import React, { useState, useMemo } from 'react';
import { Input, theme, Tabs, Button, Tooltip, message } from 'antd';
import { Search, BookOpen, ArrowRight, Copy, CircleAlert } from 'lucide-react';
import { SplitPane } from '../common';

const { TextArea } = Input;

const MONO = "'JetBrains Mono', 'Cascadia Code', Monaco, Consolas, monospace";

interface MatchInfo {
  match: string;
  index: number;
  groups?: Record<string, string>;
}

const regexPresets = [
  { name: '邮箱地址', pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}' },
  { name: '手机号码', pattern: '1[3-9]\\d{9}' },
  { name: 'URL链接', pattern: 'https?:\\/\\/[\\w\\-._~:/?#[\\]@!$&\'()*+,;=%]+' },
  { name: 'IP地址', pattern: '\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}' },
  { name: '日期格式', pattern: '\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}' },
  { name: '身份证号', pattern: '[1-9]\\d{5}(18|19|20)\\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx]' },
  { name: '中文字符', pattern: '[\\u4e00-\\u9fa5]+' },
  { name: '数字', pattern: '-?\\d+(\\.\\d+)?' },
];

const regexSyntax = [
  { symbol: '.', desc: '匹配任意单个字符（除换行符）' },
  { symbol: '\\d', desc: '匹配任意数字 [0-9]' },
  { symbol: '\\w', desc: '匹配单词字符 [a-zA-Z0-9_]' },
  { symbol: '\\s', desc: '匹配空白字符' },
  { symbol: '^', desc: '匹配字符串开头' },
  { symbol: '$', desc: '匹配字符串结尾' },
  { symbol: '*', desc: '匹配前一个元素零次或多次' },
  { symbol: '+', desc: '匹配前一个元素一次或多次' },
  { symbol: '?', desc: '匹配前一个元素零次或一次' },
  { symbol: '{n}', desc: '匹配前一个元素恰好 n 次' },
  { symbol: '{n,}', desc: '匹配前一个元素至少 n 次' },
  { symbol: '{n,m}', desc: '匹配前一个元素 n 到 m 次' },
  { symbol: '[abc]', desc: '匹配字符集中的任意字符' },
  { symbol: '[^abc]', desc: '匹配不在字符集中的任意字符' },
  { symbol: '()', desc: '捕获组' },
  { symbol: '(?:)', desc: '非捕获组' },
  { symbol: '(?=)', desc: '正向先行断言' },
  { symbol: '(?!)', desc: '负向先行断言' },
  { symbol: '|', desc: '或运算符' },
];

const tabsStyle = `
.regex-tabs { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.regex-tabs > .ant-tabs-nav { flex-shrink: 0; margin-bottom: 12px; }
.regex-tabs > .ant-tabs-content-holder { flex: 1; min-height: 0; display: flex; }
.regex-tabs .ant-tabs-content { height: 100%; }
.regex-tabs .ant-tabs-tabpane { height: 100%; display: flex; flex-direction: column; }
`;

