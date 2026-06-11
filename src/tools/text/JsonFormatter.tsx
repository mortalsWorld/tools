import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Input, Button, Space, message, Tabs, theme, ConfigProvider } from 'antd';
import { CopyOutlined, CompressOutlined, ExpandOutlined, CheckOutlined } from '@ant-design/icons';
import hljs from 'highlight.js';
import json from 'highlight.js/lib/languages/json';

hljs.registerLanguage('json', json);

const { TextArea } = Input;

export const JsonFormatter: React.FC = () => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [leftWidth, setLeftWidth] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const { token } = theme.useToken();
  const codeRef = useRef<HTMLPreElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (codeRef.current && output) {
      hljs.highlightElement(codeRef.current);
    }
  }, [output]);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .language-json .hljs {
        background: ${token.colorBgContainer} !important;
        color: ${token.colorText} !important;
        padding: 0 !important;
      }
      .language-json .hljs-string {
        color: ${token.colorSuccess} !important;
      }
      .language-json .hljs-number {
        color: ${token.colorWarning} !important;
      }
      .language-json .hljs-boolean {
        color: ${token.colorError} !important;
      }
      .language-json .hljs-keyword {
        color: ${token.colorPrimary} !important;
      }
      .language-json .hljs-null {
        color: ${token.colorTextTertiary} !important;
      }
      .language-json .hljs-attr {
        color: ${token.colorInfo} !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, [token]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.min(Math.max(newWidth, 20), 80));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const formatJson = useCallback(() => {
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed, null, 2));
      message.success('JSON 格式化成功');
    } catch (e) {
      message.error('JSON 格式错误');
    }
  }, [input]);

  const compressJson = useCallback(() => {
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed));
      message.success('JSON 压缩成功');
    } catch (e) {
      message.error('JSON 格式错误');
    }
  }, [input]);

  const copyOutput = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    message.success('已复制到剪贴板');
    setTimeout(() => setCopied(false), 2000);
  };

  const clearAll = () => {
    setInput('');
    setOutput('');
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  return (
    <ConfigProvider
      theme={{
        token: {
          borderRadius: 8,
        },
      }}
    >
      <Card 
        title="JSON 格式化/压缩" 
        style={{ borderRadius: 12, height: '100%', minHeight: '500px' }}
        extra={
          <Button 
            type="text" 
            onClick={clearAll}
            style={{ color: token.colorTextSecondary }}
          >
            清空
          </Button>
        }
      >
        <Tabs defaultActiveKey="format">
          <Tabs.TabPane tab="格式化/压缩" key="format">
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <div style={{ display: 'flex', gap: 12 }}>
                <Button 
                  type="primary" 
                  icon={<ExpandOutlined />} 
                  onClick={formatJson}
                  size="large"
                  style={{ flex: 1 }}
                >
                  格式化 JSON
                </Button>
                <Button 
                  icon={<CompressOutlined />} 
                  onClick={compressJson}
                  size="large"
                  style={{ flex: 1 }}
                >
                  压缩 JSON
                </Button>
                {output && (
                  <Button 
                    icon={copied ? <CheckOutlined /> : <CopyOutlined />} 
                    onClick={copyOutput}
                    type={copied ? 'primary' : 'default'}
                    size="large"
                  >
                    {copied ? '已复制' : '复制结果'}
                  </Button>
                )}
              </div>
              
              <div 
                ref={containerRef}
                style={{ 
                  display: 'flex', 
                  height: '350px',
                  gap: 0,
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: `1px solid ${token.colorBorder}`
                }}
              >
                <div 
                  style={{ 
                    width: `${leftWidth}%`,
                    display: 'flex',
                    flexDirection: 'column',
                    borderRight: `1px solid ${token.colorBorder}`
                  }}
                >
                  <div style={{ 
                    padding: '12px 16px',
                    background: token.colorBgLayout,
                    borderBottom: `1px solid ${token.colorBorder}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    <span style={{ 
                      padding: '4px 10px', 
                      background: token.colorInfoBg, 
                      borderRadius: 4, 
                      fontSize: 12, 
                      color: token.colorInfo 
                    }}>
                      输入
                    </span>
                    <span style={{ color: token.colorTextSecondary, fontSize: 12 }}>
                      {input.length} 字符
                    </span>
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <TextArea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder='{"name": "John", "age": 30}'
                      autoSize={{ minRows: 20, maxRows: 20 }}
                      style={{ 
                        height: '100%',
                        borderRadius: 0,
                        border: 'none',
                        fontFamily: "'Monaco', 'Menlo', monospace",
                        fontSize: 13,
                        background: token.colorBgContainer
                      }}
                    />
                  </div>
                </div>

                <div 
                  ref={dividerRef}
                  style={{ 
                    width: '8px',
                    cursor: 'col-resize',
                    background: token.colorBgLayout,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 0.2s'
                  }}
                  onMouseDown={handleMouseDown}
                >
                  <div style={{ 
                    width: '20px', 
                    height: '32px',
                    background: token.colorBorder,
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2
                  }}>
                    <div style={{ width: '4px', height: '4px', background: token.colorTextSecondary, borderRadius: '50%' }} />
                    <div style={{ width: '4px', height: '4px', background: token.colorTextSecondary, borderRadius: '50%' }} />
                    <div style={{ width: '4px', height: '4px', background: token.colorTextSecondary, borderRadius: '50%' }} />
                  </div>
                </div>

                <div 
                  style={{ 
                    width: `${100 - leftWidth}%`,
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  <div style={{ 
                    padding: '12px 16px',
                    background: token.colorBgLayout,
                    borderBottom: `1px solid ${token.colorBorder}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ 
                        padding: '4px 10px', 
                        background: token.colorSuccessBg, 
                        borderRadius: 4, 
                        fontSize: 12, 
                        color: token.colorSuccess 
                      }}>
                        输出
                      </span>
                      <span style={{ color: token.colorTextSecondary, fontSize: 12 }}>
                        {output.length} 字符
                      </span>
                    </div>
                  </div>
                  <div style={{ 
                    flex: 1, 
                    overflow: 'auto',
                    padding: '16px',
                    background: token.colorBgContainer
                  }}>
                    {output ? (
                      <pre style={{ margin: 0 }}>
                        <code ref={codeRef} className="language-json" style={{ 
                          fontSize: 13,
                          lineHeight: 1.6,
                          fontFamily: "'Monaco', 'Menlo', monospace",
                          color: token.colorText
                        }}>
                          {output}
                        </code>
                      </pre>
                    ) : (
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        height: '100%',
                        color: token.colorTextTertiary,
                        fontSize: 14
                      }}>
                        格式化后的结果将显示在这里
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Space>
          </Tabs.TabPane>
          <Tabs.TabPane tab="示例" key="example">
            <div style={{ padding: 16, background: token.colorBgContainer, borderRadius: 8, border: `1px solid ${token.colorBorder}` }}>
              <p style={{ color: token.colorTextSecondary, marginBottom: 12 }}>示例 JSON：</p>
              <div style={{ 
                background: token.colorBgLayout, 
                borderRadius: 8,
                padding: 12,
                overflowX: 'auto',
                marginBottom: 12
              }}>
                <pre style={{ 
                  margin: 0,
                  fontFamily: "'Monaco', 'Menlo', monospace",
                  fontSize: 13,
                  color: token.colorText
                }}>
{`{
  "name": "开发工具箱",
  "version": "1.0.0",
  "description": "一个纯离线的开发工具集合",
  "tools": ["JSON格式化", "Base64编解码", "时间戳转换"],
  "settings": {
    "theme": "light",
    "autoSave": true
  }
}`}
                </pre>
              </div>
              <Button 
                type="primary" 
                onClick={() => {
                  setInput(`{
  "name": "开发工具箱",
  "version": "1.0.0",
  "description": "一个纯离线的开发工具集合",
  "tools": ["JSON格式化", "Base64编解码", "时间戳转换"],
  "settings": {
    "theme": "light",
    "autoSave": true
  }
}`);
                }}
              >
                使用示例
              </Button>
            </div>
          </Tabs.TabPane>
        </Tabs>
      </Card>
    </ConfigProvider>
  );
};
