/**
 * 分组拖拽区域组件
 * 使用 @dnd-kit 的 useDroppable 和 useDraggable
 * 同时支持 HTML5 原生拖拽
 * 样式参考左侧导航栏
 */

import React from 'react';
import { Badge } from 'antd';
import { DownOutlined, RightOutlined, FolderOutlined } from '@ant-design/icons';
import { useDroppable } from '@dnd-kit/core';
import { Group } from '../types';
import { DRAG_TYPES } from '../utils/dragUtils';

export interface GroupDropZoneProps {
  group: Group;
  isSelected: boolean;
  isDropTargetGroup: boolean;
  isDragging: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
  count: number;
  onDrop: (e: React.DragEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onClick: () => void;
  onToggleExpand: (e: React.MouseEvent) => void;
  token: any;
}

export const GroupDropZone: React.FC<GroupDropZoneProps> = ({
  group,
  isSelected,
  isDropTargetGroup,
  isDragging,
  hasChildren,
  isExpanded,
  count,
  onDrop,
  onDragStart,
  onDragOver,
  onDragLeave,
  onClick,
  onToggleExpand,
  token,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `group-drop-${group.id}`,
    data: { type: DRAG_TYPES.GROUP, groupId: group.id }
  });

  return (
    <div
      ref={setNodeRef}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: '6px',
        paddingBottom: '6px',
        paddingRight: '8px',
        paddingLeft: `${(group.level - 1) * 16 + 8}px`,
        borderRadius: 6,
        cursor: hasChildren ? 'pointer' : 'default',
        backgroundColor: isOver || isDropTargetGroup ? token.colorPrimaryBg : isSelected ? token.colorPrimaryBg : 'transparent',
        border: isOver || isDropTargetGroup ? `1px dashed ${token.colorPrimary}` : 'none',
        color: isSelected ? token.colorPrimary : token.colorText,
        fontWeight: isSelected ? 500 : 400,
        marginBottom: 1,
        transition: 'all 0.2s',
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
        {/* 展开/折叠箭头 - 只有有子分组时显示 */}
        {hasChildren && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(e);
            }}
            style={{
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              minWidth: 14,
              justifyContent: 'center',
              fontSize: 12,
              color: token.colorTextSecondary,
            }}
          >
            {isExpanded ? <DownOutlined /> : <RightOutlined />}
          </span>
        )}
        {/* 没有子分组时显示空格占位 */}
        {!hasChildren && <span style={{ width: 14 }} />}
        
        {/* 文件夹图标 - 始终显示 */}
        <FolderOutlined 
          style={{ 
            fontSize: 14, 
            color: token.colorTextSecondary,
            opacity: isSelected ? 1 : 0.6
          }} 
        />
        
        {/* 分组名称 */}
        <span style={{ fontSize: 13 }}>{group.name}</span>
      </div>
      
      {/* 数量徽章 */}
      <Badge
        count={count}
        size="small"
        style={{
          backgroundColor: isSelected ? token.colorPrimary : token.colorFillSecondary,
          color: isSelected ? '#fff' : token.colorTextSecondary,
          fontSize: 10,
        }}
      />
    </div>
  );
};