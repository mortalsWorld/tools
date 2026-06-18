import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  searchFiles: (directory: string, pattern: string) =>
    ipcRenderer.invoke('search-files', directory, pattern),
  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
  openUrl: (url: string) => ipcRenderer.invoke('open-url', url),
  // HTTP 请求（在主进程中发起，不受浏览器 CORS 限制）
  httpRequest: (options: {
    url: string
    method: string
    headers?: Record<string, string>
    body?: string
    timeoutMs?: number
    proxy?: {
      url: string
      auth?: { username: string; password: string }
    }
  }) => ipcRenderer.invoke('http-request', options),
  loadConfig: (fileName: string) => ipcRenderer.invoke('load-config', fileName),
  saveConfig: (fileName: string, data: any) => ipcRenderer.invoke('save-config', fileName, data),
  // Process management
  getProcesses: () => ipcRenderer.invoke('get-processes'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  killProcess: (pid: number) => ipcRenderer.invoke('kill-process', pid),
  killProcesses: (pids: number[]) => ipcRenderer.invoke('kill-processes', pids),
  searchFileHandle: (filePath: string) => ipcRenderer.invoke('search-file-handle', filePath),
  // Password management
  getPasswords: () => ipcRenderer.invoke('get-passwords'),
  savePassword: (password: any) => ipcRenderer.invoke('save-password', password),
  deletePassword: (id: string) => ipcRenderer.invoke('delete-password', id),
  generatePassword: (options: {
    length: number;
    includeNumbers: boolean;
    includeSymbols: boolean;
    includeUppercase: boolean;
    includeLowercase: boolean;
    customSymbols?: string[];
  }) => ipcRenderer.invoke('generate-password', options),
  // App config management
  getAppConfig: () => ipcRenderer.invoke('get-app-config'),
  saveAppConfig: (config: any) => ipcRenderer.invoke('save-app-config', config),
  resetAppConfig: () => ipcRenderer.invoke('reset-app-config'),
  // Backup settings management
  getBackupSettings: () => ipcRenderer.invoke('get-backup-settings'),
  saveBackupSettings: (settings: { backupEnabled: boolean, backupCount: number }) =>
    ipcRenderer.invoke('save-backup-settings', settings),
  // Backup management
  selectBackupDirectory: () => ipcRenderer.invoke('select-backup-directory'),
  getBackupDir: () => ipcRenderer.invoke('get-backup-dir'),
  createFullBackup: (note?: string) => ipcRenderer.invoke('create-full-backup', note),
  getBackupList: () => ipcRenderer.invoke('get-backup-list'),
  deleteBackup: (backupId: string) => ipcRenderer.invoke('delete-backup', backupId),
  restoreBackup: (backupId: string) => ipcRenderer.invoke('restore-backup', backupId),
  importBackup: (backupPath: string) => ipcRenderer.invoke('import-backup', backupPath),
  // Config directory migration
  migrateConfigDir: (newDir: string, fullConfig?: any) => ipcRenderer.invoke('migrate-config-dir', newDir, fullConfig),
  // Icon management
  selectIcon: () => ipcRenderer.invoke('select-icon'),
  getFileIcon: (filePath: string) => ipcRenderer.invoke('get-file-icon', filePath),
  // Shortcut resolution
  resolveShortcut: (lnkPath: string) => ipcRenderer.invoke('resolve-shortcut', lnkPath),
  // Event listeners
  onShortcutTriggered: (callback: (toolId: string) => void) => {
    const listener = (_event: any, toolId: string) => callback(toolId);
    ipcRenderer.on('shortcut-triggered', listener);
    return () => {
      ipcRenderer.removeListener('shortcut-triggered', listener);
    };
  },
  onConfigChanged: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('config-changed', listener);
    return () => {
      ipcRenderer.removeListener('config-changed', listener);
    };
  },
  onNavigateTo: (callback: (toolId: string) => void) => {
    const listener = (_event: any, toolId: string) => callback(toolId);
    ipcRenderer.on('navigate-to', listener);
    return () => {
      ipcRenderer.removeListener('navigate-to', listener);
    };
  }
})
