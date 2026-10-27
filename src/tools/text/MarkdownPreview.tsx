import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Input, Button, Segmented, theme, message } from 'antd';
import { Copy, Eraser, FileText, Eye } from 'lucide-react';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import css from 'highlight.js/lib/languages/css';
import bash from 'highlight.js/lib/languages/bash';
import { SplitPane } from '../common';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('css', css);
hljs.registerLanguage('bash', bash);
hljs.configure({ ignoreUnescapedHTML: true });

const { TextArea } = Input;

const MONO = "'JetBrains Mono', 'Cascadia Code', Monaco, Consolas, monospace";

const SAMPLE_MARKDOWN = `# 欢迎使用 Markdown 预览

这是一个简单的 Markdown 编辑器和预览工具。

## 功能特性

- 实时预览
- 支持基本 Markdown 语法
- 代码高亮

## 代码示例

\`\`\`javascript
function hello() {
  console.log("Hello, World!");
}
\`\`\`

## 列表

1. 第一项
2. 第二项
3. 第三项

- 无序列表项
- 另一个无序列表项`;

// 安全说明：
// 1. html: false 禁用原始 HTML 渲染，防止 XSS 攻击
// 2. 用户输入的 Markdown 只渲染为纯文本格式，所有 HTML 标签都会被转义
// 3. 使用 DOMPurify 对 markdown-it 输出进行二次过滤，作为纵深防御措施
// 4. 即使 markdown-it 配置变更或出现漏洞，DOMPurify 仍能阻止 XSS 攻击
const md = new MarkdownIt({
  html: false,  // 关键安全设置：禁止渲染原始 HTML，防止 XSS
  breaks: true,
  linkify: true,
});

type ViewMode = 'split' | 'edit' | 'preview';

