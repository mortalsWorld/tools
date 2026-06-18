import React, { useState } from 'react';
import { Card, Input, Button, Space, message } from 'antd';
import { CopyOutlined, ArrowRightOutlined } from '@ant-design/icons';

const { TextArea } = Input;

export const Base64Tool: React.FC = () => {
  const [plainText, setPlainText] = useState('');
  const [base64Text, setBase64Text] = useState('');

  const encode = () => {
    try {
      const encoded = btoa(unescape(encodeURIComponent(plainText)));
      setBase64Text(encoded);
      message.success('Base64 编码成功');
    } catch (e) {
      message.error('编码失败');
    }
  };

  const decode = () => {
    try {
      const decoded = decodeURIComponent(escape(atob(base64Text)));
      setPlainText(decoded);
      message.success('Base64 解码成功');
    } catch (e) {
      message.error('解码失败，Base64 格式错误');
    }
  };

  const copyPlainText = () => {
    navigator.clipboard.writeText(plainText);
    message.success('已复制到剪贴板');
  };

  const copyBase64 = () => {
    navigator.clipboard.writeText(base64Text);
    message.success('已复制到剪贴板');
  };

  return (
    <Card title="Base64 编解码">
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <div>
          <div style={{ marginBottom: 8 }}>
            普通文本:
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={copyPlainText}
              style={{ marginLeft: 8 }}
            >
              复制
            </Button>
          </div>
          <TextArea
            value={plainText}
            onChange={(e) => setPlainText(e.target.value)}
            rows={6}
            placeholder="请输入要编码的文本"
          />
        </div>
        <Space>
          <Button type="primary" icon={<ArrowRightOutlined />} onClick={encode}>
            编码 →
          </Button>
          <Button icon={<ArrowRightOutlined rotate={180} />} onClick={decode}>
            ← 解码
          </Button>
        </Space>
        <div>
          <div style={{ marginBottom: 8 }}>
            Base64:
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={copyBase64}
              style={{ marginLeft: 8 }}
            >
              复制
            </Button>
          </div>
          <TextArea
            value={base64Text}
            onChange={(e) => setBase64Text(e.target.value)}
            rows={6}
            placeholder="请输入要解码的 Base64"
          />
        </div>
      </Space>
    </Card>
  );
};
