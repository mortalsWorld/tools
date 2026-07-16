import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export interface ProcessInfo {
  pid: number;
  name: string;
  memory: string;
  memoryBytes: number;
  cpuUsage: number;
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

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
}

export interface AppConfig {
  configDir?: string;
  shortcuts?: Record<string, string>;
  theme?: string;
  backupEnabled?: boolean;
  backupCount?: number;
  toolbarOrder?: string[];
  categoryOrder?: string[];
  hiddenTools?: string[];
  hiddenCategories?: string[];
  backupDir?: string;
  backupInterval?: number;
  backupIntervalUnit?: string;
  lastBackupTime?: number;
  windowShortcut?: string;
  logLevel?: string;
  closeToMinimize?: boolean;
}

class TauriAPI {
  platform = 'win32';

  // 文件系统操作
  async selectDirectory(): Promise<string | null> {
    return invoke('select_directory');
  }

  async selectFile(): Promise<string | null> {
    return invoke('select_file');
  }

  async searchFiles(directory: string, pattern: string): Promise<string[]> {
    return invoke('search_files', { directory, pattern });
  }

  async openFile(path: string): Promise<void> {
    return invoke('open_file', { path });
  }

  async openUrl(url: string): Promise<void> {
    return invoke('open_url', { url });
  }

  // HTTP 请求
  async httpRequest(options: {
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
  }): Promise<HttpResponse> {
    let proxyUrl: string | undefined;
    if (options.proxy) {
      proxyUrl = options.proxy.url;
    }

    return invoke('http_request', {
      options: {
        url: options.url,
        method: options.method,
        headers: options.headers,
        body: options.body,
        timeoutMs: options.timeoutMs,
        proxy: proxyUrl,
        useSystemProxy: options.useSystemProxy ?? false,
      }
    });
  }

  // 配置管理
  async loadConfig(fileName: string): Promise<any> {
    return invoke('load_config', { fileName });
  }

  async saveConfig(fileName: string, data: any): Promise<void> {
    return invoke('save_config', { fileName, data });
  }

  // 系统信息
  async getProcesses(): Promise<ProcessInfo[]> {
    const processes = await invoke<any[]>('get_processes');
    return processes.map(p => ({
      pid: p.pid,
      name: p.name,
      memory: p.memory,
      memoryBytes: p.memory_bytes,
      cpuUsage: p.cpu_usage,
    }));
  }

  async getSystemInfo(): Promise<SystemInfo> {
    const info = await invoke<any>('get_system_info');
    return {
      cpu: {
        name: info.cpu.name,
        cores: info.cpu.cores,
        logicalProcessors: info.cpu.logical_processors,
        maxSpeed: info.cpu.max_speed,
        usage: info.cpu.usage,
      },
      memory: {
        total: info.memory.total,
        free: info.memory.free,
        used: info.memory.used,
      },
    };
  }

  async getLocalNetworkInfo(): Promise<{ ipv4: string[]; ipv6: string[] }> {
    return invoke('get_local_network_info');
  }

  async killProcess(pid: number): Promise<{ success: boolean; error?: string }> {
    return invoke('kill_process', { pid });
  }

  async killProcesses(pids: number[]): Promise<{ success: boolean; errors: number[] }> {
    return invoke('kill_processes', { pids });
  }

  async searchFileHandle(filePath: string): Promise<{ Id: number; ProcessName: string }[]> {
    return invoke('search_file_handle', { filePath });
  }

  async searchDirectoryHandle(directoryPath: string): Promise<{ Id: number; ProcessName: string }[]> {
    // 在 Tauri 版本中暂时使用相同的命令
    return invoke('search_file_handle', { filePath: directoryPath });
  }

  // 密码管理
  async getPasswords(): Promise<any> {
    return invoke('get_passwords');
  }

  async savePassword(password: any): Promise<boolean> {
    return invoke('save_password', { passwordData: password });
  }

  async deletePassword(id: string): Promise<boolean> {
    return invoke('delete_password', { id });
  }

  async generatePassword(options: {
    length: number;
    includeNumbers: boolean;
    includeSymbols: boolean;
    includeUppercase: boolean;
    includeLowercase: boolean;
    customSymbols?: string[];
  }): Promise<string> {
    return invoke('generate_password', {
      length: options.length,
      includeNumbers: options.includeNumbers,
      includeSymbols: options.includeSymbols,
      includeUppercase: options.includeUppercase,
      includeLowercase: options.includeLowercase,
      customSymbols: options.customSymbols,
    });
  }

