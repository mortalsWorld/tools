import React, { useState, useEffect } from 'react';
import { Layout, Menu, Button, theme, ConfigProvider, Typography } from 'antd';
import { 
  MenuFoldOutlined, 
  MenuUnfoldOutlined, 
  SunOutlined, 
  MoonOutlined,
  ToolOutlined
} from '@ant-design/icons';
import { useTheme } from '../context/ThemeContext';
import { toolRegistry } from '../tools/registry';
import { Tool, ToolCategory } from '../types';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;



interface MainLayoutProps {
  children?: React.ReactNode;
}

const MainLayoutContent: React.FC<{ 
  children?: React.ReactNode;
  selectedKey: string;
  setSelectedKey: React.Dispatch<React.SetStateAction<string>>;
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  appTheme: 'light' | 'dark';
  toggleTheme: () => void;
}> = ({ 
  children, 
  selectedKey, 
  setSelectedKey, 
  collapsed, 
  setCollapsed,
  appTheme,
  toggleTheme 
}) => {
  const [currentTool, setCurrentTool] = useState<Tool | null>(null);
  const [toolbarOrder, setToolbarOrder] = useState<string[]>([]);
  const [hiddenTools, setHiddenTools] = useState<string[]>([]);
  const [hiddenCategories, setHiddenCategories] = useState<string[]>([]);
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const { token } = theme.useToken();
  
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    
    html.style.backgroundColor = token.colorBgLayout;
    body.style.backgroundColor = token.colorBgLayout;
    html.style.minHeight = '100vh';
    body.style.minHeight = '100vh';
    body.style.margin = '0';
    body.style.padding = '0';
    body.style.color = token.colorText;
    
    const root = document.getElementById('root');
    if (root) {
      root.style.minHeight = '100vh';
      root.style.height = '100vh';
      root.style.backgroundColor = token.colorBgLayout;
    }
  }, [token.colorBgLayout, token.colorText]);
  
  useEffect(() => {
    const tool = toolRegistry.getTool(selectedKey);
    setCurrentTool(tool || null);
  }, [selectedKey]);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        // 检查是否在 Electron 环境中
        if ((window as any).electronAPI) {
          const config = await (window.electronAPI as any).getAppConfig();
          if (config) {
            setToolbarOrder(config.toolbarOrder || []);
            setHiddenTools(config.hiddenTools || []);
            setHiddenCategories(config.hiddenCategories || []);
            setCategoryOrder(config.categoryOrder || []);
          }
        }
      } catch (error) {
        console.error('加载工具栏配置失败:', error);
      }
    };
    loadConfig();

    // 监听配置更改事件（使用 IPC 方式）
    const cleanupFns: (() => void)[] = [];
    
    if ((window as any).electronAPI?.onConfigChanged) {
      const cleanup = (window.electronAPI as any).onConfigChanged(() => {
        loadConfig();
      });
      cleanupFns.push(cleanup);
    }

    // 监听导航事件（从主菜单点击设置）
    if ((window as any).electronAPI?.onNavigateTo) {
      const cleanup = (window.electronAPI as any).onNavigateTo((toolId: string) => {
        setSelectedKey(toolId);
      });
      cleanupFns.push(cleanup);
    }

    // 监听全局快捷键触发事件
    if ((window as any).electronAPI?.onShortcutTriggered) {
      const cleanup = (window.electronAPI as any).onShortcutTriggered((toolId: string) => {
        console.log('[MainLayout] 收到快捷键触发:', toolId);
        setSelectedKey(toolId);
      });
      cleanupFns.push(cleanup);
    }

    return () => {
      cleanupFns.forEach(fn => fn());
    };
  }, []);

  const categories = toolRegistry.getCategories();

  // 按分类顺序排序，跳过隐藏的分类
  const sortedCategories = [...categories].sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a.id);
    const bIndex = categoryOrder.indexOf(b.id);
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  const menuItems: any[] = [];
  
  sortedCategories.forEach((category: ToolCategory) => {
    // 跳过 settings 分类（设置入口在顶部菜单栏）
    if (category.id === 'settings') return;
    // 跳过隐藏的分类
    if (hiddenCategories.includes(category.id)) return;
    
    let tools = toolRegistry.getToolsByCategory(category.id);
    
    // 过滤掉 settings 工具和隐藏的工具
    tools = tools.filter(tool => tool.id !== 'settings' && !hiddenTools.includes(tool.id));
    
    tools.sort((a, b) => {
      const aIndex = toolbarOrder.indexOf(a.id);
      const bIndex = toolbarOrder.indexOf(b.id);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    if (tools.length === 1) {
      const tool = tools[0];
      menuItems.push({
        key: tool.id,
        icon: tool.icon,
        label: tool.name,
      });
    } else if (tools.length > 1) {
      const toolItems = tools.map(tool => ({
        key: tool.id,
        icon: tool.icon,
        label: tool.name,
      }));

      menuItems.push({
        key: `category-${category.id}`,
        label: category.name,
        icon: category.icon,
        children: toolItems,
      });
    }
  });

  const handleMenuClick = ({ key }: { key: string }) => {
    if (!key.startsWith('category-')) {
      setSelectedKey(key);
    }
  };

  return (
    <Layout style={{ minHeight: '100vh', height: '100vh', background: token.colorBgLayout }}>
      <Sider 
        trigger={null} 
        collapsible 
        collapsed={collapsed}
        style={{
          background: token.colorBgContainer,
          boxShadow: '2px 0 8px rgba(0, 0, 0, 0.1)',
          borderRight: `1px solid ${token.colorBorder}`,
          color: token.colorText,
        }}
      >
        <div 
          style={{ 
            height: 64, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: collapsed ? 16 : 20,
            borderBottom: `1px solid ${token.colorBorder}`,
            padding: '0 12px',
            gap: 8,
            background: token.colorBgContainer,
          }}
        >
          <ToolOutlined style={{ fontSize: collapsed ? 18 : 24, color: token.colorPrimary }} />
          {!collapsed && <Title level={4} style={{ margin: 0, color: token.colorPrimary }}>工具箱</Title>}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{
            borderRight: 'none',
            marginTop: 8,
            background: token.colorBgContainer,
            color: token.colorText,
          }}
          selectable
        />
      </Sider>
      <Layout style={{ background: token.colorBgLayout, minHeight: '100vh', height: '100vh' }}>
        <Header style={{ 
          padding: '0 24px', 
          background: token.colorBgContainer,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${token.colorBorder}`,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ 
                fontSize: '16px', 
                width: 48, 
                height: 48,
                borderRadius: 8,
              }}
            />
            <Title level={4} style={{ margin: 0, color: token.colorTextHeading }}>
              {currentTool?.name || '开发工具箱'}
            </Title>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ 
              color: token.colorTextSecondary, 
              fontSize: 13,
            }}>
              {currentTool?.description || '选择一个工具开始使用'}
            </span>
            <Button
              type="default"
              icon={appTheme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggleTheme}
              style={{ 
                fontSize: '14px', 
                width: 40, 
                height: 40,
                borderRadius: 8,
                padding: 0,
              }}
            />
          </div>
        </Header>
        <Content
          style={{
            margin: '24px',
            padding: 24,
            minHeight: 'calc(100vh - 140px)',
            background: token.colorBgContainer,
            borderRadius: token.borderRadiusLG,
            border: `1px solid ${token.colorBorder}`,
            overflow: 'auto',
          }}
        >
          {currentTool?.component ? (
            currentTool.id === 'welcome' ? (
              <currentTool.component onNavigate={setSelectedKey} />
            ) : (
              <currentTool.component />
            )
          ) : (
            children
          )}
        </Content>
      </Layout>
    </Layout>
  );
};

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>('welcome');
  const { theme: appTheme, toggleTheme } = useTheme();

  return (
    <ConfigProvider
      key={appTheme} // 添加 key 以确保主题切换时完全重新渲染
      theme={{
        algorithm: appTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1890ff',
          borderRadiusLG: 12,
          borderRadius: 8,
        },
      }}
    >
      <MainLayoutContent 
        children={children}
        selectedKey={selectedKey}
        setSelectedKey={setSelectedKey}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        appTheme={appTheme}
        toggleTheme={toggleTheme}
      />
    </ConfigProvider>
  );
};
