import React, { useState } from 'react';
import { Card, Input, Button, Space, message } from 'antd';
import { CopyOutlined, ArrowRightOutlined } from '@ant-design/icons';

const { TextArea } = Input;

export const UnicodeTool: React.FC = () => {
  const [text, setText] = useState('');
  const [unicode, setUnicode] = useState('');

  const textToUnicode = () => {
    try {
      let result = '';
      for (let i = 0; i < text.length; i++) {
        const codePoint = text.charCodeAt(i);
        result += `\\u${codePoint.toString(16).padStart(4, '0')}`;
      }
      setUnicode(result);
      message.success('转换成功');
    } catch (e) {
      message.error('转换失败');
    }
  };

  const unicodeToText = () => {
    try {
      let result = unicode;
      result = result.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
      });
      setText(result);
      message.success('转换成功');
    } catch (e) {
      message.error('转换失败，Unicode 格式错误');
    }
  };

  const copyText = () => {
    navigator.clipboard.writeText(text);
    message.success('已复制到剪贴板');
  };

  const copyUnicode = () => {
    navigator.clipboard.writeText(unicode);
    message.success('已复制到剪贴板');
  };

  return (
    <Card title="Unicode 转换">
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <div>
          <div style={{ marginBottom: 8 }}>
            文本:
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={copyText}
              style={{ marginLeft: 8 }}
            >
              复制
            </Button>
          </div>
          <TextArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="请输入文本"
          />
        </div>
        <Space>
          <Button type="primary" icon={<ArrowRightOutlined />} onClick={textToUnicode}>
            文本 → Unicode
          </Button>
          <Button icon={<ArrowRightOutlined rotate={180} />} onClick={unicodeToText}>
            Unicode → 文本
          </Button>
        </Space>
        <div>
          <div style={{ marginBottom: 8 }}>
            Unicode:
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={copyUnicode}
              style={{ marginLeft: 8 }}
            >
              复制
            </Button>
          </div>
          <TextArea
            value={unicode}
            onChange={(e) => setUnicode(e.target.value)}
            rows={6}
            placeholder="请输入 Unicode (如: \\u4f60\\u597d)"
          />
        </div>
      </Space>
    </Card>
  );
};
