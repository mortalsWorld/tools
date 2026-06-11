/**
 * 分组工具函数
 * 用于处理分组相关的通用操作
 */

import { Group } from '../types';

/**
 * 获取子分组（排序后）
 * @param groups 所有分组列表
 * @param parentId 父分组ID，null 表示顶级分组
 * @returns 排序后的子分组列表
 */
export function getChildGroups(groups: Group[], parentId: string | null): Group[] {
  return groups
    .filter(g => g.parentId === parentId)
    .sort((a, b) => {
      if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
        return a.sortOrder - b.sortOrder;
      }
      return a.id.localeCompare(b.id);
    });
}

/**
 * 获取分组路径（如 "父分组 / 子分组"）
 * @param groups 所有分组列表
 * @param groupId 目标分组ID
 * @returns 分组路径字符串
 */
export function getGroupPath(groups: Group[], groupId: string): string {
  const path: string[] = [];
  let currentId: string | null = groupId;

  while (currentId) {
    const current = groups.find(g => g.id === currentId);
    if (!current) break;
    path.unshift(current.name);
    currentId = current.parentId;
  }

  return path.join(' / ');
}

/**
 * 检查是否是后代（用于循环引用检测）
 * @param groups 所有分组列表
 * @param parentId 父分组ID
 * @param checkId 要检查的分组ID
 * @returns 是否是后代
 */
export function isDescendant(groups: Group[], parentId: string | null, checkId: string): boolean {
  const children = groups.filter(g => g.parentId === parentId);
  for (const child of children) {
    if (child.id === checkId) return true;
    if (isDescendant(groups, child.id, checkId)) return true;
  }
  return false;
}

/**
 * 更新分组层级
 * @param groups 所有分组列表
 * @param groupId 要更新的分组ID
 * @param newParentId 新的父分组ID
 * @param newLevel 新的层级
 * @returns 更新后的分组列表
 */
export function updateGroupHierarchy(
  groups: Group[],
  groupId: string,
  newParentId: string | null,
  newLevel: number
): Group[] {
  let result: Group[] = [];

  // 更新当前分组
  const current = groups.find(g => g.id === groupId);
  if (current) {
    result.push({ ...current, parentId: newParentId, level: newLevel });
  }

  // 更新子分组 - 它们仍然保持为该分组的子分组，只有层级改变
  const children = getChildGroups(groups, groupId);
  for (const child of children) {
    result = [...result, ...updateGroupHierarchy(groups, child.id, groupId, newLevel + 1)];
  }

  return result;
}

/**
 * 按 sortOrder 排序分组
 * @param groups 所有分组列表
 * @returns 排序后的分组列表
 */
export function sortGroups(groups: Group[]): Group[] {
  return [...groups].sort((a, b) => {
    if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
      return a.sortOrder - b.sortOrder;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * 确保分组有 sortOrder 字段
 * @param groups 所有分组列表
 * @returns 带有 sortOrder 的分组列表
 */
export function ensureSortOrder(groups: Group[]): Group[] {
  return groups.map((group, index) => ({
    ...group,
    sortOrder: group.sortOrder !== undefined ? group.sortOrder : index
  }));
}