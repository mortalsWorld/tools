import React, { useState } from 'react';
import { Card, Input, Button, Space, message } from 'antd';
import { CopyOutlined, ArrowRightOutlined } from '@ant-design/icons';

const { TextArea } = Input;

export const HexTool: React.FC = () => {
  const [text, setText] = useState('');
  const [hex, setHex] = useState('');

  const textToHex = () => {
    try {
      let result = '';
      for (let i = 0; i < text.length; i++) {
        const hexCode = text.charCodeAt(i).toString(16);
        result += hexCode.padStart(2, '0');
      }
      setHex(result.toUpperCase());
      message.success('转换成功');
    } catch (e) {
      message.error('转换失败');
    }
  };

  const hexToText = () => {
    try {
      const cleanHex = hex.replace(/\s/g, '');
      let result = '';
      for (let i = 0; i < cleanHex.length; i += 2) {
        const charCode = parseInt(cleanHex.substr(i, 2), 16);
        result += String.fromCharCode(charCode);
      }
      setText(result);
      message.success('转换成功');
    } catch (e) {
      message.error('转换失败，Hex 格式错误');
    }
  };

  const copyText = () => {
    navigator.clipboard.writeText(text);
    message.success('已复制到剪贴板');
  };

  const copyHex = () => {
    navigator.clipboard.writeText(hex);
    message.success('已复制到剪贴板');
  };

  return (
    <Card title="Hex 转换">
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
          <Button type="primary" icon={<ArrowRightOutlined />} onClick={textToHex}>
            文本 → Hex
          </Button>
          <Button icon={<ArrowRightOutlined rotate={180} />} onClick={hexToText}>
            Hex → 文本
          </Button>
        </Space>
        <div>
          <div style={{ marginBottom: 8 }}>
            Hex:
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={copyHex}
              style={{ marginLeft: 8 }}
            >
              复制
            </Button>
          </div>
          <TextArea
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            rows={6}
            placeholder="请输入 Hex (如: 48656C6C6F)"
          />
        </div>
      </Space>
    </Card>
  );
};
