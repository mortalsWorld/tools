export interface ProcessInfo {
  pid: number;
  name: string;
  memory: string;
  memoryBytes: number;
  cpuUsage: number;
  ports: number[];
}

export interface SystemInfo {
  cpu: {
    name: string;
    cores: number;
    logicalProcessors: number;
    maxSpeed: number;
    usage?: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
  };
}

export interface SearchHit {
  path: string;
  name: string;
  /** 小写扩展名（含点号），目录为空字符串 */
  ext: string;
  isDir: boolean;
  size: number;
  modified: number;
  score: number;
}

export interface SearchResponse {
  results: SearchHit[];
  indexedCount: number;
  fromCache: boolean;
  elapsedMs: number;
  warnings: string[];
}

export interface WindowsSettingItem {
  name: string;
  uri: string;
  category: string;
}

export interface IElectronAPI {
  platform: string;
  selectDirectory: () => Promise<string | null>;
  selectFile: () => Promise<string | null>;
  searchFiles: (directory: string, pattern: string) => Promise<string[]>;
  searchFilesAdvanced: (
    directory: string,
    query: string,
    limit?: number,
    refresh?: boolean,
    sortBy?: string,
    sortDesc?: boolean
  ) => Promise<SearchResponse>;
  clearFileIndex: (directory?: string) => Promise<boolean>;
  searchWindowsSettings: (keyword: string, limit?: number) => Promise<WindowsSettingItem[]>;
  openWindowsSetting: (uri: string) => Promise<void>;
  openFile: (path: string) => Promise<void>;
  openUrl: (url: string) => Promise<void>;
  httpRequest: (options: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    proxy?: {
      url: string;
      auth?: { username: string; password: string };
    };
    useSystemProxy?: boolean;
  }) => Promise<any>;
  loadConfig: (fileName: string) => Promise<any>;
  saveConfig: (fileName: string, data: any) => Promise<void>;
  getProcesses: () => Promise<ProcessInfo[]>;
  getSystemInfo: () => Promise<SystemInfo>;
  killProcess: (pid: number) => Promise<{ success: boolean; error?: string }>;
  killProcesses: (pids: number[]) => Promise<{ success: boolean; errors: number[] }>;
  searchFileHandle: (filePath: string) => Promise<{ Id: number; ProcessName: string }[]>;
  searchDirectoryHandle: (directoryPath: string) => Promise<{ Id: number; ProcessName: string }[]>;
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
  getAppConfig: () => Promise<any>;
  saveAppConfig: (config: any) => Promise<boolean>;
  resetAppConfig: () => Promise<void>;
  getBackupSettings: () => Promise<{ backupEnabled: boolean; backupCount: number }>;
  saveBackupSettings: (settings: { backupEnabled: boolean; backupCount: number }) => Promise<boolean>;
  selectBackupDirectory: () => Promise<string | null>;
  getBackupDir: () => Promise<string | null>;
  createFullBackup: (note?: string) => Promise<any>;
  getBackupList: () => Promise<any[]>;
  deleteBackup: (backupId: string) => Promise<boolean>;
  restoreBackup: (backupId: string) => Promise<any>;
  importBackup: (backupPath: string) => Promise<any>;
  migrateConfigDir: (newDir: string, fullConfig?: any) => Promise<{ success: boolean; error?: string }>;
  selectIcon: () => Promise<{ path: string; base64: string } | null>;
  getFileIcon: (filePath: string) => Promise<{ base64: string }>;
  resolveShortcut: (lnkPath: string) => Promise<{ success: boolean; targetPath: string; isShortcut?: boolean; error?: string }>;
  registerGlobalShortcut: (shortcut: string, handler: string) => Promise<boolean>;
  unregisterGlobalShortcut: (handler: string) => Promise<boolean>;
  registerAllShortcuts: () => Promise<boolean>;
  showWindow: () => Promise<boolean>;
  hideWindow: () => Promise<boolean>;
  toggleWindow: () => Promise<boolean>;
  minimizeWindow: () => Promise<boolean>;
  quitApp: () => Promise<boolean>;
  onShortcutTriggered: (callback: (toolId: string) => void) => () => void;
  onConfigChanged: (callback: () => void) => () => void;
  onNavigateTo: (callback: (toolId: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

export {};
