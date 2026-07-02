import React, { useState, useCallback, useMemo } from 'react';
import {
  Card,
  Button,
  Input,
  Modal,
  Space,
  message,
  Radio,
  ConfigProvider,
  TreeSelect,
  theme,
  Empty,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  EditOutlined,
  SettingOutlined,
  GlobalOutlined,
  UploadOutlined,
  CloseOutlined,
  SwapOutlined,
  CheckSquareOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  closestCenter,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import GroupManager from '../common/GroupManager';
import {
  WebItem,
  Group,
  DEFAULT_GROUPS,
  GroupPanel,
  SortableItemBase,
  BatchMoveModal,
  useGroupManagement,
  useDragAndDrop,
  useBatchSelection,
  useConfigPersistence,
  getDescendantGroupIds,
} from '../common';

const { Text } = Typography;
const { TreeNode } = TreeSelect;

// 网页特有图标
const DEFAULT_WEB_ICONS = [
  '🌐', '💻', '📱', '🎮', '📺', '🎵', '🎨', '🎬',
  '📊', '📈', '📉', '📖', '📝', '✏️', '📌', '🔖',
  '✨', '🌟', '💫', '⭐', '🔥', '💯', '👍', '🎉',
  '🍎', '🍊', '🍇', '🍓', '🍕', '🍔', '☕', '🍵',
  '🌸', '🌺', '🌻', '🌷', '🌼', '🌿', '🌲', '🌳',
  '🏠', '🏢', '🏪', '🏬', '🏯', '🏰', '🗼', '🏛',
  '🚗', '🚕', '🚙', '🚌', '🚲', '🚀', '✈️', '🚂',
  '🎭', '🎪', '🎨', '🎯', '🎲', '🎰', '🎸', '🎤',
  '🐱', '🐶', '🐰', '🦊', '🐻', '🐼', '🐨', '🦁',
  '😊', '😍', '🥰', '🤩', '😎', '🤓', '🥳', '😄',
];

export const WebOpenerTool: React.FC = () => {
  const { token } = theme.useToken();

  // 使用配置持久化 hook
  const {
    items,
    setItems,
    groups,
    setGroups,
    saveItems,
    saveGroups,
  } = useConfigPersistence<WebItem>({
    configFileName: 'web-opener.json',
    defaultGroups: DEFAULT_GROUPS,
  });

  // 视图模式
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  // 当前选中的分组
  const [selectedGroup, setSelectedGroup] = useState<string>('all');

  // 排序后的项目
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
        return a.sortOrder - b.sortOrder;
      }
      return a.id.localeCompare(b.id);
    });
  }, [items]);

  // 过滤后的项目
  const filteredItems = useMemo(() => {
    if (selectedGroup === 'all') return sortedItems;
    const groupIds = getDescendantGroupIds(groups, selectedGroup);
    return sortedItems.filter(item => groupIds.includes(item.group));
  }, [sortedItems, selectedGroup, groups]);

  // 项目 ID 列表
  const itemIds = useMemo(() => filteredItems.map(item => item.id), [filteredItems]);

  // 使用拖拽 hook（需要先调用，因为 useGroupManagement 需要 dropTarget）
  // 使用批量选择 hook
  const {
    selectedItemIds,
    isEditMode,
    setIsEditMode,
    toggleSelectItem,
    selectAll,
    clearSelection,
  } = useBatchSelection<WebItem>();

  const {
    activeId,
    setActiveId,
    dropTarget,
    setDropTarget,
    activeGroupId,
    sensors,
    handleDragStart,
    handleDragEnd,
    handleGroupDragStart,
    handleGroupDragOver,
    handleDragOver,
    handleDragLeave,
  } = useDragAndDrop<WebItem>({
    items,
    groups,
    filteredItems,
    setItems,
    setGroups,
    onSaveItems: saveItems,
    onSaveGroups: saveGroups,
    isEditMode,
  });

  // 使用分组管理 hook
  const {
    expandedGroups,
    getChildGroups,
    toggleGroup,
    getGroupPath,
    getGroupItemCount,
    handleGroupDrop,
  } = useGroupManagement({
    groups,
    onSave: saveGroups,
    isEditMode,
  });

  // 批量移动模态框状态
  const [isBatchMoveModalVisible, setIsBatchMoveModalVisible] = useState(false);

  // 添加/编辑模态框状态
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isGroupManagerVisible, setIsGroupManagerVisible] = useState(false);

  // 新建/编辑项目状态
  const [newItem, setNewItem] = useState<WebItem>({
    id: '',
    name: '',
    url: '',
    icon: '🌐',
    group: 'default',
    iconData: undefined,
    description: undefined,
    sortOrder: 0,
  });
  const [editingItem, setEditingItem] = useState<WebItem | null>(null);

  // ===== 网页特有逻辑 =====

  // 打开网页
  const handleOpenItem = useCallback(async (item: WebItem) => {
    try {
      await window.electronAPI?.openUrl(item.url);
    } catch (error) {
      message.error('打开失败');
    }
  }, []);

  // URL 验证和格式化
  const formatUrl = useCallback((url: string): string => {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return 'https://' + url;
    }
    return url;
  }, []);

  // 上传图标
  const handleUploadIcon = useCallback(async (forAdd: boolean) => {
    try {
      const iconData = await window.electronAPI?.selectIcon();
      if (iconData) {
        if (forAdd) {
          setNewItem(prev => ({ ...prev, iconData: iconData.base64 }));
        } else if (editingItem) {
          setEditingItem(prev => prev ? ({ ...prev, iconData: iconData.base64 }) : null);
        }
        message.success('图标上传成功');
      }
    } catch (error) {
      console.error('Failed to upload icon:', error);
      message.error('图标上传失败');
    }
  }, [editingItem]);

  // 清除图标
  const handleClearIcon = useCallback((forAdd: boolean) => {
    if (forAdd) {
      setNewItem(prev => ({ ...prev, iconData: undefined }));
    } else if (editingItem) {
      setEditingItem(prev => prev ? ({ ...prev, iconData: undefined }) : null);
    }
  }, [editingItem]);

  // ===== 项目操作 =====

  // 添加项目
  const handleAddItem = useCallback(() => {
    const targetGroup = selectedGroup === 'all' ? 'default' : selectedGroup;
    const currentMaxSortOrder = Math.max(
      ...items.filter(i => i.group === targetGroup).map(i => i.sortOrder || 0),
      -1,
    );
    setNewItem({
      id: Date.now().toString(),
      name: '',
      url: '',
      icon: '🌐',
      group: targetGroup,
      iconData: undefined,
      description: undefined,
      sortOrder: currentMaxSortOrder + 1,
    });
    setIsAddModalVisible(true);
  }, [selectedGroup, items]);

  // 确认添加
  const handleConfirmAdd = useCallback(() => {
    if (!newItem.name.trim() || !newItem.url.trim()) {
      message.warning('请填写完整信息');
      return;
    }

    const url = formatUrl(newItem.url);
    const newItems = [...items, { ...newItem, url }];
    setItems(newItems);
    saveItems(newItems);
    setIsAddModalVisible(false);
    message.success('添加成功');
  }, [newItem, items, formatUrl, setItems, saveItems]);

  // 处理外部文件拖拽（网页工具不支持文件，显示提示）
  const handleDropFiles = useCallback((files: File[], targetGroupId: string) => {
    console.log(`[WebOpener] 外部文件拖拽到分组: ${targetGroupId}, 文件数: ${files.length}`);
    message.warning('网页快速打开工具不支持拖拽文件，请手动添加网页链接');
  }, []);

  // 编辑项目
  const handleEditItem = useCallback((item: WebItem) => {
    setEditingItem({ ...item });
    setIsEditModalVisible(true);
  }, []);

  // 确认编辑
  const handleConfirmEdit = useCallback(() => {
    if (!editingItem || !editingItem.name.trim() || !editingItem.url.trim()) {
      message.warning('请填写完整信息');
      return;
    }

    const url = formatUrl(editingItem.url);
    const updatedItems = items.map(item =>
      item.id === editingItem.id ? { ...editingItem, url } : item
    );
    setItems(updatedItems);
    saveItems(updatedItems);
    setIsEditModalVisible(false);
    setEditingItem(null);
    message.success('编辑成功');
  }, [editingItem, items, formatUrl, setItems, saveItems]);

  // 删除项目
  const handleDeleteItem = useCallback((item: WebItem) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除"${item.name}"吗？`,
      okType: 'danger',
      onOk: () => {
        const updatedItems = items.filter(i => i.id !== item.id);
        setItems(updatedItems);
        saveItems(updatedItems);
        message.success('删除成功');
      },
    });
  }, [items, setItems, saveItems]);

  // ===== 批量选择操作 =====

  // 切换编辑模式
  const handleToggleMultiSelectMode = useCallback(() => {
    setIsEditMode(prev => !prev);
    if (isEditMode) {
      clearSelection();
    }
  }, [isEditMode, setIsEditMode, clearSelection]);

  // 全选当前过滤的项目
  const handleSelectAll = useCallback(() => {
    selectAll(filteredItems);
  }, [selectAll, filteredItems]);

  // 打开批量移动模态框
  const handleOpenBatchMoveModal = useCallback(() => {
    if (selectedItemIds.size === 0) {
      message.warning('请先选择要移动的项');
      return;
    }
    setIsBatchMoveModalVisible(true);
  }, [selectedItemIds]);

  // 批量移动保存
  const handleBatchMoveSave = useCallback((updatedItems: WebItem[]) => {
    setItems(updatedItems);
    saveItems(updatedItems);
    clearSelection();
  }, [setItems, saveItems, clearSelection]);

  // ===== TreeSelect 渲染 =====

  const renderTreeSelectNodes = useCallback((parentId: string | null): React.ReactNode[] => {
    const children = getChildGroups(parentId);
    if (children.length === 0) return [];

    return children.map(group => {
      const childNodes = renderTreeSelectNodes(group.id);
      return (
        <TreeNode
          key={group.id}
          value={group.id}
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GlobalOutlined />
              <span>{group.name}</span>
            </div>
          }
        >
          {childNodes}
        </TreeNode>
      );
    });
  }, [getChildGroups]);

  // ===== SortableItemBase 渲染函数 =====

  // 网页特有 tooltip
  const renderWebTooltip = useCallback((item: WebItem) => (
    <div style={{ padding: 14, maxWidth: 500, wordWrap: 'break-word', overflowWrap: 'break-word' }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: '#333', wordBreak: 'break-all', lineHeight: 1.4 }}>
        {item.name}
      </div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 6, lineHeight: 1.5 }}>
        <span style={{ fontWeight: 500, color: '#999', display: 'block', marginBottom: 3 }}>网址：</span>
        <span style={{ color: '#1890ff', wordBreak: 'break-all', fontFamily: 'Consolas, Monaco, monospace', display: 'block' }}>
          {item.url}
        </span>
      </div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: item.description ? 6 : 0, lineHeight: 1.5 }}>
        <span style={{ fontWeight: 500, color: '#999' }}>分组：</span>
        <span>{groups.find((g: Group) => g.id === item.group)?.name || '默认分组'}</span>
      </div>
      {item.description && (
        <div style={{ fontSize: 12, color: '#666', borderTop: '1px solid #eee', paddingTop: 8, marginTop: 8, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 500, color: '#999', display: 'block', marginBottom: 3 }}>备注：</span>
          <span style={{ display: 'block', wordBreak: 'break-all' }}>{item.description}</span>
        </div>
      )}
    </div>
  ), [groups]);

  // 网页特有 subtitle（显示"网页"标签）
  const renderWebSubtitle = useCallback((_item: WebItem) => (
    <span>
      <GlobalOutlined />
      <span style={{ marginLeft: 4 }}>网页</span>
    </span>
  ), []);

  // 列表视图详情（显示 URL）
  const renderWebDetails = useCallback((item: WebItem) => item.url, []);

  // ===== 渲染 =====

  return (
    <ConfigProvider
      theme={{
        token: {
          borderRadius: 8,
        },
      }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: token.colorBgContainer,
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          {/* 工具栏 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderBottom: `1px solid ${token.colorBorder}`,
            backgroundColor: token.colorBgElevated,
          }}>
            <Space>
              <span style={{ fontSize: 16, fontWeight: 600 }}>网页快速打开</span>
              {selectedGroup !== 'all' && (
                <Text type="secondary" style={{ fontSize: 13 }}>
                  - {getGroupPath(selectedGroup)}
                </Text>
              )}
            </Space>

            <Space>
              {/* 批量选择按钮 */}
              {isEditMode && (
                <Space>
                  <Button
                    icon={<CheckSquareOutlined />}
                    onClick={handleSelectAll}
                    size="small"
                  >
                    全选
                  </Button>
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    onClick={handleOpenBatchMoveModal}
                    disabled={selectedItemIds.size === 0}
                    size="small"
                  >
                    移动到分组 ({selectedItemIds.size})
                  </Button>
                </Space>
              )}

              <Button
                type={isEditMode ? 'primary' : 'default'}
                icon={<SwapOutlined />}
                onClick={handleToggleMultiSelectMode}
                size="small"
              >
                编辑模式
              </Button>

              <Radio.Group
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value)}
                buttonStyle="solid"
                size="small"
              >
                <Radio.Button value="grid"><AppstoreOutlined /></Radio.Button>
                <Radio.Button value="list"><UnorderedListOutlined /></Radio.Button>
              </Radio.Group>

              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddItem}
              >
                添加快捷方式
              </Button>

              <Button
                icon={<SettingOutlined />}
                onClick={() => setIsGroupManagerVisible(true)}
              >
                分组管理
              </Button>
            </Space>
          </div>

          {/* 主内容区域 */}
          <div style={{
            flex: 1,
            display: 'flex',
            overflow: 'hidden',
          }}>
            {/* 左侧分组面板 */}
            <GroupPanel
              selectedGroup={selectedGroup}
              setSelectedGroup={setSelectedGroup}
              groups={groups}
              expandedGroups={expandedGroups}
              dropTarget={dropTarget}
              activeGroupId={activeGroupId}
              activeId={activeId}
              items={items}
              token={token}
              getChildGroups={getChildGroups}
              getGroupItemCount={(groupId: string) => getGroupItemCount(groupId, items, true)}
              handleGroupDragStart={handleGroupDragStart}
              handleGroupDragOver={handleGroupDragOver}
              handleGroupDrop={handleGroupDrop}
              handleDragLeave={handleDragLeave}
              toggleGroup={toggleGroup}
              setActiveId={setActiveId}
              setItems={setItems}
              saveItems={saveItems}
              setDropTarget={setDropTarget}
              onDropFiles={handleDropFiles}
            />

            {/* 右侧快捷方式列表 */}
            <div
              onDragOver={(e) => handleDragOver(e, selectedGroup)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => {
                e.preventDefault();
                setDropTarget(null);
              }}
              style={{
                flex: 1,
                padding: 16,
                overflow: 'auto',
                backgroundColor: dropTarget === selectedGroup && selectedGroup !== null ? `${token.colorPrimaryBg}20` : token.colorBgElevated,
                border: dropTarget === selectedGroup && selectedGroup !== null ? `2px dashed ${token.colorPrimary}` : 'none',
                borderRadius: 8,
                transition: 'all 0.2s',
              }}
            >
              {filteredItems.length === 0 ? (
                <Empty
                  image={<div style={{ fontSize: 64 }}>🌐</div>}
                  description={
                    selectedGroup === 'all'
                      ? '还没有添加任何网页快捷方式'
                      : '该分组下还没有快捷方式'
                  }
                >
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleAddItem}>
                    添加快捷方式
                  </Button>
                </Empty>
              ) : (
                <SortableContext items={itemIds} strategy={viewMode === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}>
                  <div style={{ marginBottom: 12, fontSize: 13, color: token.colorTextSecondary }}>
                    {filteredItems.length} 个项目
                    {isEditMode && selectedItemIds.size > 0 && ` (已选择 ${selectedItemIds.size} 个)`}
                  </div>
                  {viewMode === 'grid' ? (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                      gap: 16,
                    }}>
                      {filteredItems.map(item => (
                        <SortableItemBase
                          key={item.id}
                          id={item.id}
                          item={item}
                          viewMode="grid"
                          onOpen={handleOpenItem}
                          onEdit={handleEditItem}
                          onDelete={handleDeleteItem}
                          token={token}
                          isSelected={selectedItemIds.has(item.id)}
                          showCheckbox={isEditMode}
                          onToggleSelect={toggleSelectItem}
                          renderTooltip={renderWebTooltip}
                          renderSubtitle={renderWebSubtitle}
                        />
                      ))}
                    </div>
                  ) : (
                    <div style={{
                      background: token.colorBgContainer,
                      borderRadius: 12,
                      border: `1px solid ${token.colorBorder}`,
                    }}>
                      {filteredItems.map(item => (
                        <SortableItemBase
                          key={item.id}
                          id={item.id}
                          item={item}
                          viewMode="list"
                          onOpen={handleOpenItem}
                          onEdit={handleEditItem}
                          onDelete={handleDeleteItem}
                          token={token}
                          isSelected={selectedItemIds.has(item.id)}
                          showCheckbox={isEditMode}
                          onToggleSelect={toggleSelectItem}
                          renderTooltip={renderWebTooltip}
                          renderDetails={renderWebDetails}
                        />
                      ))}
                    </div>
                  )}
                </SortableContext>
              )}
            </div>
          </div>

          {/* 拖拽覆盖层 */}
          <DragOverlay>
            {activeId ? (
              <div style={{ opacity: 0.8, transform: 'scale(1.05)' }}>
                {(() => {
                  const item = items.find(i => i.id === activeId);
                  if (item) {
                    return (
                      <Card size="small" style={{ borderRadius: 12 }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 32 }}>
                            {item.iconData ? (
                              <img src={item.iconData} alt="icon" style={{ maxWidth: 32, maxHeight: 32 }} />
                            ) : (
                              item.icon
                            )}
                          </div>
                          <Text>{item.name}</Text>
                        </div>
                      </Card>
                    );
                  }
                  return null;
                })()}
              </div>
            ) : null}
          </DragOverlay>

          {/* 添加快捷方式模态框 */}
          <Modal
            title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><PlusOutlined /> 添加快捷方式</div>}
            open={isAddModalVisible}
            onOk={handleConfirmAdd}
            onCancel={() => setIsAddModalVisible(false)}
            okText="添加"
            cancelText="取消"
            width={600}
          >
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>名称</div>
                <Input
                  value={newItem.name}
                  onChange={(e) => setNewItem(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="请输入网页名称"
                />
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>网址</div>
                <Input
                  value={newItem.url}
                  onChange={(e) => setNewItem(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="请输入网址 (例如: https://example.com)"
                />
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>图标</div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 64,
                    height: 64,
                    border: `2px solid ${token.colorBorder}`,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 32,
                  }}>
                    {newItem.iconData ? (
                      <img
                        src={newItem.iconData}
                        alt="preview"
                        style={{ maxWidth: 48, maxHeight: 48, objectFit: 'contain' }}
                      />
                    ) : (
                      <span>{newItem.icon}</span>
                    )}
                  </div>
                  <Space direction="vertical" style={{ flex: 1 }}>
                    <Button
                      type="primary"
                      icon={<UploadOutlined />}
                      onClick={() => handleUploadIcon(true)}
                    >
                      上传图标
                    </Button>
                    {newItem.iconData && (
                      <Button
                        danger
                        icon={<CloseOutlined />}
                        onClick={() => handleClearIcon(true)}
                      >
                        清除图标
                      </Button>
                    )}
                  </Space>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))',
                  gap: 8,
                  border: `1px solid ${token.colorBorder}`,
                  padding: 12,
                  borderRadius: 8,
                  maxHeight: 180,
                  overflowY: 'auto',
                }}>
                  {DEFAULT_WEB_ICONS.map((icon) => (
                    <div
                      key={icon}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 24,
                        padding: 8,
                        borderRadius: 8,
                        cursor: 'pointer',
                        backgroundColor: newItem.icon === icon ? token.colorPrimaryBg : 'transparent',
                        border: newItem.icon === icon ? `2px solid ${token.colorPrimary}` : '2px solid transparent',
                        transition: 'all 0.2s',
                      }}
                      onClick={() => setNewItem(prev => ({ ...prev, icon }))}
                    >
                      {icon}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>描述（可选）</div>
                <Input.TextArea
                  value={newItem.description}
                  onChange={(e) => setNewItem(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="请输入描述信息"
                  rows={2}
                />
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>分组</div>
                <TreeSelect
                  value={newItem.group}
                  onChange={(value) => setNewItem(prev => ({ ...prev, group: value }))}
                  style={{ width: '100%' }}
                  placeholder="请选择分组"
                  treeDefaultExpandAll
                >
                  {renderTreeSelectNodes(null)}
                </TreeSelect>
              </div>
            </Space>
          </Modal>

          {/* 编辑快捷方式模态框 */}
          {editingItem && (
            <Modal
              title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><EditOutlined /> 编辑快捷方式</div>}
              open={isEditModalVisible}
              onOk={handleConfirmEdit}
              onCancel={() => { setIsEditModalVisible(false); setEditingItem(null); }}
              okText="保存"
              cancelText="取消"
              width={600}
            >
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <div>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>名称</div>
                  <Input
                    value={editingItem.name}
                    onChange={(e) => setEditingItem(prev => prev ? ({ ...prev, name: e.target.value }) : null)}
                    placeholder="请输入网页名称"
                  />
                </div>
                <div>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>网址</div>
                  <Input
                    value={editingItem.url}
                    onChange={(e) => setEditingItem(prev => prev ? ({ ...prev, url: e.target.value }) : null)}
                    placeholder="请输入网址"
                  />
                </div>
                <div>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>图标</div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    <div style={{
                      width: 64,
                      height: 64,
                      border: `2px solid ${token.colorBorder}`,
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 32,
                    }}>
                      {editingItem.iconData ? (
                        <img
                          src={editingItem.iconData}
                          alt="preview"
                          style={{ maxWidth: 48, maxHeight: 48, objectFit: 'contain' }}
                        />
                      ) : (
                        <span>{editingItem.icon}</span>
                      )}
                    </div>
                    <Space direction="vertical" style={{ flex: 1 }}>
                      <Button
                        type="primary"
                        icon={<UploadOutlined />}
                        onClick={() => handleUploadIcon(false)}
                      >
                        上传图标
                      </Button>
                      {editingItem.iconData && (
                        <Button
                          danger
                          icon={<CloseOutlined />}
                          onClick={() => handleClearIcon(false)}
                        >
                          清除图标
                        </Button>
                      )}
                    </Space>
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))',
                    gap: 8,
                    border: `1px solid ${token.colorBorder}`,
                    padding: 12,
                    borderRadius: 8,
                    maxHeight: 180,
                    overflowY: 'auto',
                  }}>
                    {DEFAULT_WEB_ICONS.map((icon) => (
                      <div
                        key={icon}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 24,
                          padding: 8,
                          borderRadius: 8,
                          cursor: 'pointer',
                          backgroundColor: editingItem.icon === icon ? token.colorPrimaryBg : 'transparent',
                          border: editingItem.icon === icon ? `2px solid ${token.colorPrimary}` : '2px solid transparent',
                          transition: 'all 0.2s',
                        }}
                        onClick={() => setEditingItem(prev => prev ? ({ ...prev, icon }) : null)}
                      >
                        {icon}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>描述（可选）</div>
                  <Input.TextArea
                    value={editingItem.description}
                    onChange={(e) => setEditingItem(prev => prev ? ({ ...prev, description: e.target.value }) : null)}
                    placeholder="请输入描述信息"
                    rows={2}
                  />
                </div>
                <div>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>分组</div>
                  <TreeSelect
                    value={editingItem.group}
                    onChange={(value) => setEditingItem(prev => prev ? ({ ...prev, group: value }) : null)}
                    style={{ width: '100%' }}
                    placeholder="请选择分组"
                    treeDefaultExpandAll
                  >
                    {renderTreeSelectNodes(null)}
                  </TreeSelect>
                </div>
              </Space>
            </Modal>
          )}

          {/* 批量移动模态框 */}
          <BatchMoveModal
            visible={isBatchMoveModalVisible}
            onClose={() => setIsBatchMoveModalVisible(false)}
            items={items}
            selectedItemIds={selectedItemIds}
            groups={groups}
            onSave={handleBatchMoveSave}
          />

          {/* 分组管理模态框 */}
          {isGroupManagerVisible && (
            <GroupManager
              groups={groups}
              defaultGroupId="default"
              onGroupsChange={(newGroups) => {
                setGroups(newGroups);
                saveGroups(newGroups);
              }}
              onClose={() => setIsGroupManagerVisible(false)}
            />
          )}
        </div>
      </DndContext>
    </ConfigProvider>
  );
};