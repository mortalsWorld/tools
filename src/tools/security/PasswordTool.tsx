import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Card,
  Button,
  Input,
  Modal,
  Space,
  message,
  Radio,
  ConfigProvider,
  theme,
  Empty,
  Typography,
  Slider,
  Checkbox,
  Select,
} from 'antd';
import {
  PlusOutlined,
  SafetyOutlined,
  UnorderedListOutlined,
  EditOutlined,
  SettingOutlined,
  CopyOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  SwapOutlined,
  CheckSquareOutlined,
  CheckOutlined,
  KeyOutlined,
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
  PasswordItem,
  Group,
  DEFAULT_GROUPS,
  GroupPanel,
  SortableItemBase,
  BatchMoveModal,
  useGroupManagement,
  useDragAndDrop,
  useBatchSelection,
  useConfigPersistence,
} from '../common';

const { Text } = Typography;
const { Option } = Select;

const DEFAULT_PASSWORD_ICONS = [
  '🔑', '🔐', '🛡️', '💼', '📧', '🌐', '💳', '🏦',
  '📱', '💻', '🎮', '📺', '🎵', '🎨', '🎬', '📊',
  '📈', '📉', '📖', '📝', '✨', '🌟', '⭐', '🔥',
  '😊', '😍', '🤩', '😎', '🦁', '🐱', '🐶', '🐰',
];

const commonSymbols = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '_', '=', '+', '[', ']', '{', '}', '|', ';', ':', ',', '.', '<', '>', '?'];
const safeSymbols = ['-', '_', '.', ',', '@'];

const mapPasswordEntryToItem = (entry: any, index: number): PasswordItem => ({
  id: entry.id,
  name: entry.name || '未命名',
  icon: '🔑',
  group: entry.groupId || 'default',
  iconData: undefined,
  description: entry.notes || undefined,
  sortOrder: entry.sortOrder !== undefined ? entry.sortOrder : index,
  username: entry.username || '',
  password: entry.password || '',
  url: entry.url || undefined,
});

const mapGroupToNewFormat = (g: any, index: number): Group => ({
  id: g.id,
  name: g.name,
  parentId: g.parentId || null,
  level: g.level || 1,
  sortOrder: g.sortOrder !== undefined ? g.sortOrder : index,
});

