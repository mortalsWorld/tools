# Toolbox

A modern general-purpose tool collection desktop application, built with Tauri 2.x + React + TypeScript. Compared to the Electron version, it has smaller size and lower memory usage.

![License](https://img.shields.io/badge/license-CC%20BY--NC%204.0-yellow.svg)
![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8D8?style=flat-square&logo=tauri)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript)

## Features

### General
- **Welcome** - Application introduction and quick access

### Text Processing
- **Code Formatter** - JSON/XML formatting and minification
- **Markdown Preview** - Real-time Markdown preview and editing
- **Regex Tester** - Regular expression testing with real-time highlighting

### Encoding
- **Encoder/Decoder** - Base64/URL/Hex/Unicode encoding and decoding

### Date & Time
- **Date/Time Converter** - Timestamp and date format conversion

### File Search
- **File Search** - Local file fast search tool

### Quick Tools
- **File Launcher** - Quick access to frequently used files and directories, supports group management and drag-to-sort
- **Web Opener** - Quick access to frequently visited websites, supports group management and drag-to-sort

### Network
- **Network Info** - View local network IP information and public IP
- **HTTP Test** - HTTP request testing tool
- **IP Subnet Calculator** - IP subnet mask range conversion, supports CIDR and range formats
- **IP Lookup** - Batch IP lookup tool, supports multi-format subnet matching, IPv4/IPv6

### System
- **Process Viewer** - View system processes, CPU, memory information

### Security
- **Password Manager** - Password generation and storage management, supports group management, drag-to-sort, and batch operations

### Settings
- **Settings** - Application configuration management

## Tech Stack

- **Frontend Framework**: React 19
- **Type System**: TypeScript 5.6
- **Desktop Framework**: Tauri 2.x (Rust-based)
- **UI Component Library**: Ant Design 6.4
- **Drag & Drop**: @dnd-kit 6.3
- **Build Tool**: Vite 8

## Security Features

- ✅ **Password Encryption** - XOR encryption with local key storage
- ✅ **Global Shortcuts** - Quick show/hide window with keyboard shortcuts
- ✅ **Window Behavior Control** - Support minimize to tray on close
- ✅ **Auto Config Migration** - Automatically detect and migrate old Electron config on startup

## Project Structure

```
src/
├── tools/                    # Tool components directory
│   ├── common/              # Common components and hooks
│   │   ├── components/      # Common UI components
│   │   ├── hooks/           # Common hooks
│   │   └── utils/           # Utility functions
│   ├── datetime/            # Date/time tools
│   ├── encoding/            # Encoding tools
│   ├── examples/            # Example tools
│   ├── filesearch/          # File search tools
│   ├── filelauncher/        # File launcher tools
│   ├── network/             # Network tools
│   ├── security/            # Security tools
│   ├── settings/            # Settings tools
│   ├── system/              # System tools
│   └── text/                # Text processing tools
├── components/              # Global components
├── context/                 # React Context
└── lib/                     # Utility libraries

src-tauri/
├── src/
│   ├── main.rs              # Tauri main process entry
│   ├── lib.rs               # Library entry
│   └── commands.rs          # Rust backend commands
├── Cargo.toml               # Rust dependencies
└── tauri.conf.json          # Tauri configuration
```

## Installation & Usage

### Requirements

- Node.js >= 18.0.0
- Rust >= 1.77.0
- npm >= 9.0.0

### Install Dependencies

```bash
npm install
```

### Development Mode

```bash
npm run dev:tauri
```

### Build Application

```bash
npm run build:tauri
```

After building, packages are located in `src-tauri/target/release/bundle/`:
- `nsis/工具箱_1.6.0_x64-setup.exe` - NSIS installer
- Portable version can run `src-tauri/target/release/app.exe` directly

## Config Persistence

Application configs are stored in the **runtime directory** under the `config/` subdirectory:

```
runtime-directory/
├── app.exe                  # Application
├── app_lib.dll              # Dynamic library
├── config/                  # Config directory
│   ├── app-config.json      # App settings
│   ├── file-launcher.json   # File launcher config
│   ├── web-opener.json      # Web opener config
│   ├── passwords.json       # Password manager config (encrypted)
│   └── backups/             # Config backup directory
└── logs/                    # Log files directory
```

### Auto Config Migration

On first startup, if old config is detected, it will be automatically migrated from:
- `%APPDATA%/toolbox/config/` (default installation)
- `config/` in runtime directory (portable version)

### Config Files

- `app-config.json` - App settings (theme, shortcuts, backup config, window behavior, toolbar customization, etc.)
- `file-launcher.json` - File launcher config (supports group management, drag-to-sort)
- `web-opener.json` - Web opener config (supports group management, drag-to-sort)
- `passwords.json` - Password manager config (**encrypted storage**, supports group management)

## Development Guide

### Adding a New Tool

1. Create a new tool directory under `src/tools/`
2. Create the tool component and implement the functionality
3. Register the tool in `src/tools/index.tsx`

Example:

```tsx
// src/tools/mytool/MyTool.tsx
import React from 'react';

export const MyTool: React.FC = () => {
  return <div>My Tool</div>;
};
```

```tsx
// src/tools/index.tsx
import { MyTool } from './mytool/MyTool';

// Register the tool
toolRegistry.registerTool({
  id: 'my-tool',
  name: 'My Tool',
  description: 'Tool description',
  category: 'general',
  icon: <ToolOutlined />,
  component: MyTool
});
```

## License

This project is open source under the **CC BY-NC 4.0 License (Attribution-NonCommercial)**. See [LICENSE](LICENSE) for details.

**Usage Restrictions:**
- ✅ Personal learning, research, and non-commercial use allowed
- ✅ Modification and distribution of derivative works allowed (with copyright notice)
- ❌ Any form of commercial use is prohibited
- ❌ Integration into commercial products or services is prohibited

For commercial licensing, please contact the author for written permission.

## Acknowledgements

- [Tauri](https://tauri.app/) - Build smaller, faster, and more secure desktop apps
- [React](https://reactjs.org/) - The library for web and native user interfaces
- [Ant Design](https://ant.design/) - An enterprise-class UI design language
- [@dnd-kit](https://dndkit.com/) - A lightweight, modular drag & drop toolkit
- [Vite](https://vitejs.dev/) - Next generation frontend tooling