/**
 * 配置持久化 Hook
 * 提供配置的加载和保存功能
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { BaseItem, Group, DEFAULT_GROUPS } from '../types';
import { ensureSortOrder } from '../utils/groupUtils';

export interface UseConfigPersistenceOptions<T extends BaseItem> {
  configFileName: string;
  defaultItems?: T[];
  defaultGroups?: Group[];
}

export interface UseConfigPersistenceReturn<T extends BaseItem> {
  items: T[];
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  saveItems: (newItems: T[]) => void;
  saveGroups: (newGroups: Group[]) => void;
  loadData: () => Promise<void>;
  isLoaded: boolean;
}

export function useConfigPersistence<T extends BaseItem>(
  options: UseConfigPersistenceOptions<T>
): UseConfigPersistenceReturn<T> {
  const { configFileName, defaultItems = [], defaultGroups = DEFAULT_GROUPS } = options;

  const [items, setItems] = useState<T[]>(defaultItems);
  const [groups, setGroups] = useState<Group[]>(defaultGroups);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  
  // 使用 ref 确保 loadData 只执行一次
  const loadedRef = useRef(false);

  const loadData = useCallback(async () => {
    // 如果已经加载过，直接返回
    if (loadedRef.current) {
      console.log(`[useConfigPersistence] 已经加载过，跳过: ${configFileName}`);
      return;
    }
    
    try {
      console.log(`[useConfigPersistence] 开始加载配置: ${configFileName}`);
      const savedData = await window.electronAPI?.loadConfig(configFileName);
      
      if (savedData) {
        console.log(`[useConfigPersistence] 加载到配置数据:`, savedData);
        
        // 加载 items，确保向后兼容
        const savedItems = savedData.items || defaultItems;
        const compatibleItems = savedItems.map((item: any, index: number) => ({
          ...item,
          iconData: item.iconData || undefined,
          description: item.description || undefined,
          sortOrder: item.sortOrder !== undefined ? item.sortOrder : index,
        }));
        console.log(`[useConfigPersistence] 加载 items 完成，共 ${compatibleItems.length} 个`);
        setItems(compatibleItems);

        // 加载 groups，确保向后兼容
        const savedGroups = savedData.groups || defaultGroups;
        const compatibleGroups = ensureSortOrder(savedGroups);
        console.log(`[useConfigPersistence] 加载 groups 完成，共 ${compatibleGroups.length} 个:`, compatibleGroups);
        if (compatibleGroups.length > 0) {
          setGroups(compatibleGroups);
        }
      } else {
        console.log(`[useConfigPersistence] 没有找到保存的配置，使用默认值`);
      }
      
      setIsLoaded(true);
      loadedRef.current = true;
      console.log(`[useConfigPersistence] 加载完成，isLoaded=true`);
    } catch (error) {
      console.error('[useConfigPersistence] 加载数据失败:', error);
      setIsLoaded(true);
      loadedRef.current = true;
    }
  }, [configFileName, defaultItems, defaultGroups]);

  const saveItems = useCallback((newItems: T[]) => {
    console.log(`[useConfigPersistence] 保存 items，共 ${newItems.length} 个`);
    window.electronAPI?.saveConfig(configFileName, { items: newItems, groups });
  }, [configFileName, groups]);

  const saveGroups = useCallback((newGroups: Group[]) => {
    console.log(`[useConfigPersistence] 保存 groups，共 ${newGroups.length} 个:`, newGroups);
    setGroups(newGroups);
    window.electronAPI?.saveConfig(configFileName, { items, groups: newGroups });
  }, [configFileName, items]);

  // 初始化加载（只执行一次）
  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    items,
    setItems,
    groups,
    setGroups,
    saveItems,
    saveGroups,
    loadData,
    isLoaded,
  };
}