  // 应用配置
  async getAppConfig(): Promise<AppConfig> {
    return invoke('get_app_config');
  }

  async saveAppConfig(config: AppConfig): Promise<boolean> {
    return invoke('save_app_config', { config });
  }

  async resetAppConfig(): Promise<void> {
    return invoke('reset_app_config');
  }

  // 备份管理
  async getBackupSettings(): Promise<{ backupEnabled: boolean; backupCount: number }> {
    const config = await this.getAppConfig();
    return {
      backupEnabled: config.backupEnabled ?? true,
      backupCount: config.backupCount ?? 5,
    };
  }

  async saveBackupSettings(settings: { backupEnabled: boolean; backupCount: number }): Promise<boolean> {
    const config = await this.getAppConfig();
    config.backupEnabled = settings.backupEnabled;
    config.backupCount = settings.backupCount;
    return this.saveAppConfig(config);
  }

  async selectBackupDirectory(): Promise<string | null> {
    return invoke('select_backup_directory');
  }

  async getBackupDir(): Promise<string | null> {
    return invoke('get_backup_dir');
  }

  async createFullBackup(note?: string): Promise<any> {
    return invoke('create_full_backup', { note });
  }

  async getBackupList(): Promise<any[]> {
    return invoke('get_backup_list');
  }

  async deleteBackup(backupId: string): Promise<boolean> {
    return invoke('delete_backup', { backupId });
  }

  async restoreBackup(backupId: string): Promise<any> {
    return invoke('restore_backup', { backupId });
  }

  async importBackup(backupPath: string): Promise<any> {
    return invoke('import_backup', { backupPath });
  }

  async migrateConfigDir(newDir: string, fullConfig?: any): Promise<{ success: boolean; error?: string }> {
    return invoke('migrate_config_dir', { newDir, fullConfig });
  }

  // 图标管理
  async selectIcon(): Promise<{ path: string; base64: string } | null> {
    return invoke('select_icon');
  }

  async getFileIcon(filePath: string): Promise<{ base64: string }> {
    return invoke('get_file_icon', { filePath });
  }

  // 快捷方式
  async resolveShortcut(lnkPath: string): Promise<{ success: boolean; targetPath: string; isShortcut?: boolean; error?: string }> {
    return invoke('resolve_shortcut', { lnkPath });
  }

  // 全局快捷键
  async registerGlobalShortcut(shortcut: string, handler: string): Promise<boolean> {
    return invoke('register_global_shortcut', { shortcut, handler });
  }

  async unregisterGlobalShortcut(handler: string): Promise<boolean> {
    return invoke('unregister_global_shortcut', { handler });
  }

  async registerAllShortcuts(): Promise<boolean> {
    return invoke('register_all_shortcuts');
  }

  // 窗口控制
  async showWindow(): Promise<boolean> {
    return invoke('show_window');
  }

  async hideWindow(): Promise<boolean> {
    return invoke('hide_window');
  }

  async toggleWindow(): Promise<boolean> {
    return invoke('toggle_window');
  }

  // 事件监听
  onShortcutTriggered(callback: (toolId: string) => void): () => void {
    let unlisten: UnlistenFn | undefined;
    const setup = async () => {
      unlisten = await listen('shortcut-triggered', (event) => {
        callback(event.payload as string);
      });
    };
    setup();
    return () => {
      if (unlisten) unlisten();
    };
  }

  onConfigChanged(callback: () => void): () => void {
    let unlisten: UnlistenFn | undefined;
    const setup = async () => {
      unlisten = await listen('config-changed', () => {
        callback();
      });
    };
    setup();
    return () => {
      if (unlisten) unlisten();
    };
  }

  onNavigateTo(callback: (toolId: string) => void): () => void {
    let unlisten: UnlistenFn | undefined;
    const setup = async () => {
      unlisten = await listen('navigate-to', (event) => {
        callback(event.payload as string);
      });
    };
    setup();
    return () => {
      if (unlisten) unlisten();
    };
  }
}

const tauriAPI = new TauriAPI();

// 导出到全局 window 对象
if (typeof window !== 'undefined') {
  (window as any).electronAPI = tauriAPI;
  (window as any).tauriAPI = tauriAPI;
}

export default tauriAPI;
export { tauriAPI };