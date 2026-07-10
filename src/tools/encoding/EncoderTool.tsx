import React, { useState } from 'react';
import { Card, Input, Button, Space, message, Tabs, theme, ConfigProvider } from 'antd';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';

const { TextArea } = Input;

export const EncoderTool: React.FC = () => {
  const [plainText, setPlainText] = useState('');
  const [encodedText, setEncodedText] = useState('');
  const [activeTab, setActiveTab] = useState('base64');
  const [copied, setCopied] = useState(false);
  const { token } = theme.useToken();

  // Base64
  const encodeBase64 = () => {
    try {
      const encoded = btoa(unescape(encodeURIComponent(plainText)));
      setEncodedText(encoded);
      message.success('Base64 编码成功');
    } catch (e) {
      message.error('编码失败');
    }
  };

  const decodeBase64 = () => {
    try {
      const decoded = decodeURIComponent(escape(atob(plainText)));
      setEncodedText(decoded);
      message.success('Base64 解码成功');
    } catch (e) {
      message.error('解码失败，Base64 格式错误');
    }
  };

  // URL
  const encodeURL = () => {
    try {
      const encoded = encodeURIComponent(plainText);
      setEncodedText(encoded);
      message.success('URL 编码成功');
    } catch (e) {
      message.error('编码失败');
    }
  };

  const decodeURL = () => {
    try {
      const decoded = decodeURIComponent(plainText);
      setEncodedText(decoded);
      message.success('URL 解码成功');
    } catch (e) {
      message.error('解码失败');
    }
  };

  // Hex
  const encodeHex = () => {
    try {
      const encoded = Array.from(new TextEncoder().encode(plainText))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      setEncodedText(encoded);
      message.success('Hex 编码成功');
    } catch (e) {
      message.error('编码失败');
    }
  };

  const decodeHex = () => {
    try {
      const hexString = plainText.replace(/\s/g, '');
      const bytes = new Uint8Array(hexString.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      const decoded = new TextDecoder().decode(bytes);
      setEncodedText(decoded);
      message.success('Hex 解码成功');
    } catch (e) {
      message.error('解码失败，Hex 格式错误');
    }
  };

  // Unicode
  const encodeUnicode = () => {
    try {
      const encoded = plainText
        .split('')
        .map(char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'))
        .join('');
      setEncodedText(encoded);
      message.success('Unicode 编码成功');
    } catch (e) {
      message.error('编码失败');
    }
  };

  const decodeUnicode = () => {
    try {
      const decoded = plainText.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
      setEncodedText(decoded);
      message.success('Unicode 解码成功');
    } catch (e) {
      message.error('解码失败');
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    message.success('已复制到剪贴板');
    setTimeout(() => setCopied(false), 2000);
  };

  const tabItems = [
    {
      key: 'base64',
      label: 'Base64',
      children: (
        <div style={{ padding: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <div>
              <div style={{ marginBottom: 8, fontWeight: 600, color: token.colorTextHeading }}>
                原文
              </div>
              <TextArea
                value={plainText}
                onChange={(e) => setPlainText(e.target.value)}
                placeholder="输入要编码或解码的文本..."
                style={{ borderRadius: 8, fontFamily: 'Monaco, Consolas, monospace' }}
                rows={4}
              />
            </div>
            <div style={{ textAlign: 'center' }}>
              <Space>
                <Button type="primary" onClick={encodeBase64}>编码 →</Button>
                <Button onClick={decodeBase64}>← 解码</Button>
              </Space>
            </div>
            <div>
              <div style={{ marginBottom: 8, fontWeight: 600, color: token.colorTextHeading }}>
                结果
              </div>
              <TextArea
                value={encodedText}
                onChange={(e) => setEncodedText(e.target.value)}
                placeholder="编码/解码结果..."
                style={{ borderRadius: 8, fontFamily: 'Monaco, Consolas, monospace' }}
                rows={4}
              />
            </div>
          </Space>
        </div>
      )
    },
    {
      key: 'url',
      label: 'URL',
      children: (
        <div style={{ padding: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <div>
              <div style={{ marginBottom: 8, fontWeight: 600, color: token.colorTextHeading }}>
                原文
              </div>
              <TextArea
                value={plainText}
                onChange={(e) => setPlainText(e.target.value)}
                placeholder="输入要编码或解码的文本..."
                style={{ borderRadius: 8, fontFamily: 'Monaco, Consolas, monospace' }}
                rows={4}
              />
            </div>
            <div style={{ textAlign: 'center' }}>
              <Space>
                <Button type="primary" onClick={encodeURL}>编码 →</Button>
                <Button onClick={decodeURL}>← 解码</Button>
              </Space>
            </div>
            <div>
              <div style={{ marginBottom: 8, fontWeight: 600, color: token.colorTextHeading }}>
                结果
              </div>
              <TextArea
                value={encodedText}
                onChange={(e) => setEncodedText(e.target.value)}
                placeholder="编码/解码结果..."
                style={{ borderRadius: 8, fontFamily: 'Monaco, Consolas, monospace' }}
                rows={4}
              />
            </div>
          </Space>
        </div>
      )
    },
    {
      key: 'hex',
      label: 'Hex',
      children: (
        <div style={{ padding: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <div>
              <div style={{ marginBottom: 8, fontWeight: 600, color: token.colorTextHeading }}>
                原文
              </div>
              <TextArea
                value={plainText}
                onChange={(e) => setPlainText(e.target.value)}
                placeholder="输入要编码或解码的文本..."
                style={{ borderRadius: 8, fontFamily: 'Monaco, Consolas, monospace' }}
                rows={4}
              />
            </div>
            <div style={{ textAlign: 'center' }}>
              <Space>
                <Button type="primary" onClick={encodeHex}>编码 →</Button>
                <Button onClick={decodeHex}>← 解码</Button>
              </Space>
            </div>
            <div>
              <div style={{ marginBottom: 8, fontWeight: 600, color: token.colorTextHeading }}>
                结果
              </div>
              <TextArea
                value={encodedText}
                onChange={(e) => setEncodedText(e.target.value)}
                placeholder="编码/解码结果..."
                style={{ borderRadius: 8, fontFamily: 'Monaco, Consolas, monospace' }}
                rows={4}
              />
            </div>
          </Space>
        </div>
      )
    },
    {
      key: 'unicode',
      label: 'Unicode',
      children: (
        <div style={{ padding: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <div>
              <div style={{ marginBottom: 8, fontWeight: 600, color: token.colorTextHeading }}>
                原文
              </div>
              <TextArea
                value={plainText}
                onChange={(e) => setPlainText(e.target.value)}
                placeholder="输入要编码或解码的文本..."
                style={{ borderRadius: 8, fontFamily: 'Monaco, Consolas, monospace' }}
                rows={4}
              />
            </div>
            <div style={{ textAlign: 'center' }}>
              <Space>
                <Button type="primary" onClick={encodeUnicode}>编码 →</Button>
                <Button onClick={decodeUnicode}>← 解码</Button>
              </Space>
            </div>
            <div>
              <div style={{ marginBottom: 8, fontWeight: 600, color: token.colorTextHeading }}>
                结果
              </div>
              <TextArea
                value={encodedText}
                onChange={(e) => setEncodedText(e.target.value)}
                placeholder="编码/解码结果..."
                style={{ borderRadius: 8, fontFamily: 'Monaco, Consolas, monospace' }}
                rows={4}
              />
            </div>
          </Space>
        </div>
      )
    }
  ];

  return (
    <ConfigProvider theme={{ token: { borderRadius: 8 } }}>
      <div style={{ padding: '16px' }}>
        <Card
          title="编码解码工具"
          extra={
            <Space>
              <Button 
                icon={copied ? <CheckOutlined /> : <CopyOutlined />} 
                onClick={() => handleCopy(encodedText || plainText)}
                disabled={!encodedText && !plainText}
              >
                {copied ? '已复制' : '复制'}
              </Button>
              <Button onClick={() => { setPlainText(''); setEncodedText(''); }}>清空</Button>
            </Space>
          }
          style={{ borderRadius: 12 }}
        >
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={tabItems}
          />
        </Card>
      </div>
    </ConfigProvider>
  );
};
