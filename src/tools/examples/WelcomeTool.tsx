import React, { useState, useEffect } from 'react';
import { Card, Typography, Row, Col, Divider, Empty } from 'antd';
import { 
  ToolOutlined, 
  CodeOutlined, 
  ClockCircleOutlined, 
  SearchOutlined,
  ApiOutlined,
  WifiOutlined,
  FolderOpenOutlined,
  AppstoreOutlined,
  KeyOutlined,
  ArrowRightOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { toolRegistry } from '../registry';
import { Tool } from '../../types';

const { Title, Paragraph } = Typography;

interface ToolCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
}

interface FavoriteTool {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
}

export const WelcomeTool: React.FC<{ onNavigate: (toolId: string) => void }> = ({ onNavigate }) => {
  const [favoriteTools, setFavoriteTools] = useState<FavoriteTool[]>([]);

  useEffect(() => {
    const loadFavorites = async () => {
      try {
        if ((window as any).electronAPI) {
          const config = await (window.electronAPI as any).getAppConfig();
          if (config && config.favoriteTools && Array.isArray(config.favoriteTools)) {
            const favorites: FavoriteTool[] = [];
            const gradients = [
              'linear-gradient(135deg, #ff9800 0%, #ff5722 100%)',
              'linear-gradient(135deg, #4caf50 0%, #8bc34a 100%)',
              'linear-gradient(135deg, #2196f3 0%, #64b5f6 100%)',
              'linear-gradient(135deg, #9c27b0 0%, #ce93d8 100%)',
              'linear-gradient(135deg, #e91e63 0%, #f48fb1 100%)',
              'linear-gradient(135deg, #00bcd4 0%, #84ffff 100%)',
              'linear-gradient(135deg, #ffeb3b 0%, #fff176 100%)',
              'linear-gradient(135deg, #ff5722 0%, #ff9800 100%)',
            ];
            
            config.favoriteTools.forEach((toolId: string, index: number) => {
              const tool: Tool | undefined = toolRegistry.getTool(toolId);
              if (tool) {
                favorites.push({
                  id: tool.id,
                  name: tool.name,
                  description: tool.description,
                  icon: tool.icon,
                  gradient: gradients[index % gradients.length]
                });
              }
            });
            
            setFavoriteTools(favorites);
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

  const categories: ToolCategory[] = [
    {
      id: 'code-formatter',
      name: '文本处理',
      description: '代码格式化、Markdown预览、正则表达式测试',
      icon: <CodeOutlined style={{ fontSize: 28, color: '#fff' }} />,
      gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    },
    {
      id: 'encoder',
      name: '编码转换',
      description: 'Base64、URL、Hex、Unicode编解码',
      icon: <ApiOutlined style={{ fontSize: 28, color: '#fff' }} />,
      gradient: 'linear-gradient(135deg, #52c41a 0%, #73d13d 100%)'
    },
    {
      id: 'datetime',
      name: '时间日期',
      description: '时间戳转换、日期计算',
      icon: <ClockCircleOutlined style={{ fontSize: 28, color: '#fff' }} />,
      gradient: 'linear-gradient(135deg, #fa8c16 0%, #ffa940 100%)'
    },
    {
      id: 'file-search',
      name: '文件搜索',
      description: '本地文件快速搜索',
      icon: <SearchOutlined style={{ fontSize: 28, color: '#fff' }} />,
      gradient: 'linear-gradient(135deg, #f5222d 0%, #ff4d4f 100%)'
    },
    {
      id: 'file-launcher',
      name: '快捷工具',
      description: '文件快速启动、网页快速打开',
      icon: <FolderOpenOutlined style={{ fontSize: 28, color: '#fff' }} />,
      gradient: 'linear-gradient(135deg, #722ed1 0%, #9254de 100%)'
    },
    {
      id: 'network',
      name: '网络工具',
      description: '网络信息查看、IP子网计算、IP查找',
      icon: <WifiOutlined style={{ fontSize: 28, color: '#fff' }} />,
      gradient: 'linear-gradient(135deg, #13c2c2 0%, #36cfc9 100%)'
    },
    {
      id: 'process-tool',
      name: '系统工具',
      description: '进程查看、系统设置',
      icon: <AppstoreOutlined style={{ fontSize: 28, color: '#fff' }} />,
      gradient: 'linear-gradient(135deg, #1890ff 0%, #40a9ff 100%)'
    },
    {
      id: 'password-tool',
      name: '密码管理',
      description: '密码生成、安全存储',
      icon: <KeyOutlined style={{ fontSize: 28, color: '#fff' }} />,
      gradient: 'linear-gradient(135deg, #eb2f96 0%, #ff72c0 100%)'
    },
    {
      id: 'settings',
      name: '系统设置',
      description: '应用程序配置、主题设置',
      icon: <SettingOutlined style={{ fontSize: 28, color: '#fff' }} />,
      gradient: 'linear-gradient(135deg, #536dfe 0%, #7c4dff 100%)'
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Card 
        style={{ 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          border: 'none',
          borderRadius: 20,
          color: '#fff',
          boxShadow: '0 12px 40px rgba(102, 126, 234, 0.45)',
          overflow: 'hidden'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '8px 0' }}>
          <div style={{ 
            width: 90, 
            height: 90, 
            background: 'rgba(255, 255, 255, 0.18)',
            borderRadius: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            <ToolOutlined style={{ fontSize: 44 }} />
          </div>
          <div>
            <Title level={2} style={{ margin: 0, color: '#fff', fontSize: 28, fontWeight: 600 }}>
              欢迎使用工具箱
            </Title>
            <Paragraph style={{ color: 'rgba(255, 255, 255, 0.88)', marginTop: 10, marginBottom: 0, fontSize: 15 }}>
              一个纯离线的通用工具集合，无需网络即可使用
            </Paragraph>
          </div>
        </div>
      </Card>

      <div>
        <Title level={3} style={{ margin: 0, marginBottom: 16, fontSize: 20, fontWeight: 600 }}>我的收藏</Title>
        {favoriteTools.length > 0 ? (
          <Row gutter={[12, 12]}>
            {favoriteTools.map((tool) => (
              <Col xs={24} sm={8} key={tool.id}>
                <Card 
                  hoverable
                  style={{ 
                    borderRadius: 14, 
                    border: '1px solid #e8e8e8',
                    cursor: 'pointer',
                    transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                    height: '100%'
                  }}
                  styles={{ body: { padding: 18 } }}
                  onClick={() => onNavigate(tool.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ 
                      width: 44, 
                      height: 44, 
                      background: tool.gradient,
                      borderRadius: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)'
                    }}>
                      {tool.icon}
                    </div>
                    <div>
                      <Title level={5} style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{tool.name}</Title>
                      <Paragraph style={{ marginTop: 2, marginRight: 0, marginBottom: 0, marginLeft: 0, color: '#888', fontSize: 12 }}>
                        {tool.description}
                      </Paragraph>
                    </div>
                  </div>
                  <style>{`
                    .ant-card-hoverable:hover {
                      border-color: #667eea !important;
                      box-shadow: 0 6px 24px rgba(102, 126, 234, 0.18) !important;
                      transform: translateY(-3px);
                    }
                  `}</style>
                </Card>
              </Col>
            ))}
          </Row>
        ) : (
          <Card 
            style={{ 
              borderRadius: 14, 
              border: '1px dashed #d9d9d9',
              background: '#fafafa',
              textAlign: 'center',
              padding: '32px'
            }}
          >
            <Empty 
              description={
                <div>
                  <p style={{ marginBottom: 8 }}>暂无收藏的工具</p>
                  <p style={{ fontSize: 13, color: '#999' }}>在设置中添加收藏工具，将显示在这里</p>
                </div>
              }
            />
          </Card>
        )}
      </div>

      <Title level={3} style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>工具分类</Title>
      <Row gutter={[16, 16]}>
        {categories.map((category) => (
          <Col xs={24} sm={12} lg={8} key={category.id}>
            <Card 
              hoverable
              style={{ 
                borderRadius: 16, 
                border: '1px solid #f0f0f0',
                cursor: 'pointer',
                transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                height: '100%'
              }}
              styles={{ body: { padding: 24 } }}
              onClick={() => onNavigate(category.id)}
            >
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 16
              }}>
                <div style={{ 
                  width: 56, 
                  height: 56, 
                  background: category.gradient,
                  borderRadius: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)'
                }}>
                  {category.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Title level={4} style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{category.name}</Title>
                    <ArrowRightOutlined 
                      style={{ 
                        fontSize: 16, 
                        color: '#999',
                        opacity: 0,
                        transition: 'opacity 0.3s ease'
                      }} 
                    />
                  </div>
                  <Paragraph style={{ marginTop: 4, marginRight: 0, marginBottom: 0, marginLeft: 0, color: '#666', fontSize: 13 }}>
                    {category.description}
                  </Paragraph>
                </div>
              </div>
              <style>{`
                .ant-card-hoverable:hover {
                  border-color: #667eea !important;
                  box-shadow: 0 8px 28px rgba(102, 126, 234, 0.22) !important;
                  transform: translateY(-4px);
                }
                .ant-card-hoverable:hover .anticon-arrow-right {
                  opacity: 1 !important;
                }
                .ant-card-hoverable:hover > div > div:first-child {
                  transform: translateX(4px);
                }
                .ant-card-hoverable:hover > div > div:first-child > div:first-child {
                  transform: scale(1.08);
                  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.35);
                }
              `}</style>
            </Card>
          </Col>
        ))}
      </Row>

      <Divider style={{ margin: '8px 0 24px', borderColor: '#f0f0f0' }} />

      <Card style={{ borderRadius: 16, border: '1px solid #f0f0f0', background: '#fafafa' }}>
        <Title level={3} style={{ marginBottom: 20, fontSize: 18, fontWeight: 600 }}>使用说明</Title>
        <Row gutter={[24, 24]}>
          <Col xs={24} md={12}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ 
                width: 40, 
                height: 40, 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
              }}>
                <span style={{ fontSize: 18, fontWeight: 'bold', color: '#fff' }}>1</span>
              </div>
              <div>
                <Title level={5} style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>选择工具</Title>
                <Paragraph style={{ marginTop: 6, marginRight: 0, marginBottom: 0, marginLeft: 0, color: '#666', fontSize: 13 }}>
                  从左侧导航栏选择需要使用的工具，或点击上方卡片快速跳转
                </Paragraph>
              </div>
            </div>
          </Col>
          <Col xs={24} md={12}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ 
                width: 40, 
                height: 40, 
                background: 'linear-gradient(135deg, #52c41a 0%, #73d13d 100%)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(82, 196, 26, 0.3)'
              }}>
                <span style={{ fontSize: 18, fontWeight: 'bold', color: '#fff' }}>2</span>
              </div>
              <div>
                <Title level={5} style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>收藏工具</Title>
                <Paragraph style={{ marginTop: 6, marginRight: 0, marginBottom: 0, marginLeft: 0, color: '#666', fontSize: 13 }}>
                  在设置页面的工具栏自定义中收藏常用工具，方便快速访问
                </Paragraph>
              </div>
            </div>
          </Col>
        </Row>
      </Card>
    </div>
  );
};