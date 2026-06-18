import React, { useState, useEffect, useRef } from 'react';
import { Card, Input, Button, Space, message, Tabs, theme, ConfigProvider, Checkbox, Alert } from 'antd';
import { CopyOutlined, CompressOutlined, ExpandOutlined, CheckOutlined } from '@ant-design/icons';
import hljs from 'highlight.js';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';

hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);

const { TextArea } = Input;

interface ParseError {
  message: string;
  line: number;
  column: number;
}

export const CodeFormatter: React.FC = () => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [leftWidth, setLeftWidth] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState('json');
  const { token } = theme.useToken();
  const codeRef = useRef<HTMLPreElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // JSON格式化高级选项
  const [unicodeDecode, setUnicodeDecode] = useState(true);
  const [quoteToDouble, setQuoteToDouble] = useState(true);
  const [removeEscape, setRemoveEscape] = useState(false);
  
  // JSON解析错误信息
  const [parseError, setParseError] = useState<ParseError | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (codeRef.current && output) {
      hljs.highlightElement(codeRef.current);
    }
  }, [output, activeTab]);

  useEffect(() => {
    const language = activeTab;
    const style = document.createElement('style');
    style.textContent = `
      .language-${language} .hljs {
        background: ${token.colorBgContainer} !important;
        color: ${token.colorText} !important;
        padding: 0 !important;
      }
      .hljs-string { color: ${token.colorSuccess} !important; }
      .hljs-number { color: ${token.colorWarning} !important; }
      .hljs-boolean, .hljs-literal { color: ${token.colorError} !important; }
      .hljs-keyword { color: ${token.colorPrimary} !important; }
      .hljs-null { color: ${token.colorTextTertiary} !important; }
      .hljs-attr { color: ${token.colorInfo} !important; }
      .hljs-tag { color: ${token.colorPrimary} !important; }
      .hljs-name { color: ${token.colorInfo} !important; }
      .hljs-comment { color: ${token.colorTextTertiary} !important; }
      .hljs-cdata { color: ${token.colorTextSecondary} !important; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, [token, activeTab]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.min(Math.max(newWidth, 20), 80));
    };

    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // 根据字符偏移量计算行号和列号
  const getErrorPosition = (text: string, offset: number): { line: number; column: number } => {
    let line = 1;
    let column = 1;
    
    for (let i = 0; i < Math.min(offset, text.length); i++) {
      if (text[i] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
    
    return { line, column };
  };

  // 解析JSON并返回详细错误信息
  const parseJsonWithError = (jsonString: string): { success: boolean; data?: any; error?: ParseError } => {
    try {
      const parsed = JSON.parse(jsonString);
      return { success: true, data: parsed };
    } catch (e) {
      const error = e as SyntaxError;
      
      // 尝试从错误消息中提取位置信息
      const positionMatch = error.message.match(/at position (\d+)/);
      let offset = 0;
      
      if (positionMatch) {
        offset = parseInt(positionMatch[1], 10);
      } else {
        // 如果没有位置信息，默认从开头计算
        offset = 0;
      }
      
      const position = getErrorPosition(jsonString, offset);
      
      // 清理错误消息
      let cleanMessage = error.message;
      // 移除 "Unexpected token" 等前缀，提取关键信息
      const tokenMatch = error.message.match(/Unexpected token (.+) in JSON/);
      if (tokenMatch) {
        cleanMessage = `意外的符号: ${tokenMatch[1]}`;
      } else if (error.message.includes('Unexpected end of JSON')) {
        cleanMessage = 'JSON不完整，缺少闭合括号或引号';
      } else if (error.message.includes('Unexpected string')) {
        cleanMessage = '字符串格式错误，请检查引号是否正确闭合';
      } else if (error.message.includes('Unexpected number')) {
        cleanMessage = '数字格式错误';
      }
      
      return {
        success: false,
        error: {
          message: cleanMessage,
          line: position.line,
          column: position.column
        }
      };
    }
  };

  const formatJson = () => {
    try {
      let processedInput = input;
      
      // 1. 单引号转双引号（JSON标准要求双引号）
      if (quoteToDouble) {
        // 匹配单引号包围的键名和字符串值
        processedInput = processedInput
          // 键名单引号转双引号（不包括已经转义的）
          .replace(/'(?![^\\]*\\)'/g, '"')
          // 值单引号转双引号
          .replace(/"([^"]*)"'(?![^\\]*\\)'/g, '"$1"');
        
        // 重新处理，处理单引号开头的情况
        processedInput = processedInput.replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, content) => {
          // 移除转义的单引号
          const unescaped = content.replace(/\\'/g, "'");
          return `: "${unescaped}"`;
        });
      }
      
      // 2. 去掉转义（处理双重转义）
      if (removeEscape) {
        processedInput = processedInput
          .replace(/\\\\/g, '\\')
          .replace(/\\"/g, '"')
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\r/g, '\r');
      }
      
      // 3. Unicode解码（Python输出的\u4e2d\u6587格式）
      if (unicodeDecode) {
        processedInput = processedInput.replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) => {
          return String.fromCharCode(parseInt(hex, 16));
        });
        // 处理Python的大括号Unicode格式
        processedInput = processedInput.replace(/\\U([0-9a-fA-F]{8})/g, (_match, hex) => {
          return String.fromCodePoint(parseInt(hex, 16));
        });
      }
      
      // 使用新的错误解析函数
      const result = parseJsonWithError(processedInput);
      
      if (result.success) {
        setOutput(JSON.stringify(result.data, null, 2));
        setParseError(null);
        message.success('JSON 格式化成功');
      } else {
        setParseError(result.error || null);
        message.error('JSON 格式错误');
      }
    } catch (e) {
      setParseError({ message: '未知错误', line: 1, column: 1 });
      message.error('JSON 格式错误');
    }
  };

  const compressJson = () => {
    try {
      const result = parseJsonWithError(input);
      
      if (result.success) {
        setOutput(JSON.stringify(result.data));
        setParseError(null);
        message.success('JSON 压缩成功');
      } else {
        setParseError(result.error || null);
        message.error('JSON 格式错误');
      }
    } catch (e) {
      setParseError({ message: '未知错误', line: 1, column: 1 });
      message.error('JSON 格式错误');
    }
  };

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
          indent--;
          formatted += tab.repeat(indent) + token + '\n';
        } else if (token.startsWith('<') && !token.endsWith('/>')) {
          formatted += tab.repeat(indent) + token + '\n';
          indent++;
        } else if (token.trim() !== '') {
          formatted += tab.repeat(indent) + token.trim() + '\n';
        }
      }

      setOutput(formatted.trim());
      message.success('XML 格式化成功');
    } catch (e) {
      message.error('XML 格式错误');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    message.success('已复制到剪贴板');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    setInput('');
    setOutput('');
    setParseError(null);
  };

  const tabItems = [
    {
      key: 'json',
      label: 'JSON',
      children: (
        <div>
          {/* 高级选项 */}
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${token.colorBorder}`, background: token.colorBgLayout }}>
            <Space size="middle" wrap>
              <Checkbox checked={unicodeDecode} onChange={(e) => setUnicodeDecode(e.target.checked)}>
                Unicode解码（\u4e2d\u6587 → 中文）
              </Checkbox>
              <Checkbox checked={quoteToDouble} onChange={(e) => setQuoteToDouble(e.target.checked)}>
                单引号转双引号（Python dict → JSON）
              </Checkbox>
              <Checkbox checked={removeEscape} onChange={(e) => setRemoveEscape(e.target.checked)}>
                去掉转义（双重转义还原）
              </Checkbox>
            </Space>
          </div>

          {/* 错误提示面板 */}
          {parseError && (
            <Alert
              message="JSON解析错误"
              description={
                <div>
                  <p>{parseError.message}</p>
                  <p style={{ marginTop: 8, color: '#ff4d4f', fontWeight: 'bold' }}>
                    错误位置：第 <span style={{ fontSize: 16 }}>{parseError.line}</span> 行，第 <span style={{ fontSize: 16 }}>{parseError.column}</span> 列
                  </p>
                </div>
              }
              type="error"
              showIcon
              style={{ margin: '12px 16px' }}
            />
          )}
          
          <div ref={containerRef} style={{ display: 'flex', height: 'calc(100vh - 500px)', minHeight: '400px' }}>
            <div style={{ width: `${leftWidth}%`, padding: '0 16px', borderRight: `1px solid ${token.colorBorder}` }}>
              <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: token.colorTextHeading }}>输入</div>
              {/* 带行号的输入区域 */}
              <div style={{ 
                display: 'flex', 
                height: 'calc(100% - 40px)',
                border: `1px solid ${token.colorBorder}`,
                borderRadius: 8,
                overflow: 'hidden'
              }}>
                {/* 行号区域 */}
                <div 
                  ref={lineNumbersRef}
                  style={{ 
                    width: 50,
                    padding: '12px 4px',
                    background: token.colorBgLayout,
                    borderRight: `1px solid ${token.colorBorder}`,
                    fontFamily: 'Monaco, Consolas, monospace',
                    fontSize: 13,
                    color: token.colorTextSecondary,
                    textAlign: 'right',
                    overflowY: 'auto',
                    userSelect: 'none'
                  }}
                >
                  {input.split('\n').map((_, i) => (
                    <div key={i} style={{ lineHeight: '1.5' }}>
                      {parseError && parseError.line === i + 1 ? (
                        <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>{i + 1}</span>
                      ) : (
                        i + 1
                      )}
                    </div>
                  ))}
                </div>
                {/* 输入区域 */}
                <TextArea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="粘贴或输入 JSON 数据..."
                  style={{ 
                    flex: 1,
                    height: '100%',
                    fontFamily: 'Monaco, Consolas, monospace',
                    fontSize: 13,
                    borderRadius: 0,
                    border: 'none',
                    padding: '12px'
                  }}
                  onScroll={(e) => {
                    if (lineNumbersRef.current) {
                      lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
                    }
                  }}
                />
              </div>
            </div>
            <div
              style={{
                width: 8,
                cursor: 'col-resize',
                background: 'transparent',
                transition: 'background 0.2s'
              }}
              onMouseDown={() => setIsDragging(true)}
              onMouseEnter={(e) => e.currentTarget.style.background = token.colorPrimaryBg}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            />
            <div style={{ width: `${100 - leftWidth}%`, padding: '16px' }}>
              <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: token.colorTextHeading }}>输出</div>
              <pre
                ref={codeRef}
                className={`language-json`}
                style={{
                  height: 'calc(100% - 40px)',
                  margin: 0,
                  padding: 16,
                  background: token.colorBgContainer,
                  border: `1px solid ${token.colorBorder}`,
                  borderRadius: 8,
                  overflow: 'auto',
                  fontFamily: 'Monaco, Consolas, monospace',
                  fontSize: 13,
                  lineHeight: 1.5
                }}
              >
                {output}
              </pre>
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'xml',
      label: 'XML',
      children: (
        <div ref={containerRef} style={{ display: 'flex', height: 'calc(100vh - 350px)', minHeight: '400px' }}>
          <div style={{ width: `${leftWidth}%`, padding: '16px', borderRight: `1px solid ${token.colorBorder}` }}>
            <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: token.colorTextHeading }}>输入</div>
            <TextArea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="粘贴或输入 XML 数据..."
              style={{ 
                height: 'calc(100% - 40px)',
                fontFamily: 'Monaco, Consolas, monospace',
                fontSize: 13,
                borderRadius: 8
              }}
            />
          </div>
          <div
            style={{
              width: 8,
              cursor: 'col-resize',
              background: 'transparent',
              transition: 'background 0.2s'
            }}
            onMouseDown={() => setIsDragging(true)}
            onMouseEnter={(e) => e.currentTarget.style.background = token.colorPrimaryBg}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          />
          <div style={{ width: `${100 - leftWidth}%`, padding: '16px' }}>
            <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: token.colorTextHeading }}>输出</div>
            <pre
              ref={codeRef}
              className={`language-xml`}
              style={{
                height: 'calc(100% - 40px)',
                margin: 0,
                padding: 16,
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorder}`,
                borderRadius: 8,
                overflow: 'auto',
                fontFamily: 'Monaco, Consolas, monospace',
                fontSize: 13,
                lineHeight: 1.5
              }}
            >
              {output}
            </pre>
          </div>
        </div>
      )
    }
  ];

  return (
    <ConfigProvider theme={{ token: { borderRadius: 8 } }}>
      <div style={{ padding: '16px' }}>
        <Card
          title="代码格式化"
          extra={
            <Space>
              <Button icon={<ExpandOutlined />} onClick={activeTab === 'json' ? formatJson : formatXml}>
                格式化
              </Button>
              {activeTab === 'json' && (
                <Button icon={<CompressOutlined />} onClick={compressJson}>
                  压缩
                </Button>
              )}
              <Button icon={<CopyOutlined />} onClick={handleCopy} disabled={!output}>
                {copied ? <CheckOutlined /> : '复制'}
              </Button>
              <Button onClick={handleClear}>清空</Button>
            </Space>
          }
          style={{ borderRadius: 12 }}
          styles={{ body: { padding: 0 } }}
        >
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={tabItems}
            style={{ padding: '0 16px' }}
          />
        </Card>
      </div>
    </ConfigProvider>
  );
};
