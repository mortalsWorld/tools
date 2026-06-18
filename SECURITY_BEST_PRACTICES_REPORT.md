# 工具箱 Electron 应用 安全最佳实践报告

**生成日期**: 2026-06-16
**应用版本**: v1.3.0
**应用类型**: Electron 桌面工具集合应用（文件管理、密码管理、系统监控等）

---

## 执行摘要

本报告基于对本应用代码库的全面安全审查。审查范围包括 Electron 主进程、IPC 通信、密码管理模块、文件操作模块及依赖项管理等核心安全敏感部分。

**修复状态**: ✅ 已完成所有 CRITICAL 和 HIGH 级漏洞修复

### 已修复漏洞清单

| 优先级 | 漏洞 | 修复状态 |
|--------|------|----------|
| CRITICAL | 明文密码存储 | ✅ 已修复 (safeStorage 加密) |
| CRITICAL | 命令注入风险 | ✅ 已修复 (execFile 参数化) |
| HIGH | 缺失内容安全策略 CSP | ✅ 已修复 |
| HIGH | shell.openExternal 未校验协议 | ✅ 已修复 |
| HIGH | 生产环境 DevTools 开启 | ✅ 已修复 |
| HIGH | 全局快捷键输入未校验 | ✅ 已修复 |
| MEDIUM | 密码生成器模运算偏差 | ✅ 已修复 |
| MEDIUM | sandbox 未启用 | ✅ 已修复 |
| LOW | 文件搜索递归深度未限制 | ✅ 已修复 |

---

## 1. 严重 (CRITICAL)

### 漏洞 1: 明文密码存储（CWE-312: Cleartext Storage of Sensitive Information）

**位置**: `electron/main.ts` (加密相关函数)

**描述**: 密码管理功能将密码以明文 JSON 格式存储在磁盘上，未加密。

**修复方案**:
- 使用 `electron-safeStorage` 进行系统级加密（Windows DPAPI / macOS Keychain / Linux libsecret）
- 在 `loadConfig`/`saveConfig` 核心函数中自动处理 `passwords.json` 的加解密
- 支持向后兼容：旧的明文密码会被自动识别并在保存时加密
- 添加 `__encrypted__` 标记防止重复加密

**关键代码**:
```typescript
const encryptPasswordFieldsInConfig = (data: any): any => {
  if (!data) return data;
  
  const items = data.items || data.passwords || [];
  items.forEach((item: any) => {
    if (item.password && !item.__encrypted__) {
      item.password = encryptSensitiveData(item.password);
      item.__encrypted__ = true;
    }
  });
  
  return data;
};
```

### 漏洞 2: 命令注入风险（CWE-78: OS Command Injection）

**位置**: `electron/main.ts` (IPC 处理函数)

**描述**: 多个 IPC 处理函数将用户输入直接拼接进系统命令。

**修复方案**:
- 所有 `exec()` 调用替换为 `execFile()` + 参数数组传递
- 添加输入验证函数：`isValidPid`、`isSafeFilePath`、`isSafeUrl`
- 关键修复：`kill-process`、`kill-processes`、`search-file-handle`、`resolve-shortcut`

**关键代码**:
```typescript
// 安全写法
if (!isValidPid(pid)) {
  throw new Error('Invalid PID');
}
const { execFile } = await import('child_process');
await execFile('taskkill', ['/F', '/PID', String(pid)]);
```

---

## 2. 高 (HIGH)

### 漏洞 3: 缺失内容安全策略 CSP（CWE-1021 / CWE-79）

**位置**: `index.html` 和 `electron/main.ts` (BrowserWindow 配置)

**修复方案**:
```html
<!-- index.html -->
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';">
```

```typescript
// main.ts - BrowserWindow 配置
webPreferences: {
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  ...
}
```

### 漏洞 4: shell.openExternal / shell.openPath 未校验 URL 协议（CWE-78 / CWE-918）

**位置**: `electron/main.ts` (isSafeUrl 函数)

**修复方案**: URL 白名单验证：
```typescript
const isSafeUrl = (url: string): boolean => {
  const allowedProtocols = ['http:', 'https:', 'ftp:', 'mailto:', 'tel:', 'telnet:'];
  const blockedProtocols = ['javascript:', 'vbscript:', 'file:', 'data:', 'ms-'];
  
  try {
    const parsed = new URL(url);
    if (blockedProtocols.some(p => parsed.protocol.startsWith(p))) {
      return false;
    }
    return allowedProtocols.includes(parsed.protocol);
  } catch {
    return false;
  }
};
```

### 漏洞 5: 开发工具在生产环境开启（CWE-489: Active Debug Code）

**位置**: `electron/main.ts` (createWindow 函数)

**修复方案**:
```typescript
if (!app.isPackaged && process.env.NODE_ENV !== 'production') {
  win.webContents.openDevTools();
}
```

### 漏洞 6: 全局快捷键注册的输入未校验（CWE-77）

**位置**: `electron/main.ts` (isValidAccelerator 函数)

**修复方案**:
```typescript
const isValidAccelerator = (accelerator: string): boolean => {
  const validPattern = /^[A-Za-z0-9+!@#$%^&*()_+\-=\[\]{}|;:,.<>?/\\~`\s]*$/;
  return validPattern.test(accelerator) && accelerator.length <= 100;
};
```

---

## 3. 中 (MEDIUM)

### 漏洞 7: 密码生成器使用模运算产生偏差分布

**位置**: `electron/main.ts` (generate-password IPC 处理)

**修复方案**: 使用 `crypto.randomInt()` 替代模运算：
```typescript
const password: string[] = [];
for (let i = 0; i < length; i++) {
  password.push(chars[crypto.randomInt(chars.length)]);
}
return password.join('');
```

### 漏洞 8: sandbox 未启用

**位置**: `electron/main.ts` (BrowserWindow 配置)

**修复方案**: 在 BrowserWindow 配置中添加 `sandbox: true`。

---

## 4. 低 (LOW)

### 漏洞 9: 文件搜索递归深度未限制

**位置**: `electron/main.ts` (searchFilesRecursive 函数)

**修复方案**: 限制最大递归深度为 10 层。

---

## 5. 信息性 (INFO)

### 依赖项建议

Electron 42.4.0、Vite 8.0.16 均已在使用。

**建议**: 定期（每季度）检查 CVE 数据库，启用 `npm audit` 并处理高严重度漏洞。

### 打包体积优化

应用通过以下方式优化打包体积：
- 删除未使用的 Chromium 语言包（保留中英日韩），节省约 45 MB
- 使用 maximum 压缩率
- asar 打包应用代码和资源

---

## 安全改进优先级

| 优先级 | 数量 | 描述 |
|---|---|---|
| CRITICAL | 2 | 明文密码 + 命令注入风险 |
| HIGH | 4 | CSP / openExternal 未校验 / 生产 DevTools / 快捷键校验 |
| MEDIUM | 2 | 密码分布偏差 / sandbox |
| LOW | 1 | 递归深度限制 |

**所有漏洞均已修复。**

---

## 代码参考文件

- `electron/main.ts` - Electron 主进程入口
- `electron/preload.ts` - 预加载脚本
- `src/tools/security/PasswordTool.tsx` - 密码管理工具组件
- `src/tools/filelauncher/FileLauncherTool.tsx` - 文件启动工具组件
- `package.json` - 项目依赖配置
- `electron/logger.ts` - 日志模块
- `scripts/afterPack.js` - 打包后优化脚本
- `electron-builder.yml` - 打包配置