export const MarkdownPreview: React.FC = () => {
  const [markdown, setMarkdown] = useState(SAMPLE_MARKDOWN);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const { token } = theme.useToken();
  const previewRef = useRef<HTMLDivElement>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);

  const html = useMemo(() => {
    // 安全最佳实践：使用 DOMPurify 对 markdown-it 输出进行二次过滤
    // 即使 markdown-it 配置了 html: false，仍添加 DOMPurify 作为纵深防御
    return DOMPurify.sanitize(md.render(markdown));
  }, [markdown]);

  useEffect(() => {
    const root = previewRef.current;
    if (!root) return;
    root.querySelectorAll('pre code').forEach((el) => {
      hljs.highlightElement(el as HTMLElement);
    });
  }, [html, viewMode]);

  const stats = useMemo(() => {
    const lines = markdown ? markdown.split('\n').length : 0;
    return { lines, chars: markdown.length };
  }, [markdown]);

  const markdownStyles = useMemo(() => `
    .markdown-preview {
      color: ${token.colorText};
    }
    .markdown-preview h1 {
      font-size: 24px;
      font-weight: 600;
      margin: 0 0 16px 0;
      padding-bottom: 10px;
      border-bottom: 2px solid ${token.colorBorderSecondary};
      color: ${token.colorTextHeading};
    }
    .markdown-preview h2 {
      font-size: 20px;
      font-weight: 600;
      margin: 20px 0 12px 0;
      padding-bottom: 6px;
      border-bottom: 1px solid ${token.colorBorderSecondary};
      color: ${token.colorTextHeading};
    }
    .markdown-preview h3 {
      font-size: 18px;
      font-weight: 600;
      margin: 18px 0 10px 0;
      color: ${token.colorTextHeading};
    }
    .markdown-preview h4, .markdown-preview h5, .markdown-preview h6 {
      font-size: 16px;
      font-weight: 600;
      margin: 16px 0 8px 0;
      color: ${token.colorTextHeading};
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
      background: ${token.colorBgLayout};
      border-radius: 0 4px 4px 0;
      color: ${token.colorTextSecondary};
      font-style: italic;
    }
    .markdown-preview code {
      padding: 2px 6px;
      background: ${token.colorBgLayout};
      border-radius: 4px;
      font-family: ${MONO};
      font-size: 13px;
      color: ${token.colorPrimary};
    }
    .markdown-preview pre {
      margin: 16px 0;
      padding: 14px;
      background: ${token.colorBgLayout};
      border-radius: 8px;
      overflow-x: auto;
      border: 1px solid ${token.colorBorderSecondary};
    }
    .markdown-preview pre code {
      padding: 0;
      background: transparent;
      color: ${token.colorText};
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
      border-top: 1px solid ${token.colorBorderSecondary};
    }
    .markdown-preview table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 14px;
    }
    .markdown-preview th, .markdown-preview td {
      padding: 10px 12px;
      border: 1px solid ${token.colorBorderSecondary};
      text-align: left;
    }
    .markdown-preview th {
      background: ${token.colorBgLayout};
      font-weight: 600;
    }
    .markdown-preview tr:nth-child(even) {
      background: ${token.colorBgLayout};
    }
    .markdown-preview img {
      max-width: 100%;
      border-radius: 4px;
    }
  `, [token]);

  const getEditorElement = () => editorWrapperRef.current?.querySelector('textarea') ?? null;

  const syncScroll = (source: HTMLElement, target: HTMLElement | null) => {
    if (!target || isSyncingRef.current) return;
    const sourceMax = source.scrollHeight - source.clientHeight;
    const targetMax = target.scrollHeight - target.clientHeight;
    if (sourceMax <= 0 || targetMax <= 0) return;
    const ratio = source.scrollTop / sourceMax;
    isSyncingRef.current = true;
    target.scrollTop = ratio * targetMax;
    requestAnimationFrame(() => { isSyncingRef.current = false; });
  };

  const copyMarkdown = () => {
    navigator.clipboard.writeText(markdown);
    message.success('已复制 Markdown');
  };

  const copyHtml = () => {
    navigator.clipboard.writeText(html);
    message.success('已复制 HTML');
  };

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

  const editorPanel = (
    <div style={surface}>
      <div style={panelHeader}>
        <span style={headerLabel}>Markdown</span>
        <span style={headerMeta}>{stats.lines} 行 · {stats.chars} 字符</span>
      </div>
      <div ref={editorWrapperRef} style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <TextArea
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          onScroll={(e) => {
            if (viewMode === 'split') syncScroll(e.currentTarget, previewRef.current);
          }}
          placeholder="输入 Markdown 内容..."
          style={{
            flex: 1,
            minHeight: 0,
            border: 'none',
            boxShadow: 'none',
            background: 'transparent',
            borderRadius: 0,
            padding: '12px 14px',
            fontFamily: MONO,
            fontSize: 13,
            lineHeight: 1.6,
            resize: 'none',
          }}
        />
      </div>
    </div>
  );

  const previewPanel = (
    <div style={surface}>
      <div style={panelHeader}>
        <span style={headerLabel}>预览</span>
      </div>
      {markdown.trim() ? (
        <div
          ref={previewRef}
          className="markdown-preview"
          onScroll={(e) => {
            if (viewMode === 'split') syncScroll(e.currentTarget, getEditorElement());
          }}
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: 20,
            background: token.colorBgContainer,
            fontFamily: "'Segoe UI', 'PingFang SC', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 14,
            lineHeight: 1.8,
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
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
          background: token.colorBgContainer,
        }}>
          <Eye size={22} strokeWidth={1.5} />
          <span>输入 Markdown 内容后在此预览</span>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <style>{markdownStyles}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <Segmented
          value={viewMode}
          onChange={(v) => setViewMode(v as ViewMode)}
          options={[
            { label: '分栏', value: 'split' },
            { label: '仅编辑', value: 'edit' },
            { label: '仅预览', value: 'preview' },
          ]}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Button icon={<Copy size={14} />} onClick={copyMarkdown} disabled={!markdown}>
            复制 Markdown
          </Button>
          <Button icon={<Copy size={14} />} onClick={copyHtml} disabled={!html}>
            复制 HTML
          </Button>
          <Button icon={<FileText size={14} />} onClick={() => setMarkdown(SAMPLE_MARKDOWN)}>
            载入示例
          </Button>
          <Button icon={<Eraser size={14} />} onClick={() => setMarkdown('')} disabled={!markdown}>
            清空
          </Button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 320, display: 'flex' }}>
        {viewMode === 'split' && (
          <SplitPane left={editorPanel} right={previewPanel} min={25} max={75} />
        )}
        {viewMode === 'edit' && editorPanel}
        {viewMode === 'preview' && previewPanel}
      </div>
    </div>
  );
};
