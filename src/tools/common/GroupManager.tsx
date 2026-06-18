import React, { useState, useEffect, useCallback } from 'react';
import {
  Tree,
  Button,
  Modal,
  Input,
  message,
  Empty,
  Dropdown,
  MenuProps
} from 'antd';
import {
  PlusCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  SwapOutlined,
  FolderOpenOutlined,
  MoreOutlined
} from '@ant-design/icons';

const { TreeNode } = Tree;

export interface Group {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  sortOrder?: number;
}

interface GroupManagerProps {
  groups: Group[];
  defaultGroupId?: string;
  onGroupsChange: (groups: Group[]) => void;
  onClose: () => void;
}

const DEFAULT_GROUPS: Group[] = [
  { id: 'default', name: '默认分组', parentId: null, level: 1, sortOrder: 0 }
];

const GroupManager: React.FC<GroupManagerProps> = ({ 
  groups, 
  defaultGroupId = 'default',
  onGroupsChange, 
  onClose 
}) => {
  // 确保向后兼容性：为缺少 sortOrder 的分组添加默认值
  const ensureSortOrder = (inputGroups: Group[]): Group[] => {
    return inputGroups.map((group, index) => ({
      ...group,
      sortOrder: group.sortOrder !== undefined ? group.sortOrder : index
    }));
  };

  const [localGroups, setLocalGroups] = useState<Group[]>(() => {
    const initialGroups = groups.length > 0 ? groups : DEFAULT_GROUPS;
    return ensureSortOrder(initialGroups);
  });
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  
  // Modal states
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [newParentId, setNewParentId] = useState<string | null>(null);

  useEffect(() => {
    if (groups.length > 0) {
      setLocalGroups(ensureSortOrder(groups));
    }
  }, [groups]);

  const getChildGroups = useCallback((parentId: string | null): Group[] => {
    // 按 sortOrder 排序返回子分组
    return localGroups
      .filter(g => g.parentId === parentId)
      .sort((a, b) => {
        if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
          return a.sortOrder - b.sortOrder;
        }
        return a.id.localeCompare(b.id);
      });
  }, [localGroups]);

  const getGroupPath = useCallback((groupId: string): string => {
    const path: string[] = [];
    let currentId: string | null = groupId;
    
    while (currentId) {
      const current = localGroups.find(g => g.id === currentId);
      if (!current) break;
      path.unshift(current.name);
      currentId = current.parentId;
    }
    
    return path.join(' / ');
  }, [localGroups]);

  // 不再使用此函数
  // const buildTreeData = useCallback((parentId: string | null): DataNode[] => {
  //   const children = getChildGroups(parentId);
  //   return children.map(group => {
  //     const childNodes = buildTreeData(group.id);
  //     return {
  //       title: group.name,
  //       key: group.id,
  //       children: childNodes.length > 0 ? childNodes : undefined
  //     };
  //   });
  // }, [getChildGroups]);

  const handleAddGroup = (parentId: string | null = null) => {
    console.log(`[GroupManager] handleAddGroup called, parentId=${parentId}`);
    const parent = parentId ? localGroups.find(g => g.id === parentId) : null;
    const newLevel = parent ? parent.level + 1 : 1;
    
    if (newLevel > 3) {
      message.warning('最多支持3级分组');
      return;
    }
    
    console.log(`[GroupManager] 创建新分组，parentId=${parentId}, level=${newLevel}`);
    setCurrentGroup({ id: '', name: '', parentId, level: newLevel });
    setInputValue('');
    setAddModalVisible(true);
  };

  const handleConfirmAddGroup = () => {
    console.log('[GroupManager] handleConfirmAddGroup called');
    if (!inputValue.trim()) {
      message.warning('请输入分组名称');
      return;
    }

    // 计算新分组的 sortOrder：找到同一父级下最大的 sortOrder 并加 1
    const siblings = getChildGroups(currentGroup?.parentId || null);
    const maxSortOrder = siblings.length > 0
      ? Math.max(...siblings.map(g => g.sortOrder || 0))
      : -1;
    
    const newGroup: Group = {
      id: Date.now().toString(),
      name: inputValue.trim(),
      parentId: currentGroup?.parentId || null,
      level: currentGroup?.level || 1,
      sortOrder: maxSortOrder + 1
    };
    
    console.log(`[GroupManager] 创建新分组:`, newGroup);
    console.log(`[GroupManager] 当前分组列表长度: ${localGroups.length}`);
    
    const updatedGroups = [...localGroups, newGroup];
    console.log(`[GroupManager] 更新后分组列表长度: ${updatedGroups.length}`);
    setLocalGroups(updatedGroups);
    // 通知父组件分组已更改
    onGroupsChange(updatedGroups);
    setAddModalVisible(false);
    message.success('分组添加成功');
  };

  const handleEditGroup = (group: Group) => {
    setCurrentGroup(group);
    setInputValue(group.name);
    setEditModalVisible(true);
  };

  const handleConfirmEditGroup = () => {
    if (!currentGroup || !inputValue.trim()) {
      message.warning('请输入分组名称');
      return;
    }
    
    const updatedGroups = localGroups.map(g => 
      g.id === currentGroup.id ? { ...g, name: inputValue.trim() } : g
    );
    
    setLocalGroups(updatedGroups);
    // 通知父组件分组已更改
    onGroupsChange(updatedGroups);
    setEditModalVisible(false);
    message.success('分组重命名成功');
  };

  const handleMoveGroup = (group: Group) => {
    setCurrentGroup(group);
    setNewParentId(null);
    setMoveModalVisible(true);
  };

  const handleConfirmMoveGroup = () => {
    if (!currentGroup) return;
    
    // '__root__' is a special value for top-level (no parent)
    // Convert '__root__' to null to represent top-level
    const effectiveParentId = newParentId === '__root__' ? null : newParentId;
    
    console.log(`[handleConfirmMoveGroup] 移动分组: currentGroup=${currentGroup.name}, currentGroupId=${currentGroup.id}, newParentId=${newParentId}, effectiveParentId=${effectiveParentId}`);
    
    // Cannot move to itself
    if (effectiveParentId === currentGroup.id) {
      message.warning('不能将分组移动到自身');
      return;
    }
    
    // Check if moving to descendant
    const isDescendant = (parentId: string | null, checkId: string): boolean => {
      const children = getChildGroups(parentId);
      for (const child of children) {
        if (child.id === checkId) return true;
        if (isDescendant(child.id, checkId)) return true;
      }
      return false;
    };

    if (effectiveParentId && isDescendant(currentGroup.id, effectiveParentId)) {
      message.warning('不能将分组移动到自己的子分组下');
      return;
    }

    // Validate target group exists
    if (effectiveParentId && !localGroups.find(g => g.id === effectiveParentId)) {
      message.warning('目标父分组不存在');
      return;
    }

    const newParent = effectiveParentId ? localGroups.find(g => g.id === effectiveParentId) : null;
    const newLevel = newParent ? newParent.level + 1 : 1;

    if (newLevel > 3) {
      message.warning('最多支持3级分组');
      return;
    }

    // Update current group and all descendants
    const updateGroupHierarchy = (groupId: string, newParentId: string | null, level: number): Group[] => {
      let result: Group[] = [];
      
      // Update current group
      const current = localGroups.find(g => g.id === groupId);
      if (current) {
        result.push({ ...current, parentId: newParentId, level });
      }
      
      // Update children - they remain children of this group (groupId)
      const children = getChildGroups(groupId);
      for (const child of children) {
        // Children keep groupId as parent, only level changes
        result = [...result, ...updateGroupHierarchy(child.id, groupId, level + 1)];
      }
      
      return result;
    };

    const updatedHierarchy = updateGroupHierarchy(currentGroup.id, effectiveParentId, newLevel);
    console.log(`[handleConfirmMoveGroup] 更新层级完成: 移动到层级 ${newLevel}, 父分组ID=${effectiveParentId}`);
    let updatedGroups = [...localGroups];
    
    updatedHierarchy.forEach(updatedGroup => {
      updatedGroups = updatedGroups.map(g => 
        g.id === updatedGroup.id ? updatedGroup : g
      );
    });
    
    setLocalGroups(updatedGroups);
    // 通知父组件分组已更改
    onGroupsChange(updatedGroups);
    setMoveModalVisible(false);
    message.success('分组移动成功');
  };

  const handleDeleteGroup = (group: Group) => {
    if (group.id === defaultGroupId) {
      message.warning('不能删除默认分组');
      return;
    }

    const hasChildren = getChildGroups(group.id).length > 0;
    if (hasChildren) {
      message.warning('请先删除子分组');
      return;
    }

    Modal.confirm({
      title: '确认删除',
      content: `确定要删除分组"${group.name}"吗？`,
      okType: 'danger',
      onOk: () => {
        const updatedGroups = localGroups.filter(g => g.id !== group.id);
        setLocalGroups(updatedGroups);
        // 通知父组件分组已更改
        onGroupsChange(updatedGroups);
        message.success('分组删除成功');
      }
    });
  };

  const getGroupMenu = (group: Group): MenuProps['items'] => [
    {
      key: 'add',
      label: '添加子分组',
      icon: <PlusCircleOutlined />,
      disabled: group.level >= 3,
      onClick: () => handleAddGroup(group.id)
    },
    {
      key: 'edit',
      label: '重命名',
      icon: <EditOutlined />,
      onClick: () => handleEditGroup(group)
    },
    {
      key: 'move',
      label: '移动分组',
      icon: <SwapOutlined />,
      onClick: () => handleMoveGroup(group)
    },
    { type: 'divider' },
    {
      key: 'delete',
      label: '删除分组',
      danger: true,
      icon: <DeleteOutlined />,
      onClick: () => handleDeleteGroup(group)
    }
  ];

  const handleSave = () => {
    onGroupsChange(localGroups);
    onClose();
    message.success('分组保存成功');
  };

  const renderCustomTreeNode = (group: Group): React.ReactNode => {    
    return (
      <TreeNode
        key={group.id}
        title={
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            width: '100%',
            paddingRight: 8
          }}>
            <span>{group.name}</span>
            <Dropdown 
                menu={{ items: getGroupMenu(group) }}
                trigger={['click']}
                placement="bottomRight"
              >
                <Button 
                  type="text" 
                  size="small" 
                  icon={<MoreOutlined />}
                  onClick={(e) => e.stopPropagation()}
                  style={{ padding: '0 4px' }}
                />
              </Dropdown>
          </div>
        }
      >
        {getChildGroups(group.id).map(renderCustomTreeNode)}
      </TreeNode>
    );
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FolderOpenOutlined />
          分组管理
        </div>
      }
      open={true}
      onCancel={onClose}
      onOk={handleSave}
      okText="保存"
      cancelText="关闭"
      width={500}
      styles={{ body: { maxHeight: 500, overflowY: 'auto' } }}
    >
      {/* 添加顶级分组按钮 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button 
          type="primary" 
          size="small" 
          icon={<PlusCircleOutlined />}
          onClick={() => handleAddGroup(null)}
        >
          添加顶级分组
        </Button>
      </div>
      
      {localGroups.length === 0 ? (
        <Empty description="暂无分组，点击上方按钮添加" />
      ) : (
        <Tree
          showIcon
          defaultExpandAll
          expandedKeys={expandedKeys}
          onExpand={(keys) => setExpandedKeys(keys)}
          selectedKeys={selectedKeys}
          onSelect={(keys) => setSelectedKeys(keys)}
          blockNode
          style={{ padding: '8px 0' }}
        >
          {getChildGroups(null).map(renderCustomTreeNode)}
        </Tree>
      )}

      {/* Add Group Modal */}
      <Modal
        title="添加分组"
        open={addModalVisible}
        onOk={handleConfirmAddGroup}
        onCancel={() => setAddModalVisible(false)}
        okText="确定"
        cancelText="取消"
      >
        {currentGroup && (
          <div>
            {currentGroup.parentId && (
              <div style={{ marginBottom: 16, color: '#666' }}>
                父分组: {getGroupPath(currentGroup.parentId)}
              </div>
            )}
            <div style={{ marginBottom: 8, fontWeight: 500 }}>分组名称</div>
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="请输入分组名称"
              autoFocus
              onPressEnter={handleConfirmAddGroup}
            />
          </div>
        )}
      </Modal>

      {/* Edit Group Modal */}
      <Modal
        title="重命名分组"
        open={editModalVisible}
        onOk={handleConfirmEditGroup}
        onCancel={() => setEditModalVisible(false)}
        okText="确定"
        cancelText="取消"
      >
        <div style={{ marginBottom: 8, fontWeight: 500 }}>新名称</div>
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="请输入新名称"
          autoFocus
          onPressEnter={handleConfirmEditGroup}
        />
      </Modal>

      {/* Move Group Modal */}
      <Modal
        title="移动分组"
        open={moveModalVisible}
        onOk={handleConfirmMoveGroup}
        onCancel={() => setMoveModalVisible(false)}
        okText="确定"
        cancelText="取消"
      >
        {currentGroup && (
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>
              当前分组: {getGroupPath(currentGroup.id)}
            </div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>
              选择目标位置
            </div>
            <Tree
              defaultExpandAll
              blockNode
              onSelect={(keys) => {
                if (keys.length > 0) {
                  setNewParentId(keys[0] as string);
                } else {
                  setNewParentId(null);
                }
              }}
              selectedKeys={newParentId ? [newParentId] : []}
              style={{ 
                border: '1px solid #d9d9d9',
                borderRadius: 6,
                padding: 12,
                maxHeight: 200,
                overflowY: 'auto'
              }}
            >
              <TreeNode 
                key="__root__" 
                title={
                  <span style={{ color: newParentId === null ? '#1890ff' : undefined }}>
                    顶级（无父分组）
                  </span>
                } 
              />
              {getChildGroups(null).filter(g => g.id !== currentGroup?.id).map(group => {
                const renderMoveTree = (g: Group): React.ReactNode => {
                  if (g.id === currentGroup?.id) return null;
                  return (
                    <TreeNode key={g.id} title={g.name}>
                      {getChildGroups(g.id).map(renderMoveTree)}
                    </TreeNode>
                  );
                };
                return renderMoveTree(group);
              })}
            </Tree>
          </div>
        )}
      </Modal>
    </Modal>
  );
};

export default GroupManager;
