import React, { useState, useEffect } from 'react';
import { theme, Empty } from 'antd';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Code2,
  Binary,
  Clock,
  Search,
  FolderOpen,
  Wifi,
  LayoutGrid,
  KeyRound,
  Settings,
  Star,
  BookOpen,
} from 'lucide-react';
import { toolRegistry } from '../registry';
import { Tool } from '../../types';

/** 分类入口定义（导航用） */
interface CategoryEntry {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
}

/** 根据当前小时返回问候语 */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

const CATEGORIES: CategoryEntry[] = [
  { id: 'code-formatter', name: '文本处理', description: '代码格式化、Markdown 预览、正则测试', icon: <Code2 size={20} /> },
  { id: 'encoder', name: '编码转换', description: 'Base64、URL、Hex、Unicode 编解码', icon: <Binary size={20} /> },
  { id: 'datetime', name: '时间日期', description: '时间戳转换、日期计算', icon: <Clock size={20} /> },
  { id: 'file-search', name: '文件搜索', description: '本地文件快速搜索与系统设置直达', icon: <Search size={20} /> },
  { id: 'file-launcher', name: '快捷工具', description: '文件快速启动、网页快速打开', icon: <FolderOpen size={20} /> },
  { id: 'network', name: '网络工具', description: '网络信息、IP 子网计算、IP 查找', icon: <Wifi size={20} /> },
  { id: 'process-tool', name: '系统工具', description: '进程查看、RAID 计算', icon: <LayoutGrid size={20} /> },
  { id: 'password-tool', name: '密码管理', description: '密码生成与安全存储', icon: <KeyRound size={20} /> },
  { id: 'settings', name: '应用设置', description: '主题、快捷键、工具栏自定义', icon: <Settings size={20} /> },
];

export const WelcomeTool: React.FC<{ onNavigate: (toolId: string) => void }> = ({ onNavigate }) => {
  const [favoriteTools, setFavoriteTools] = useState<Tool[]>([]);
  const { token } = theme.useToken();

  useEffect(() => {
    const loadFavorites = async () => {
      try {
        if ((window as any).electronAPI) {
          const config = await (window.electronAPI as any).getAppConfig();
          if (config?.favoriteTools && Array.isArray(config.favoriteTools)) {
            const tools: Tool[] = [];
            config.favoriteTools.forEach((toolId: string) => {
              const tool = toolRegistry.getTool(toolId);
              if (tool) tools.push(tool);
            });
            setFavoriteTools(tools);
          }
        }
      } catch (error) {
        console.error('加载收藏工具失败:', error);
      }
    };

    loadFavorites();

    const cleanupFns: (() => void)[] = [];
    if ((window as any).electronAPI?.onConfigChanged) {
      const cleanup = (window.electronAPI as any).onConfigChanged(() => {
        loadFavorites();
      });
      cleanupFns.push(cleanup);
    }
    return () => {
      cleanupFns.forEach(fn => fn());
    };
  }, []);

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      {/* Hero 区：简洁问候，去掉彩色大横幅 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="pt-2"
      >
        <h1
          className="!m-0 font-semibold"
          style={{ fontSize: 26, color: token.colorText, letterSpacing: '-0.01em' }}
        >
          {greeting()}，欢迎使用工具箱
        </h1>
        <p className="!mt-2 !mb-0" style={{ color: token.colorTextSecondary, fontSize: 14 }}>
          纯离线的通用工具集合，从下方选择一个工具开始
        </p>
      </motion.div>

      {/* 收藏工具区 */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Star size={15} style={{ color: token.colorTextTertiary }} />
          <h2 className="!m-0 font-medium" style={{ fontSize: 14, color: token.colorText }}>
            我的收藏
          </h2>
        </div>
        {favoriteTools.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {favoriteTools.map((tool, i) => (
              <motion.div
                key={tool.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.25 }}
                whileHover={{ y: -2 }}
                onClick={() => onNavigate(tool.id)}
                className="cursor-pointer rounded-xl p-4 flex items-center gap-3"
                style={{
                  background: token.colorBgElevated,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  boxShadow: token.boxShadowTertiary,
                }}
              >
                <div
                  className="flex items-center justify-center rounded-lg shrink-0"
                  style={{
                    width: 36,
                    height: 36,
                    background: 'rgb(99 102 241 / 0.1)',
                    color: '#6366f1',
                  }}
                >
                  {tool.icon}
                </div>
                <div className="min-w-0">
                  <div
                    className="font-medium truncate"
                    style={{ fontSize: 13, color: token.colorText }}
                  >
                    {tool.name}
                  </div>
                  <div
                    className="truncate"
                    style={{ fontSize: 12, color: token.colorTextTertiary }}
                  >
                    {tool.description}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div
            className="rounded-xl py-8 text-center"
            style={{ border: `1px dashed ${token.colorBorder}` }}
          >
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <span style={{ color: token.colorTextTertiary, fontSize: 13 }}>
                  暂无收藏，可在设置中添加
                </span>
              }
            />
          </div>
        )}
      </section>

      {/* 分类导航区 */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen size={15} style={{ color: token.colorTextTertiary }} />
          <h2 className="!m-0 font-medium" style={{ fontSize: 14, color: token.colorText }}>
            全部功能
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CATEGORIES.map((cat, i) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.03, duration: 0.25 }}
              whileHover={{ y: -2 }}
              onClick={() => onNavigate(cat.id)}
              className="cursor-pointer rounded-xl p-4 flex items-center gap-3 group"
              style={{
                background: token.colorBgElevated,
                border: `1px solid ${token.colorBorderSecondary}`,
                boxShadow: token.boxShadowTertiary,
              }}
            >
              <div
                className="flex items-center justify-center rounded-lg shrink-0"
                style={{
                  width: 38,
                  height: 38,
                  background: 'rgb(99 102 241 / 0.08)',
                  color: '#6366f1',
                }}
              >
                {cat.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium" style={{ fontSize: 13, color: token.colorText }}>
                  {cat.name}
                </div>
                <div
                  className="truncate"
                  style={{ fontSize: 12, color: token.colorTextTertiary }}
                >
                  {cat.description}
                </div>
              </div>
              <ArrowRight
                size={15}
                className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                style={{ color: token.colorTextTertiary }}
              />
            </motion.div>
          ))}
        </div>
      </section>

      {/* 使用说明：极简两列 */}
      <section
        className="rounded-xl p-5 mt-2"
        style={{
          background: token.colorBgElevated,
          border: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[
            { n: '1', t: '选择工具', d: '从左侧导航栏选择工具，或点击上方卡片快速跳转' },
            { n: '2', t: '收藏工具', d: '在设置的工具栏自定义中收藏常用工具，方便快速访问' },
          ].map(item => (
            <div key={item.n} className="flex items-start gap-3">
              <span
                className="flex items-center justify-center rounded-full font-semibold shrink-0"
                style={{
                  width: 22,
                  height: 22,
                  fontSize: 12,
                  background: 'rgb(99 102 241 / 0.1)',
                  color: '#6366f1',
                }}
              >
                {item.n}
              </span>
              <div>
                <div className="font-medium" style={{ fontSize: 13, color: token.colorText }}>
                  {item.t}
                </div>
                <div style={{ fontSize: 12, color: token.colorTextTertiary, marginTop: 2 }}>
                  {item.d}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
