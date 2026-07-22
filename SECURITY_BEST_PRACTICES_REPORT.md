# 安全扫描报告

**项目**: 工具箱 (Tauri 2 + React 19 + Rust)
**扫描时间**: 2026-07-20
**扫描范围**: 前端 (TypeScript/React)、后端 (Rust/Tauri Commands)、配置 (CSP / capabilities / Cargo.toml)
**参考规范**: OWASP JavaScript/TypeScript Web Frontend Security, OWASP Rust/Web 安全最佳实践

---

## Executive Summary

本次扫描共发现 **10 个安全问题**，其中：

- **Critical**: 1 个 — 任意文件读写（路径穿越）
- **High**: 3 个 — CSP 弱化、密码解密回退明文、加密失败回退明文
- **Medium**: 4 个 — open_file/open_url 协议未验证、备份 ID 路径穿越、import_backup 路径未验证、Tauri capabilities 过宽
- **Low**: 2 个 — 缺少 clickjacking 防护、加密密钥保护不足

**已正确实现**（积极项）:
- markdown-it 关闭了 `html: false` 防 XSS
- 前端代码无 `eval` / `new Function` / `innerHTML` 滥用
- 前端无 `localStorage` 敏感存储、无危险 `window.location` 跳转
- HTTP 工具 URL 验证只允许 http/https 协议
- 后端 `Command::new` 调用均为硬编码命令（无命令注入）
- 文件图标 base64 字符白名单验证

---

## Critical

### [C-1] load_config / save_config 任意文件读写（路径穿越）

**影响**: 攻击者通过 IPC 传入 `file_name` 包含 `../../../` 等路径，可读写应用 config 目录之外的文件，包括覆盖 `encryption-key.dat`（破坏加密）、读取/篡改用户桌面文档等。

