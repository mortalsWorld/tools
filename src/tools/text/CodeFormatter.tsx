import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, Input, Button, Space, message, theme, ConfigProvider, Checkbox, Tooltip, Alert, Segmented } from 'antd';
import { Copy, Minimize2, Maximize2, ArrowLeftRight, Eraser } from 'lucide-react';
import { motion } from 'framer-motion';
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
  const [swapPanels, setSwapPanels] = useState(false);

  const [unicodeDecode, setUnicodeDecode] = useState(true);
  const [quoteToDouble, setQuoteToDouble] = useState(true);
  const [removeEscape, setRemoveEscape] = useState(false);
  const [removeComments, setRemoveComments] = useState(true);

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

  const getErrorPosition = (text: string, offset: number): { line: number; column: number } => {
    let line = 1;
    let column = 1;
    for (let i = 0; i < Math.min(offset, text.length); i++) {
      if (text[i] === '\n') { line++; column = 1; }
      else { column++; }
    }
    return { line, column };
  };

  const parseJsonWithError = (jsonString: string): { success: boolean; data?: any; error?: ParseError } => {
    try {
      const parsed = JSON.parse(jsonString);
      return { success: true, data: parsed };
    } catch (e) {
      const error = e as SyntaxError;
      const positionMatch = error.message.match(/at position (\d+)/);
      let offset = positionMatch ? parseInt(positionMatch[1], 10) : 0;
      const position = getErrorPosition(jsonString, offset);
      let cleanMessage = error.message;
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
      return { success: false, error: { message: cleanMessage, line: position.line, column: position.column } };
    }
  };

  const removeJsonComments = (json: string): string => {
    const result: string[] = [];
    let i = 0;
    let inString = false;
    let escape = false;

    while (i < json.length) {
      const ch = json[i];

      if (inString) {
        result.push(ch);
        if (escape) {
          escape = false;
        } else if (ch === '\\') {
          escape = true;
        } else if (ch === '"') {
          inString = false;
        }
        i++;
        continue;
      }

      if (ch === '"') {
        inString = true;
        result.push(ch);
        i++;
        continue;
      }

      if (ch === '/' && i + 1 < json.length && json[i + 1] === '/') {
        i += 2;
        while (i < json.length && json[i] !== '\n') {
          i++;
        }
        continue;
      }

      if (ch === '#') {
        i++;
        while (i < json.length && json[i] !== '\n') {
          i++;
        }
        continue;
      }

      result.push(ch);
      i++;
    }

    return result.join('');
  };

  const formatJson = () => {
    try {
      let processedInput = input;
      if (removeComments) {
        processedInput = removeJsonComments(processedInput);
      }
      if (quoteToDouble) {
        processedInput = processedInput
          .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, content) => {
            const unescaped = content.replace(/\\'/g, "'");
            const escaped = unescaped.replace(/"/g, '\\"');
            return `"${escaped}"`;
          });
      }
      if (removeEscape) {
        processedInput = processedInput
          .replace(/\\\\/g, '\\')
          .replace(/\\"/g, '"')
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\r/g, '\r');
      }
      if (unicodeDecode) {
        processedInput = processedInput.replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) => {
          return String.fromCharCode(parseInt(hex, 16));
        });
        processedInput = processedInput.replace(/\\U([0-9a-fA-F]{8})/g, (_match, hex) => {
          return String.fromCodePoint(parseInt(hex, 16));
        });
      }
      const result = parseJsonWithError(processedInput);
      if (result.success) {
        setOutput(JSON.stringify(result.data, null, 2));
        setParseError(null);
        message.success('JSON 格式化成功');
      } else {
        setParseError(result.error || null);
        message.error('JSON 格式错误');
      }
    } catch {
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
    } catch {
      setParseError({ message: '未知错误', line: 1, column: 1 });
      message.error('JSON 格式错误');
    }
  };

  const formatXml = () => {
    try {
      const xmlInput = input.trim();
      if (!xmlInput) { message.warning('请输入 XML 内容'); return; }
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
      setParseError(null);
      message.success('XML 格式化成功');
    } catch {
      message.error('XML 格式错误');
    }
  };

  const handleCopy = () => {
    if (!output) return;
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

  const handleSwap = () => {
    if (!output) { message.warning('没有可交换的输出'); return; }
    setInput(output);
    setOutput('');
    setParseError(null);
    message.success('已将输出移入输入区');
  };

  const handleScrollSync = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const inputStats = useMemo(() => {
    const lines = input ? input.split('\n').length : 0;
    const chars = input ? input.length : 0;
    return { lines, chars };
  }, [input]);

  const outputStats = useMemo(() => {
    const lines = output ? output.split('\n').length : 0;
    const chars = output ? output.length : 0;
    return { lines, chars };
  }, [output]);

  const leftPanel = (isJson: boolean) => {
    const content = (
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${token.colorBorder}`,
        borderRadius: 8,
        overflow: 'hidden',
        background: token.colorBgContainer,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: token.colorBgLayout,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          fontSize: 12,
          color: token.colorTextSecondary,
        }}>
          <span style={{ fontWeight: 600, color: token.colorText }}>输入</span>
          <span>{inputStats.lines} 行 · {inputStats.chars} 字符</span>
        </div>
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div
            ref={lineNumbersRef}
            style={{
              width: 44,
              padding: '10px 6px',
              background: token.colorBgLayout,
              borderRight: `1px solid ${token.colorBorderSecondary}`,
              fontFamily: 'Monaco, Consolas, monospace',
              fontSize: 12,
              color: token.colorTextTertiary,
              textAlign: 'right',
              overflowY: 'hidden',
              userSelect: 'none',
              lineHeight: '20px',
            }}
          >
            {input.split('\n').map((_, i) => (
              <div key={i} style={{
                height: 20,
                lineHeight: '20px',
                color: parseError && parseError.line === i + 1 ? token.colorError : undefined,
                fontWeight: parseError && parseError.line === i + 1 ? 'bold' : undefined,
              }}>
                {i + 1}
              </div>
            ))}
          </div>
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onScroll={handleScrollSync}
            placeholder={isJson ? '粘贴或输入 JSON 数据...' : '粘贴或输入 XML 数据...'}
            autoSize={false}
            style={{
              flex: 1,
              height: '100%',
              fontFamily: 'Monaco, Consolas, monospace',
              fontSize: 13,
              lineHeight: '20px',
              borderRadius: 0,
              border: 'none',
              boxShadow: 'none',
              padding: '10px 12px',
              resize: 'none',
              background: 'transparent',
            }}
          />
        </div>
      </div>
    );
    return content;
  };

  const rightPanel = (isJson: boolean) => {
    const content = (
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${token.colorBorder}`,
        borderRadius: 8,
        overflow: 'hidden',
        background: token.colorBgContainer,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: token.colorBgLayout,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          fontSize: 12,
          color: token.colorTextSecondary,
        }}>
          <span style={{ fontWeight: 600, color: token.colorText }}>输出</span>
          <span>{outputStats.lines} 行 · {outputStats.chars} 字符</span>
        </div>
        <pre
          ref={codeRef}
          className={`language-${isJson ? 'json' : 'xml'}`}
          style={{
            flex: 1,
            margin: 0,
            padding: '10px 12px',
            background: 'transparent',
            overflow: 'auto',
            fontFamily: 'Monaco, Consolas, monospace',
            fontSize: 13,
            lineHeight: '20px',
            whiteSpace: 'pre',
          }}
        >
          {output}
        </pre>
      </div>
    );
    return content;
  };

  const editorArea = (isJson: boolean) => {
    const left = leftPanel(isJson);
    const right = rightPanel(isJson);
    const panels = swapPanels ? [right, left] : [left, right];
    return (
      <div ref={containerRef} style={{
        display: 'flex',
        flex: 1,
        minHeight: 420,
        padding: '0 16px 16px',
        gap: 0,
      }}>
        <div style={{ width: `${leftWidth}%`, minWidth: 200, display: 'flex' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {panels[0]}
          </div>
        </div>
        <div
          style={{
            width: 6,
            cursor: 'col-resize',
            background: isDragging ? token.colorPrimaryBg : 'transparent',
            borderRadius: 3,
            transition: 'background 0.15s',
            flexShrink: 0,
          }}
          onMouseDown={() => setIsDragging(true)}
          onMouseEnter={(e) => { if (!isDragging) e.currentTarget.style.background = token.colorPrimaryBorderHover; }}
          onMouseLeave={(e) => { if (!isDragging) e.currentTarget.style.background = 'transparent'; }}
        />
        <div style={{ width: `${100 - leftWidth}%`, minWidth: 200, display: 'flex', flex: 1 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {panels[1]}
          </div>
        </div>
      </div>
    );
  };

  const isJson = activeTab === 'json';

  return (
    <ConfigProvider theme={{ token: { borderRadius: 8 } }}>
      <div style={{ padding: '12px 16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Card
          styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' } }}
          style={{
            flex: 1,
            minHeight: 0,
          }}
          title={
            <span style={{ fontWeight: 600, fontSize: 15 }}>代码格式化</span>
          }
          extra={
            <Space size={4}>
              <Segmented
                size="small"
                value={activeTab}
                onChange={(v) => setActiveTab(v as string)}
                options={[
                  { label: 'JSON', value: 'json' },
                  { label: 'XML', value: 'xml' },
                ]}
              />
              <div style={{ width: 1, height: 20, background: token.colorBorder, margin: '0 4px' }} />
              <Tooltip title={swapPanels ? '左侧输入/右侧输出' : '左侧输出/右侧输入'}>
                <Button
                  size="small"
                  icon={<ArrowLeftRight size={14} />}
                  onClick={() => setSwapPanels(!swapPanels)}
                  type={swapPanels ? 'primary' : 'default'}
                >
                  {swapPanels ? '右左' : '左右'}
                </Button>
              </Tooltip>
              <div style={{ width: 1, height: 20, background: token.colorBorder, margin: '0 4px' }} />
              <motion.div whileTap={{ scale: 0.97 }} style={{ display: 'inline-flex' }}>
                <Button
                  size="small"
                  type="primary"
                  icon={<Maximize2 size={14} />}
                  onClick={isJson ? formatJson : formatXml}
                >
                  格式化
                </Button>
              </motion.div>
              {isJson && (
                <Button
                  size="small"
                  icon={<Minimize2 size={14} />}
                  onClick={compressJson}
                >
                  压缩
                </Button>
              )}
              <Button
                size="small"
                icon={<Copy size={14} />}
                onClick={handleCopy}
                disabled={!output}
              >
                {copied ? '已复制' : '复制'}
              </Button>
              <Button
                size="small"
                icon={<ArrowLeftRight size={14} />}
                onClick={handleSwap}
                disabled={!output}
              >
                交换
              </Button>
              <Button
                size="small"
                icon={<Eraser size={14} />}
                onClick={handleClear}
              >
                清空
              </Button>
            </Space>
          }
        >
          {isJson && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{
                padding: '10px 16px',
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorBgLayout,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: token.colorText }}>选项</span>
                  <Checkbox checked={unicodeDecode} onChange={(e) => setUnicodeDecode(e.target.checked)}>
                    Unicode解码
                  </Checkbox>
                  <Checkbox checked={quoteToDouble} onChange={(e) => setQuoteToDouble(e.target.checked)}>
                    单引号转双引号
                  </Checkbox>
                  <Checkbox checked={removeEscape} onChange={(e) => setRemoveEscape(e.target.checked)}>
                    去掉转义
                  </Checkbox>
                  <Checkbox checked={removeComments} onChange={(e) => setRemoveComments(e.target.checked)}>
                    移除注释(#/ //)
                  </Checkbox>
                </div>
              </div>

              {parseError && (
                <Alert
                  message={
                    <span style={{ fontWeight: 600, color: token.colorError }}>
                      JSON 解析错误
                    </span>
                  }
                  description={
                    <div style={{ fontSize: 13 }}>
                      <div>{parseError.message}</div>
                      <div style={{ marginTop: 4, color: token.colorError, fontSize: 12 }}>
                        位置：第 {parseError.line} 行，第 {parseError.column} 列
                      </div>
                    </div>
                  }
                  type="error"
                  showIcon
                  style={{ margin: '8px 16px 0' }}
                />
              )}

              {editorArea(true)}
            </div>
          )}
          {!isJson && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {editorArea(false)}
            </div>
          )}
        </Card>
      </div>
    </ConfigProvider>
  );
};
