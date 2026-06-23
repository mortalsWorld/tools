# 工具箱 (Toolbox)

一个现代化的通用工具集合桌面应用程序，基于 Electron + React + TypeScript 构建。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Electron](https://img.shields.io/badge/Electron-42.4.0-47848F?style=flat-square&logo=electron)
![React](https://img.shields.io/badge/React-19.2.7-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4.5-3178C6?style=flat-square&logo=typescript)

## 功能特性

### 通用工具
- **欢迎页面** - 应用介绍与快速入口

### 文本处理
- **代码格式化** - JSON/XML 代码格式化与压缩
- **Markdown 预览** - Markdown 实时预览与编辑
- **正则表达式测试** - 正则表达式测试工具，支持实时匹配高亮

### 编码转换
- **编码解码** - Base64/URL/Hex/Unicode 编码解码

### 时间日期
- **时间日期转换** - 时间戳与日期格式相互转换

### 文件搜索
- **文件搜索** - 本地文件快速搜索工具

### 快捷工具
- **文件快速启动** - 快速访问常用文件和目录，支持分组管理、拖拽排序
- **网页快速打开** - 快速访问常用网站，支持分组管理、拖拽排序

### 网络工具
- **网络信息** - 查看本地网络 IP 信息
- **IP 子网计算** - IP 子网掩码范围转换，支持 CIDR、范围格式
- **IP 查找** - 批量 IP 查找工具，支持多格式子网匹配、IPv4/IPv6

### 系统工具
- **进程查看** - 查看系统进程、CPU、内存、GPU 信息

### 安全工具
- **密码管理** - 密码生成与存储管理，支持分组管理、拖拽排序、批量操作

### 设置
- **应用设置** - 应用程序配置管理

## 技术栈

- **前端框架**: React 19.2
- **类型系统**: TypeScript 5.4
- **桌面框架**: Electron 42.4
- **UI 组件库**: Ant Design 6.4
- **拖拽排序**: @dnd-kit
- **构建工具**: Vite 8.0 + electron-builder

## 安全特性

- ✅ **密码加密存储** - 使用 Electron `safeStorage`（系统级加密：Windows DPAPI / macOS Keychain）
- ✅ **命令注入防护** - 使用 `execFile` 参数化调用，禁止字符串拼接
- ✅ **内容安全策略 (CSP)** - 严格的 CSP 配置，限制资源加载
- ✅ **URL 协议白名单** - 仅允许 http/https/ftp/mailto 等安全协议
- ✅ **生产环境 DevTools 关闭** - 仅开发模式启用
- ✅ **sandbox 启用** - BrowserWindow sandbox 安全隔离

## 项目结构

```
src/
├── tools/                    # 工具组件目录
│   ├── common/              # 公共组件和 hooks
│   │   ├── components/      # 公共 UI 组件
│   │   │   ├── BatchMoveModal.tsx      # 批量移动弹窗
│   │   │   ├── GroupDropZone.tsx      # 分组拖拽区域
│   │   │   ├── GroupItem.tsx          # 分组项组件
│   │   │   ├── GroupPanel.tsx         # 分组面板
│   │   │   └── SortableItemBase.tsx   # 可排序项基础组件
│   │   ├── hooks/          # 公共 Hooks
│   │   │   ├── useBatchSelection.ts   # 批量选择管理
│   │   │   ├── useConfigPersistence.ts # 配置持久化
│   │   │   ├── useDragAndDrop.ts      # 拖拽排序
│   │   │   └── useGroupManagement.ts  # 分组管理
│   │   └── utils/          # 工具函数
│   ├── datetime/           # 时间日期工具
│   ├── encoding/           # 编码转换工具
│   ├── examples/          # 示例工具
│   ├── filesearch/        # 文件搜索工具
│   ├── filelauncher/      # 文件启动工具
│   ├── network/           # 网络工具
│   ├── security/          # 安全工具
│   ├── settings/          # 设置工具
│   ├── system/            # 系统工具
│   ├── text/              # 文本处理工具
│   └── webopener/         # 网页打开工具
├── components/             # 全局组件
├── context/                # React Context
├── electron/               # Electron 主进程
└── types/                  # 类型定义

electron/
├── main.ts                 # Electron 主进程入口
├── preload.ts              # 预加载脚本
└── logger.ts              # 日志工具

scripts/
└── afterPack.js           # 打包后优化脚本（清理未使用的 Chromium 语言包）
```

## 安装与运行

### 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建应用

```bash
npm run build
```

构建完成后，安装包位于 `release/` 目录下：
- `DevTools Setup 1.4.0.exe` - NSIS 安装包（约 100 MB）
- `DevTools 1.4.0.exe` - 便携版（约 100 MB）

### 安装说明

应用安装时支持自定义安装目录：
- **非一键安装模式** - 用户可以选择安装位置
- **每用户安装** - 安装到用户目录，避免权限问题
- **创建桌面快捷方式** - 自动创建桌面快捷方式
- **创建开始菜单** - 自动创建开始菜单项

### 打包体积优化

应用通过以下方式优化打包体积：
- **删除未使用的 Chromium 语言包** - 仅保留中英日韩语言包，节省约 45 MB
- **maximum 压缩** - 使用最高压缩率
- **asar 打包** - 应用代码和资源打包为 asar 格式

## 配置持久化

### 配置存储位置

应用配置存储在**安装目录**下的 `config/` 子目录：

```
安装目录/
├── DevTools.exe           # 应用程序
├── config/                # 配置文件目录
│   ├── app-config.json    # 应用配置
│   ├── shortcuts.json     # 文件快速启动配置
│   ├── websites.json       # 网页快速打开配置
│   └── passwords.json     # 密码管理配置（已加密）
└── logs/                  # 日志文件目录
```

**重要**：配置文件随安装目录移动，卸载应用不会删除配置（需手动删除安装目录）。

### 旧配置迁移

首次启动时，如果检测到旧版本配置（位于用户数据目录），会自动迁移到新位置：
- **Windows**: `%APPDATA%/toolbox/config/` → `安装目录/config/`
- **macOS**: `~/Library/Application Support/toolbox/config/` → `安装目录/config/`

### 备份与恢复

应用支持自动备份配置：
- **自动备份** - 每次保存配置前自动创建备份
- **定时备份** - 可设置定时自动备份
- **备份保留数量** - 默认保留 5 个备份
- **手动备份** - 支持手动创建完整备份
- **恢复备份** - 支持从备份列表恢复配置
- **导入外部备份** - 支持导入外部备份目录

备份存储在 `config/backups/` 目录下。

### 配置文件说明

- `app-config.json` - 应用设置（主题、快捷键、备份配置等）
- `shortcuts.json` - 文件快速启动配置
- `websites.json` - 网页快速打开配置
- `passwords.json` - 密码管理配置（**已加密存储**）

## 开发指南

### 添加新工具

1. 在 `src/tools/` 下创建新的工具目录
2. 创建工具组件，实现工具功能
3. 在 `src/tools/index.tsx` 中注册工具

示例：

```tsx
// src/tools/mytool/MyTool.tsx
import React from 'react';

export const MyTool: React.FC = () => {
  return <div>我的工具</div>;
};
```

```tsx
// src/tools/index.tsx
import { MyTool } from './mytool/MyTool';

// 注册工具
toolRegistry.registerTool({
  id: 'my-tool',
  name: '我的工具',
  description: '工具描述',
  category: 'general',
  icon: <ToolOutlined />,
  component: MyTool
});
```

### 添加新分类

```tsx
toolRegistry.registerCategory({
  id: 'my-category',
  name: '我的分类',
  icon: <MyIcon />
});
```

## 参与贡献

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 许可证

本项目基于 MIT 许可证开源，详见 [LICENSE](LICENSE) 文件。

## 致谢

- [Electron](https://electronjs.org/) - 使用 Electron 构建跨平台桌面应用
- [React](https://reactjs.org/) - 用户界面库
- [Ant Design](https://ant.design/) - 企业级 UI 设计语言
- [@dnd-kit](https://dndkit.com/) - 轻量级拖拽排序库
- [Vite](https://vitejs.dev/) - 下一代前端构建工具
