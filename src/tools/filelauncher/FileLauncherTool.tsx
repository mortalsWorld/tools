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
  Tooltip,
  Empty,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  EditOutlined,
  SettingOutlined,
  FolderOutlined,
  FileOutlined,
  UploadOutlined,
  CloseOutlined,
  SwapOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import GroupManager from '../common/GroupManager';
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
import {
  FileItem,
  DEFAULT_GROUPS,
  GroupPanel,
  BatchMoveModal,
  SortableItemBase,
  useGroupManagement,
  useDragAndDrop,
  useBatchSelection,
  useConfigPersistence,
} from '../common';

const { Text } = Typography;
const { TreeNode } = TreeSelect;

interface ElectronFile extends File {
  path?: string;
}

const DEFAULT_ICONS = [
  '📄', '📁', '📝', '📊', '📈', '📉', '🎨', '🎭',
  '🎬', '🎵', '🎶', '🎸', '🎹', '🎺', '🎻', '🎼',
  '🎾', '🏀', '🏈', '⚽', '⚾', '🎿', '🏂', '🏃',
  '🚗', '🚕', '🚙', '🚌', '🏎️', '🚓', '🚑', '🚒',
  '📱', '📲', '📳', '📴', '☎️', '📞', '📟', '📠',
  '💻', '🖥️', '🖨️', '⌨️', '🖱️', '🖲️', '💽', '💾',
  '📀', '🎥', '🎞️', '📽️', '🎬', '📺', '📷', '📸',
  '💡', '🔦', '🏮', '📔', '📕', '📖', '📗', '📘',
  '📙', '📚', '📓', '📒', '📃', '📜', '📄', '📰',
  '🔑', '🔒', '🔓', '🔐', '🔏', '🔎', '🔍', '🏠'
];

