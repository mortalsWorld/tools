# 工具开发示例

本目录包含工具组件的示例。

## 如何添加新工具

1. 在 `src/tools/` 目录下创建新的工具文件（如 `src/tools/MyTool.tsx`）
2. 实现你的工具组件
3. 在 `src/tools/index.ts` 中注册你的工具：

```typescript
import { MyTool } from './MyTool';
import { MyIcon } from '@ant-design/icons';

export const initializeTools = () => {
  // ... 其他代码
  toolRegistry.registerTool({
    id: 'my-tool',
    name: '我的工具',
    description: '工具描述',
    category: 'development', // 或其他分类
    icon: <MyIcon />,
    component: MyTool
  });
};
```

## 工具分类

- `general`: 通用工具
- `development`: 开发工具
- `design`: 设计工具
- `settings`: 系统设置
