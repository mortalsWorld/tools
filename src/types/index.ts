import { ReactNode } from 'react';

export interface ToolCategory {
  id: string;
  name: string;
  icon: ReactNode;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: ReactNode;
  component: React.ComponentType<any>;
}

export interface ToolRegistry {
  registerTool(tool: Tool): void;
  getTools(): Tool[];
  getToolsByCategory(categoryId: string): Tool[];
  getCategories(): ToolCategory[];
}
