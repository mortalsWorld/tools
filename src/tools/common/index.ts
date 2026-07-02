/**
 * 通用基础设施索引文件
 * 导出所有类型、工具函数、hooks 和组件
 */

// 类型
export { DEFAULT_GROUPS } from './types';
export type { Group, BaseItem, FileItem, WebItem, PasswordItem } from './types';

// 工具函数
export {
  getChildGroups,
  getGroupPath,
  isDescendant,
  updateGroupHierarchy,
  sortGroups,
  ensureSortOrder,
  getDescendantGroupIds,
} from './utils/groupUtils';

export {
  MIME_TYPES,
  DRAG_TYPES,
  DRAG_EFFECTS,
  setDragData,
  getDragData,
  hasDragData,
  isGroupDrag,
  isExternalFileDrag,
  isItemDrag,
} from './utils/dragUtils';

// Hooks
export { useGroupManagement } from './hooks/useGroupManagement';
export type { UseGroupManagementOptions, UseGroupManagementReturn } from './hooks/useGroupManagement';

export { useBatchSelection } from './hooks/useBatchSelection';
export type { UseBatchSelectionReturn } from './hooks/useBatchSelection';

export { useConfigPersistence } from './hooks/useConfigPersistence';
export type { UseConfigPersistenceOptions, UseConfigPersistenceReturn } from './hooks/useConfigPersistence';

export { useDragAndDrop } from './hooks/useDragAndDrop';
export type { UseDragAndDropOptions, UseDragAndDropReturn } from './hooks/useDragAndDrop';

// 组件
export { GroupDropZone } from './components/GroupDropZone';
export type { GroupDropZoneProps } from './components/GroupDropZone';

export { GroupItem } from './components/GroupItem';
export type { GroupItemProps } from './components/GroupItem';

export { GroupPanel } from './components/GroupPanel';
export type { GroupPanelProps } from './components/GroupPanel';

export { SortableItemBase } from './components/SortableItemBase';
export type { SortableItemBaseProps } from './components/SortableItemBase';

export { BatchMoveModal } from './components/BatchMoveModal';
export type { BatchMoveModalProps } from './components/BatchMoveModal';