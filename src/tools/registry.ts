import { Tool, ToolCategory } from '../types';

class ToolRegistryImpl {
  private tools: Map<string, Tool> = new Map();
  private categories: Map<string, ToolCategory> = new Map();

  registerCategory(category: ToolCategory) {
    this.categories.set(category.id, category);
  }

  registerTool(tool: Tool) {
    this.tools.set(tool.id, tool);
  }

  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  getToolsByCategory(categoryId: string): Tool[] {
    return this.getTools().filter(tool => tool.category === categoryId);
  }

  getCategories(): ToolCategory[] {
    return Array.from(this.categories.values());
  }

  getTool(toolId: string): Tool | undefined {
    return this.tools.get(toolId);
  }
}

export const toolRegistry = new ToolRegistryImpl();
