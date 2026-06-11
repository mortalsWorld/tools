/**
 * 拖拽 Hook
 * 提供修复后的拖拽功能
 */

import { useState, useCallback } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { BaseItem, Group } from '../types';
import { isDescendant, updateGroupHierarchy } from '../utils/groupUtils';
import { DRAG_TYPES } from '../utils/dragUtils';

export interface UseDragAndDropOptions<T extends BaseItem> {
  items: T[];
  groups: Group[];
  filteredItems: T[];
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  onSaveItems: (items: T[]) => void;
  onSaveGroups: (groups: Group[]) => void;
  isEditMode?: boolean;
}

export interface UseDragAndDropReturn {
  activeId: string | null;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  dropTarget: string | null;
  setDropTarget: React.Dispatch<React.SetStateAction<string | null>>;
  activeGroupId: string | null;
  setActiveGroupId: React.Dispatch<React.SetStateAction<string | null>>;
  sensors: ReturnType<typeof useSensors>;
  handleDragStart: (event: DragStartEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  handleGroupDragStart: (event: React.DragEvent, groupId: string) => void;
  handleGroupDragOver: (event: React.DragEvent) => void;
  handleGroupDrop: (draggedGroupId: string, targetGroupId: string) => void;
  handleDragOver: (event: React.DragEvent, targetGroup: string | null) => void;
  handleDragLeave: () => void;
}

export function useDragAndDrop<T extends BaseItem>(
  options: UseDragAndDropOptions<T>
): UseDragAndDropReturn {
  const { items, groups, filteredItems, setItems, setGroups, onSaveItems, onSaveGroups, isEditMode = false } = options;

  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 处理快捷方式项拖拽开始
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  // 处理快捷方式项拖拽结束
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    const activeItem = items.find(item => item.id === active.id);
    if (!activeItem) {
      setActiveId(null);
      return;
    }

    // 检查是否拖拽到了分组区域（通过 over.data.current.type）
    let targetGroupId: string | null = null;

    if (over && over.data.current && over.data.current.type === DRAG_TYPES.GROUP) {
      // 拖拽到了分组区域
      targetGroupId = over.data.current.groupId as string;
      console.log(`[handleDragEnd] 拖拽到分组区域: ${activeItem.name} -> ${targetGroupId}`);
    } else if (!over) {
      // 没有放置目标，检查 dropTarget 状态
      if (dropTarget && dropTarget !== 'all') {
        targetGroupId = dropTarget;
        console.log(`[handleDragEnd] 使用 dropTarget: ${targetGroupId}`);
      }
    }

    if (targetGroupId && activeItem.group !== targetGroupId) {
      console.log(`[handleDragEnd] 移动到分组: ${activeItem.name} -> ${targetGroupId}`);
      const targetGroupMaxSortOrder = Math.max(
        ...items.filter(i => i.group === targetGroupId).map(i => i.sortOrder || 0),
        -1
      );

      const updatedItems = items.map(item => {
        if (item.id === active.id) {
          return { ...item, group: targetGroupId!, sortOrder: targetGroupMaxSortOrder + 1 };
        }
        return item;
      });

      setItems(updatedItems);
      onSaveItems(updatedItems);
      setActiveId(null);
      return;
    }

    const overItem = items.find(item => item.id === over?.id);
    if (!overItem) {
      setActiveId(null);
      return;
    }

    if (active.id === over?.id) {
      setActiveId(null);
      return;
    }

    let updatedItems = [...items];

    if (activeItem.group === overItem.group) {
      const oldIndex = filteredItems.findIndex(item => item.id === active.id);
      const newIndex = filteredItems.findIndex(item => item.id === over?.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const groupItems = [...filteredItems];
        const newGroupItems = arrayMove(groupItems, oldIndex, newIndex);

        updatedItems = items.map(item => {
          const idx = newGroupItems.findIndex(gi => gi.id === item.id);
          if (idx !== -1) {
            return { ...item, sortOrder: idx };
          }
          return item;
        });
      }
    } else {
      const targetGroupMaxSortOrder = Math.max(
        ...items.filter(i => i.group === overItem.group).map(i => i.sortOrder || 0),
        -1
      );

      updatedItems = items.map(item => {
        if (item.id === active.id) {
          return { ...item, group: overItem.group, sortOrder: targetGroupMaxSortOrder + 1 };
        }
        return item;
      });
    }

    setItems(updatedItems);
    onSaveItems(updatedItems);
    setActiveId(null);
  }, [items, filteredItems, setItems, onSaveItems, dropTarget, groups]);

  // 处理分组拖拽开始
  const handleGroupDragStart = useCallback((event: React.DragEvent, groupId: string) => {
    event.dataTransfer.setData('text/plain', groupId);
    event.dataTransfer.effectAllowed = 'move';
    console.log(`[handleGroupDragStart] 开始拖拽分组: ${groupId}`);
    setActiveGroupId(groupId);
  }, []);

  // 处理分组拖拽悬停
  const handleGroupDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // 处理分组放置
  const handleGroupDrop = useCallback((draggedGroupId: string, targetGroupId: string) => {
    console.log(`[handleGroupDrop] 处理分组放置: ${draggedGroupId}, 目标: ${targetGroupId}, 编辑模式: ${isEditMode}`);
    console.log(`[handleGroupDrop] 当前分组列表:`, JSON.stringify(groups, null, 2));
    setActiveGroupId(null);

    if (!draggedGroupId || !targetGroupId) {
      console.log(`[handleGroupDrop] 参数无效: draggedGroupId=${draggedGroupId}, targetGroupId=${targetGroupId}`);
      return;
    }

    const activeGroup = groups.find(g => g.id === draggedGroupId);
    if (!activeGroup) {
      console.log(`[handleGroupDrop] 找不到拖拽的分组: ${draggedGroupId}`);
      return;
    }

    let overGroup: Group | null = null;
    let isTopLevelDrop = false;

    if (targetGroupId === 'all') {
      isTopLevelDrop = true;
    } else {
      overGroup = groups.find(g => g.id === targetGroupId) ?? null;
      if (!overGroup) {
        console.log(`[handleGroupDrop] 找不到放置目标分组: ${targetGroupId}`);
        return;
      }
    }

    if (!isTopLevelDrop && draggedGroupId === targetGroupId) {
      console.log(`[handleGroupDrop] 不能将分组拖拽到自身`);
      return;
    }

    // 检查是否是将分组移动到子分组下（禁止循环引用）
    if (!isTopLevelDrop && isDescendant(groups, draggedGroupId, targetGroupId)) {
      console.log(`[handleGroupDrop] 不能将分组移动到自己的子分组下`);
      return;
    }

    let updatedGroups: Group[];

    if (isTopLevelDrop) {
      // 移动到顶层
      console.log(`[handleGroupDrop] 移动分组到顶层: ${activeGroup.name}`);
      
      const updatedHierarchy = updateGroupHierarchy(groups, draggedGroupId, null, 1);
      console.log(`[handleGroupDrop] 更新后的层级:`, JSON.stringify(updatedHierarchy, null, 2));
      updatedGroups = [...groups];
      
      updatedHierarchy.forEach(updatedGroup => {
        updatedGroups = updatedGroups.map(g =>
          g.id === updatedGroup.id ? updatedGroup : g
        );
      });

      // 更新顶层分组的 sortOrder
      const topLevelGroups = updatedGroups.filter(g => g.parentId === null).sort((a, b) => {
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      });

      updatedGroups = updatedGroups.map(group => {
        if (group.parentId === null) {
          const idx = topLevelGroups.findIndex(g => g.id === group.id);
          return { ...group, sortOrder: idx };
        }
        return group;
      });
      console.log(`[handleGroupDrop] 移动到顶层后分组列表:`, JSON.stringify(updatedGroups, null, 2));
    } else if (!isEditMode && activeGroup.level === overGroup!.level && activeGroup.parentId === overGroup!.parentId) {
      // 非编辑模式：同层级排序（包括顶层分组）
      console.log(`[handleGroupDrop] 同层级排序: ${activeGroup.name} -> ${overGroup!.name}`);
      
      const siblings = groups.filter(g => g.parentId === activeGroup.parentId).sort((a, b) => {
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      });

      const oldIndex = siblings.findIndex(g => g.id === draggedGroupId);
      const newIndex = siblings.findIndex(g => g.id === dropTarget);

      if (oldIndex === -1 || newIndex === -1) {
        console.log(`[handleGroupDrop] 找不到分组索引: oldIndex=${oldIndex}, newIndex=${newIndex}`);
        return;
      }

      const newSiblings = arrayMove(siblings, oldIndex, newIndex);

      updatedGroups = groups.map(group => {
        const newSibling = newSiblings.find(s => s.id === group.id);
        if (newSibling) {
          const newSortOrder = newSiblings.indexOf(newSibling);
          return { ...group, sortOrder: newSortOrder };
        }
        return group;
      });
      console.log(`[handleGroupDrop] 同层级排序后分组列表:`, JSON.stringify(updatedGroups, null, 2));
    } else if (isEditMode) {
      // 编辑模式：跨层级移动
      console.log(`[handleGroupDrop] 编辑模式 - 跨层级移动: ${activeGroup.name} -> ${overGroup!.name} 的子分组`);
      console.log(`[handleGroupDrop] 新层级: ${overGroup!.level + 1}`);
      
      const newLevel = overGroup!.level + 1;
      if (newLevel > 3) {
        console.log(`[handleGroupDrop] 超过最大层级限制: ${newLevel} > 3`);
        return;
      }

      const updatedHierarchy = updateGroupHierarchy(groups, draggedGroupId, targetGroupId, newLevel);
      console.log(`[handleGroupDrop] 更新后的层级:`, JSON.stringify(updatedHierarchy, null, 2));
      updatedGroups = [...groups];

      updatedHierarchy.forEach(updatedGroup => {
        updatedGroups = updatedGroups.map(g =>
          g.id === updatedGroup.id ? updatedGroup : g
        );
      });

      // 更新目标分组下子分组的 sortOrder
      const targetChildren = updatedGroups.filter(g => g.parentId === targetGroupId).sort((a, b) => {
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      });

      updatedGroups = updatedGroups.map(group => {
        if (group.parentId === targetGroupId) {
          const idx = targetChildren.findIndex(g => g.id === group.id);
          return { ...group, sortOrder: idx };
        }
        return group;
      });
      console.log(`[handleGroupDrop] 跨层级移动后分组列表:`, JSON.stringify(updatedGroups, null, 2));
    } else {
      console.log(`[handleGroupDrop] 非编辑模式下不允许跨层级移动`);
      return;
    }

    console.log(`[handleGroupDrop] 更新分组完成，共${updatedGroups.length}个分组`);
    setGroups(updatedGroups);
    onSaveGroups(updatedGroups);
  }, [groups, setGroups, onSaveGroups, isEditMode]);

  // 处理拖拽悬停
  const handleDragOver = useCallback((event: React.DragEvent, targetGroup: string | null) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDropTarget(targetGroup);
  }, []);

  // 处理拖拽离开
  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  return {
    activeId,
    setActiveId,
    dropTarget,
    setDropTarget,
    activeGroupId,
    setActiveGroupId,
    sensors,
    handleDragStart,
    handleDragEnd,
    handleGroupDragStart,
    handleGroupDragOver,
    handleGroupDrop,
    handleDragOver,
    handleDragLeave,
  };
}