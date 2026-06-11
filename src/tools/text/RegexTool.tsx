import React, { useState, useMemo } from 'react';
import { Card, Input, Checkbox, Space, theme, ConfigProvider, Alert, Button, Tooltip, Tabs } from 'antd';
import { SearchOutlined, BookOutlined, ArrowRightOutlined } from '@ant-design/icons';

const { TextArea } = Input;

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

export const RegexTool: React.FC = () => {
  const [pattern, setPattern] = useState('');
  const [testText, setTestText] = useState('');
  const [flags, setFlags] = useState({ i: false, g: true, m: false });
  const { token } = theme.useToken();

  const flagsString = useMemo(() => {
    return Object.entries(flags)
      .filter(([_, enabled]) => enabled)
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
            borderRadius: 2,
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

  return (
    <ConfigProvider
      theme={{
        token: {
          borderRadius: 8,
        },
      }}
    >
      <Card
        title="正则表达式测试"
        style={{ borderRadius: 12, height: '100%', minHeight: '500px' }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>正则表达式</div>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                prefix="/"
                suffix={flagsString ? `/${flagsString}` : '/'}
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="输入正则表达式"
                status={error ? 'error' : undefined}
                size="large"
              />
            </Space.Compact>
            {error && (
              <Alert
                message={error}
                type="error"
                style={{ marginTop: 8 }}
                showIcon
              />
            )}
          </div>

          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>选项</div>
            <Space>
              <Checkbox
                checked={flags.i}
                onChange={(e) => setFlags({ ...flags, i: e.target.checked })}
              >
                忽略大小写 (i)
              </Checkbox>
              <Checkbox
                checked={flags.g}
                onChange={(e) => setFlags({ ...flags, g: e.target.checked })}
              >
                全局匹配 (g)
              </Checkbox>
              <Checkbox
                checked={flags.m}
                onChange={(e) => setFlags({ ...flags, m: e.target.checked })}
              >
                多行匹配 (m)
              </Checkbox>
            </Space>
          </div>

          {matches.length > 0 && (
            <Alert
              message={`找到 ${matches.length} 个匹配`}
              type="success"
              showIcon
              icon={<SearchOutlined />}
            />
          )}

          <Tabs defaultActiveKey="test">
            <Tabs.TabPane tab="测试" key="test">
              <div style={{ display: 'flex', gap: 16, height: '350px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{
                padding: '12px 16px',
                background: token.colorBgLayout,
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                border: `1px solid ${token.colorBorder}`,
                borderBottom: 'none',
                flexShrink: 0
              }}>
                <span style={{
                  padding: '4px 10px',
                  background: token.colorInfoBg,
                  borderRadius: 4,
                  fontSize: 12,
                  color: token.colorInfo
                }}>
                  测试文本
                </span>
              </div>
              <TextArea
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                placeholder="输入要测试的文本"
                autoSize={{ minRows: 12, maxRows: 12 }}
                style={{
                  height: 'calc(100% - 44px)',
                  borderRadius: 0,
                  borderBottomLeftRadius: 8,
                  borderBottomRightRadius: 8,
                  fontFamily: "'Monaco', 'Menlo', monospace",
                  fontSize: 13,
                  resize: 'none'
                }}
              />
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{
                padding: '12px 16px',
                background: token.colorBgLayout,
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                border: `1px solid ${token.colorBorder}`,
                borderBottom: 'none',
                flexShrink: 0
              }}>
                <span style={{
                  padding: '4px 10px',
                  background: token.colorSuccessBg,
                  borderRadius: 4,
                  fontSize: 12,
                  color: token.colorSuccess
                }}>
                  高亮结果
                </span>
              </div>
              <div style={{
                height: 'calc(100% - 44px)',
                padding: '12px 16px',
                border: `1px solid ${token.colorBorder}`,
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 8,
                background: token.colorBgContainer,
                overflow: 'auto',
                fontFamily: "'Monaco', 'Menlo', monospace",
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
              }}>
                {testText ? highlightedText : '结果将显示在这里'}
              </div>
            </div>
          </div>
            </Tabs.TabPane>
            <Tabs.TabPane tab="常用预设" key="presets">
              <div style={{ padding: 16, background: token.colorBgContainer, borderRadius: 8, border: `1px solid ${token.colorBorder}` }}>
                <div style={{ marginBottom: 12, color: token.colorTextSecondary, fontSize: 14 }}>点击下方预设快速填充正则表达式：</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                  {regexPresets.map((preset, index) => (
                    <Button
                      key={index}
                      type="default"
                      style={{
                        justifyContent: 'flex-start',
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: `1px solid ${token.colorBorder}`,
                        background: token.colorBgLayout
                      }}
                      onClick={() => setPattern(preset.pattern)}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 500, color: token.colorText }}>{preset.name}</span>
                        <ArrowRightOutlined style={{ fontSize: 14, color: token.colorTextSecondary }} />
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            </Tabs.TabPane>
            <Tabs.TabPane tab="语法参考" key="syntax">
              <div style={{ padding: 16, background: token.colorBgContainer, borderRadius: 8, border: `1px solid ${token.colorBorder}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <BookOutlined style={{ color: token.colorInfo, fontSize: 18 }} />
                  <span style={{ fontWeight: 500, fontSize: 16, color: token.colorText }}>正则表达式语法参考</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {regexSyntax.map((item, index) => (
                    <Tooltip key={index} title={item.desc}>
                      <div
                        style={{
                          padding: '10px 14px',
                          background: token.colorBgLayout,
                          borderRadius: 6,
                          border: `1px solid ${token.colorBorder}`,
                          cursor: 'help'
                        }}
                      >
                        <span style={{
                          fontFamily: "'Monaco', 'Menlo', monospace",
                          fontSize: 14,
                          color: token.colorPrimary,
                          fontWeight: 500
                        }}>{item.symbol}</span>
                        <span style={{
                          marginLeft: 12,
                          fontSize: 13,
                          color: token.colorTextSecondary
                        }}>{item.desc}</span>
                      </div>
                    </Tooltip>
                  ))}
                </div>
              </div>
            </Tabs.TabPane>
          </Tabs>

          {matches.length > 0 && (
            <div>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>匹配详情</div>
              <div style={{
                maxHeight: '200px',
                overflow: 'auto',
                padding: 12,
                background: token.colorBgLayout,
                borderRadius: 8,
                border: `1px solid ${token.colorBorder}`
              }}>
                {matches.map((m, i) => (
                  <div key={i} style={{
                    padding: '8px 12px',
                    background: token.colorBgContainer,
                    borderRadius: 4,
                    marginBottom: 8,
                    border: `1px solid ${token.colorBorder}`
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 500 }}>匹配 {i + 1}</span>
                      <span style={{ color: token.colorTextSecondary, fontSize: 12 }}>
                        位置: {m.index}
                      </span>
                    </div>
                    <div style={{
                      fontFamily: "'Monaco', 'Menlo', monospace",
                      fontSize: 13,
                      background: token.colorPrimaryBg,
                      padding: '4px 8px',
                      borderRadius: 4,
                      color: token.colorPrimaryText
                    }}>
                      {m.match}
                    </div>
                    {m.groups && Object.keys(m.groups).length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 4 }}>分组:</div>
                        {Object.entries(m.groups).map(([key, value]) => (
                          <div key={key} style={{
                            fontSize: 12,
                            marginLeft: 16,
                            color: token.colorText
                          }}>
                            <span style={{ color: token.colorInfo }}>{key}:</span> {value}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Space>
      </Card>
    </ConfigProvider>
  );
};
