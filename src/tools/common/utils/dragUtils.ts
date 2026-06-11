/**
 * 拖拽工具函数和常量
 * 用于处理拖拽相关的通用操作
 */

// MIME 类型常量
export const MIME_TYPES = {
  GROUP_ID: 'application/x-group-id',
  ITEM_ID: 'application/x-item-id',
  TEXT_PLAIN: 'text/plain',
};

// 拖拽类型标识
export const DRAG_TYPES = {
  GROUP: 'group',
  ITEM: 'item',
  FILE: 'file',
  WEB: 'web',
};

// 拖拽效果
export const DRAG_EFFECTS = {
  MOVE: 'move',
  COPY: 'copy',
  LINK: 'link',
};

/**
 * 设置拖拽数据
 * @param event 拖拽事件
 * @param dataType 数据类型
 * @param data 数据内容
 */
export function setDragData(
  event: React.DragEvent,
  dataType: string,
  data: string
): void {
  event.dataTransfer.setData(dataType, data);
  event.dataTransfer.effectAllowed = 'move';
}

/**
 * 获取拖拽数据
 * @param event 拖拽事件
 * @param dataType 数据类型
 * @returns 数据内容
 */
export function getDragData(event: React.DragEvent, dataType: string): string {
  return event.dataTransfer.getData(dataType);
}

/**
 * 检查是否有拖拽数据
 * @param event 拖拽事件
 * @param dataType 数据类型
 * @returns 是否有该类型的数据
 */
export function hasDragData(event: React.DragEvent, dataType: string): boolean {
  return event.dataTransfer.types.includes(dataType);
}

/**
 * 判断拖拽是否是分组
 * @param event 拖拽事件
 * @returns 是否是分组拖拽
 */
export function isGroupDrag(event: React.DragEvent): boolean {
  return hasDragData(event, MIME_TYPES.GROUP_ID) || 
         (hasDragData(event, MIME_TYPES.TEXT_PLAIN) && 
          !event.dataTransfer.files.length);
}

/**
 * 判断拖拽是否是外部文件
 * @param event 拖拽事件
 * @returns 是否是外部文件拖拽
 */
export function isExternalFileDrag(event: React.DragEvent): boolean {
  return event.dataTransfer.files.length > 0;
}

/**
 * 判断拖拽是否是快捷方式项
 * @param event 拖拽事件
 * @returns 是否是快捷方式项拖拽
 */
export function isItemDrag(event: React.DragEvent): boolean {
  return hasDragData(event, MIME_TYPES.ITEM_ID) || 
         hasDragData(event, MIME_TYPES.TEXT_PLAIN);
}