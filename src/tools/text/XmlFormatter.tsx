import React, { useState, useEffect, useRef } from 'react';
import { Card, Input, Button, Space, message, theme, ConfigProvider } from 'antd';
import { CopyOutlined, FormatPainterOutlined, CheckOutlined } from '@ant-design/icons';
import hljs from 'highlight.js';
import xml from 'highlight.js/lib/languages/xml';

hljs.registerLanguage('xml', xml);

const { TextArea } = Input;

export const XmlFormatter: React.FC = () => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [leftWidth, setLeftWidth] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const { token } = theme.useToken();
  const codeRef = useRef<HTMLPreElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (codeRef.current && output) {
      hljs.highlightElement(codeRef.current);
    }
  }, [output]);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .language-xml .hljs {
        background: ${token.colorBgContainer} !important;
        color: ${token.colorText} !important;
        padding: 0 !important;
      }
      .language-xml .hljs-tag {
        color: ${token.colorPrimary} !important;
      }
      .language-xml .hljs-name {
        color: ${token.colorInfo} !important;
      }
      .language-xml .hljs-attr {
        color: ${token.colorSuccess} !important;
      }
      .language-xml .hljs-string {
        color: ${token.colorWarning} !important;
      }
      .language-xml .hljs-comment {
        color: ${token.colorTextTertiary} !important;
      }
      .language-xml .hljs-cdata {
        color: ${token.colorTextSecondary} !important;
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

  const formatXml = () => {
    try {
      const xmlInput = input.trim();
      if (!xmlInput) {
        message.warning('请输入 XML 内容');
        return;
      }

      let formatted = '';
      let indent = 0;
      const tab = '  ';

      const tokens = xmlInput.split(/(<[^>]+>)/g);

      for (const token of tokens) {
        if (token.trim() === '') continue;

        if (token.startsWith('</')) {
          indent = Math.max(0, indent - 1);
          formatted += tab.repeat(indent) + token + '\n';
        } else if (token.startsWith('<') && !token.endsWith('/>')) {
          formatted += tab.repeat(indent) + token + '\n';
          indent++;
        } else {
          if (token.startsWith('<')) {
            formatted += tab.repeat(indent) + token + '\n';
          } else {
            if (token.trim() !== '') {
              formatted += tab.repeat(indent) + token.trim() + '\n';
            }
          }
        }
      }

      setOutput(formatted.trim());
      message.success('XML 格式化成功');
    } catch (e) {
      message.error('XML 格式错误');
    }
  };

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
        title="XML 格式化" 
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
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div style={{ display: 'flex', gap: 12 }}>
            <Button 
              type="primary" 
              icon={<FormatPainterOutlined />} 
              onClick={formatXml}
              size="large"
              style={{ flex: 1 }}
            >
              格式化 XML
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
                  placeholder='<root><item>Hello World</item></root>'
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
                    <code ref={codeRef} className="language-xml" style={{ 
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
      </Card>
    </ConfigProvider>
  );
};
