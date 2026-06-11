import React, { useState, useMemo } from 'react';
import { Card, Input, Row, Col } from 'antd';
import MarkdownIt from 'markdown-it';
import { useTheme } from '../../context/ThemeContext';

const { TextArea } = Input;
const md = new MarkdownIt();

export const MarkdownPreview: React.FC = () => {
  const [markdown, setMarkdown] = useState('# 欢迎使用 Markdown 预览\n\n这是一个简单的 Markdown 编辑器和预览工具。\n\n## 功能特性\n\n- 实时预览\n- 支持基本 Markdown 语法\n- 代码高亮\n\n## 代码示例\n\n```javascript\nfunction hello() {\n  console.log("Hello, World!");\n}\n```\n\n## 列表\n\n1. 第一项\n2. 第二项\n3. 第三项\n\n- 无序列表项\n- 另一个无序列表项');
  const { theme } = useTheme();

  const html = useMemo(() => {
    return md.render(markdown);
  }, [markdown]);

  return (
    <Card title="Markdown 预览">
      <Row gutter={16}>
        <Col span={12}>
          <div style={{ marginBottom: 8 }}>编辑区:</div>
          <TextArea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            rows={20}
            style={{ fontFamily: 'monospace' }}
          />
        </Col>
        <Col span={12}>
          <div style={{ marginBottom: 8 }}>预览区:</div>
          <div
            style={{
              border: '1px solid #d9d9d9',
              borderRadius: 6,
              padding: 16,
              minHeight: 400,
              maxHeight: 600,
              overflow: 'auto',
              backgroundColor: theme === 'dark' ? '#141414' : '#fff',
              color: theme === 'dark' ? '#fff' : '#000',
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </Col>
      </Row>
    </Card>
  );
};
