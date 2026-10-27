import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Input, Button, message, theme, Checkbox, Tooltip, Segmented } from 'antd';
import { Copy, Minimize2, Maximize2, ArrowLeftRight, Eraser, Braces, Columns2, CircleAlert } from 'lucide-react';
import { motion } from 'framer-motion';
import hljs from 'highlight.js';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import { SplitPane } from '../common';

hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);

const { TextArea } = Input;

const MONO = "'JetBrains Mono', 'Cascadia Code', Monaco, Consolas, monospace";

interface ParseError {
  message: string;
  line: number;
  column: number;
}

export const CodeFormatter: React.FC = () => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('json');
  const { token } = theme.useToken();
  const codeRef = useRef<HTMLPreElement>(null);
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
        background: transparent !important;
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
      const offset = positionMatch ? parseInt(positionMatch[1], 10) : 0;
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

  const removeJsonComments = (jsonText: string): string => {
    const result: string[] = [];
    let i = 0;
    let inString = false;
    let escape = false;

    while (i < jsonText.length) {
      const ch = jsonText[i];

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

      if (ch === '/' && i + 1 < jsonText.length && jsonText[i + 1] === '/') {
        i += 2;
        while (i < jsonText.length && jsonText[i] !== '\n') {
          i++;
        }
        continue;
      }

      if (ch === '#') {
        i++;
        while (i < jsonText.length && jsonText[i] !== '\n') {
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
      for (const item of tokens) {
        if (item.trim() === '') continue;
        if (item.startsWith('</')) {
          indent--;
          formatted += tab.repeat(indent) + item + '\n';
        } else if (item.startsWith('<') && !item.endsWith('/>')) {
          formatted += tab.repeat(indent) + item + '\n';
          indent++;
        } else if (item.trim() !== '') {
          formatted += tab.repeat(indent) + item.trim() + '\n';
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

  const isJson = activeTab === 'json';

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (isJson) formatJson(); else formatXml();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, input, removeComments, quoteToDouble, removeEscape, unicodeDecode]);

  const surface: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    border: `1px solid ${token.colorBorderSecondary}`,
    borderRadius: 10,
    overflow: 'hidden',
    background: token.colorBgLayout,
  };

  const panelHeader: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    borderBottom: `1px solid ${token.colorBorderSecondary}`,
    flexShrink: 0,
  };

  const headerLabel: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: token.colorTextTertiary,
    letterSpacing: '0.02em',
  };

  const headerMeta: React.CSSProperties = {
    fontSize: 12,
    color: token.colorTextTertiary,
  };

  const inputPanel = (
    <div style={{ ...surface }}>
      <div style={panelHeader}>
        <span style={headerLabel}>输入</span>
        <span style={headerMeta}>{inputStats.lines} 行 · {inputStats.chars} 字符</span>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div
          ref={lineNumbersRef}
          style={{
            width: 44,
            padding: '10px 6px',
            background: token.colorFillQuaternary,
            borderRight: `1px solid ${token.colorBorderSecondary}`,
            fontFamily: MONO,
            fontSize: 12,
            color: token.colorTextTertiary,
            textAlign: 'right',
            overflowY: 'hidden',
            userSelect: 'none',
            lineHeight: '20px',
            flexShrink: 0,
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
            minHeight: 0,
            fontFamily: MONO,
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

  const outputPanel = (
    <div style={{ ...surface }}>
      <div style={panelHeader}>
        <span style={headerLabel}>输出</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={headerMeta}>{outputStats.lines} 行 · {outputStats.chars} 字符</span>
          {output && (
            <Button
              type="text"
              size="small"
              icon={<Copy size={13} />}
              onClick={handleCopy}
              style={{ padding: '0 4px', height: 20 }}
            />
          )}
        </div>
      </div>
      {output ? (
        <pre
          ref={codeRef}
          className={`language-${isJson ? 'json' : 'xml'}`}
          style={{
            flex: 1,
            minHeight: 0,
            margin: 0,
            padding: '10px 12px',
            background: 'transparent',
            overflow: 'auto',
            fontFamily: MONO,
            fontSize: 13,
            lineHeight: '20px',
            whiteSpace: 'pre',
          }}
        >
          {output}
        </pre>
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          color: token.colorTextTertiary,
          fontSize: 12,
        }}>
          <Braces size={22} strokeWidth={1.5} />
          <span>格式化结果将显示在这里</span>
        </div>
      )}
    </div>
  );

  const optionChipStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 10px',
    borderRadius: 6,
    background: token.colorBgContainer,
    border: `1px solid ${token.colorBorderSecondary}`,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <Segmented
          value={activeTab}
          onChange={(v) => setActiveTab(v as string)}
          options={[
            { label: 'JSON', value: 'json' },
            { label: 'XML', value: 'xml' },
          ]}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <motion.div whileTap={{ scale: 0.97 }} style={{ display: 'inline-flex' }}>
            <Button
              type="primary"
              icon={<Maximize2 size={14} />}
              onClick={isJson ? formatJson : formatXml}
            >
              格式化
            </Button>
          </motion.div>
          {isJson && (
            <Button icon={<Minimize2 size={14} />} onClick={compressJson}>
              压缩
            </Button>
          )}
          <Button
            icon={<Copy size={14} />}
            onClick={handleCopy}
            disabled={!output}
          >
            {copied ? '已复制' : '复制'}
          </Button>
          <Button
            icon={<ArrowLeftRight size={14} />}
            onClick={handleSwap}
            disabled={!output}
          >
            交换
          </Button>
          <Tooltip title="交换输入 / 输出面板位置">
            <Button
              icon={<Columns2 size={14} />}
              type={swapPanels ? 'primary' : 'default'}
              onClick={() => setSwapPanels(!swapPanels)}
            />
          </Tooltip>
          <Button icon={<Eraser size={14} />} onClick={handleClear}>
            清空
          </Button>
        </div>
      </div>

      {isJson && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          padding: '6px 10px',
          background: token.colorBgLayout,
          borderRadius: 8,
        }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: token.colorTextTertiary, letterSpacing: '0.02em' }}>
            选项
          </span>
          <span style={optionChipStyle}>
            <Checkbox checked={unicodeDecode} onChange={(e) => setUnicodeDecode(e.target.checked)}>
              Unicode解码
            </Checkbox>
          </span>
          <span style={optionChipStyle}>
            <Checkbox checked={quoteToDouble} onChange={(e) => setQuoteToDouble(e.target.checked)}>
              单引号转双引号
            </Checkbox>
          </span>
          <span style={optionChipStyle}>
            <Checkbox checked={removeEscape} onChange={(e) => setRemoveEscape(e.target.checked)}>
              去掉转义
            </Checkbox>
          </span>
          <span style={optionChipStyle}>
            <Checkbox checked={removeComments} onChange={(e) => setRemoveComments(e.target.checked)}>
              移除注释(#/ //)
            </Checkbox>
          </span>
        </div>
      )}

      {parseError && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderRadius: 6,
          background: token.colorErrorBg,
          color: token.colorError,
          fontSize: 12,
        }}>
          <CircleAlert size={14} />
          <span style={{ fontWeight: 500 }}>JSON 解析错误：{parseError.message}</span>
          <span style={{ color: token.colorError, opacity: 0.8 }}>
            第 {parseError.line} 行，第 {parseError.column} 列
          </span>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 320, display: 'flex', flexDirection: 'column' }}>
        <SplitPane
          left={swapPanels ? outputPanel : inputPanel}
          right={swapPanels ? inputPanel : outputPanel}
        />
      </div>
    </div>
  );
};
