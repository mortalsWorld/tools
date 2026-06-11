/**
 * 分组项组件（递归渲染）
 * 递归渲染子分组
 */

import React from 'react';
import { message } from 'antd';
import { Group, BaseItem } from '../types';
import { GroupDropZone } from './GroupDropZone';

export interface GroupItemProps<T extends BaseItem> {
  group: Group;
  selectedGroup: string;
  expandedGroups: Set<string>;
  dropTarget: string | null;
  activeGroupId: string | null;
  activeId: string | null;
  items: T[];
  token: any;
  getChildGroups: (parentId: string | null) => Group[];
  getGroupItemCount: (groupId: string) => number;
  handleGroupDragStart: (event: React.DragEvent, groupId: string) => void;
  handleGroupDragOver: (event: React.DragEvent) => void;
  handleGroupDrop: (draggedGroupId: string, targetGroupId: string) => void;
  setSelectedGroup: (groupId: string) => void;
  toggleGroup: (groupId: string, e: React.MouseEvent) => void;
  setActiveId: (id: string | null) => void;
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  saveItems: (items: T[]) => void;
  setDropTarget: (target: string | null) => void;
  onDropFiles?: (files: File[], targetGroupId: string) => void;
}

export function GroupItem<T extends BaseItem>(props: GroupItemProps<T>): React.ReactElement {
  const {
    group,
    selectedGroup,
    expandedGroups,
    dropTarget,
    activeGroupId,
    activeId,
    items,
    token,
    getChildGroups,
    getGroupItemCount,
    handleGroupDragStart,
    handleGroupDragOver,
    handleGroupDrop,
    setSelectedGroup,
    toggleGroup,
    setActiveId,
    setItems,
    saveItems,
    setDropTarget,
    onDropFiles,
  } = props;

  const isSelected = selectedGroup === group.id;
  const count = getGroupItemCount(group.id);
  const hasChildren = getChildGroups(group.id).length > 0;
  const isExpanded = expandedGroups.has(group.id);
  const isDropTargetGroup = dropTarget === group.id;
  const isDragging = activeGroupId === group.id;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    console.log(`[GroupItem] handleDrop called, group.id=${group.id}, dropTarget=${dropTarget}`);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      // 外部文件拖拽到分组
      console.log(`[GroupItem] 外部文件拖拽到分组: ${group.name}, 文件数: ${files.length}`);
      if (onDropFiles) {
        onDropFiles(files, group.id);
      } else {
        message.warning('请使用主区域的拖拽功能');
      }
    } else {
      const draggedGroupId = e.dataTransfer.getData('text/plain');
      console.log(`[GroupItem] draggedGroupId=${draggedGroupId}, group.id=${group.id}, activeId=${activeId}`);
      if (draggedGroupId && draggedGroupId !== group.id) {
        // 分组拖拽
        console.log(`[GroupItem] 放置分组: ${draggedGroupId} -> ${group.id}, 准备调用 handleGroupDrop`);
        handleGroupDrop(draggedGroupId, group.id);
        console.log(`[GroupItem] handleGroupDrop 调用完成`);
      } else if (activeId) {
        // 快捷方式项拖拽到分组（@dnd-kit）
        console.log(`[GroupItem] 快捷方式拖拽到分组 (@dnd-kit): ${activeId} -> ${group.id}`);
        const activeItem = items.find(item => item.id === activeId);
        if (activeItem && activeItem.group !== group.id) {
          const targetGroupMaxSortOrder = Math.max(
            ...items.filter(i => i.group === group.id).map(i => i.sortOrder || 0),
            -1
          );
          const updatedItems = items.map(item => {
            if (item.id === activeId) {
              return { ...item, group: group.id, sortOrder: targetGroupMaxSortOrder + 1 };
            }
            return item;
          });
          setItems(updatedItems);
          saveItems(updatedItems);
          message.success(`已将快捷方式移动到 "${group.name}"`);
        }
        setActiveId(null);
      }
    }
    setDropTarget(null);
  };

  return (
    <React.Fragment key={group.id}>
      <GroupDropZone
        group={group}
        isSelected={isSelected}
        isDropTargetGroup={isDropTargetGroup}
        isDragging={isDragging}
        hasChildren={hasChildren}
        isExpanded={isExpanded}
        count={count}
        onDrop={handleDrop}
        onDragStart={(e) => handleGroupDragStart(e, group.id)}
        onDragOver={(e) => {
          handleGroupDragOver(e);
          setDropTarget(group.id);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (dropTarget === group.id) {
            setDropTarget(null);
          }
        }}
        onClick={() => setSelectedGroup(group.id)}
        onToggleExpand={(e) => toggleGroup(group.id, e)}
        token={token}
      />
      {hasChildren && isExpanded && getChildGroups(group.id).map(childGroup => (
        <GroupItem
          key={childGroup.id}
          {...props}
          group={childGroup}
        />
      ))}
    </React.Fragment>
  );
}