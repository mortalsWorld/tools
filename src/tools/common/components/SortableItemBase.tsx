/**
 * 可排序项基础组件
 * 使用 @dnd-kit 的 useSortable
 * 支持网格视图和列表视图
 */

import React from 'react';
import { Card, Tooltip, Checkbox, Space, Button } from 'antd';
import { HolderOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BaseItem } from '../types';

export interface SortableItemBaseProps<T extends BaseItem> {
  id: string;
  item: T;
  viewMode: 'grid' | 'list';
  onOpen: (item: T) => void;
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
  token: any;
  isSelected?: boolean;
  showCheckbox?: boolean;
  onToggleSelect?: (id: string) => void;
  renderTooltip?: (item: T) => React.ReactNode;
  renderIcon?: (item: T) => React.ReactNode;
  renderSubtitle?: (item: T) => React.ReactNode;
  renderDetails?: (item: T) => React.ReactNode;
}

export function SortableItemBase<T extends BaseItem>(props: SortableItemBaseProps<T>): React.ReactElement {
  const {
    id,
    item,
    viewMode,
    onOpen,
    onEdit,
    onDelete,
    token,
    isSelected = false,
    showCheckbox = false,
    onToggleSelect,
    renderTooltip,
    renderIcon,
    renderSubtitle,
    renderDetails,
  } = props;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : 'auto',
  };

  // 默认 tooltip 渲染
  const defaultTooltip = (item: T) => (
    <div style={{ padding: 14, maxWidth: 500, wordWrap: 'break-word', overflowWrap: 'break-word' }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: '#333', wordBreak: 'break-all', lineHeight: 1.4 }}>
        {item.name}
      </div>
      {item.description && (
        <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>
          <span style={{ fontWeight: 500, color: '#999', display: 'block', marginBottom: 3 }}>备注：</span>
          <span style={{ display: 'block', wordBreak: 'break-all' }}>{item.description}</span>
        </div>
      )}
    </div>
  );

  // 默认图标渲染
  const defaultIcon = (item: T) => (
    item.iconData && item.iconData.length > 0 ? (
      <img
        src={item.iconData}
        alt="icon"
        style={{
          maxWidth: viewMode === 'grid' ? 48 : 32,
          maxHeight: viewMode === 'grid' ? 48 : 32,
          objectFit: 'contain',
        }}
        onError={(e) => {
          console.error('Failed to load icon:', item.iconData);
          e.currentTarget.style.display = 'none';
          const parent = e.currentTarget.parentElement;
          if (parent) {
            const fallbackSpan = document.createElement('span');
            fallbackSpan.textContent = item.icon;
            fallbackSpan.style.fontSize = viewMode === 'grid' ? '48px' : '32px';
            parent.appendChild(fallbackSpan);
          }
        }}
      />
    ) : (
      <span style={{ fontSize: viewMode === 'grid' ? 48 : 32 }}>{item.icon}</span>
    )
  );

  const tooltipContent = renderTooltip ? renderTooltip(item) : defaultTooltip(item);
  const iconContent = renderIcon ? renderIcon(item) : defaultIcon(item);
  const subtitleContent = renderSubtitle ? renderSubtitle(item) : null;
  const detailsContent = renderDetails ? renderDetails(item) : null;

  // 网格视图
  if (viewMode === 'grid') {
    return (
      <Tooltip title={tooltipContent} placement="top" color="white">
        <div ref={setNodeRef} style={style}>
          <Card
            size="small"
            hoverable
            style={{
              cursor: showCheckbox ? 'default' : 'pointer',
              transition: 'all 0.2s',
              borderRadius: 12,
              border: isSelected ? `2px solid ${token.colorPrimary}` : `1px solid ${token.colorBorderSecondary}`,
              backgroundColor: isSelected ? token.colorPrimaryBg : 'transparent',
            }}
            bodyStyle={{ padding: 16, textAlign: 'center' }}
            onClick={() => {
              if (showCheckbox && onToggleSelect) {
                onToggleSelect(id);
              } else {
                onOpen(item);
              }
            }}
            actions={[
              <Tooltip title="拖拽排序">
                <HolderOutlined
                  key="drag"
                  {...attributes}
                  {...listeners}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => {
                    // 同时设置 HTML5 drag data，以便分组区域可以识别
                    const dragEvent = e as unknown as React.DragEvent;
                    if (dragEvent.dataTransfer) {
                      dragEvent.dataTransfer.setData('text/plain', id);
                      dragEvent.dataTransfer.effectAllowed = 'move';
                    }
                    // 调用原始 listeners
                    if (listeners?.onPointerDown) {
                      listeners.onPointerDown(e);
                    }
                  }}
                />
              </Tooltip>,
              <Tooltip title="编辑">
                <EditOutlined key="edit" onClick={(e) => { e.stopPropagation(); onEdit(item); }} />
              </Tooltip>,
              <Tooltip title="删除">
                <DeleteOutlined key="delete" onClick={(e) => { e.stopPropagation(); onDelete(item); }} />
              </Tooltip>,
            ]}
          >
            <div style={{ fontSize: 48, marginBottom: 8, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {iconContent}
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.name}
            </div>
            {subtitleContent && (
              <div style={{
                marginTop: 4,
                fontSize: 12,
                color: token.colorTextSecondary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {subtitleContent}
              </div>
            )}
          </Card>
        </div>
      </Tooltip>
    );
  }

  // 列表视图
  return (
    <Tooltip title={tooltipContent} placement="top" color="white">
      <div
        ref={setNodeRef}
        style={{
          ...style,
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          borderRadius: 8,
          cursor: showCheckbox ? 'default' : 'pointer',
          transition: 'all 0.2s',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          backgroundColor: isSelected ? token.colorPrimaryBg : 'transparent',
        }}
        onClick={() => {
          if (showCheckbox && onToggleSelect) {
            onToggleSelect(id);
          } else {
            onOpen(item);
          }
        }}
      >
        {showCheckbox && (
          <Checkbox
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect?.(id);
            }}
            style={{ marginRight: 12 }}
          />
        )}
        <HolderOutlined
          {...attributes}
          {...listeners}
          style={{
            cursor: 'grab',
            marginRight: 12,
            color: token.colorTextTertiary
          }}
          onPointerDown={(e) => {
            // 同时设置 HTML5 drag data，以便分组区域可以识别
            const dragEvent = e as unknown as React.DragEvent;
            if (dragEvent.dataTransfer) {
              dragEvent.dataTransfer.setData('text/plain', id);
              dragEvent.dataTransfer.effectAllowed = 'move';
            }
            // 调用原始 listeners
            if (listeners?.onPointerDown) {
              listeners.onPointerDown(e);
            }
          }}
        />
        <div style={{
          fontSize: 32,
          marginRight: 12,
          width: 40,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {iconContent}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>
            {item.name}
          </div>
          {subtitleContent && (
            <div style={{
              fontSize: 12,
              color: token.colorTextSecondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: 2
            }}>
              {subtitleContent}
            </div>
          )}
          {detailsContent && (
            <div style={{
              fontSize: 11,
              color: token.colorTextTertiary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: 2
            }}>
              {detailsContent}
            </div>
          )}
        </div>
        <Space style={{ marginLeft: 8 }}>
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={(e) => { e.stopPropagation(); onEdit(item); }}
            />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={(e) => { e.stopPropagation(); onDelete(item); }}
            />
          </Tooltip>
        </Space>
      </div>
    </Tooltip>
  );
}