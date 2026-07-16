# 工具箱 (Toolbox) 安全最佳实践报告

**生成时间**: 2026-07-16
**项目版本**: 1.6.0
**技术栈**: React 19 + TypeScript 5.6 + Tauri 2.x + Vite 8

---

## 执行摘要

本次安全审查基于 **OWASP 安全最佳实践** 和 **React Web 前端安全规范**，对工具箱应用进行了全面扫描。项目整体安全状况良好，未发现严重的远程漏洞。

主要发现：
- **1 个高风险问题**：密码加密使用弱加密算法（XOR）且密钥硬编码
- **2 个中等风险问题**：Markdown 渲染使用 `dangerouslySetInnerHTML`（已缓解）、HTTP 工具允许任意 URL 请求
- **1 个低风险问题**：图标数据使用 `data:` URL

所有发现均为本地桌面应用场景，攻击面有限，但建议改进以符合安全最佳实践。

---

## 高风险问题

### Finding #1: 密码加密使用弱加密算法（XOR）且密钥硬编码

**规则 ID**: REACT-AUTH-001 (Rust 后端)
**严重程度**: 高
**位置**: `src-tauri/src/commands.rs:65-74`

**证据代码**:
```rust
// 第 65 行：硬编码默认密钥
let default_key = b"toolbox_encryption_key_32bytes";

// 第 73-74 行：XOR 加密函数
fn xor_encrypt(data: &[u8], key: &[u8]) -> Vec<u8> {
    data.iter().enumerate().map(|(i, &b)| b ^ key[i % key.len()]).collect()
}
```

**影响**:
XOR 加密是弱加密算法，不具备现代加密的安全属性：
1. **可逆性**：攻击者获取密钥后可解密所有历史密码
2. **密钥硬编码**：默认密钥是固定的，任何获得源代码的人都能解密
3. **无完整性保护**：无法检测数据是否被篡改

**修复建议**:
应使用强加密算法（如 AES-256-GCM）并生成随机密钥：
```rust
// 使用 AES-256-GCM 加密
use aes_gcm::{Aes256Gcm, KeyInit, aead::Aead};

fn generate_random_key() -> Vec<u8> {
    use rand::RngCore;
    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    key.to_vec()
}
```

**缓解措施**:
- 当前实现将密钥存储在本地文件 `encryption-key.dat` 中
- 只有用户首次使用且密钥文件不存在时才使用默认密钥
- 建议：强制生成随机密钥并安全存储

---

## 中等风险问题

### Finding #2: Markdown 渲染使用 `dangerouslySetInnerHTML`

**规则 ID**: REACT-XSS-001
**严重程度**: 中等（已缓解）
**位置**: `src/tools/text/MarkdownPreview.tsx:180`

**证据代码**:
```tsx
// 第 9-13 行：安全配置
const md = new MarkdownIt({
  html: false,  // 禁用原始 HTML - 安全最佳实践
  breaks: true,
  linkify: true,
});

// 第 180 行：渲染 HTML
<div dangerouslySetInnerHTML={{ __html: html }} />
```

**影响**:
使用 `dangerouslySetInnerHTML` 是 React 的 XSS 逃生通道。如果配置不当，用户输入的恶意 HTML/JavaScript 可被执行。

**已缓解因素**:
`markdown-it` 已配置 `html: false`，禁用原始 HTML 渲染，有效防止 XSS。

**验证**:
```javascript
// 测试：输入 <script>alert('xss')</script>
// 输出：文本被转义，不会执行
```

**建议**:
当前配置已足够安全，但建议添加注释说明安全配置的重要性：
```tsx
// 安全配置：禁用原始 HTML 以防止 XSS 攻击
// 用户输入的 Markdown 只会渲染为安全的文本格式
const md = new MarkdownIt({
  html: false,  // 关键安全设置：禁止渲染原始 HTML
  // ...
});
```

---

### Finding #3: HTTP 请求工具允许发送到任意 URL

**规则 ID**: REACT-NET-001 (Rust 后端)
**严重程度**: 中等
**位置**: `src-tauri/src/commands.rs:816`

**证据代码**:
```rust
// 第 783-816 行：HTTP 请求函数
pub async fn http_request(options: HttpRequestOptions) -> Result<HttpResponse, String> {
    // ...
    let mut request = client.request(method, &options.url);
    // ...
}
```

