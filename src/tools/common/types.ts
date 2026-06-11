/**
 * 通用类型定义
 * 用于 FileLauncherTool 和 WebOpenerTool 的共享类型
 */

export interface Group {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  sortOrder?: number;
}

export interface BaseItem {
  id: string;
  name: string;
  icon: string;
  group: string;
  iconData?: string;
  description?: string;
  sortOrder?: number;
}

export interface FileItem extends BaseItem {
  path: string;
  type: 'file' | 'directory';
}

export interface WebItem extends BaseItem {
  url: string;
}

export interface PasswordItem extends BaseItem {
  username: string;
  password: string;
  url?: string;
}

export const DEFAULT_GROUPS: Group[] = [
  { id: 'default', name: '默认分组', parentId: null, level: 1, sortOrder: 0 }
];