export const RegexTool: React.FC = () => {
  const [pattern, setPattern] = useState('');
  const [testText, setTestText] = useState('');
  const [flags, setFlags] = useState({ i: false, g: true, m: false });
  const [activeTab, setActiveTab] = useState('test');
  const { token } = theme.useToken();

  const flagsString = useMemo(() => {
    return Object.entries(flags)
      .filter(([, enabled]) => enabled)
      .map(([flag]) => flag)
      .join('');
  }, [flags]);

  const [matches, error] = useMemo(() => {
    if (!pattern || !testText) {
      return [[], null];
    }

    try {
      const regex = new RegExp(pattern, flagsString);
      const found: MatchInfo[] = [];

      if (flags.g) {
        let match;
        while ((match = regex.exec(testText)) !== null) {
          found.push({
            match: match[0],
            index: match.index,
            groups: match.groups || undefined
          });
          if (match[0].length === 0) {
            regex.lastIndex++;
          }
        }
      } else {
        const match = regex.exec(testText);
        if (match) {
          found.push({
            match: match[0],
            index: match.index,
            groups: match.groups || undefined
          });
        }
      }

      return [found, null];
    } catch (e) {
      return [[], e instanceof Error ? e.message : '无效的正则表达式'];
    }
  }, [pattern, testText, flagsString, flags.g]);

  const highlightedText = useMemo(() => {
    if (!pattern || !testText || error || matches.length === 0) {
      return <span>{testText}</span>;
    }

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    matches.forEach((m, i) => {
      if (m.index > lastIndex) {
        parts.push(<span key={`text-${i}`}>{testText.slice(lastIndex, m.index)}</span>);
      }
      parts.push(
        <mark
          key={`match-${i}`}
          style={{
            backgroundColor: token.colorPrimaryBg,
            color: token.colorPrimaryText,
            padding: '0 2px',
            borderRadius: 3,
            border: `1px solid ${token.colorPrimaryBorder}`
          }}
        >
          {m.match}
        </mark>
      );
      lastIndex = m.index + m.match.length;
    });

    if (lastIndex < testText.length) {
      parts.push(<span key="text-end">{testText.slice(lastIndex)}</span>);
    }

    return <>{parts}</>;
  }, [pattern, testText, matches, error, token]);

  const surface: React.CSSProperties = {
    background: token.colorBgLayout,
    border: `1px solid ${token.colorBorderSecondary}`,
    borderRadius: 10,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'hidden',
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

  const FlagChip: React.FC<{ active: boolean; label: string; onClick: () => void }> = ({ active, label, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: 6,
        border: `1px solid ${active ? token.colorPrimaryBorder : token.colorBorderSecondary}`,
        background: active ? token.colorPrimaryBg : 'transparent',
        color: active ? token.colorPrimaryText : token.colorTextSecondary,
        fontSize: 12,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      {label}
    </button>
  );

  const chip: React.CSSProperties = {
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 12,
    whiteSpace: 'nowrap',
  };

  const testPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 320 }}>
      <SplitPane
        left={
          <div style={{ ...surface, flex: 1 }}>
            <div style={panelHeader}>
              <span style={headerLabel}>测试文本</span>
              <span style={headerMeta}>{testText.length} 字符</span>
            </div>
            <TextArea
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="输入要测试的文本"
              style={{
                flex: 1,
                minHeight: 0,
                border: 'none',
                boxShadow: 'none',
                background: 'transparent',
                borderRadius: 0,
                padding: '10px 12px',
                fontFamily: MONO,
                fontSize: 13,
                lineHeight: '20px',
                resize: 'none',
              }}
            />
          </div>
        }
        right={
          <div style={{ ...surface, flex: 1 }}>
            <div style={panelHeader}>
              <span style={headerLabel}>高亮结果</span>
              {matches.length > 0 && <span style={headerMeta}>{matches.length} 处匹配</span>}
            </div>
            {testText ? (
              <div style={{
                flex: 1,
                minHeight: 0,
                padding: '10px 12px',
                overflow: 'auto',
                fontFamily: MONO,
                fontSize: 13,
                lineHeight: '20px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: token.colorText,
              }}>
                {highlightedText}
              </div>
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
                <Search size={22} strokeWidth={1.5} />
                <span>匹配结果将显示在这里</span>
              </div>
            )}
          </div>
        }
      />
    </div>
  );

  const presetPanel = (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <div style={{ marginBottom: 12, color: token.colorTextSecondary, fontSize: 12 }}>
        点击预设快速填充正则表达式，并自动切回测试
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
        {regexPresets.map((preset) => (
          <div
            key={preset.name}
            className="regex-preset"
            onClick={() => {
              setPattern(preset.pattern);
              setActiveTab('test');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderRadius: 8,
              border: `1px solid ${token.colorBorderSecondary}`,
              background: token.colorBgLayout,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ fontSize: 13, color: token.colorText }}>{preset.name}</span>
            <ArrowRight size={14} style={{ color: token.colorTextTertiary }} />
          </div>
        ))}
      </div>
    </div>
  );

  const syntaxPanel = (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <BookOpen size={16} style={{ color: token.colorInfo }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: token.colorTextTertiary, letterSpacing: '0.02em' }}>
          正则表达式语法参考
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
        {regexSyntax.map((item) => (
          <Tooltip key={item.symbol} title={item.desc}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                padding: '6px 10px',
                borderRadius: 6,
                cursor: 'help',
              }}
            >
              <span style={{
                fontFamily: MONO,
                fontSize: 13,
                color: token.colorPrimary,
                fontWeight: 500,
                flexShrink: 0,
              }}>{item.symbol}</span>
              <span style={{ fontSize: 12, color: token.colorTextSecondary }}>{item.desc}</span>
            </div>
          </Tooltip>
        ))}
      </div>
    </div>
  );

  const copyAllMatches = () => {
    if (matches.length === 0) return;
    navigator.clipboard.writeText(matches.map((m) => m.match).join('\n'));
    message.success('已复制全部匹配');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <style>{tabsStyle}</style>
      <style>{`
.regex-preset:hover {
  border-color: ${token.colorPrimaryBorder} !important;
  background: ${token.colorPrimaryBg} !important;
  transform: translateY(-1px);
}
`}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Input
          prefix="/"
          suffix={flagsString ? `/${flagsString}` : '/'}
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="输入正则表达式"
          status={error ? 'error' : undefined}
          size="large"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <FlagChip active={flags.i} label="忽略大小写 i" onClick={() => setFlags({ ...flags, i: !flags.i })} />
          <FlagChip active={flags.g} label="全局匹配 g" onClick={() => setFlags({ ...flags, g: !flags.g })} />
          <FlagChip active={flags.m} label="多行匹配 m" onClick={() => setFlags({ ...flags, m: !flags.m })} />
          <div style={{ flex: 1 }} />
          {matches.length > 0 && (
            <span style={{ ...chip, background: token.colorSuccessBg, color: token.colorSuccess }}>
              匹配 {matches.length} 处
            </span>
          )}
          {testText.length > 0 && (
            <span style={{ ...chip, background: token.colorFillTertiary, color: token.colorTextSecondary }}>
              {testText.length} 字符
            </span>
          )}
        </div>
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: token.colorError, fontSize: 12 }}>
            <CircleAlert size={14} />
            <span>{error}</span>
          </div>
        )}
      </div>

      <Tabs
        className="regex-tabs"
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'test', label: '测试', children: testPanel },
          { key: 'presets', label: '常用预设', children: presetPanel },
          { key: 'syntax', label: '语法参考', children: syntaxPanel },
        ]}
      />

      {matches.length > 0 && (
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: token.colorTextTertiary, letterSpacing: '0.02em' }}>
              匹配详情
            </span>
            <Button type="text" size="small" icon={<Copy size={13} />} onClick={copyAllMatches}>
              复制全部匹配
            </Button>
          </div>
          <div style={{
            maxHeight: 200,
            overflow: 'auto',
            padding: 8,
            background: token.colorBgLayout,
            borderRadius: 8,
            border: `1px solid ${token.colorBorderSecondary}`,
          }}>
            {matches.map((m, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 10px',
                borderRadius: 6,
                flexWrap: 'wrap',
              }}>
                <span style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: token.colorPrimaryBg,
                  color: token.colorPrimary,
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>{i + 1}</span>
                <span style={{ fontSize: 12, color: token.colorTextTertiary, minWidth: 64 }}>
                  位置 {m.index}
                </span>
                <span style={{
                  fontFamily: MONO,
                  fontSize: 13,
                  color: token.colorPrimaryText,
                  background: token.colorPrimaryBg,
                  padding: '1px 6px',
                  borderRadius: 4,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}>{m.match}</span>
                {m.groups && Object.entries(m.groups).map(([key, value]) => (
                  <span key={key} style={{
                    fontSize: 12,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: token.colorFillTertiary,
                    color: token.colorTextSecondary,
                  }}>
                    <span style={{ color: token.colorInfo }}>{key}</span>: {value}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