**影响**:
用户可通过 HTTP 测试工具发送请求到任意 URL，包括：
1. 内部网络资源（SSRF 风险）
2. 敏感 API 端点
3. 文件系统路径（部分系统）

**缓解因素**:
- 这是桌面应用，用户需要主动输入 URL
- 不存在服务器端 SSRF 风险
- 请求不带认证凭据

**建议**:
添加 URL 验证，禁止访问敏感端点：
```rust
fn validate_url(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|e| format!("无效的 URL: {}", e))?;
    
    // 禁止访问本地敏感端点
    match parsed.host_str() {
        Some("localhost") | Some("127.0.0.1") => {
            // 允许，但记录日志
            log::warn!("用户请求访问本地端点: {}", url);
        }
        _ => {}
    }
    
    Ok(())
}
```

---

## 低风险问题

### Finding #4: 图标数据使用 `data:` URL

**规则 ID**: REACT-URL-001
**严重程度**: 低
**位置**: `src/tools/filelauncher/FileLauncherTool.tsx:231-236`

**证据代码**:
```tsx
// 第 231-236 行
const hasDataPrefix = base64Data.startsWith('data:image');
if (!hasDataPrefix) {
    return `data:image/png;base64,${base64Data}`;
}
return base64Data;
```

**影响**:
`data:` URL 可被用于 XSS，但此处的数据来自系统文件图标提取，不是用户直接输入。

**缓解因素**:
- 数据来源是 `getFileIcon` 系统调用，提取自文件系统图标
- 仅限 `data:image/` 前缀，不执行 JavaScript

**建议**:
添加数据验证，确保只接受 base64 编码数据：
```tsx
const hasDataPrefix = base64Data.startsWith('data:image');
const base64Content = hasDataPrefix 
    ? base64Data.split(',')[1] 
    : base64Data;

// 验证 base64 格式
if (!/^[A-Za-z0-9+/=]+$/.test(base64Content)) {
    console.warn('图标数据格式无效');
    return undefined;
}
```

---

## 未发现的问题

以下安全风险在本次扫描中**未发现**：

| 风险类型 | 状态 | 说明 |
|---------|------|------|
| 敏感数据存储在 localStorage | ✅ 未发现 | 应用不使用 Web Storage 存储敏感数据 |
| `eval()`/`new Function()` 使用 | ✅ 未发现 | 无动态代码执行 |
| 环境变量泄露密钥 | ✅ 未发现 | 无 `.env` 文件包含敏感信息 |
| `postMessage` 跨窗口消息漏洞 | ✅ 未发现 | 未使用 postMessage |
| CSRF 漏洞 | ✅ 未发现 | 不使用 cookie 认证 |
| 开放重定向 | ✅ 未发现 | 无未验证的 URL 重定向 |
| 第三方脚本注入 | ✅ 未发现 | 无外部脚本加载 |

---

## 建议修复优先级

| 优先级 | Finding ID | 问题 | 建议 |
|--------|-----------|------|------|
| 🔴 高 | #1 | 密码加密使用 XOR | 改用 AES-256-GCM 加密 |
| 🟡 中 | #2 | dangerouslySetInnerHTML | 已缓解，添加安全注释 |
| 🟡 中 | #3 | HTTP 任意 URL 请求 | 添加 URL 验证和日志 |
| 🟢 低 | #4 | data: URL 图标 | 添加 base64 验证 |

---

## 附录：扫描范围

### 前端代码扫描
- 源代码目录: `src/`
- 扫描模式:
  - `dangerouslySetInnerHTML` / `innerHTML` / `outerHTML`
  - `eval()` / `new Function()` / `setTimeout(string)`
  - `localStorage` / `sessionStorage` 敏感数据
  - `process.env` / `import.meta.env` 环境变量
  - `window.location` / `navigate()` 重定向
  - `postMessage` 跨窗口消息
  - `credentials: 'include'` CSRF 风险

### 后端代码扫描
- 源代码目录: `src-tauri/src/`
- 扫描模式:
  - 加密函数和密钥管理
  - HTTP 请求处理
  - 文件操作和路径验证
  - 系统命令执行

### 参考文档
- [React Web 前端安全规范](file:///C:/Users/dell/.trae-cn/skills/security-best-practices/references/javascript-typescript-react-web-frontend-security.md)
- [OWASP XSS 预防指南](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [OWASP 密码存储指南](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)