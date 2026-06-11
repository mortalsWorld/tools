export interface IElectronAPI {
  platform: string;
  selectDirectory: () => Promise<string | null>;
  selectFile: () => Promise<string | null>;
  searchFiles: (directory: string, pattern: string) => Promise<string[]>;
  openFile: (path: string) => Promise<void>;
  openUrl: (url: string) => Promise<void>;
  loadConfig: (fileName: string) => Promise<any>;
  saveConfig: (fileName: string, data: any) => Promise<void>;
  // Process management
  getProcesses: () => Promise<any[]>;
  getSystemInfo: () => Promise<any>;
  killProcess: (pid: number) => Promise<any>;
  killProcesses: (pids: number[]) => Promise<any>;
  searchFileHandle: (filePath: string) => Promise<any[]>;
  // Password management
  getPasswords: () => Promise<any>;
  savePassword: (password: any) => Promise<boolean>;
  deletePassword: (id: string) => Promise<boolean>;
  generatePassword: (options: {
    length: number;
    includeNumbers: boolean;
    includeSymbols: boolean;
    includeUppercase: boolean;
    includeLowercase: boolean;
    customSymbols?: string[];
  }) => Promise<string>;
  // App config management
  getAppConfig: () => Promise<any>;
  saveAppConfig: (config: any) => Promise<boolean>;
  // Backup settings management
  getBackupSettings: () => Promise<{ backupEnabled: boolean, backupCount: number }>;
  saveBackupSettings: (settings: { backupEnabled: boolean, backupCount: number }) => Promise<boolean>;
  // Backup management
  selectBackupDirectory: () => Promise<string | null>;
  getBackupDir: () => Promise<string | null>;
  createFullBackup: (note?: string) => Promise<any>;
  getBackupList: () => Promise<any[]>;
  deleteBackup: (backupId: string) => Promise<boolean>;
  restoreBackup: (backupId: string) => Promise<any>;
  importBackup: (backupPath: string) => Promise<any>;
  // Config directory migration
  migrateConfigDir: (newDir: string, fullConfig?: any) => Promise<{ success: boolean, error?: string }>;
  // Icon management
  selectIcon: () => Promise<{ path: string, base64: string } | null>;
  getFileIcon: (filePath: string) => Promise<{ base64: string }>;
  // Shortcut resolution
  resolveShortcut: (lnkPath: string) => Promise<{ success: boolean, targetPath: string, isShortcut?: boolean, error?: string }>;
  // Event listener
  onShortcutTriggered: (callback: (toolId: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

export {};
