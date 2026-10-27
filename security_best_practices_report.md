# 安全最佳实践报告 · 工具箱（Toolbox）

> 扫描时间：2026-10-27
> 范围：`src/`（React 19 + TypeScript 5.6 前端）、`src-tauri/src/`（Tauri 2 / Rust 命令层）、`package.json` 依赖树、`tauri.conf.json` 安全配置
> 依据：security-best-practices skill（`javascript-general-web-frontend-security` / React 前端规范）+ 实际代码与依赖审计

## 执行摘要

本次共发现 **11 个依赖漏洞（3 critical / 7 high / 1 moderate）** 与 **1 个 High 级代码缺陷（PowerShell 命令注入）**，均已在本次提交中修复；另有 2 个 Low 级加固建议（1 项已加固，1 项记录为接受风险）。修复后 `npm audit` 为 **0 vulnerabilities**。

项目的安全基线整体良好：Markdown 渲染有 `html:false` + DOMPurify 双层防护、配置文件名与备份导入均有路径穿越校验、密码字段落盘前使用 DPAPI 加密、日志不输出敏感信息。

---

## Critical（依赖）

### SEC-C01 `build` 误引入依赖链（已修复）

| 项 | 内容 |
|---|---|
| 位置 | [package.json](file:///e:/trae/tools/package.json) `"build": "^0.1.4"` |
| 证据 | `npm audit` 显示 `build`、`timespan` 无可用修复版本；`build` 传递引入 `js-yaml`(critical)、`uglify-js`(critical)、`jxLoader`(moderate)、`timespan`(high) |
| 影响 | 一旦该包被任意代码 `require`，其历史 UglifyJS/jxLoader 链可导致任意代码执行；`timespan` 存在 ReDoS。即使当前未被引用，安装期仍引入不可控的供应链风险。 |
| 修复 | `npm uninstall build`（`src/` 全量检索无任何 `from 'build'` 引用），五条漏洞链一次性消失。 |

### SEC-C02 DOMPurify ≤ 3.4.16（已修复）

| 项 | 内容 |
|---|---|
| 位置 | `package.json` → `dompurify` |
| 证据 | `npm audit`：severity **critical**，区间 `<=3.4.16`，实际解析 3.4.13 |
| 影响 | 已知净化绕过可导致 Markdown 预览中的 XSS（当前仅 1 处 `dangerouslySetInnerHTML` 使用点）。 |
| 修复 | 升级至 `3.4.17`。 |

---

## High

### SEC-H01 PowerShell 脚本拼接用户路径（命令注入，已修复）

| 项 | 内容 |
|---|---|
| 位置（修复前） | [commands.rs](file:///e:/trae/tools/src-tauri/src/commands.rs) `search_file_handle` 与 `search_directory_handle` 的 `where_clause` / `ps_template.replace("{WHERE}", ...)` |
| 位置（修复后） | [commands.rs#L1786-L1793](file:///e:/trae/tools/src-tauri/src/commands.rs#L1786-L1793)、[#L1861-L1868](file:///e:/trae/tools/src-tauri/src/commands.rs#L1861-L1868) |
| 证据 | 用户传入的 `filePath` / `directoryPath` 仅做 `replace('\\',"\\\\")` 与 `replace("'","''")` 后，被拼进 PowerShell **双引号**字符串，再作为 `powershell -Command` 执行。单引号双写只对 WQL 层有效，无法覆盖 PowerShell 双引号内的 `$(...)` / 反引号插值。 |
| 影响 | 形如 `$(Start-Process calc.exe)` 的路径可在进程搜索时执行任意本地命令。路径可能来自"选择文件/目录"的外部输入，属于可被诱导触发的本地命令执行。 |
| 修复 | 不再把用户输入拼入脚本：脚本固定为「取全量进程（ProcessId/Name/ExecutablePath）」；路径的子串匹配下沉到 Rust 端 `to_lowercase().contains()`（目录搜索先将 `/` 归一为 `\`）。对外行为不变（仍是大小写不敏感的子串匹配）。 |

### SEC-H02 markdown-it ≤ 14.3.2 / linkify-it ≤ 5.0.1（已修复）

| 项 | 内容 |
|---|---|
| 证据 | `npm audit`：`markdown-it` high（`<=14.3.2`，实际 14.2.0）；`linkify-it` high（`<=5.0.1`） |
| 影响 | 恶意 Markdown 链接文本可触发二次方级 ReDoS，使预览界面卡死（DoS）。 |
| 修复 | `markdown-it` 升至 `14.3.3`，其 `linkify-it ^5.0.2` 约束同时修复下游。 |

### SEC-H03 vite 8.0.0–8.1.5（已修复）

| 项 | 内容 |
|---|---|
| 证据 | `npm audit`：`vite` high，实际 8.0.16 |
| 影响 | 涉及 dev server 的 `fs.allow` 绕过与 launch-editor 相关执行面。**仅影响开发环境**，发布产物不包含 dev server。 |
| 修复 | 升至 `8.3.5`。 |

### SEC-H04 sharp ≤ 0.35.5-rc.1（已修复）

| 项 | 内容 |
|---|---|
| 证据 | `npm audit`：`sharp` high，实际 0.35.1 |
| 影响 | libheif / librsvg 图像解析漏洞。仅构建期（Tauri 图标处理）使用，运行时不可达，风险有限。 |
| 修复 | 升至 `0.35.5`。 |

### SEC-H05 brace-expansion 补丁缺失（已修复）

| 项 | 内容 |
|---|---|
| 证据 | `npm audit`：high，区间 `<=1.1.20 \|\| 2.0.0 - 2.1.6`，dev 传递依赖 |
| 影响 | 构造的花括号表达式可导致正则膨胀/进程挂起（DoS），影响 lint/构建流程。 |
| 修复 | `npm audit fix` 自动提升至补丁版本。 |

---

## Low

### SEC-L01 release 包携带 DevTools（接受风险，未改动）

| 项 | 内容 |
|---|---|
| 位置 | [Cargo.toml#L23](file:///e:/trae/tools/src-tauri/Cargo.toml#L23) `tauri = { features = ["devtools"] }` |
| 证据 | 代码中 [main.rs#L123](file:///e:/trae/tools/src-tauri/src/main.rs#L123) 与 [commands.rs#L2687](file:///e:/trae/tools/src-tauri/src/commands.rs#L2687) 显式调用 `window.open_devtools()` |
| 影响 | 发布版本可打开开发者工具，便于用户篡改运行时状态与读取内存中的配置。本地单机工具，需本机操作权限，实际风险低。 |
| 决策 | 移除 feature 会使上述两处调用编译失败，属于功能行为变更（会失去 F12 调试能力），本次**记录为接受风险**。若后续需要收紧，应同时用 `#[cfg(debug_assertions)]` 包裹两个调用点。 |

### SEC-L02 CSP 中 object-src / frame-src 偏宽（已加固）

| 项 | 内容 |
|---|---|
| 位置 | [tauri.conf.json#L26](file:///e:/trae/tools/src-tauri/tauri.conf.json#L26) |
| 证据 | 原为 `object-src 'self' data: blob:; frame-src 'self' data: blob:` |
| 影响 | 若未来引入不可信内容，`blob:`/`data:` 的插件与框架载体可被用于绕过脚本限制。 |
| 修复 | 收紧为 `object-src 'none'; frame-src 'none'`。已确认 `src/` 无 `<iframe>` / `<object>` / `<embed>` / `<webview>` 使用，且 Markdown 渲染为 `html:false`，不影响功能。 |

---

## 良好实践（无需改动）

| 项 | 位置 | 说明 |
|---|---|---|
| Markdown 双层防护 | [MarkdownPreview.tsx#L56](file:///e:/trae/tools/src/tools/text/MarkdownPreview.tsx#L56)、[#L74](file:///e:/trae/tools/src/tools/text/MarkdownPreview.tsx#L74)、[#L315](file:///e:/trae/tools/src/tools/text/MarkdownPreview.tsx#L315) | `markdown-it({ html: false })` + `DOMPurify.sanitize()` 纵深防御；全项目仅此 1 处 `dangerouslySetInnerHTML` |
| 无 `eval` / `new Function` / `innerHTML` | `src/` 全量检索 | 未命中任何动态执行 sink |
| 配置文件名防穿越 | [commands.rs#L39](file:///e:/trae/tools/src-tauri/src/commands.rs#L39) | 拒绝 `..`、`/`、`\`、点开头、非 `.json` 后缀 |
| 备份导入防越界 | [commands.rs#L1740](file:///e:/trae/tools/src-tauri/src/commands.rs#L1740) | `canonicalize` 后校验 `starts_with(config_dir)` |
| 密码落盘加密 | [commands.rs#L398-L402](file:///e:/trae/tools/src-tauri/src/commands.rs#L398-L402)、[#L243](file:///e:/trae/tools/src-tauri/src/commands.rs#L243) | `passwords.json` 写入前调用 `encrypt_password_fields`（DPAPI/AES），读取时自动解密，解密失败写占位符而非崩溃 |
| 日志脱敏 | `src-tauri/src/` 全量检索 | `log::*!` 未出现 password / secret / key / token |
| CSP 禁 eval | [tauri.conf.json#L26](file:///e:/trae/tools/src-tauri/tauri.conf.json#L26) | `script-src 'self'`，无 `unsafe-eval`；`style-src` 的 `unsafe-inline` 为 antd 运行时样式所必需 |
| 命令参数化 | `kill_process` 等 | `pid: u32` + `args([...])`，无字符串拼接执行 |

---

## 修复清单与验证

| ID | 状态 | 变更 |
|---|---|---|
| SEC-C01 | 已修复 | 删除 `build` 依赖 |
| SEC-C02 | 已修复 | `dompurify` → 3.4.17 |
| SEC-H01 | 已修复 | `commands.rs` 两处 PowerShell 调用改为 Rust 端过滤 |
| SEC-H02 | 已修复 | `markdown-it` → 14.3.3（含 `linkify-it` 5.0.2+） |
| SEC-H03 | 已修复 | `vite` → 8.3.5 |
| SEC-H04 | 已修复 | `sharp` → 0.35.5 |
| SEC-H05 | 已修复 | `brace-expansion` 补丁版 |
| SEC-L01 | 接受风险 | 未改动，见上文决策 |
| SEC-L02 | 已加固 | CSP `object-src 'none'; frame-src 'none'` |

验证：`npm audit --registry=https://registry.npmjs.org` → **0 vulnerabilities**；`npx tsc --noEmit` 通过；`cargo check` 通过（仅既有的 2 条 snake_case 命名警告）。

---

## Tauri 版本对齐与 Rust 依赖审计说明

### 版本对齐（打包阻塞项）

本次升级把 npm 侧 `@tauri-apps/api` 提到了 2.12.4，而 Rust crate `tauri` 仍锁定 **2.11.5**（`src-tauri/Cargo.lock`），Tauri CLI 要求两者 major.minor 一致，导致 `npm run build:tauri` 以 `Found version mismatched Tauri packages` 失败。

处理方式：**回退 npm 侧到 2.11 minor**，并把版本写为精确值（去掉 `^`），防止再次漂移：

| 包 | 升级后（引发失败） | 最终对齐版本 |
|---|---|---|
| `@tauri-apps/api` | 2.12.4 | **2.11.1** |
| `@tauri-apps/cli` | 2.12.4 | **2.11.5** |
| Rust crate `tauri` | 2.11.5（未改动） | 2.11.5 |

选择回退 npm 而非升级 crate 的原因：crate 升到 2.12 需重新编译全部 Tauri 依赖且未经行为验证，而 2.11.x 的 JS API 与 2.11.5 crate 语义完全对应，回归风险最低。对齐后 `npm audit` 仍为 **0 vulnerabilities**。

### Rust 依赖审计范围（未覆盖）

| 项 | 状态 |
|---|---|
| `cargo-audit` | **未安装**，Rust 依赖未做 CVE 数据库扫描 |
| `cargo update` | **未执行**，`src-tauri/Cargo.lock` 保持原有解析结果 |
| `cargo check` | 通过，仅 `commands.rs` 中 2 条既有的 `non_snake_case`（`filePath` / `directoryPath`）警告，与安全无关 |

后续若需覆盖 Rust 侧：`cargo install cargo-audit --locked` 后执行 `cargo audit`（需代理访问 crates.io 与漏洞库）。

---

## 语言运行时漏洞

### SEC-R01 · Critical · Node2Shell（CVE-2026-111497）

| 项 | 内容 |
|---|---|
| 位置 | 本机 Node.js 运行时（`D:\nodejs\node.exe`），v22.16.0 |
| 证据 | Node.js 官方 2026-10-21 安全公告：内置 **Brotli 解码器越界写**，可导致远程代码执行（已在野利用）；受影响范围 `22.x < 22.23.4`、`24.x < 24.22.1`、`26.x < 26.12.1` |
| 影响 | 任何触发 Brotli 解码的路径（HTTP `Content-Encoding: brotli`、`zlib.brotliDecompress*`）可被构造的压缩数据触发内存越界写，进而执行任意代码。本项目构建链（Vite/Tauri CLI）与依赖安装均运行在该 Node 上，属于可被恶意依赖/远端内容触发的 Critical 风险。 |
| 修复 | 升级至 **v22.23.4 (LTS)**。安装方式：因当前会话无管理员权限（MSI/winget 需提权），采用官方 ZIP 覆盖 `D:\nodejs`，**下载后校验 SHA256**（`cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20` 与 `SHASUMS256.txt` 一致），并把旧 `node.exe` 与 npm 脚本备份到 `D:\nodejs\backup-22.16.0\` 以便回滚。 |
| 验证 | `node --version` → `v22.23.4`；`npm --version` → `10.9.9`；Brotli 压缩→解压往返输出 `ok`；`npm ci` + `npm audit` → 0 vulnerabilities；`tsc --noEmit` 通过 |
| 备注 | ZIP 覆盖不更新 MSI 注册表，`DisplayVersion` 仍显示 22.16.0（仅显示不一致，运行时已是修复版本）。若需彻底一致，可在有管理员权限时执行 `msiexec /i node-v22.23.4-x64.msi` 覆盖安装。 |

### SEC-R02 · Medium · Rust 工具链落后

| 项 | 内容 |
|---|---|
| 位置 | rustup stable 通道，`rustc 1.97.0` → `1.99.1` |
| 证据 | `rustup check`：`1.97.0 (2026-07-07) -> 1.99.1 (2026-10-13)`，落后 3 个 stable 版本 |
| 影响 | 缺少 1.98 / 1.99 两个版本包含的编译器与 `std` 补丁；未命中已知 RCE 类公告，但保持工具链在支持窗口内是供应链安全基线。 |
| 修复 | `rustup update stable`（用户级，无需提权，走代理） |
| 验证 | `rustc --version` / `cargo --version` → **1.99.1**；`npm run build:tauri` 在新工具链下编译通过 |

### SEC-R03 · Low · 其他运行时

| 运行时 | 状态 |
|---|---|
| npm | 10.9.2 → **10.9.9**（随 Node 22.23.4 的 npm 包同步替换） |
| PowerShell 5.1 | Windows 系统组件，无法在用户态独立升级；本项目对它的调用已按 SEC-H01 改为**不含用户输入拼接**，风险已消除 |
| 项目其他语言 | 无 Python / Java / Go 等运行时参与构建或运行 |
