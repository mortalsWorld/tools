import React, { useState, useMemo } from 'react';
import { Card, Input, Row, Col, theme } from 'antd';
import MarkdownIt from 'markdown-it';
import { useTheme } from '../../context/ThemeContext';

const { TextArea } = Input;
// 安全配置：禁用原始 HTML 以防止 XSS 攻击
// 用户输入的 Markdown 只会渲染为安全的文本格式
const md = new MarkdownIt({
  html: false,  // 禁用原始 HTML - 安全最佳实践
  breaks: true,
  linkify: true,
});

export const MarkdownPreview: React.FC = () => {
  const [markdown, setMarkdown] = useState('# 欢迎使用 Markdown 预览\n\n这是一个简单的 Markdown 编辑器和预览工具。\n\n## 功能特性\n\n- 实时预览\n- 支持基本 Markdown 语法\n- 代码高亮\n\n## 代码示例\n\n```javascript\nfunction hello() {\n  console.log("Hello, World!");\n}\n```\n\n## 列表\n\n1. 第一项\n2. 第二项\n3. 第三项\n\n- 无序列表项\n- 另一个无序列表项');
  const { theme: appTheme } = useTheme();
  const { token } = theme.useToken();

  const html = useMemo(() => {
    return md.render(markdown);
  }, [markdown]);

  const isDark = appTheme === 'dark';

  const previewStyle = {
    border: `1px solid ${isDark ? token.colorBorderSecondary : token.colorBorder}`,
    borderRadius: 8,
    padding: 20,
    minHeight: 'calc(100% - 32px)',
    maxHeight: 600,
    overflowY: 'auto' as const,
    backgroundColor: isDark ? token.colorBgLayout : token.colorBgContainer,
    fontFamily: "'Segoe UI', 'PingFang SC', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: 14,
    lineHeight: 1.8,
    color: isDark ? token.colorText : token.colorText,
  };

  const markdownStyles = `
    .markdown-preview {
      color: ${isDark ? token.colorText : token.colorText};
    }
    .markdown-preview h1 {
      font-size: 24px;
      font-weight: 600;
      margin: 0 0 16px 0;
      padding-bottom: 10px;
      border-bottom: 2px solid ${isDark ? token.colorBorderSecondary : token.colorBorder};
      color: ${isDark ? token.colorTextHeading : token.colorTextHeading};
    }
    .markdown-preview h2 {
      font-size: 20px;
      font-weight: 600;
      margin: 20px 0 12px 0;
      padding-bottom: 6px;
      border-bottom: 1px solid ${isDark ? token.colorBorderSecondary : token.colorBorder};
      color: ${isDark ? token.colorTextHeading : token.colorTextHeading};
    }
    .markdown-preview h3 {
      font-size: 18px;
      font-weight: 600;
      margin: 18px 0 10px 0;
      color: ${isDark ? token.colorTextHeading : token.colorTextHeading};
    }
    .markdown-preview h4, .markdown-preview h5, .markdown-preview h6 {
      font-size: 16px;
      font-weight: 600;
      margin: 16px 0 8px 0;
      color: ${isDark ? token.colorTextHeading : token.colorTextHeading};
    }
    .markdown-preview p {
      margin: 12px 0;
      line-height: 1.8;
    }
    .markdown-preview ul, .markdown-preview ol {
      margin: 12px 0;
      padding-left: 28px;
    }
    .markdown-preview li {
      margin: 6px 0;
      line-height: 1.6;
    }
    .markdown-preview li > ul, .markdown-preview li > ol {
      margin: 6px 0;
      padding-left: 20px;
    }
    .markdown-preview blockquote {
      margin: 16px 0;
      padding: 12px 16px;
      border-left: 4px solid ${token.colorPrimary};
      background: ${isDark ? token.colorBgContainer : token.colorBgLayout};
      border-radius: 0 4px 4px 0;
      color: ${isDark ? token.colorTextSecondary : token.colorTextSecondary};
      font-style: italic;
    }
    .markdown-preview code {
      padding: 2px 6px;
      background: ${isDark ? token.colorBgContainer : token.colorBgLayout};
      border-radius: 4px;
      font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
      font-size: 13px;
      color: ${token.colorPrimary};
    }
    .markdown-preview pre {
      margin: 16px 0;
      padding: 16px;
      background: ${isDark ? '#1a1a1a' : token.colorBgLayout};
      border-radius: 6px;
      overflow-x: auto;
      border: 1px solid ${isDark ? token.colorBorderSecondary : token.colorBorder};
    }
    .markdown-preview pre code {
      padding: 0;
      background: transparent;
      color: ${isDark ? token.colorText : token.colorText};
      font-size: 13px;
      line-height: 1.6;
    }
    .markdown-preview a {
      color: ${token.colorPrimary};
      text-decoration: none;
    }
    .markdown-preview a:hover {
      text-decoration: underline;
    }
    .markdown-preview hr {
      margin: 24px 0;
      border: none;
      border-top: 1px solid ${isDark ? token.colorBorderSecondary : token.colorBorder};
    }
    .markdown-preview table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 14px;
    }
    .markdown-preview th, .markdown-preview td {
      padding: 10px 12px;
      border: 1px solid ${isDark ? token.colorBorderSecondary : token.colorBorder};
      text-align: left;
    }
    .markdown-preview th {
      background: ${isDark ? token.colorBgContainer : token.colorBgLayout};
      font-weight: 600;
    }
    .markdown-preview tr:nth-child(even) {
      background: ${isDark ? token.colorBgContainer : token.colorBgLayout};
    }
    .markdown-preview img {
      max-width: 100%;
      border-radius: 4px;
    }
  `;

  return (
    <Card title="Markdown 预览" style={{ height: '100%', minHeight: '500px' }}>
      <style>{markdownStyles}</style>
      <Row gutter={16} style={{ height: 'calc(100% - 60px)' }}>
        <Col span={12} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ marginBottom: 8, fontWeight: 500, color: token.colorTextSecondary }}>编辑区</div>
          <TextArea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            style={{
              flex: 1,
              fontFamily: "'Monaco', 'Menlo', 'Consolas', monospace",
              fontSize: 13,
              lineHeight: 1.6,
              borderRadius: 8,
              resize: 'none',
            }}
          />
        </Col>
        <Col span={12} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ marginBottom: 8, fontWeight: 500, color: token.colorTextSecondary }}>预览区</div>
          <div
            className="markdown-preview"
            style={previewStyle}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </Col>
      </Row>
    </Card>
  );
};
