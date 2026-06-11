/**
 * 分组管理 Hook
 * 提供分组管理的完整功能
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Group, BaseItem } from '../types';
import { getChildGroups, getGroupPath, ensureSortOrder } from '../utils/groupUtils';

export interface UseGroupManagementOptions {
  groups: Group[];
  onSave?: (groups: Group[]) => void;
  isEditMode?: boolean;
}

export interface UseGroupManagementReturn {
  expandedGroups: Set<string>;
  setExpandedGroups: React.Dispatch<React.SetStateAction<Set<string>>>;
  getChildGroups: (parentId: string | null) => Group[];
  toggleGroup: (groupId: string, e: React.MouseEvent) => void;
  getGroupPath: (groupId: string) => string;
  getGroupItemCount: (groupId: string, items: BaseItem[]) => number;
  handleGroupDrop: (draggedGroupId: string, targetGroupId: string) => void;
  saveGroups: (newGroups: Group[]) => void;
}

export function useGroupManagement(options: UseGroupManagementOptions): UseGroupManagementReturn {
  const { groups, onSave, isEditMode = false } = options;

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // 使用 ref 追踪是否已初始化，避免重复展开
  const initializedRef = useRef(false);

  // 自动展开顶级分组（只在初始化时执行一次）
  useEffect(() => {
    if (initializedRef.current) return;
    
    const topLevelGroups = groups.filter(g => g.parentId === null);
    if (topLevelGroups.length > 0) {
      const newExpanded = new Set<string>();
      topLevelGroups.forEach(group => {
        newExpanded.add(group.id);
      });
      setExpandedGroups(newExpanded);
      initializedRef.current = true;
    }
  }, [groups]);

  const saveGroups = useCallback((newGroups: Group[]) => {
    onSave?.(newGroups);
  }, [onSave]);

  const getChildGroupsMemoized = useCallback((parentId: string | null): Group[] => {
    return getChildGroups(groups, parentId);
  }, [groups]);

  const toggleGroup = useCallback((groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  }, []);

  const getGroupPathMemoized = useCallback((groupId: string): string => {
    return getGroupPath(groups, groupId);
  }, [groups]);

  const getGroupItemCount = useCallback((groupId: string, items: BaseItem[]): number => {
    if (groupId === 'all') return items.length;
    return items.filter(item => item.group === groupId).length;
  }, []);

  const handleGroupDrop = useCallback((draggedGroupId: string, targetGroupId: string) => {
    console.log(`[useGroupManagement] handleGroupDrop called: ${draggedGroupId} -> ${targetGroupId}, 编辑模式: ${isEditMode}`);
    console.log(`[useGroupManagement] 当前分组列表:`, JSON.stringify(groups, null, 2));
    
    if (!targetGroupId || !draggedGroupId || draggedGroupId === targetGroupId) {
      console.log(`[useGroupManagement] 参数无效或拖拽到自身`);
      return;
    }

    const activeGroup = groups.find(g => g.id === draggedGroupId);
    if (!activeGroup) {
      console.log(`[useGroupManagement] 找不到拖拽的分组: ${draggedGroupId}`);
      return;
    }

    let updatedGroups = [...groups];

    if (targetGroupId === 'all') {
      // 移动到顶层（仅编辑模式）
      if (!isEditMode) {
        console.log(`[useGroupManagement] 非编辑模式下不能移动到顶层`);
        return;
      }
      console.log(`[useGroupManagement] 编辑模式 - 移动到顶层`);
      const updateGroupHierarchy = (groupId: string, parentId: string | null, level: number): Group[] => {
        let result: Group[] = [];
        const current = groups.find(g => g.id === groupId);
        if (current) result.push({ ...current, parentId, level });
        const children = groups.filter(g => g.parentId === groupId);
        for (const child of children) {
          result = [...result, ...updateGroupHierarchy(child.id, groupId, level + 1)];
        }
        return result;
      };

      const updatedHierarchy = updateGroupHierarchy(draggedGroupId, null, 1);
      updatedHierarchy.forEach(updatedGroup => {
        updatedGroups = updatedGroups.map(g => g.id === updatedGroup.id ? updatedGroup : g);
      });
    } else {
      const targetGroup = groups.find(g => g.id === targetGroupId);
      if (!targetGroup) {
        console.log(`[useGroupManagement] 找不到目标分组: ${targetGroupId}`);
        return;
      }

      // 检查是否移动到自己的子分组
      const isDescendant = (parentId: string | null, checkId: string): boolean => {
        const children = groups.filter(g => g.parentId === parentId);
        for (const child of children) {
          if (child.id === checkId) return true;
          if (isDescendant(child.id, checkId)) return true;
        }
        return false;
      };
      if (isDescendant(draggedGroupId, targetGroupId)) {
        console.log(`[useGroupManagement] 不能移动到自己的子分组`);
        return;
      }

      if (!isEditMode) {
        // 非编辑模式：仅同层级同父分组排序
        console.log(`[useGroupManagement] 非编辑模式 - 同层级排序`);
        
        if (activeGroup.level !== targetGroup.level || activeGroup.parentId !== targetGroup.parentId) {
          console.log(`[useGroupManagement] 非编辑模式下只能同层级排序，跳过`);
          return;
        }

        const siblings = groups.filter(g => g.parentId === activeGroup.parentId);
        const oldIndex = siblings.findIndex(g => g.id === draggedGroupId);
        const newIndex = siblings.findIndex(g => g.id === targetGroupId);
        
        console.log(`[useGroupManagement] oldIndex=${oldIndex}, newIndex=${newIndex}`);
        
        if (oldIndex !== -1 && newIndex !== -1) {
          // 先按 sortOrder 排序 siblings
          const sortedSiblings = [...siblings].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
          const sortedOldIndex = sortedSiblings.findIndex(g => g.id === draggedGroupId);
          const sortedNewIndex = sortedSiblings.findIndex(g => g.id === targetGroupId);
          
          console.log(`[useGroupManagement] 排序后 - sortedOldIndex=${sortedOldIndex}, sortedNewIndex=${sortedNewIndex}`);
          
          const newSiblings = [...sortedSiblings];
          const [removed] = newSiblings.splice(sortedOldIndex, 1);
          newSiblings.splice(sortedNewIndex, 0, removed);
          
          updatedGroups = groups.map(group => {
            const newSibling = newSiblings.find(s => s.id === group.id);
            if (newSibling) return { ...group, sortOrder: newSiblings.indexOf(newSibling) };
            return group;
          });
        }
      } else {
        // 编辑模式：跨层级移动（成为子分组）
        console.log(`[useGroupManagement] 编辑模式 - 跨层级移动`);
        
        // 检查目标分组是否已有子分组达到层级限制
        const getMaxLevel = (parentId: string | null, currentLevel: number): number => {
          let maxLevel = currentLevel;
          const children = groups.filter(g => g.parentId === parentId);
          for (const child of children) {
            const childMax = getMaxLevel(child.id, currentLevel + 1);
            if (childMax > maxLevel) maxLevel = childMax;
          }
          return maxLevel;
        };
        
        const activeGroupMaxLevel = getMaxLevel(draggedGroupId, activeGroup.level);
        const newMaxLevel = targetGroup.level + 1 + (activeGroupMaxLevel - activeGroup.level);
        
        console.log(`[useGroupManagement] activeGroupMaxLevel=${activeGroupMaxLevel}, newMaxLevel=${newMaxLevel}`);
        
        if (newMaxLevel > 3) {
          console.log(`[useGroupManagement] 超过最大层级限制: ${newMaxLevel} > 3`);
          return;
        }

        const newLevel = targetGroup.level + 1;

        const updateGroupHierarchy = (groupId: string, parentId: string | null, level: number): Group[] => {
          let result: Group[] = [];
          const current = groups.find(g => g.id === groupId);
          if (current) result.push({ ...current, parentId, level });
          const children = groups.filter(g => g.parentId === groupId);
          for (const child of children) {
            result = [...result, ...updateGroupHierarchy(child.id, groupId, level + 1)];
          }
          return result;
        };

        const updatedHierarchy = updateGroupHierarchy(draggedGroupId, targetGroupId, newLevel);
        updatedHierarchy.forEach(updatedGroup => {
          updatedGroups = updatedGroups.map(g => g.id === updatedGroup.id ? updatedGroup : g);
        });
      }
    }

    console.log(`[useGroupManagement] 更新后分组列表:`, JSON.stringify(updatedGroups, null, 2));
    saveGroups(ensureSortOrder(updatedGroups));
  }, [groups, saveGroups, isEditMode]);

  return {
    expandedGroups,
    setExpandedGroups,
    getChildGroups: getChildGroupsMemoized,
    toggleGroup,
    getGroupPath: getGroupPathMemoized,
    getGroupItemCount,
    handleGroupDrop,
    saveGroups,
  };
}