const FileLauncherTool: React.FC = () => {
  const { token } = theme.useToken();
  
  // 使用配置持久化 hook
  const {
    items,
    setItems,
    groups,
    setGroups,
    saveItems,
    saveGroups,
    isLoaded,
  } = useConfigPersistence<FileItem>({
    configFileName: 'file-launcher.json',
    defaultGroups: DEFAULT_GROUPS,
  });

  // 状态
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // 计算过滤后的项
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
        return a.sortOrder - b.sortOrder;
      }
      return a.id.localeCompare(b.id);
    });
  }, [items]);

  const filteredItems = useMemo(() => {
    if (selectedGroup === 'all') return sortedItems;
    return sortedItems.filter(item => item.group === selectedGroup);
  }, [sortedItems, selectedGroup]);

  const itemIds = useMemo(() => {
    return filteredItems.map(item => item.id);
  }, [filteredItems]);

  // 使用拖拽 hook（需要先调用，因为 useGroupManagement 需要 dropTarget）
  // 使用批量选择 hook
  const {
    selectedItemIds,
    isEditMode,
    setIsEditMode,
    toggleSelectItem,
    selectAll,
    clearSelection,
  } = useBatchSelection<FileItem>();

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
  } = useDragAndDrop<FileItem>({
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

  // 模态框状态
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isGroupManagerVisible, setIsGroupManagerVisible] = useState(false);
  const [isBatchMoveModalVisible, setIsBatchMoveModalVisible] = useState(false);

  // 新建/编辑项状态
  const [newItem, setNewItem] = useState<FileItem>({
    id: '',
    name: '',
    path: '',
    type: 'file',
    icon: '📄',
    group: 'default',
    iconData: undefined,
    description: undefined,
    sortOrder: 0,
  });
  const [editingItem, setEditingItem] = useState<FileItem | null>(null);

  // ========== 特有逻辑：路径验证 ==========
  const normalizePath = useCallback((filePath: string): { path: string; isValid: boolean; error?: string } => {
    if (!filePath) {
      return { path: '', isValid: false, error: '路径为空' };
    }

    let normalizedPath = filePath.trim();

    const illegalChars = /[<>"|?*\x00-\x1f]/;
    if (illegalChars.test(normalizedPath)) {
      return { path: normalizedPath, isValid: false, error: '路径包含非法字符' };
    }

    if (normalizedPath.length > 260) {
      return { path: normalizedPath, isValid: false, error: '路径长度超出限制' };
    }

    const isWindowsPath = /^[a-zA-Z]:/.test(normalizedPath);
    const isUncPath = /^\\\\/.test(normalizedPath);
    if (!isWindowsPath && !isUncPath) {
      return { path: normalizedPath, isValid: false, error: '无效的路径格式' };
    }

    return { path: normalizedPath, isValid: true };
  }, []);

  // ========== 特有逻辑：获取文件图标 ==========
  const fetchFileIcon = useCallback(async (filePath: string): Promise<string | undefined> => {
    console.log(`[fetchFileIcon] 开始获取图标，路径: ${filePath}`);
    
    if (!filePath) {
      console.warn('[fetchFileIcon] 文件路径为空，跳过图标获取');
      return undefined;
    }

    try {
      const startTime = Date.now();
      const iconResult = await window.electronAPI?.getFileIcon(filePath);
      const duration = Date.now() - startTime;
      
      console.log(`[fetchFileIcon] 获取图标完成，耗时: ${duration}ms, path=${filePath}`);
      
      if (iconResult) {
        const iconResultWithError = iconResult as { base64: string; error?: string };
        
        if (iconResult.base64 && iconResult.base64.length > 0) {
          const base64Data = iconResult.base64;
          const hasDataPrefix = base64Data.startsWith('data:image');
          
          if (!hasDataPrefix) {
            console.log('[fetchFileIcon] 图标数据缺少 data:image 前缀，已自动添加');
            return `data:image/png;base64,${base64Data}`;
          }
          return base64Data;
        } else {
          console.warn(`[fetchFileIcon] getFileIcon 返回空数据，路径: ${filePath}, 错误: ${iconResultWithError.error}`);
          return undefined;
        }
      } else {
        console.warn(`[fetchFileIcon] getFileIcon 返回 null，路径: ${filePath}`);
        return undefined;
      }
    } catch (error) {
      console.error('[fetchFileIcon] 获取文件图标失败:', error, '路径:', filePath);
      return undefined;
    }
  }, []);

  // ========== 特有逻辑：解析快捷方式 ==========
  const resolveShortcut = useCallback(async (lnkPath: string): Promise<string> => {
    console.log(`[resolveShortcut] 开始解析快捷方式: ${lnkPath}`);
    
    if (!lnkPath.toLowerCase().endsWith('.lnk')) {
      console.log(`[resolveShortcut] 不是 .lnk 文件，直接返回原路径`);
      return lnkPath;
    }

    try {
      const electronAPI = window.electronAPI as any;
      const result = await electronAPI?.resolveShortcut(lnkPath);
      
      if (result?.success && result?.targetPath) {
        console.log(`[resolveShortcut] 成功解析快捷方式: ${lnkPath} -> ${result.targetPath}`);
        return result.targetPath;
      } else {
        console.warn(`[resolveShortcut] 解析失败，返回原路径: ${lnkPath}, 错误: ${result?.error}`);
        return lnkPath;
      }
    } catch (error) {
      console.error('[resolveShortcut] 解析快捷方式时发生异常:', error);
      return lnkPath;
    }
  }, []);

  // ========== 特有逻辑：创建文件项 ==========
  const createFileItem = useCallback((
    name: string,
    filePath: string,
    type: 'file' | 'directory',
    groupId: string,
    sortOrder: number
  ): FileItem => {
    return {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      name,
      path: filePath,
      type,
      icon: type === 'directory' ? '📁' : '📄',
      group: groupId,
      iconData: undefined,
      description: undefined,
      sortOrder,
    };
  }, []);

  // ========== 特有逻辑：处理外部文件拖拽 ==========
  const handleDropFiles = useCallback(async (files: ElectronFile[], targetGroupId: string) => {
    console.log(`[handleDropFiles] 外部文件拖拽到分组: ${targetGroupId}, 文件数: ${files.length}`);
    
    const resolvedGroupId = targetGroupId === 'all' ? 'default' : targetGroupId;
    const newItems: FileItem[] = [];
    const errors: string[] = [];

    for (const file of files) {
      const rawPath = file.path || '';
      const { path: validatedPath, isValid, error } = normalizePath(rawPath);

      if (!isValid) {
        console.warn(`[handleDropFiles] 路径验证失败: ${file.name}, 错误: ${error}`);
        errors.push(`${file.name}: ${error}`);
        continue;
      }

      const resolvedPath = await resolveShortcut(validatedPath);
      console.log(`[handleDropFiles] 文件=${file.name}, 原始路径=${validatedPath}, 解析后路径=${resolvedPath}`);

      const name = file.name;
      const displayName = name.toLowerCase().endsWith('.lnk') ? name.replace(/\.lnk$/i, '') : name;
      const isDirectory = !file.type && !name.includes('.');
      const currentMaxSortOrder = Math.max(
        ...items.filter(i => i.group === resolvedGroupId).map(i => i.sortOrder || 0),
        -1
      );
      const fileItem = createFileItem(displayName, resolvedPath, isDirectory ? 'directory' : 'file', resolvedGroupId, currentMaxSortOrder + 1);
      newItems.push(fileItem);
    }

    for (let i = 0; i < newItems.length; i++) {
      const item = newItems[i];
      const iconData = await fetchFileIcon(item.path);
      newItems[i] = { ...item, iconData };

      if (newItems.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }

    if (newItems.length > 0) {
      const updatedItems = [...items, ...newItems];
      setItems(updatedItems);
      saveItems(updatedItems);
      console.log(`[handleDropFiles] 已持久化 ${newItems.length} 个快捷方式`);
      message.success(`成功添加 ${newItems.length} 个快捷方式到分组`);
    }

    if (errors.length > 0) {
      console.warn('[handleDropFiles] 部分文件路径验证失败:', errors);
    }
  }, [items, setItems, saveItems, normalizePath, fetchFileIcon, createFileItem, resolveShortcut]);

  const handleDrop = useCallback(async (e: React.DragEvent, targetGroup: string) => {
    e.preventDefault();
    setDropTarget(null);

    const files = Array.from(e.dataTransfer.files) as ElectronFile[];
    if (files.length === 0) {
      message.warning('请拖拽文件或文件夹');
      return;
    }

    const targetGroupId = targetGroup === 'all' ? 'default' : targetGroup;
    const newItems: FileItem[] = [];
    const errors: string[] = [];

    for (const file of files) {
      const rawPath = file.path || '';
      const { path: validatedPath, isValid, error } = normalizePath(rawPath);

      if (!isValid) {
        console.warn(`[handleDrop] 路径验证失败: ${file.name}, 错误: ${error}`);
        errors.push(`${file.name}: ${error}`);
        continue;
      }

      // 解析 .lnk 快捷方式
      const resolvedPath = await resolveShortcut(validatedPath);
      console.log(`[handleDrop] 文件=${file.name}, 原始路径=${validatedPath}, 解析后路径=${resolvedPath}`);

      const name = file.name;
      const displayName = name.toLowerCase().endsWith('.lnk') ? name.replace(/\.lnk$/i, '') : name;
      const isDirectory = !file.type && !name.includes('.');
      const currentMaxSortOrder = Math.max(
        ...items.filter(i => i.group === targetGroupId).map(i => i.sortOrder || 0),
        -1
      );
      const fileItem = createFileItem(displayName, resolvedPath, isDirectory ? 'directory' : 'file', targetGroupId, currentMaxSortOrder + 1);
      newItems.push(fileItem);
    }

    for (let i = 0; i < newItems.length; i++) {
      const item = newItems[i];
      const iconData = await fetchFileIcon(item.path);
      newItems[i] = { ...item, iconData };

      if (newItems.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }

    if (newItems.length > 0) {
      const updatedItems = [...items, ...newItems];
      setItems(updatedItems);
      saveItems(updatedItems);
      console.log(`[handleDrop] 已持久化 ${newItems.length} 个快捷方式`);
      message.success(`成功添加 ${newItems.length} 个快捷方式`);
    }

    if (errors.length > 0) {
      console.warn('[handleDrop] 部分文件路径验证失败:', errors);
    }
  }, [items, setItems, saveItems, normalizePath, fetchFileIcon, createFileItem, resolveShortcut, setDropTarget]);

  // ========== 处理打开项 ==========
  const handleOpenItem = useCallback((item: FileItem) => {
    window.electronAPI?.openFile(item.path);
  }, []);

  // ========== 处理添加项 ==========
  const handleAddItem = useCallback(() => {
    const targetGroup = selectedGroup === 'all' ? 'default' : selectedGroup;
    const currentMaxSortOrder = Math.max(
      ...items.filter(i => i.group === targetGroup).map(i => i.sortOrder || 0),
      -1
    );
    setNewItem({
      id: Date.now().toString(),
      name: '',
      path: '',
      type: 'file',
      icon: '📄',
      group: targetGroup,
      iconData: undefined,
      description: undefined,
      sortOrder: currentMaxSortOrder + 1,
    });
    setIsAddModalVisible(true);
  }, [selectedGroup, items]);

  const handleConfirmAdd = useCallback(async () => {
    if (!newItem.name.trim() || !newItem.path.trim()) {
      message.warning('请填写完整信息');
      return;
    }

    const newItems = [...items, newItem];
    setItems(newItems);
    saveItems(newItems);
    console.log(`[handleConfirmAdd] 已持久化 1 个快捷方式`);
    setIsAddModalVisible(false);
    message.success('添加成功');
  }, [newItem, items, setItems, saveItems]);

  // ========== 处理编辑项 ==========
  const handleEditItem = useCallback((item: FileItem) => {
    setEditingItem({ ...item });
    setIsEditModalVisible(true);
  }, []);

  const handleConfirmEdit = useCallback(() => {
    if (!editingItem || !editingItem.name.trim() || !editingItem.path.trim()) {
      message.warning('请填写完整信息');
      return;
    }

    const updatedItems = items.map(item =>
      item.id === editingItem.id ? editingItem : item
    );
    setItems(updatedItems);
    saveItems(updatedItems);
    console.log(`[handleConfirmEdit] 已持久化 1 个快捷方式`);
    setIsEditModalVisible(false);
    message.success('编辑成功');
  }, [editingItem, items, setItems, saveItems]);

  // ========== 处理删除项 ==========
  const handleDeleteItem = useCallback((item: FileItem) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除"${item.name}"吗？`,
      okType: 'danger',
      onOk: () => {
        const updatedItems = items.filter(i => i.id !== item.id);
        setItems(updatedItems);
        saveItems(updatedItems);
        console.log(`[handleDeleteItem] 已持久化，删除 1 个快捷方式`);
        message.success('删除成功');
      },
    });
  }, [items, setItems, saveItems]);

  // ========== 处理选择路径 ==========
  const handleSelectPath = useCallback(async (isDirectory: boolean) => {
    try {
      let selectedPath: string | null = null;
      if (isDirectory) {
        selectedPath = await window.electronAPI?.selectDirectory();
      } else {
        selectedPath = await window.electronAPI?.selectFile();
      }

      if (selectedPath) {
        const { path: validatedPath, isValid, error } = normalizePath(selectedPath);
        if (!isValid) {
          console.error('[handleSelectPath] 路径验证失败:', error, selectedPath);
          message.error(`路径无效: ${error}`);
          return;
        }

        const name = selectedPath.split(/[\\/]/).pop() || '未命名';
        const iconData = await fetchFileIcon(validatedPath);

        if (isAddModalVisible) {
          setNewItem(prev => ({
            ...prev,
            path: validatedPath,
            name,
            type: isDirectory ? 'directory' : 'file',
            icon: isDirectory ? '📁' : '📄',
            iconData,
          }));
        } else if (isEditModalVisible && editingItem) {
          setEditingItem(prev => prev ? ({
            ...prev,
            path: validatedPath,
            name,
            type: isDirectory ? 'directory' : 'file',
            icon: isDirectory ? '📁' : '📄',
            iconData,
          }) : null);
        }
      }
    } catch (error) {
      console.error('[handleSelectPath] 选择路径时发生错误:', error);
      message.error('选择路径失败');
    }
  }, [normalizePath, fetchFileIcon, isAddModalVisible, isEditModalVisible, editingItem, setNewItem, setEditingItem]);

  // ========== 处理上传图标 ==========
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
  }, [editingItem, setNewItem, setEditingItem]);

  const handleClearIcon = useCallback((forAdd: boolean) => {
    if (forAdd) {
      setNewItem(prev => ({ ...prev, iconData: undefined }));
    } else if (editingItem) {
      setEditingItem(prev => prev ? ({ ...prev, iconData: undefined }) : null);
    }
  }, [editingItem, setNewItem, setEditingItem]);

  // ========== 渲染 TreeSelect 节点 ==========
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
              <FolderOutlined />
              <span>{group.name}</span>
            </div>
          }
        >
          {childNodes}
        </TreeNode>
      );
    });
  }, [getChildGroups]);

  // ========== 渲染 SortableItemBase 的 tooltip ==========
  const renderTooltip = useCallback((item: FileItem) => (
    <div style={{ padding: 14, maxWidth: 500, wordWrap: 'break-word', overflowWrap: 'break-word' }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: '#333', wordBreak: 'break-all', lineHeight: 1.4 }}>
        {item.name}
      </div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 6, lineHeight: 1.5 }}>
        <span style={{ fontWeight: 500, color: '#999', display: 'block', marginBottom: 3 }}>路径：</span>
        <span style={{ wordBreak: 'break-all', fontFamily: 'Consolas, Monaco, monospace', display: 'block' }}>{item.path}</span>
      </div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 6, lineHeight: 1.5 }}>
        <span style={{ fontWeight: 500, color: '#999' }}>类型：</span>
        <span>{item.type === 'directory' ? '文件夹' : '文件'}</span>
      </div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: item.description ? 6 : 0, lineHeight: 1.5 }}>
        <span style={{ fontWeight: 500, color: '#999' }}>分组：</span>
        <span>{groups.find(g => g.id === item.group)?.name || item.group}</span>
      </div>
      {item.description && (
        <div style={{ fontSize: 12, color: '#666', borderTop: '1px solid #eee', paddingTop: 8, marginTop: 8, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 500, color: '#999', display: 'block', marginBottom: 3 }}>备注：</span>
          <span style={{ display: 'block', wordBreak: 'break-all' }}>{item.description}</span>
        </div>
      )}
    </div>
  ), [groups]);

  // ========== 渲染 SortableItemBase 的图标 ==========
  const renderIcon = useCallback((item: FileItem) => (
    item.iconData && item.iconData.length > 0 ? (
      <img
        src={item.iconData}
        alt="icon"
        style={{
          width: viewMode === 'grid' ? 48 : 32,
          height: viewMode === 'grid' ? 48 : 32,
          objectFit: 'contain',
          display: 'block',
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
  ), [viewMode]);

  // ========== 渲染 SortableItemBase 的副标题 ==========
  const renderSubtitle = useCallback((item: FileItem) => (
    <>
      {item.type === 'directory' ? <FolderOutlined /> : <FileOutlined />}
      <span style={{ marginLeft: 4 }}>{item.type === 'directory' ? '文件夹' : '文件'}</span>
    </>
  ), []);

  // ========== 渲染 SortableItemBase 的详情 ==========
  const renderDetails = useCallback((item: FileItem) => (
    item.description || null
  ), []);

  // ========== 处理批量移动确认 ==========
  const handleBatchMoveConfirm = useCallback((updatedItems: FileItem[]) => {
    setItems(updatedItems);
    setIsBatchMoveModalVisible(false);
  }, [setItems]);

  // ========== 处理全选 ==========
  const handleSelectAll = useCallback(() => {
    selectAll(filteredItems);
  }, [selectAll, filteredItems]);

  // ========== 处理打开批量移动模态框 ==========
  const handleOpenBatchMoveModal = useCallback(() => {
    if (selectedItemIds.size === 0) {
      message.warning('请先选择要移动的项');
      return;
    }
    setIsBatchMoveModalVisible(true);
  }, [selectedItemIds.size]);

  if (!isLoaded) {
    return null;
  }

  return (
    <ConfigProvider
      theme={{
        token: {
          borderRadius: 8,
          colorPrimary: '#1890ff',
        },
      }}
    >
      {/* DndContext 提升到整个页面 */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          backgroundColor: token.colorBgContainer,
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
              <span style={{ fontSize: 16, fontWeight: 600 }}>文件快速启动</span>
              {selectedGroup !== 'all' && (
                <Text type="secondary" style={{ fontSize: 13 }}>
                  - {getGroupPath(selectedGroup)}
                </Text>
              )}
            </Space>

            <Space>
              {/* 批量选择按钮 */}
              <Tooltip title={isEditMode ? '退出编辑模式' : '进入编辑模式'}>
                <Button
                  type={isEditMode ? 'primary' : 'default'}
                  icon={<SwapOutlined />}
                  onClick={() => {
                    setIsEditMode(!isEditMode);
                    if (isEditMode) {
                      clearSelection();
                    }
                  }}
                >
                  编辑模式
                </Button>
              </Tooltip>

              {isEditMode && (
                <>
                  <Tooltip title="全选">
                    <Button
                      icon={<CheckOutlined />}
                      onClick={handleSelectAll}
                    >
                      全选
                    </Button>
                  </Tooltip>

                  <Tooltip title="移动到分组">
                    <Button
                      type="primary"
                      icon={<CheckOutlined />}
                      disabled={selectedItemIds.size === 0}
                      onClick={handleOpenBatchMoveModal}
                    >
                      移动到分组 {selectedItemIds.size > 0 && `(${selectedItemIds.size})`}
                    </Button>
                  </Tooltip>
                </>
              )}

              {/* 视图切换 */}
              <Radio.Group
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value)}
                buttonStyle="solid"
                size="small"
              >
                <Radio.Button value="grid"><AppstoreOutlined /></Radio.Button>
                <Radio.Button value="list"><UnorderedListOutlined /></Radio.Button>
              </Radio.Group>

              {/* 添加快捷方式 */}
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddItem}
              >
                添加快捷方式
              </Button>

              {/* 分组管理 */}
              <Button
                icon={<SettingOutlined />}
                onClick={() => setIsGroupManagerVisible(true)}
              >
                分组管理
              </Button>
            </Space>
          </div>

          {/* 主内容区 */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* 左侧分组面板 */}
            <GroupPanel<FileItem>
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
              getGroupItemCount={(groupId) => getGroupItemCount(groupId, items)}
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
              onDrop={(e) => handleDrop(e, selectedGroup)}
              style={{
                flex: 1,
                padding: 16,
                overflowY: 'auto',
                backgroundColor: dropTarget === selectedGroup && selectedGroup !== null ? `${token.colorPrimaryBg}20` : 'transparent',
                border: dropTarget === selectedGroup && selectedGroup !== null ? `2px dashed ${token.colorPrimary}` : 'none',
                borderRadius: 8,
                transition: 'all 0.2s',
              }}
            >
              {filteredItems.length === 0 ? (
                <Empty
                  description="暂无快捷方式"
                  style={{ marginTop: 60 }}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleAddItem}>
                    添加快捷方式
                  </Button>
                </Empty>
              ) : (
                <SortableContext
                  items={itemIds}
                  strategy={viewMode === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}
                >
                  {viewMode === 'grid' ? (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                      gap: 16,
                    }}>
                      {filteredItems.map(item => (
                        <SortableItemBase<FileItem>
                          key={item.id}
                          id={item.id}
                          item={item}
                          viewMode="grid"
                          onOpen={handleOpenItem}
                          onEdit={handleEditItem}
                          onDelete={handleDeleteItem}
                          token={token}
                          isSelected={isEditMode && selectedItemIds.has(item.id)}
                          showCheckbox={isEditMode}
                          onToggleSelect={toggleSelectItem}
                          renderTooltip={renderTooltip}
                          renderIcon={renderIcon}
                          renderSubtitle={renderSubtitle}
                          renderDetails={renderDetails}
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
                        <SortableItemBase<FileItem>
                          key={item.id}
                          id={item.id}
                          item={item}
                          viewMode="list"
                          onOpen={handleOpenItem}
                          onEdit={handleEditItem}
                          onDelete={handleDeleteItem}
                          token={token}
                          isSelected={isEditMode && selectedItemIds.has(item.id)}
                          showCheckbox={isEditMode}
                          onToggleSelect={toggleSelectItem}
                          renderTooltip={renderTooltip}
                          renderIcon={renderIcon}
                          renderSubtitle={renderSubtitle}
                          renderDetails={renderDetails}
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
                              <img src={item.iconData} alt="icon" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                            ) : (
                              <span>{item.icon}</span>
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
        </div>
      </DndContext>

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

          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>类型</div>
            <Radio.Group
              value={newItem.type}
              onChange={(e) => setNewItem(prev => ({
                ...prev,
                type: e.target.value,
                icon: e.target.value === 'directory' ? '📁' : '📄',
              }))}
              buttonStyle="solid"
            >
              <Radio.Button value="file"><FileOutlined /> 文件</Radio.Button>
              <Radio.Button value="directory"><FolderOutlined /> 文件夹</Radio.Button>
            </Radio.Group>
          </div>

          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>名称</div>
            <Input
              value={newItem.name}
              onChange={(e) => setNewItem(prev => ({ ...prev, name: e.target.value }))}
              placeholder="请输入名称"
            />
          </div>

          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>路径</div>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={newItem.path}
                onChange={(e) => setNewItem(prev => ({ ...prev, path: e.target.value }))}
                placeholder="请选择路径"
              />
              <Button onClick={() => handleSelectPath(newItem.type === 'directory')}>
                选择...
              </Button>
            </Space.Compact>
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
              {DEFAULT_ICONS.map((icon, index) => (
                <div
                  key={index}
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
        </Space>
      </Modal>

      {/* 编辑快捷方式模态框 */}
      <Modal
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><EditOutlined /> 编辑快捷方式</div>}
        open={isEditModalVisible}
        onOk={handleConfirmEdit}
        onCancel={() => setIsEditModalVisible(false)}
        okText="确定"
        cancelText="取消"
        width={600}
      >
        {editingItem && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
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

            <div>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>类型</div>
              <Radio.Group
                value={editingItem.type}
                onChange={(e) => setEditingItem(prev => prev ? ({
                  ...prev,
                  type: e.target.value,
                  icon: e.target.value === 'directory' ? '📁' : '📄',
                }) : null)}
                buttonStyle="solid"
              >
                <Radio.Button value="file"><FileOutlined /> 文件</Radio.Button>
                <Radio.Button value="directory"><FolderOutlined /> 文件夹</Radio.Button>
              </Radio.Group>
            </div>

            <div>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>名称</div>
              <Input
                value={editingItem.name}
                onChange={(e) => setEditingItem(prev => prev ? ({ ...prev, name: e.target.value }) : null)}
                placeholder="请输入名称"
              />
            </div>

            <div>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>路径</div>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  value={editingItem.path}
                  onChange={(e) => setEditingItem(prev => prev ? ({ ...prev, path: e.target.value }) : null)}
                  placeholder="请选择路径"
                />
                <Button onClick={() => handleSelectPath(editingItem.type === 'directory')}>
                  选择...
                </Button>
              </Space.Compact>
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
                {DEFAULT_ICONS.map((icon, index) => (
                  <div
                    key={index}
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
          </Space>
        )}
      </Modal>

      {/* 批量移动模态框 */}
      <BatchMoveModal<FileItem>
        visible={isBatchMoveModalVisible}
        onClose={() => setIsBatchMoveModalVisible(false)}
        items={items}
        selectedItemIds={selectedItemIds}
        groups={groups}
        onSave={handleBatchMoveConfirm}
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
    </ConfigProvider>
  );
};

export { FileLauncherTool };