export const PasswordTool: React.FC = () => {
  const { token } = theme.useToken();

  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [searchText, setSearchText] = useState('');

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isGroupManagerVisible, setIsGroupManagerVisible] = useState(false);
  const [isBatchMoveModalVisible, setIsBatchMoveModalVisible] = useState(false);
  const [isGeneratorModalVisible, setIsGeneratorModalVisible] = useState(false);

  const [newItem, setNewItem] = useState<PasswordItem>({
    id: '',
    name: '',
    icon: '🔑',
    group: 'default',
    iconData: undefined,
    description: undefined,
    sortOrder: 0,
    username: '',
    password: '',
    url: '',
  });
  const [editingItem, setEditingItem] = useState<PasswordItem | null>(null);

  const [genLength, setGenLength] = useState<number>(16);
  const [genIncludeNumbers, setGenIncludeNumbers] = useState<boolean>(true);
  const [genIncludeSymbols, setGenIncludeSymbols] = useState<boolean>(true);
  const [genIncludeUppercase, setGenIncludeUppercase] = useState<boolean>(true);
  const [genIncludeLowercase, setGenIncludeLowercase] = useState<boolean>(true);
  const [genCustomSymbols, setGenCustomSymbols] = useState<string[]>([]);
  const [generatedPassword, setGeneratedPassword] = useState<string>('');

  const {
    items,
    setItems,
    groups,
    setGroups,
    saveItems,
    saveGroups,
  } = useConfigPersistence<PasswordItem>({
    configFileName: 'passwords.json',
    defaultItems: [],
    defaultGroups: DEFAULT_GROUPS,
  });

  useEffect(() => {
    let cancelled = false;

    const loadLegacy = async () => {
      try {
        if (!(window as any).electronAPI?.loadConfig) return;

        const legacyData = await (window as any).electronAPI.loadConfig('passwords.json');

        if (cancelled) return;

        if (legacyData && legacyData.passwords && Array.isArray(legacyData.passwords) && legacyData.passwords.length > 0) {
          const convertedItems = legacyData.passwords.map((entry: any, index: number) =>
            mapPasswordEntryToItem(entry, index)
          );

          const defaultGroupsList: Group[] = [
            { id: 'default', name: '默认分组', parentId: null, level: 1, sortOrder: 0 },
          ];

          const convertedGroups = legacyData.groups && Array.isArray(legacyData.groups) && legacyData.groups.length > 0
            ? legacyData.groups.map((g: any, index: number) => mapGroupToNewFormat(g, index))
            : defaultGroupsList;

          setItems(convertedItems);
          saveItems(convertedItems);

          setGroups(convertedGroups);
          saveGroups(convertedGroups);

          console.log(`[PasswordTool] 迁移了 ${convertedItems.length} 个密码和 ${convertedGroups.length} 个分组到新格式`);
        }
      } catch (error) {
        console.error('[PasswordTool] 加载旧格式配置失败:', error);
      }
    };

    loadLegacy();

    return () => {
      cancelled = true;
    };
  }, []);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
        return a.sortOrder - b.sortOrder;
      }
      return a.id.localeCompare(b.id);
    });
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = sortedItems;

    if (selectedGroup !== 'all') {
      result = result.filter(item => item.group === selectedGroup);
    }

    if (searchText.trim()) {
      const lower = searchText.trim().toLowerCase();
      result = result.filter(item =>
        item.name.toLowerCase().includes(lower) ||
        item.username.toLowerCase().includes(lower) ||
        (item.url && item.url.toLowerCase().includes(lower)) ||
        (item.description && item.description.toLowerCase().includes(lower))
      );
    }

    return result;
  }, [sortedItems, selectedGroup, searchText]);

  const itemIds = useMemo(() => filteredItems.map(item => item.id), [filteredItems]);

  const {
    selectedItemIds,
    isEditMode,
    setIsEditMode,
    toggleSelectItem,
    selectAll,
    clearSelection,
  } = useBatchSelection<PasswordItem>();

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
  } = useDragAndDrop<PasswordItem>({
    items,
    groups,
    filteredItems,
    setItems,
    setGroups,
    onSaveItems: saveItems,
    onSaveGroups: saveGroups,
    isEditMode,
  });

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

  const togglePasswordVisibility = useCallback((id: string) => {
    setShowPassword(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleCopyPassword = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    message.success('已复制到剪贴板');
  }, []);

  const handleAddItem = useCallback(() => {
    const targetGroup = selectedGroup === 'all' ? 'default' : selectedGroup;
    const currentMaxSortOrder = Math.max(
      ...items.filter(i => i.group === targetGroup).map(i => i.sortOrder || 0),
      -1,
    );
    setNewItem({
      id: Date.now().toString(),
      name: '',
      icon: '🔑',
      group: targetGroup,
      iconData: undefined,
      description: undefined,
      sortOrder: currentMaxSortOrder + 1,
      username: '',
      password: '',
      url: '',
    });
    setIsAddModalVisible(true);
  }, [selectedGroup, items]);

  const handleConfirmAdd = useCallback(() => {
    if (!newItem.name.trim()) {
      message.warning('请填写名称');
      return;
    }

    const newItems = [...items, newItem];
    setItems(newItems);
    saveItems(newItems);
    setIsAddModalVisible(false);
    message.success('添加成功');
  }, [newItem, items, setItems, saveItems]);

  const handleEditItem = useCallback((item: PasswordItem) => {
    setEditingItem({ ...item });
    setIsEditModalVisible(true);
  }, []);

  const handleConfirmEdit = useCallback(() => {
    if (!editingItem || !editingItem.name.trim()) {
      message.warning('请填写名称');
      return;
    }

    const updatedItems = items.map(item =>
      item.id === editingItem.id ? editingItem : item
    );
    setItems(updatedItems);
    saveItems(updatedItems);
    setIsEditModalVisible(false);
    setEditingItem(null);
    message.success('编辑成功');
  }, [editingItem, items, setItems, saveItems]);

  const handleDeleteItem = useCallback((item: PasswordItem) => {
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

  const handleOpenItem = useCallback((item: PasswordItem) => {
    handleCopyPassword(item.password);
  }, [handleCopyPassword]);

  const handleToggleMultiSelectMode = useCallback(() => {
    setIsEditMode(prev => !prev);
    if (isEditMode) {
      clearSelection();
    }
  }, [isEditMode, setIsEditMode, clearSelection]);

  const handleSelectAll = useCallback(() => {
    selectAll(filteredItems);
  }, [selectAll, filteredItems]);

  const handleOpenBatchMoveModal = useCallback(() => {
    if (selectedItemIds.size === 0) {
      message.warning('请先选择要移动的项');
      return;
    }
    setIsBatchMoveModalVisible(true);
  }, [selectedItemIds]);

  const handleBatchMoveSave = useCallback((updatedItems: PasswordItem[]) => {
    setItems(updatedItems);
    saveItems(updatedItems);
    clearSelection();
  }, [setItems, saveItems, clearSelection]);

  const handleGeneratePassword = useCallback(async () => {
    try {
      const password = await (window as any).electronAPI?.generatePassword?.({
        length: genLength,
        includeNumbers: genIncludeNumbers,
        includeSymbols: genIncludeSymbols,
        includeUppercase: genIncludeUppercase,
        includeLowercase: genIncludeLowercase,
        customSymbols: genCustomSymbols.length > 0 ? genCustomSymbols : undefined,
      });

      if (password) {
        setGeneratedPassword(password);
        message.success('密码已生成');
      } else {
        const chars = [];
        if (genIncludeLowercase) chars.push('abcdefghijklmnopqrstuvwxyz');
        if (genIncludeUppercase) chars.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
        if (genIncludeNumbers) chars.push('0123456789');
        if (genIncludeSymbols) chars.push((genCustomSymbols.length > 0 ? genCustomSymbols : commonSymbols).join(''));
        const pool = chars.join('');
        if (pool.length === 0) {
          message.warning('至少选择一种字符类型');
          return;
        }
        let pwd = '';
        for (let i = 0; i < genLength; i++) {
          pwd += pool.charAt(Math.floor(Math.random() * pool.length));
        }
        setGeneratedPassword(pwd);
        message.success('密码已生成');
      }
    } catch (error) {
      console.error('Generate password error:', error);
      const chars = [];
      if (genIncludeLowercase) chars.push('abcdefghijklmnopqrstuvwxyz');
      if (genIncludeUppercase) chars.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
      if (genIncludeNumbers) chars.push('0123456789');
      if (genIncludeSymbols) chars.push((genCustomSymbols.length > 0 ? genCustomSymbols : commonSymbols).join(''));
      const pool = chars.join('');
      if (pool.length === 0) {
        message.warning('至少选择一种字符类型');
        return;
      }
      let pwd = '';
      for (let i = 0; i < genLength; i++) {
        pwd += pool.charAt(Math.floor(Math.random() * pool.length));
      }
      setGeneratedPassword(pwd);
      message.success('密码已生成');
    }
  }, [genLength, genIncludeNumbers, genIncludeSymbols, genIncludeUppercase, genIncludeLowercase, genCustomSymbols]);

  const renderPasswordTooltip = useCallback((item: PasswordItem) => (
    <div style={{ padding: 14, maxWidth: 500, wordWrap: 'break-word', overflowWrap: 'break-word' }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: '#333', wordBreak: 'break-all', lineHeight: 1.4 }}>
        {item.name}
      </div>
      {item.username && (
        <div style={{ fontSize: 12, color: '#666', marginBottom: 6, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 500, color: '#999', display: 'block', marginBottom: 3 }}>用户名：</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ wordBreak: 'break-all', fontFamily: 'Consolas, Monaco, monospace' }}>{item.username}</span>
            <span
              style={{ cursor: 'pointer', color: '#1890ff', fontSize: 11 }}
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(item.username);
                message.success('用户名已复制');
              }}
            >
              <CopyOutlined /> 复制
            </span>
          </div>
        </div>
      )}
      {item.url && (
        <div style={{ fontSize: 12, color: '#666', marginBottom: 6, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 500, color: '#999', display: 'block', marginBottom: 3 }}>网址：</span>
          <span style={{ color: '#1890ff', wordBreak: 'break-all', fontFamily: 'Consolas, Monaco, monospace' }}>{item.url}</span>
        </div>
      )}
      <div style={{ fontSize: 12, color: '#666', marginBottom: item.description ? 6 : 0, lineHeight: 1.5 }}>
        <span style={{ fontWeight: 500, color: '#999', display: 'block', marginBottom: 3 }}>分组：</span>
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

  const renderPasswordSubtitle = useCallback((item: PasswordItem) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <KeyOutlined />
      <span style={{ marginLeft: 4 }}>{item.username}</span>
      {item.username && (
        <span
          style={{ cursor: 'pointer', color: token.colorPrimary, marginLeft: 4 }}
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(item.username);
            message.success('用户名已复制');
          }}
        >
          <CopyOutlined />
        </span>
      )}
    </span>
  ), [token.colorPrimary]);

  const renderPasswordDetails = useCallback((item: PasswordItem) => (
    <Space size="middle" style={{ fontSize: 11 }}>
      {item.url && <span style={{ color: token.colorTextTertiary }}>🌐 {item.url}</span>}
      <span
        onClick={(e) => {
          e.stopPropagation();
          togglePasswordVisibility(item.id);
        }}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        {showPassword[item.id] ? (
          <>
            <EyeInvisibleOutlined /> <span style={{ fontFamily: 'Consolas, monospace' }}>{item.password}</span>
            <span style={{ marginLeft: 8, cursor: 'pointer', color: token.colorPrimary }} onClick={(e) => { e.stopPropagation(); handleCopyPassword(item.password); }}>
              <CopyOutlined /> 复制
            </span>
          </>
        ) : (
          <><EyeOutlined /> 点击显示密码</>
        )}
      </span>
    </Space>
  ), [showPassword, togglePasswordVisibility, handleCopyPassword, token]);

  const renderPasswordIcon = useCallback((item: PasswordItem) => {
    return item.iconData && item.iconData.length > 0 ? (
      <img
        src={item.iconData}
        alt="icon"
        style={{
          maxWidth: viewMode === 'grid' ? 48 : 32,
          maxHeight: viewMode === 'grid' ? 48 : 32,
          objectFit: 'contain',
        }}
      />
    ) : (
      <span style={{ fontSize: viewMode === 'grid' ? 48 : 32 }}>{item.icon}</span>
    );
  }, [viewMode]);

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
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: '12px 20px',
            borderBottom: `1px solid ${token.colorBorder}`,
            backgroundColor: token.colorBgElevated,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 600, flexShrink: 0 }}>
                <SafetyOutlined style={{ marginRight: 8, color: token.colorPrimary }} />
                密码管理
              </span>
              {selectedGroup !== 'all' && (
                <Text type="secondary" style={{ fontSize: 13 }}>
                  - {getGroupPath(selectedGroup)}
                </Text>
              )}
              <div style={{ flex: 1, minWidth: 150, maxWidth: 300 }}>
                <Input.Search
                  placeholder="搜索密码"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  onClear={() => setSearchText('')}
                  allowClear
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Button
                icon={<SafetyOutlined />}
                onClick={() => setIsGeneratorModalVisible(true)}
                size="small"
              >
                密码生成器
              </Button>

              {isEditMode && (
                <>
                  <Button icon={<CheckSquareOutlined />} onClick={handleSelectAll} size="small">
                    全选
                  </Button>
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    onClick={handleOpenBatchMoveModal}
                    disabled={selectedItemIds.size === 0}
                    size="small"
                  >
                    移动 ({selectedItemIds.size})
                  </Button>
                </>
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
                <Radio.Button value="grid"><SafetyOutlined /></Radio.Button>
                <Radio.Button value="list"><UnorderedListOutlined /></Radio.Button>
              </Radio.Group>

              <Button type="primary" icon={<PlusOutlined />} onClick={handleAddItem} size="small">
                添加密码
              </Button>

              <Button
                icon={<SettingOutlined />}
                onClick={() => setIsGroupManagerVisible(true)}
                size="small"
              >
                分组管理
              </Button>
            </div>
          </div>

          <div style={{
            flex: 1,
            display: 'flex',
            overflow: 'hidden',
          }}>
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
              getGroupItemCount={(groupId: string) => getGroupItemCount(groupId, items)}
              handleGroupDragStart={handleGroupDragStart}
              handleGroupDragOver={handleGroupDragOver}
              handleGroupDrop={handleGroupDrop}
              handleDragLeave={handleDragLeave}
              toggleGroup={toggleGroup}
              setActiveId={setActiveId}
              setItems={setItems}
              saveItems={saveItems}
              setDropTarget={setDropTarget}
            />

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
                  image={<div style={{ fontSize: 64 }}>🔐</div>}
                  description={
                    searchText
                      ? '没有找到匹配的密码'
                      : selectedGroup === 'all'
                        ? '还没有添加任何密码'
                        : '该分组下还没有密码'
                  }
                >
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleAddItem}>
                    添加密码
                  </Button>
                </Empty>
              ) : (
                <SortableContext items={itemIds} strategy={viewMode === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}>
                  <div style={{ marginBottom: 12, fontSize: 13, color: token.colorTextSecondary }}>
                    {filteredItems.length} 个密码
                    {isEditMode && selectedItemIds.size > 0 && ` (已选择 ${selectedItemIds.size} 个)`}
                  </div>
                  {viewMode === 'grid' ? (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
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
                          renderTooltip={renderPasswordTooltip}
                          renderSubtitle={renderPasswordSubtitle}
                          renderIcon={renderPasswordIcon}
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
                          renderTooltip={renderPasswordTooltip}
                          renderSubtitle={renderPasswordSubtitle}
                          renderDetails={renderPasswordDetails}
                          renderIcon={renderPasswordIcon}
                        />
                      ))}
                    </div>
                  )}
                </SortableContext>
              )}
            </div>
          </div>

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

          <Modal
            title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><PlusOutlined /> 添加密码</div>}
            open={isAddModalVisible}
            onOk={handleConfirmAdd}
            onCancel={() => setIsAddModalVisible(false)}
            okText="添加"
            cancelText="取消"
            width={520}
          >
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>名称 *</div>
                <Input
                  value={newItem.name}
                  onChange={(e) => setNewItem(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="例如：GitHub / Gmail / 公司邮箱"
                  autoFocus
                />
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>用户名 / 邮箱</div>
                <Input
                  value={newItem.username}
                  onChange={(e) => setNewItem(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="请输入用户名或邮箱"
                  prefix={<KeyOutlined />}
                />
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>密码 *</div>
                <Space.Compact style={{ width: '100%' }}>
                  <Input.Password
                    value={newItem.password}
                    onChange={(e) => setNewItem(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="请输入密码"
                    style={{ flex: 1 }}
                  />
                  <Button
                    icon={<SafetyOutlined />}
                    onClick={() => {
                      setGenLength(16);
                      setGenIncludeNumbers(true);
                      setGenIncludeSymbols(true);
                      setGenIncludeUppercase(true);
                      setGenIncludeLowercase(true);
                      setGenCustomSymbols([]);
                      setIsGeneratorModalVisible(true);
                    }}
                  >
                    生成
                  </Button>
                  {generatedPassword && isGeneratorModalVisible === false && (
                    <Button
                      icon={<CopyOutlined />}
                      onClick={() => {
                        setNewItem(prev => ({ ...prev, password: generatedPassword }));
                      }}
                    >
                      填入
                    </Button>
                  )}
                </Space.Compact>
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>网址（可选）</div>
                <Input
                  value={newItem.url}
                  onChange={(e) => setNewItem(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://example.com"
                />
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>图标</div>
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
                  {DEFAULT_PASSWORD_ICONS.map((icon) => (
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
                <div style={{ marginBottom: 8, fontWeight: 500 }}>备注（可选）</div>
                <Input.TextArea
                  value={newItem.description}
                  onChange={(e) => setNewItem(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="请输入描述信息"
                  rows={2}
                />
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>分组</div>
                <Select
                  value={newItem.group}
                  onChange={(value) => setNewItem(prev => ({ ...prev, group: value }))}
                  style={{ width: '100%' }}
                  placeholder="请选择分组"
                >
                  {groups.map(g => (
                    <Option key={g.id} value={g.id}>{g.name}</Option>
                  ))}
                </Select>
              </div>
            </Space>
          </Modal>

          {editingItem && (
            <Modal
              title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><EditOutlined /> 编辑密码</div>}
              open={isEditModalVisible}
              onOk={handleConfirmEdit}
              onCancel={() => { setIsEditModalVisible(false); setEditingItem(null); }}
              okText="保存"
              cancelText="取消"
              width={520}
            >
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <div>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>名称 *</div>
                  <Input
                    value={editingItem.name}
                    onChange={(e) => setEditingItem(prev => prev ? ({ ...prev, name: e.target.value }) : null)}
                  />
                </div>
                <div>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>用户名 / 邮箱</div>
                  <Input
                    value={editingItem.username}
                    onChange={(e) => setEditingItem(prev => prev ? ({ ...prev, username: e.target.value }) : null)}
                    prefix={<KeyOutlined />}
                  />
                </div>
                <div>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>密码 *</div>
                  <Input.Password
                    value={editingItem.password}
                    onChange={(e) => setEditingItem(prev => prev ? ({ ...prev, password: e.target.value }) : null)}
                  />
                </div>
                <div>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>网址（可选）</div>
                  <Input
                    value={editingItem.url}
                    onChange={(e) => setEditingItem(prev => prev ? ({ ...prev, url: e.target.value }) : null)}
                  />
                </div>
                <div>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>图标</div>
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
                    {DEFAULT_PASSWORD_ICONS.map((icon) => (
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
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>备注（可选）</div>
                  <Input.TextArea
                    value={editingItem.description}
                    onChange={(e) => setEditingItem(prev => prev ? ({ ...prev, description: e.target.value }) : null)}
                    rows={2}
                  />
                </div>
                <div>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>分组</div>
                  <Select
                    value={editingItem.group}
                    onChange={(value) => setEditingItem(prev => prev ? ({ ...prev, group: value }) : null)}
                    style={{ width: '100%' }}
                  >
                    {groups.map(g => (
                      <Option key={g.id} value={g.id}>{g.name}</Option>
                    ))}
                  </Select>
                </div>
              </Space>
            </Modal>
          )}

          <Modal
            title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><SafetyOutlined /> 密码生成器</div>}
            open={isGeneratorModalVisible}
            onOk={() => {
              if (generatedPassword) {
                navigator.clipboard.writeText(generatedPassword);
                message.success('已复制到剪贴板');
              }
              setIsGeneratorModalVisible(false);
            }}
            onCancel={() => setIsGeneratorModalVisible(false)}
            okText="复制并关闭"
            cancelText="取消"
            width={480}
          >
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>密码长度：{genLength}</div>
                <Slider
                  min={8}
                  max={64}
                  value={genLength}
                  onChange={(value) => setGenLength(value as number)}
                  marks={{ 8: '8', 16: '16', 32: '32', 64: '64' }}
                />
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>字符类型</div>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Checkbox checked={genIncludeUppercase} onChange={(e) => setGenIncludeUppercase(e.target.checked)}>
                    大写字母 (A-Z)
                  </Checkbox>
                  <Checkbox checked={genIncludeLowercase} onChange={(e) => setGenIncludeLowercase(e.target.checked)}>
                    小写字母 (a-z)
                  </Checkbox>
                  <Checkbox checked={genIncludeNumbers} onChange={(e) => setGenIncludeNumbers(e.target.checked)}>
                    数字 (0-9)
                  </Checkbox>
                  <Checkbox checked={genIncludeSymbols} onChange={(e) => setGenIncludeSymbols(e.target.checked)}>
                    特殊符号
                  </Checkbox>
                </Space>
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>自定义符号（可选）</div>
                <Select
                  mode="multiple"
                  value={genCustomSymbols}
                  onChange={(value) => setGenCustomSymbols(value as string[])}
                  style={{ width: '100%' }}
                  placeholder="选择允许的符号（留空则使用全部符号）"
                  tokenSeparators={[',', ' ']}
                >
                  {commonSymbols.map(s => (
                    <Option key={s} value={s}>{s}</Option>
                  ))}
                </Select>
                <Space style={{ marginTop: 8 }}>
                  <Button size="small" onClick={() => setGenCustomSymbols(safeSymbols)}>
                    常用安全符号 (-_.@,)
                  </Button>
                  <Button size="small" onClick={() => setGenCustomSymbols([])}>
                    清空
                  </Button>
                </Space>
              </div>
              <Button type="primary" onClick={handleGeneratePassword} block>
                生成密码
              </Button>
              {generatedPassword && (
                <Card size="small" style={{ background: token.colorFillAlter }}>
                  <Space direction="vertical" style={{ width: '100%' }} size="small">
                    <Text type="secondary">生成的密码：</Text>
                    <div style={{
                      fontFamily: 'Consolas, Monaco, monospace',
                      fontSize: 18,
                      wordBreak: 'break-all',
                      background: token.colorBgContainer,
                      padding: 12,
                      borderRadius: 8,
                      border: `1px solid ${token.colorBorder}`,
                    }}>
                      {generatedPassword}
                    </div>
                    <Space>
                      <Button size="small" icon={<CopyOutlined />} onClick={() => {
                        navigator.clipboard.writeText(generatedPassword);
                        message.success('已复制到剪贴板');
                      }}>
                        复制
                      </Button>
                      {isAddModalVisible === false && (
                        <Button size="small" onClick={() => {
                          if (newItem.id) {
                            setNewItem(prev => ({ ...prev, password: generatedPassword }));
                          }
                          message.info('已生成本地密码，可粘贴到编辑框中');
                        }}>
                          准备用于新密码
                        </Button>
                      )}
                    </Space>
                  </Space>
                </Card>
              )}
            </Space>
          </Modal>

          <BatchMoveModal
            visible={isBatchMoveModalVisible}
            onClose={() => setIsBatchMoveModalVisible(false)}
            items={items}
            selectedItemIds={selectedItemIds}
            groups={groups}
            onSave={handleBatchMoveSave}
          />

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
