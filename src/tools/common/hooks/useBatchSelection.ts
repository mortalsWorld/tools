/**
 * 批量选择 Hook
 * 提供批量选择功能
 */

import { useState, useCallback } from 'react';
import { BaseItem } from '../types';

export interface UseBatchSelectionReturn<T extends BaseItem> {
  selectedItemIds: Set<string>;
  setSelectedItemIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  isEditMode: boolean;
  setIsEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  toggleSelectItem: (id: string) => void;
  selectAll: (items: T[]) => void;
  clearSelection: () => void;
  batchMoveToGroup: (items: T[], targetGroupId: string, onSave: (items: T[]) => void) => T[];
}

export function useBatchSelection<T extends BaseItem>(): UseBatchSelectionReturn<T> {
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [isEditMode, setIsEditMode] = useState<boolean>(false);

  const toggleSelectItem = useCallback((id: string) => {
    setSelectedItemIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const selectAll = useCallback((items: T[]) => {
    setSelectedItemIds(new Set(items.map(item => item.id)));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedItemIds(new Set());
    setIsEditMode(false);
  }, []);

  const batchMoveToGroup = useCallback((items: T[], targetGroupId: string, onSave: (items: T[]) => void): T[] => {
    if (selectedItemIds.size === 0) return items;

    // 计算目标分组的最大 sortOrder
    const targetGroupMaxSortOrder = Math.max(
      ...items.filter(i => i.group === targetGroupId).map(i => i.sortOrder || 0),
      -1
    );

    // 更新选中项的分组
    let currentSortOrder = targetGroupMaxSortOrder + 1;
    const updatedItems = items.map(item => {
      if (selectedItemIds.has(item.id)) {
        return { ...item, group: targetGroupId, sortOrder: currentSortOrder++ };
      }
      return item;
    });

    onSave(updatedItems);
    clearSelection();
    return updatedItems;
  }, [selectedItemIds, clearSelection]);

  return {
    selectedItemIds,
    setSelectedItemIds,
    isEditMode,
    setIsEditMode,
    toggleSelectItem,
    selectAll,
    clearSelection,
    batchMoveToGroup,
  };
}