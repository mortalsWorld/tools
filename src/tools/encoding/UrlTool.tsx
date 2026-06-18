import React, { useState } from 'react';
import { Card, Input, Button, Space, message } from 'antd';
import { CopyOutlined, ArrowRightOutlined } from '@ant-design/icons';

const { TextArea } = Input;

export const UrlTool: React.FC = () => {
  const [plainText, setPlainText] = useState('');
  const [encodedText, setEncodedText] = useState('');

  const encode = () => {
    try {
      setEncodedText(encodeURIComponent(plainText));
      message.success('URL 编码成功');
    } catch (e) {
      message.error('编码失败');
    }
  };

  const decode = () => {
    try {
      setPlainText(decodeURIComponent(encodedText));
      message.success('URL 解码成功');
    } catch (e) {
      message.error('解码失败，URL 格式错误');
    }
  };

  const copyPlainText = () => {
    navigator.clipboard.writeText(plainText);
    message.success('已复制到剪贴板');
  };

  const copyEncoded = () => {
    navigator.clipboard.writeText(encodedText);
    message.success('已复制到剪贴板');
  };

  return (
    <Card title="URL 编解码">
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
            URL 编码:
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={copyEncoded}
              style={{ marginLeft: 8 }}
            >
              复制
            </Button>
          </div>
          <TextArea
            value={encodedText}
            onChange={(e) => setEncodedText(e.target.value)}
            rows={6}
            placeholder="请输入要解码的 URL"
          />
        </div>
      </Space>
    </Card>
  );
};
