import { useCallback } from 'react';
import { IElectronAPI } from '../../../types/electron';

const getElectronAPI = (): IElectronAPI | null => {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return window.electronAPI;
  }
  return null;
};

export const useElectronAPI = () => {
  const electronAPI = useCallback(getElectronAPI, []);

  const safeInvoke = useCallback(<T extends (...args: any[]) => Promise<any>>(
    method: T | undefined,
    ...args: Parameters<T>
  ): ReturnType<T> | Promise<null> => {
    if (method) {
      return method(...args);
    }
    return Promise.resolve(null);
  }, []);

  const selectDirectory = useCallback(async () => {
    return safeInvoke(electronAPI()?.selectDirectory);
  }, [electronAPI, safeInvoke]);

  const selectFile = useCallback(async () => {
    return safeInvoke(electronAPI()?.selectFile);
  }, [electronAPI, safeInvoke]);

  const searchFiles = useCallback(async (directory: string, pattern: string) => {
    return safeInvoke(electronAPI()?.searchFiles, directory, pattern);
  }, [electronAPI, safeInvoke]);

  const openFile = useCallback(async (path: string) => {
    return safeInvoke(electronAPI()?.openFile, path);
  }, [electronAPI, safeInvoke]);

  const openUrl = useCallback(async (url: string) => {
    return safeInvoke(electronAPI()?.openUrl, url);
  }, [electronAPI, safeInvoke]);

  const httpRequest = useCallback(async (options: Parameters<IElectronAPI['httpRequest']>[0]) => {
    return safeInvoke(electronAPI()?.httpRequest, options);
  }, [electronAPI, safeInvoke]);

  const loadConfig = useCallback(async (fileName: string) => {
    return safeInvoke(electronAPI()?.loadConfig, fileName);
  }, [electronAPI, safeInvoke]);

  const saveConfig = useCallback(async (fileName: string, data: any) => {
    return safeInvoke(electronAPI()?.saveConfig, fileName, data);
  }, [electronAPI, safeInvoke]);

  const getProcesses = useCallback(async () => {
    return safeInvoke(electronAPI()?.getProcesses);
  }, [electronAPI, safeInvoke]);

  const getSystemInfo = useCallback(async () => {
    return safeInvoke(electronAPI()?.getSystemInfo);
  }, [electronAPI, safeInvoke]);

  const killProcess = useCallback(async (pid: number) => {
    return safeInvoke(electronAPI()?.killProcess, pid);
  }, [electronAPI, safeInvoke]);

  const killProcesses = useCallback(async (pids: number[]) => {
    return safeInvoke(electronAPI()?.killProcesses, pids);
  }, [electronAPI, safeInvoke]);

  const searchFileHandle = useCallback(async (filePath: string) => {
    return safeInvoke(electronAPI()?.searchFileHandle, filePath);
  }, [electronAPI, safeInvoke]);

  const getPasswords = useCallback(async () => {
    return safeInvoke(electronAPI()?.getPasswords);
  }, [electronAPI, safeInvoke]);

  const savePassword = useCallback(async (password: any) => {
    return safeInvoke(electronAPI()?.savePassword, password);
  }, [electronAPI, safeInvoke]);

  const deletePassword = useCallback(async (id: string) => {
    return safeInvoke(electronAPI()?.deletePassword, id);
  }, [electronAPI, safeInvoke]);

  const generatePassword = useCallback(async (options: Parameters<IElectronAPI['generatePassword']>[0]) => {
    return safeInvoke(electronAPI()?.generatePassword, options);
  }, [electronAPI, safeInvoke]);

  const getAppConfig = useCallback(async () => {
    return safeInvoke(electronAPI()?.getAppConfig);
  }, [electronAPI, safeInvoke]);

  const saveAppConfig = useCallback(async (config: any) => {
    return safeInvoke(electronAPI()?.saveAppConfig, config);
  }, [electronAPI, safeInvoke]);

  const resetAppConfig = useCallback(async () => {
    return safeInvoke(electronAPI()?.resetAppConfig);
  }, [electronAPI, safeInvoke]);

  const getBackupSettings = useCallback(async () => {
    return safeInvoke(electronAPI()?.getBackupSettings);
  }, [electronAPI, safeInvoke]);

  const saveBackupSettings = useCallback(async (settings: Parameters<IElectronAPI['saveBackupSettings']>[0]) => {
    return safeInvoke(electronAPI()?.saveBackupSettings, settings);
  }, [electronAPI, safeInvoke]);

  const selectBackupDirectory = useCallback(async () => {
    return safeInvoke(electronAPI()?.selectBackupDirectory);
  }, [electronAPI, safeInvoke]);

  const getBackupDir = useCallback(async () => {
    return safeInvoke(electronAPI()?.getBackupDir);
  }, [electronAPI, safeInvoke]);

  const createFullBackup = useCallback(async (note?: string) => {
    return safeInvoke(electronAPI()?.createFullBackup, note);
  }, [electronAPI, safeInvoke]);

  const getBackupList = useCallback(async () => {
    return safeInvoke(electronAPI()?.getBackupList);
  }, [electronAPI, safeInvoke]);

  const deleteBackup = useCallback(async (backupId: string) => {
    return safeInvoke(electronAPI()?.deleteBackup, backupId);
  }, [electronAPI, safeInvoke]);

  const restoreBackup = useCallback(async (backupId: string) => {
    return safeInvoke(electronAPI()?.restoreBackup, backupId);
  }, [electronAPI, safeInvoke]);

  const importBackup = useCallback(async (backupPath: string) => {
    return safeInvoke(electronAPI()?.importBackup, backupPath);
  }, [electronAPI, safeInvoke]);

  const migrateConfigDir = useCallback(async (newDir: string, fullConfig?: any) => {
    return safeInvoke(electronAPI()?.migrateConfigDir, newDir, fullConfig);
  }, [electronAPI, safeInvoke]);

  const selectIcon = useCallback(async () => {
    return safeInvoke(electronAPI()?.selectIcon);
  }, [electronAPI, safeInvoke]);

  const getFileIcon = useCallback(async (filePath: string) => {
    return safeInvoke(electronAPI()?.getFileIcon, filePath);
  }, [electronAPI, safeInvoke]);

  const resolveShortcut = useCallback(async (lnkPath: string) => {
    return safeInvoke(electronAPI()?.resolveShortcut, lnkPath);
  }, [electronAPI, safeInvoke]);

  const onShortcutTriggered = useCallback((callback: (toolId: string) => void) => {
    return electronAPI()?.onShortcutTriggered(callback) || (() => {});
  }, [electronAPI]);

  const onConfigChanged = useCallback((callback: () => void) => {
    return electronAPI()?.onConfigChanged(callback) || (() => {});
  }, [electronAPI]);

  const onNavigateTo = useCallback((callback: (toolId: string) => void) => {
    return electronAPI()?.onNavigateTo(callback) || (() => {});
  }, [electronAPI]);

  const platform = electronAPI()?.platform || 'unknown';

  return {
    platform,
    selectDirectory,
    selectFile,
    searchFiles,
    openFile,
    openUrl,
    httpRequest,
    loadConfig,
    saveConfig,
    getProcesses,
    getSystemInfo,
    killProcess,
    killProcesses,
    searchFileHandle,
    getPasswords,
    savePassword,
    deletePassword,
    generatePassword,
    getAppConfig,
    saveAppConfig,
    resetAppConfig,
    getBackupSettings,
    saveBackupSettings,
    selectBackupDirectory,
    getBackupDir,
    createFullBackup,
    getBackupList,
    deleteBackup,
    restoreBackup,
    importBackup,
    migrateConfigDir,
    selectIcon,
    getFileIcon,
    resolveShortcut,
    onShortcutTriggered,
    onConfigChanged,
    onNavigateTo,
    hasAPI: !!electronAPI()
  };
};
