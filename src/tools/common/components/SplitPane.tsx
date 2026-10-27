import React, { useState, useEffect, useRef } from 'react';
import { theme } from 'antd';

export interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  /** 左侧初始占比（百分比），默认 50 */
  defaultRatio?: number;
  /** 左侧最小占比，默认 20 */
  min?: number;
  /** 左侧最大占比，默认 80 */
  max?: number;
}

/**
 * 可拖拽的左右分栏容器
 * 手柄默认透明，hover/拖拽时高亮，中央绘制两个圆点作为可见抓手。
 */
export const SplitPane: React.FC<SplitPaneProps> = ({
  left,
  right,
  defaultRatio = 50,
  min = 20,
  max = 80,
}) => {
  const { token } = theme.useToken();
  const [ratio, setRatio] = useState(defaultRatio);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const next = ((e.clientX - rect.left) / rect.width) * 100;
      setRatio(Math.min(Math.max(next, min), max));
    };
    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, min, max]);

  useEffect(() => {
    if (isDragging) {
      const prev = document.body.style.cursor;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      return () => {
        document.body.style.cursor = prev;
        document.body.style.userSelect = '';
      };
    }
  }, [isDragging]);

  const active = isDragging || isHovering;

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}
    >
      <div style={{ width: `calc(${ratio}% - 4px)`, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {left}
      </div>
      <div
        onMouseDown={() => setIsDragging(true)}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        style={{
          width: 8,
          flexShrink: 0,
          cursor: 'col-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: active ? token.colorPrimaryBg : 'transparent',
          borderRadius: 4,
          transition: 'background 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {[0, 1].map((i) => (
            <span
              key={i}
              style={{
                width: 3,
                height: 3,
                borderRadius: '50%',
                background: active ? token.colorPrimary : token.colorBorder,
              }}
            />
          ))}
        </div>
      </div>
      <div style={{ width: `calc(${100 - ratio}% - 4px)`, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {right}
      </div>
    </div>
  );
};
