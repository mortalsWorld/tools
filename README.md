# 工具箱 (Toolbox)

一个现代化的通用工具集合桌面应用程序，基于 Tauri 2.x + React + TypeScript 构建，相比 Electron 版本具有更小的体积和更低的内存占用。

![License](https://img.shields.io/badge/license-CC%20BY--NC%204.0-yellow.svg)
![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8D8?style=flat-square&logo=tauri)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript)

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
- **网络信息** - 查看本地网络 IP 信息、公网 IP
- **HTTP 测试** - HTTP 请求测试工具
- **IP 子网计算** - IP 子网掩码范围转换，支持 CIDR、范围格式
- **IP 查找** - 批量 IP 查找工具，支持多格式子网匹配、IPv4/IPv6

### 系统工具
- **进程查看** - 查看系统进程、CPU、内存信息

### 安全工具
- **密码管理** - 密码生成与存储管理，支持分组管理、拖拽排序、批量操作

### 设置
- **应用设置** - 应用程序配置管理

## 技术栈

- **前端框架**: React 19
- **类型系统**: TypeScript 5.6
- **桌面框架**: Tauri 2.x（基于 Rust）
- **UI 组件库**: Ant Design 6.4
- **拖拽排序**: @dnd-kit 6.3
- **构建工具**: Vite 8

## 安全特性

- ✅ **密码加密存储** - 使用 XOR 加密，密钥存储在本地
- ✅ **全局快捷键** - 支持快捷键快速显示/隐藏窗口
- ✅ **窗口行为控制** - 支持关闭按钮最小化到托盘
- ✅ **自动配置迁移** - 启动时自动检测并迁移旧版 Electron 配置

## 项目结构

```
src/
├── tools/                    # 工具组件目录
│   ├── common/              # 公共组件和 hooks
│   │   ├── components/      # 公共 UI 组件
│   │   ├── hooks/           # 公共 Hooks
│   │   └── utils/           # 工具函数
│   ├── datetime/            # 时间日期工具
│   ├── encoding/            # 编码转换工具
│   ├── examples/            # 示例工具
│   ├── filesearch/          # 文件搜索工具
│   ├── filelauncher/        # 文件启动工具
│   ├── network/             # 网络工具
│   ├── security/            # 安全工具
│   ├── settings/            # 设置工具
│   ├── system/              # 系统工具
│   └── text/                # 文本处理工具
├── components/              # 全局组件
├── context/                 # React Context
└── lib/                     # 工具库

src-tauri/
├── src/
│   ├── main.rs              # Tauri 主进程入口
│   ├── lib.rs               # 库入口
│   └── commands.rs          # Rust 后端命令
├── Cargo.toml               # Rust 依赖配置
└── tauri.conf.json          # Tauri 配置
```

## 安装与运行

### 环境要求

- Node.js >= 18.0.0
- Rust >= 1.77.0
- npm >= 9.0.0

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev:tauri
```

### 构建应用

```bash
npm run build:tauri
```

构建完成后，安装包位于 `src-tauri/target/release/bundle/` 目录下：
- `nsis/工具箱_1.6.0_x64-setup.exe` - NSIS 安装包
- 便携版可直接运行 `src-tauri/target/release/app.exe`

## 配置持久化

### 配置存储位置

应用配置存储在**运行目录**下的 `config/` 子目录：

```
运行目录/
├── app.exe                  # 应用程序
├── app_lib.dll              # 动态库
├── config/                  # 配置文件目录
│   ├── app-config.json      # 应用配置
│   ├── file-launcher.json   # 文件快速启动配置
│   ├── web-opener.json      # 网页快速打开配置
│   ├── passwords.json       # 密码管理配置（已加密）
│   └── backups/             # 配置备份目录
└── logs/                    # 日志文件目录
```

### 旧配置自动迁移

首次启动时，如果检测到旧版本配置，会自动迁移：
- `%APPDATA%/toolbox/config/` （默认安装位置）
- 运行目录下的 `config/` （便携版）

### 配置文件说明

- `app-config.json` - 应用设置（主题、快捷键、备份配置、窗口行为、工具栏自定义等）
- `file-launcher.json` - 文件快速启动配置（支持分组管理、拖拽排序）
- `web-opener.json` - 网页快速打开配置（支持分组管理、拖拽排序）
- `passwords.json` - 密码管理配置（**已加密存储**，支持分组管理）

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

## 许可证

本项目基于 **CC BY-NC 4.0 许可证（署名-非商业性使用）** 开源，详见 [LICENSE](LICENSE) 文件。

**使用限制：**
- ✅ 允许个人学习、研究和非商业使用
- ✅ 允许修改和分发衍生作品（需保留版权声明）
- ❌ 禁止任何形式的商业使用
- ❌ 禁止集成到商业产品或服务中

如需商业授权，请联系作者获得书面许可。

## 致谢

- [Tauri](https://tauri.app/) - 构建更小、更快、更安全的桌面应用
- [React](https://reactjs.org/) - 用户界面库
- [Ant Design](https://ant.design/) - 企业级 UI 设计语言
- [@dnd-kit](https://dndkit.com/) - 轻量级拖拽排序库
- [Vite](https://vitejs.dev/) - 下一代前端构建工具