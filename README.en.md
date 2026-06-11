# Toolbox

A modern general-purpose tool collection desktop application, built with Electron + React + TypeScript.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Electron](https://img.shields.io/badge/Electron-31.7.7-47848F?style=flat-square&logo=electron)
![React](https://img.shields.io/badge/React-18.3.1-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4.5-3178C6?style=flat-square&logo=typescript)

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
- **Network Info** - View local network IP information
- **IP Subnet Calculator** - IP subnet mask range conversion, supports CIDR and range formats
- **IP Lookup** - Batch IP lookup tool, supports multi-format subnet matching, IPv4/IPv6

### System
- **Process Viewer** - View system processes, CPU, memory, GPU information

### Security
- **Password Manager** - Password generation and storage management, supports group management, drag-to-sort, and batch operations

### Settings
- **Settings** - Application configuration management

## Tech Stack

- **Frontend Framework**: React 18.3
- **Type System**: TypeScript 5.4
- **Desktop Framework**: Electron 31.7
- **UI Component Library**: Ant Design 6.4
- **Drag & Drop**: @dnd-kit
- **Build Tools**: Vite 5.3 + electron-builder

## Project Structure

```
src/
├── tools/                    # Tool components directory
│   ├── common/              # Common components and hooks
│   │   ├── components/      # Common UI components
│   │   │   ├── BatchMoveModal.tsx      # Batch move modal
│   │   │   ├── GroupDropZone.tsx      # Group drag zone
│   │   │   ├── GroupItem.tsx          # Group item component
│   │   │   ├── GroupPanel.tsx         # Group panel
│   │   │   └── SortableItemBase.tsx   # Sortable item base component
│   │   ├── hooks/          # Common hooks
│   │   │   ├── useBatchSelection.ts   # Batch selection management
│   │   │   ├── useConfigPersistence.ts # Config persistence
│   │   │   ├── useDragAndDrop.ts      # Drag and drop
│   │   │   └── useGroupManagement.ts  # Group management
│   │   └── utils/          # Utility functions
│   ├── datetime/           # Date/time tools
│   ├── encoding/           # Encoding tools
│   ├── examples/          # Example tools
│   ├── filesearch/        # File search tools
│   ├── filelauncher/      # File launcher tools
│   ├── network/           # Network tools
│   ├── security/          # Security tools
│   ├── settings/          # Settings tools
│   ├── system/            # System tools
│   ├── text/              # Text processing tools
│   └── webopener/         # Web opener tools
├── components/             # Global components
├── context/                # React Context
├── electron/               # Electron main process
└── types/                  # Type definitions

electron/
├── main.ts                 # Electron main process entry
├── preload.ts              # Preload script
└── logger.ts              # Logger utility
```

## Installation & Usage

### Requirements

- Node.js >= 18.0.0
- npm >= 9.0.0

### Install Dependencies

```bash
npm install
```

### Development Mode

```bash
npm run dev
```

### Build Application

```bash
npm run build
```

After building, the packages are located in the `release/` directory:
- `DevTools Setup 1.0.0.exe` - NSIS installer
- `DevTools 1.0.0.exe` - Portable version

## Config Persistence

Application configs are stored in the user data directory:
- **Windows**: `%APPDATA%/toolbox/config/`
- **macOS**: `~/Library/Application Support/toolbox/config/`
- **Linux**: `~/.config/toolbox/config/`

Configs for each tool are stored in JSON format:
- `shortcuts.json` - File launcher config
- `websites.json` - Web opener config
- `passwords.json` - Password manager config

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

### Adding a New Category

```tsx
toolRegistry.registerCategory({
  id: 'my-category',
  name: 'My Category',
  icon: <MyIcon />
});
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Create a Pull Request

## License

This project is open source under the MIT license. See [LICENSE](LICENSE) for details.

## Acknowledgements

- [Electron](https://electronjs.org/) - Build cross-platform desktop apps
- [React](https://reactjs.org/) - The library for web and native user interfaces
- [Ant Design](https://ant.design/) - An enterprise-class UI design language
- [@dnd-kit](https://dndkit.com/) - A lightweight, modular drag & drop toolkit
- [Vite](https://vitejs.dev/) - Next generation frontend tooling