**位置**:
- [commands.rs:293-312](file:///E:/trae/tools/src-tauri/src/commands.rs#L293-L312) `load_config`
- [commands.rs:315-335](file:///E:/trae/tools/src-tauri/src/commands.rs#L315-L335) `save_config`

**证据**:
```rust
#[command]
pub async fn load_config(file_name: String) -> Result<serde_json::Value, String> {
    ensure_config_dir().map_err(|e| e.to_string())?;
    let config_path = get_config_dir().join(&file_name);  // ← 未验证 file_name
    ...
    let content = fs::read_to_string(&config_path)...
}
```

攻击示例: `invoke('load_config', { fileName: '..\\..\\Windows\\System32\\drivers\\etc\\hosts' })`

**修复**:
```rust
fn validate_config_name(name: &str) -> Result<PathBuf, String> {
    // 拒绝路径分隔符、绝对路径前缀、跳目录
    if name.is_empty() || name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err("非法的配置文件名".into());
    }
    if name.starts_with('.') {
        return Err("非法的配置文件名".into());
    }
    // 限定允许的扩展名
    if !name.ends_with(".json") {
        return Err("仅支持 .json 配置文件".into());
    }
    Ok(PathBuf::from(name))
}
```

**缓解**:
- 使用白名单：硬编码可用 `file_name`（如 `passwords.json` / `app-config.json`），拒绝其他值。
- 即便用文件名校验，也应 `canonicalize()` 父目录并验证 `starts_with(get_config_dir())`。

---

## High

### [H-1] CSP 包含 `unsafe-inline` 和 `unsafe-eval`

**影响**: 削弱对 XSS 的纵深防御。一旦出现 XSS 漏洞（例如：后续引入未净化的 `dangerouslySetInnerHTML`），攻击者可执行任意内联脚本与 `eval()` 代码。

**位置**: [tauri.conf.json:25](file:///E:/trae/tools/src-tauri/tauri.conf.json#L25)

**证据**:
```json
"csp": "default-src 'self' ipc: http://ipc.localhost; ...; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ..."
```

**修复**:
1. **删除 `'unsafe-eval'`** — 当前代码无 `eval()` / `new Function()` 使用，不必要。
2. **去掉 `'unsafe-inline'`**:
   - 移除 `index.html` 中所有内联 `<script>` 与 `onclick` 处理器
   - 若 Vite/React 注入需要内联脚本，启用 Vite 的 `build.cssCodeSplit` 配合 nonce 机制
3. 若必须保留 `unsafe-inline`，请在报告中显式标注并按风险登记。

**缓解**:
- 临时保留的同时，在 Tauri capabilities 中最小化前端可用权限，限制 `invoke` 可访问的命令集。

---

### [H-2] `decrypt_string` 解密失败时返回原始密文（密码回退为"密文字符串"）

**影响**: 当 AES-256-GCM 解密失败（密钥文件丢失、损坏、版本错乱）时，函数 `commands.rs:189-192` 把原始 base64 密文当成"明文"返回给前端。前端若未识别 `__encrypted__` 标记会直接把密文显示给用户，造成数据呈现错误；攻击者如果能修改 `encryption-key.dat` 后再让受害用户打开，可强制所有密码以密文字符串形式呈现，绕过 UI 层的密码掩码。

**位置**: [commands.rs:184-193](file:///E:/trae/tools/src-tauri/src/commands.rs#L184-L193)

**证据**:
```rust
VERSION_AES => {
    let key = get_encryption_key();
    match aes_decrypt(payload, &key) {
        Ok(plain) => plain,
        Err(e) => {
            log::warn!("AES 解密失败（可能密钥不匹配）: {}", e);
            data.to_string()  // ← 危险回退：原密文被当作明文
        }
    }
}
```

**修复**:
```rust
Err(e) => {
    log::error!("AES 解密失败（密钥不匹配或数据损坏）: {}", e);
    return Err(format!("解密失败: {}", e));  // 抛出错误而非回退
}
```

并把 `decrypt_string` 改为 `Result<String, String>`，由调用方在 UI 层显示 "[需要重新输入密码]"。

---

### [H-3] `encrypt_string` 加密失败时回退到明文 base64

**影响**: 当 AES 初始化或加密失败（极端情况下）时，`encrypt_string` 会把原始密码以 `__b64__<base64(plaintext)>` 形式落盘。攻击者拿到 `passwords.json` 后只需 base64 解码即可还原明文，绕过加密。

**位置**: [commands.rs:140-150](file:///E:/trae/tools/src-tauri/src/commands.rs#L140-L150)

**证据**:
```rust
fn encrypt_string(data: &str) -> String {
    let key = get_encryption_key();
    match aes_encrypt(data.as_bytes(), &key) {
        Ok(bytes) => base64::engine::general_purpose::STANDARD.encode(&bytes),
        Err(e) => {
            log::error!("加密失败: {}", e);
            // 回退：返回原始数据的 base64（标记为未加密）
            format!("__b64__{}", base64::engine::general_purpose::STANDARD.encode(data))
        }
    }
}
```

**修复**:
```rust
fn encrypt_string(data: &str) -> Result<String, String> {
    let key = get_encryption_key();
    aes_encrypt(data.as_bytes(), &key)
        .map(|bytes| base64::engine::general_purpose::STANDARD.encode(&bytes))
        // 失败时直接返回错误，绝不回退到明文
}
```

调用方（`encrypt_password_fields`）需要处理 `Result`。

---

## Medium

### [M-1] `open_file` / `open_url` 无协议验证（任意协议 / 本地应用执行）

**影响**: 前端可调用 `invoke('open_url', { url: 'ms-settings:' })` 或 `file:///c:/sensitive.txt` 等任意协议/路径。`open::that` 会调用系统 `cmd /c start` 等命令打开对应协议，可用于执行本地应用（ms-settings、ms-msdt 等）或泄露本地文件内容。

**位置**: [commands.rs:357-366](file:///E:/trae/tools/src-tauri/src/commands.rs#L357-L366)

**证据**:
```rust
#[command]
pub async fn open_file(path: String) -> Result<(), String> {
    let _ = open::that(&path);  // ← 无任何验证
    Ok(())
}

#[command]
pub async fn open_url(url: String) -> Result<(), String> {
    let _ = open::that(&url);    // ← 无任何验证
    Ok(())
}
```

**修复**:
```rust
fn validate_open_target(s: &str) -> Result<(), String> {
    if s.is_empty() {
        return Err("路径不能为空".into());
    }
    // 拒绝 UNC/本地文件协议
    if s.starts_with("file://") || s.starts_with("\\\\") {
        return Err("禁止访问本地文件协议".into());
    }
    // URL 必须以 http/https/mailto 等允许协议开头
    if let Ok(url) = url::Url::parse(s) {
        match url.scheme() {
            "http" | "https" | "mailto" | "tel" => Ok(()),
            s => Err(format!("不支持的协议: {}", s)),
        }
    } else {
        // 非 URL 视为本地路径：拒绝 ../
        if s.contains("..") {
            return Err("非法的本地路径".into());
        }
        Ok(())
    }
}

#[command]
pub async fn open_url(url: String) -> Result<(), String> {
    validate_open_target(&url)?;
    let _ = open::that(&url);
    Ok(())
}
```

---

### [M-2] `delete_backup` / `restore_backup` 备份 ID 路径穿越

**影响**: `backup_id` 直接 `join` 到备份目录，传入 `../some_other_dir` 可让 `remove_directory` 删除任意目录，或让 `restore_backup` 从任意目录复制文件到 config 目录，覆盖加密密钥等关键文件。

**位置**:
- [commands.rs:1330-1339](file:///E:/trae/tools/src-tauri/src/commands.rs#L1330-L1339) `delete_backup`
- [commands.rs:1342-1375](file:///E:/trae/tools/src-tauri/src/commands.rs#L1342-L1375) `restore_backup`

**证据**:
```rust
pub async fn delete_backup(backup_id: String) -> Result<bool, String> {
    let backup_dir = get_config_dir().join("backups").join(&backup_id);  // ← 无验证
    ...
    remove_directory(&backup_dir)...
}
```

**修复**:
```rust
fn validate_backup_id(id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || id.contains("..") || id.contains('/') || id.contains('\\') {
        return Err("非法的备份 ID".into());
    }
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.') {
        return Err("备份 ID 包含非法字符".into());
    }
    Ok(PathBuf::from(id))
}

pub async fn delete_backup(backup_id: String) -> Result<bool, String> {
    let id = validate_backup_id(&backup_id)?;
    let backup_dir = get_config_dir().join("backups").join(&id);
    // canonicalize 检查目标仍在 backups 目录内
    let canonical = backup_dir.canonicalize()
        .map_err(|e| format!("备份目录解析失败: {}", e))?;
    let canonical_backups = get_config_dir().join("backups").canonicalize()
        .map_err(|e| format!("备份父目录解析失败: {}", e))?;
    if !canonical.starts_with(&canonical_backups) {
        return Err("备份路径越界".into());
    }
    remove_directory(&backup_dir)...
}
```

---

### [M-3] `import_backup` 路径无任何验证

**影响**: 用户传入任意本地目录路径作为 `backup_path`，函数将其中所有文件复制到 `config_dir`，可能覆盖 `encryption-key.dat`、`passwords.json` 等关键文件。

**位置**: [commands.rs:1378-1415](file:///E:/trae/tools/src-tauri/src/commands.rs#L1378-L1415)

**证据**:
```rust
pub async fn import_backup(backup_path: String) -> Result<bool, String> {
    let source_dir = PathBuf::from(&backup_path);
    if !source_dir.exists() { return Err(...); }
    if !source_dir.is_dir() { return Err(...); }
    // 后面直接遍历该目录，复制到 config_dir
}
```

**修复**:
- 限定导入来源：只允许用户通过 `select_backup_directory` 命令选择目录（不在 import 内部接受路径参数）。
- 复制前对每个文件名做 `..` 验证。
- 复制完成后校验 `dest_path` 仍在 `config_dir` 内（`canonicalize` + `starts_with`）。

---

### [M-4] Tauri capabilities 权限过宽（`fs:default` / `shell:default`）

**影响**: `core:default` + `fs:default` + `shell:default` 让前端 `invoke` 拥有文件系统读写、shell 命令执行的全集权限。一旦前端被 XSS 或供应链投毒攻击，攻击者可获得相当 OS shell 的能力。

**位置**: [capabilities/default.json:6-12](file:///E:/trae/tools/src-tauri/capabilities/default.json#L6-L12)

**证据**:
```json
"permissions": [
  "core:default",
  "dialog:default",
  "fs:default",     // ← 包含任意路径读写
  "shell:default",  // ← 允许执行任意 shell 命令
  "log:default"
]
```

**修复**:
- 删除 `shell:default`（项目自身不从前端调用 `shell.execute`），由后端命令封装。
- 替换 `fs:default` 为精确路径范围：
  ```json
  "permissions": [
    "core:default",
    "dialog:default",
    "fs:allow-read-text-file",
    "fs:scope-app-config-recursive",
    "log:default"
  ]
  ```
- Tauri 2 推荐用 `fs:scope` 明确限定到 `$APPCONFIG/**` 等白名单路径。

---

## Low

### [L-1] 缺少 `frame-ancestors` 与 clickjacking 防护

**影响**: 桌面应用一般不需要担心被嵌入 iframe，但 `tauri.conf.json` 的 CSP 中没有 `frame-ancestors 'none';`，缺少纵深防御。

**位置**: [tauri.conf.json:25](file:///E:/trae/tools/src-tauri/tauri.conf.json#L25)

**修复**: 在 CSP 末尾追加 `frame-ancestors 'none';`。

---

### [L-2] 加密密钥保护不足

**影响**: 密钥文件 `encryption-key.dat` 存储在 config 目录，权限默认继承用户目录权限。任何能访问文件系统的进程（包括恶意软件）都能读取该文件并解密 `passwords.json`。

**位置**: [commands.rs:70-90](file:///E:/trae/tools/src-tauri/src/commands.rs#L70-L90)

**证据**:
```rust
fn get_encryption_key() -> Vec<u8> {
    let config_dir = get_config_dir();
    let key_path = config_dir.join("encryption-key.dat");
    if key_path.exists() { fs::read(&key_path) ... }
    ...
}
```

**修复**:
- 优先使用 Windows DPAPI（项目已依赖 `winapi` 的 `dpapi` feature）：
  - 调用 `CryptProtectData` 用当前用户凭证加密密钥
  - 启动时 `CryptUnprotectData` 解密
- 或在 `tauri-plugin-stronghold` 中存储密钥
- 至少把 `encryption-key.dat` 设置为仅当前用户可读（Windows: `ACL` / DACL）

---

## 附: 已正确实现的安全特性 (积极项)

- [MarkdownPreview.tsx:12-16](file:///E:/trae/tools/src/tools/text/MarkdownPreview.tsx#L12-L16) — markdown-it `html: false` 正确关闭原始 HTML
- 前端代码无 `eval` / `new Function` / `setTimeout("...")` / `setInterval("...")`
- 前端代码无 `innerHTML` / `outerHTML` / `insertAdjacentHTML` 危险写入
- 前端代码无 `window.location` 危险跳转、无 `window.open` 拼接用户输入
- 前端代码未使用 `localStorage` / `sessionStorage` 存储敏感数据
- 前端代码未使用 `postMessage`
- [commands.rs:922-943](file:///E:/trae/tools/src-tauri/src/commands.rs#L922-L943) `validate_http_url` 严格只允许 http/https 协议
- [commands.rs:534-543](file:///E:/trae/tools/src-tauri/src/commands.rs#L534-L543) `Command::new("taskkill")` / `Command::new("netstat")` 均为硬编码命令与参数（无命令注入）
- [FileLauncherTool.tsx:238-242](file:///E:/trae/tools/src/tools/filelauncher/FileLauncherTool.tsx#L238-L242) base64 图标字符白名单验证
- [commands.rs:97-137](file:///E:/trae/tools/src-tauri/src/commands.rs#L97-L137) AES-256-GCM 使用 `rand::rng().fill_bytes` 生成随机 nonce
- [commands.rs:70-90](file:///E:/trae/tools/src-tauri/src/commands.rs#L70-L90) 加密密钥使用 `rand::rng()` 32 字节真随机生成

---

## 建议修复优先级

| 优先级 | 编号 | 描述 | 预估工作量 |
|--------|------|------|------------|
| P0 (立即) | C-1 | load_config/save_config 路径穿越 | 30 分钟 |
| P0 (立即) | H-2 | decrypt_string 回退密文 | 15 分钟 |
| P0 (立即) | H-3 | encrypt_string 回退明文 | 15 分钟 |
| P1 (本周) | H-1 | 移除 CSP unsafe-eval | 1 小时（需测试） |
| P1 (本周) | M-1 | open_file/open_url 协议白名单 | 30 分钟 |
| P1 (本周) | M-2 | backup_id 路径校验 | 30 分钟 |
| P1 (本周) | M-3 | import_backup 路径校验 | 30 分钟 |
| P2 (本月) | M-4 | capabilities 最小化 | 1 小时 |
| P2 (本月) | L-1 | 加 frame-ancestors | 5 分钟 |
| P3 (后续) | L-2 | 密钥使用 DPAPI 保护 | 2 小时 |

---

## 建议的下一步

1. **先修复 P0 三个问题**（密码与任意文件读写），它们直接影响用户数据安全。
2. 修复完成后让我知道，我可以一并处理 P1 级别的协议与路径校验。
3. 报告同时建议加入 CI：`cargo audit`（Rust 依赖审计）与 `npm audit`（前端依赖审计）以发现供应链漏洞。
