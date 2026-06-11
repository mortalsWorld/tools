/**
 * 左侧分组面板组件
 * 包含"全部"分组条目和分组列表
 */

import React from 'react';
import { Badge } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { Group, BaseItem } from '../types';
import { GroupItem } from './GroupItem';

export interface GroupPanelProps<T extends BaseItem> {
  selectedGroup: string;
  setSelectedGroup: (groupId: string) => void;
  groups: Group[];
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
  handleDragLeave: () => void;
  toggleGroup: (groupId: string, e: React.MouseEvent) => void;
  setActiveId: (id: string | null) => void;
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  saveItems: (items: T[]) => void;
  setDropTarget: (target: string | null) => void;
  onDropFiles?: (files: File[], targetGroupId: string) => void;
}

export function GroupPanel<T extends BaseItem>(props: GroupPanelProps<T>): React.ReactElement {
  const {
    selectedGroup,
    setSelectedGroup,
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
    handleDragLeave,
    toggleGroup,
    setActiveId,
    setItems,
    saveItems,
    setDropTarget,
    onDropFiles,
  } = props;

  // "全部"分组条目的拖拽悬停处理
  const handleAllDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      e.dataTransfer.dropEffect = 'copy';
    } else {
      e.dataTransfer.dropEffect = 'move';
    }
    setDropTarget('all');
  };

  // "全部"分组条目的放置处理
  const handleAllDrop = (e: React.DragEvent) => {
    e.preventDefault();

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      // 外部文件拖拽到"全部"
      console.log(`[GroupPanel] 外部文件拖拽到全部，文件数: ${files.length}`);
      if (onDropFiles) {
        onDropFiles(files, 'all');
      }
    } else {
      const draggedGroupId = e.dataTransfer.getData('text/plain');
      if (draggedGroupId) {
        console.log(`[GroupPanel] 放置分组到全部: ${draggedGroupId}`);
        handleGroupDrop(draggedGroupId, 'all');
      }
    }
    setDropTarget(null);
  };

  return (
    <div style={{
      width: 240,
      borderRight: `1px solid ${token.colorBorder}`,
      backgroundColor: token.colorFillAlter,
      padding: 12,
      overflowY: 'auto'
    }}>
      {/* "全部"分组条目 */}
      <div
        onDragOver={handleAllDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleAllDrop}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderRadius: 8,
          cursor: 'pointer',
          backgroundColor: dropTarget === 'all' ? token.colorPrimaryBg : selectedGroup === 'all' ? token.colorPrimaryBg : 'transparent',
          border: dropTarget === 'all' ? `2px dashed ${token.colorPrimary}` : 'none',
          color: selectedGroup === 'all' ? token.colorPrimary : token.colorText,
          fontWeight: selectedGroup === 'all' ? 500 : 400,
          marginBottom: 8,
          transition: 'all 0.2s'
        }}
        onClick={() => setSelectedGroup('all')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GlobalOutlined />
          <span>全部</span>
        </div>
        <Badge
          count={getGroupItemCount('all')}
          size="small"
          style={{
            backgroundColor: selectedGroup === 'all' ? token.colorPrimary : token.colorFillSecondary,
            color: selectedGroup === 'all' ? '#fff' : token.colorTextSecondary
          }}
        />
      </div>

      {/* 分组列表 */}
      <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 500, color: token.colorTextSecondary, padding: '0 12px' }}>
        分组
      </div>
      {getChildGroups(null).map(group => (
        <GroupItem
          key={group.id}
          group={group}
          selectedGroup={selectedGroup}
          expandedGroups={expandedGroups}
          dropTarget={dropTarget}
          activeGroupId={activeGroupId}
          activeId={activeId}
          items={items}
          token={token}
          getChildGroups={getChildGroups}
          getGroupItemCount={getGroupItemCount}
          handleGroupDragStart={handleGroupDragStart}
          handleGroupDragOver={handleGroupDragOver}
          handleGroupDrop={handleGroupDrop}
          setSelectedGroup={setSelectedGroup}
          toggleGroup={toggleGroup}
          setActiveId={setActiveId}
          setItems={setItems}
          saveItems={saveItems}
          setDropTarget={setDropTarget}
          onDropFiles={onDropFiles}
        />
      ))}
    </div>
  );
}