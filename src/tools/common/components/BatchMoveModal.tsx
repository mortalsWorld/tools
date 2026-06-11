/**
 * 批量移动模态框组件
 * 使用 Ant Design Modal 和 TreeSelect
 */

import React, { useState } from 'react';
import { Modal, TreeSelect, message } from 'antd';
import { FolderOutlined } from '@ant-design/icons';
import { Group, BaseItem } from '../types';
import { getChildGroups } from '../utils/groupUtils';

const { TreeNode } = TreeSelect;

export interface BatchMoveModalProps<T extends BaseItem> {
  visible: boolean;
  onClose: () => void;
  items: T[];
  selectedItemIds: Set<string>;
  groups: Group[];
  onSave: (items: T[]) => void;
}

export function BatchMoveModal<T extends BaseItem>(props: BatchMoveModalProps<T>): React.ReactElement {
  const { visible, onClose, items, selectedItemIds, groups, onSave } = props;

  const [targetGroupId, setTargetGroupId] = useState<string>('default');

  // 渲染 TreeSelect 的节点
  const renderTreeSelectNodes = (parentId: string | null): React.ReactNode[] => {
    const children = getChildGroups(groups, parentId);
    if (children.length === 0) return [];

    return children.map(group => {
      const childNodes = renderTreeSelectNodes(group.id);
      return (
        <TreeNode
          key={group.id}
          value={group.id}
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FolderOutlined />
              <span>{group.name}</span>
            </div>
          }
        >
          {childNodes}
        </TreeNode>
      );
    });
  };

  // 处理确认移动
  const handleConfirm = () => {
    if (selectedItemIds.size === 0) {
      message.warning('请先选择要移动的项');
      return;
    }

    if (!targetGroupId) {
      message.warning('请选择目标分组');
      return;
    }

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
    onClose();
    message.success(`已将 ${selectedItemIds.size} 个项移动到目标分组`);
  };

  return (
    <Modal
      title="批量移动"
      open={visible}
      onOk={handleConfirm}
      onCancel={onClose}
      okText="移动"
      cancelText="取消"
      width={400}
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>
          已选择 {selectedItemIds.size} 个项
        </div>
      </div>
      <div style={{ marginBottom: 8, fontWeight: 500 }}>
        目标分组
      </div>
      <TreeSelect
        value={targetGroupId}
        onChange={(value) => setTargetGroupId(value)}
        style={{ width: '100%' }}
        placeholder="请选择目标分组"
        treeDefaultExpandAll
      >
        {renderTreeSelectNodes(null)}
      </TreeSelect>
    </Modal>
  );
}