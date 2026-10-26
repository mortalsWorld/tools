import React, { useState, useEffect, Suspense } from 'react';
import { Layout, Menu, Button, theme, ConfigProvider, Typography, Spin } from 'antd';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Wrench,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { toolRegistry } from '../tools/registry';
import { Tool, ToolCategory } from '../types';
import pkg from '../../package.json';

const APP_VERSION = pkg.version;

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

/** 现代极简设计 token（浅色） */
const lightToken = {
  colorPrimary: '#6366f1',
  colorInfo: '#6366f1',
  colorSuccess: '#10b981',
  colorWarning: '#f59e0b',
  colorError: '#ef4444',
  borderRadius: 8,
  borderRadiusLG: 12,
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
  fontSize: 14,
  colorBgLayout: '#fafafa',
  colorBgContainer: '#ffffff',
  colorBorder: '#e5e5e8',
  colorBorderSecondary: '#f0f0f2',
  colorText: '#18181b',
  colorTextSecondary: '#52525b',
  colorTextTertiary: '#a1a1aa',
  boxShadowTertiary: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
  boxShadowSecondary: '0 4px 12px -2px rgb(0 0 0 / 0.08)',
};

/** 现代极简设计 token（深色） */
const darkToken: typeof lightToken = {
  ...lightToken,
  colorBgLayout: '#0a0a0b',
  colorBgContainer: '#141416',
  colorBorder: '#26262a',
  colorBorderSecondary: '#1c1c1f',
  colorText: '#e4e4e7',
  colorTextSecondary: '#a1a1aa',
  colorTextTertiary: '#52525b',
  boxShadowTertiary: '0 1px 2px 0 rgb(0 0 0 / 0.3)',
  boxShadowSecondary: '0 4px 12px -2px rgb(0 0 0 / 0.5)',
};

/** antd 组件级覆盖：统一现代极简风格 */
const componentOverrides = {
  Menu: {
    itemBorderRadius: 8,
    itemMarginInline: 8,
    itemMarginBlock: 2,
    itemHeight: 36,
    subMenuItemBorderRadius: 8,
  },
  Card: {
    boxShadowTertiary: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
  },
  Table: {
    headerBorderRadius: 8,
    cellPaddingBlock: 10,
  },
  Button: {
    controlHeight: 34,
  },
  Input: {
    controlHeight: 34,
  },
};

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
  toggleTheme,
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

    const cleanupFns: (() => void)[] = [];

    if ((window as any).electronAPI?.onConfigChanged) {
      const cleanup = (window.electronAPI as any).onConfigChanged(() => {
        loadConfig();
      });
      cleanupFns.push(cleanup);
    }

    if ((window as any).electronAPI?.onNavigateTo) {
      const cleanup = (window.electronAPI as any).onNavigateTo((toolId: string) => {
        setSelectedKey(toolId);
      });
      cleanupFns.push(cleanup);
    }

    if ((window as any).electronAPI?.onShortcutTriggered) {
      const cleanup = (window.electronAPI as any).onShortcutTriggered((toolId: string) => {
        setSelectedKey(toolId);
      });
      cleanupFns.push(cleanup);
    }

    return () => {
      cleanupFns.forEach(fn => fn());
    };
  }, []);

  const categories = toolRegistry.getCategories();

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
    if (category.id === 'settings') return;
    if (hiddenCategories.includes(category.id)) return;

    let tools = toolRegistry.getToolsByCategory(category.id);
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

  const isDark = appTheme === 'dark';

  return (
    <Layout className="h-screen" style={{ background: token.colorBgLayout }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={200}
        collapsedWidth={64}
        style={{
          background: token.colorBgContainer,
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Logo 区 */}
        <div
          className="flex items-center justify-center gap-2 select-none"
          style={{
            height: 56,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <div
            className="flex items-center justify-center rounded-lg"
            style={{
              width: 30,
              height: 30,
              background: 'linear-gradient(135deg, #6366f1, #818cf8)',
              boxShadow: '0 2px 6px -1px rgb(99 102 241 / 0.4)',
            }}
          >
            <Wrench size={16} color="#fff" strokeWidth={2.2} />
          </div>
          {!collapsed && (
            <span
              className="font-semibold tracking-wide"
              style={{ fontSize: 15, color: token.colorText }}
            >
              工具箱
            </span>
          )}
        </div>

        {/* 菜单 */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={handleMenuClick}
            style={{
              borderRight: 'none',
              background: 'transparent',
              fontSize: 13,
            }}
            selectable
          />
        </div>

        {/* 底部版本号 */}
        {!collapsed && (
          <div
            className="text-center py-3 select-none"
            style={{
              fontSize: 11,
              color: token.colorTextTertiary,
              borderTop: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            v{APP_VERSION}
          </div>
        )}
      </Sider>

      <Layout style={{ background: token.colorBgLayout }}>
        {/* 顶部栏：半透明 + 毛玻璃 */}
        <Header
          className="flex items-center justify-between"
          style={{
            height: 56,
            lineHeight: 'normal',
            padding: '0 20px',
            background: isDark ? 'rgba(20,20,22,0.8)' : 'rgba(255,255,255,0.8)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <div className="flex items-center gap-3">
            <Button
              type="text"
              icon={
                collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />
              }
              onClick={() => setCollapsed(!collapsed)}
              className="flex items-center justify-center"
              style={{ width: 34, height: 34, borderRadius: 8 }}
            />
            <Title
              level={5}
              className="!m-0"
              style={{ fontWeight: 600, color: token.colorText, fontSize: 15 }}
            >
              {currentTool?.name || '开发工具箱'}
            </Title>
          </div>
          <div className="flex items-center gap-3">
            <span style={{ color: token.colorTextTertiary, fontSize: 12 }}>
              {currentTool?.description || '选择一个工具开始使用'}
            </span>
            <motion.div whileTap={{ scale: 0.9, rotate: 20 }}>
              <Button
                type="text"
                icon={isDark ? <Sun size={17} /> : <Moon size={17} />}
                onClick={toggleTheme}
                className="flex items-center justify-center"
                style={{ width: 34, height: 34, borderRadius: 8 }}
              />
            </motion.div>
          </div>
        </Header>

        {/* 内容区 */}
        <Content
          style={{
            margin: 16,
            padding: 24,
            minHeight: 'calc(100vh - 88px)',
            background: token.colorBgContainer,
            borderRadius: 12,
            border: `1px solid ${token.colorBorderSecondary}`,
            boxShadow: token.boxShadowTertiary,
            overflow: 'auto',
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedKey}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              style={{ height: '100%' }}
            >
              {currentTool?.component ? (
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center py-24">
                      <Spin size="large" />
                    </div>
                  }
                >
                  {currentTool.id === 'welcome' ? (
                    <currentTool.component onNavigate={setSelectedKey} />
                  ) : (
                    <currentTool.component />
                  )}
                </Suspense>
              ) : (
                children
              )}
            </motion.div>
          </AnimatePresence>
        </Content>
      </Layout>
    </Layout>
  );
};

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>('welcome');
  const { theme: appTheme, toggleTheme } = useTheme();

  const isDark = appTheme === 'dark';

  return (
    <ConfigProvider
      key={appTheme}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: isDark ? darkToken : lightToken,
        components: componentOverrides,
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
