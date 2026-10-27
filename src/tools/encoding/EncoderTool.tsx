import React, { useState, useEffect } from 'react';
import { Input, Button, Segmented, message, theme } from 'antd';
import { Copy, Check, ArrowRight, ArrowLeft, ArrowLeftRight, Eraser } from 'lucide-react';
import { motion } from 'framer-motion';

const { TextArea } = Input;

const MONO = "'JetBrains Mono', 'Cascadia Code', Monaco, Consolas, monospace";

const CODECS = {
  base64: {
    label: 'Base64',
    hint: '支持 UTF-8 中文',
    encode: (text: string) => btoa(unescape(encodeURIComponent(text))),
    decode: (text: string) => decodeURIComponent(escape(atob(text))),
  },
  url: {
    label: 'URL',
    hint: '使用 encodeURIComponent 编码',
    encode: (text: string) => encodeURIComponent(text),
    decode: (text: string) => decodeURIComponent(text),
  },
  hex: {
    label: 'Hex',
    hint: 'UTF-8 字节转十六进制，以空格分隔',
    encode: (text: string) => Array.from(new TextEncoder().encode(text))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' '),
    decode: (text: string) => {
      const hexString = text.replace(/\s/g, '');
      if (!hexString) return '';
      const bytes = new Uint8Array(hexString.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
      return new TextDecoder().decode(bytes);
    },
  },
  unicode: {
    label: 'Unicode',
    hint: '转为 \\uXXXX 转义序列',
    encode: (text: string) => text
      .split('')
      .map((char) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'))
      .join(''),
    decode: (text: string) => text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    ),
  },
} as const;

type CodecKey = keyof typeof CODECS;

const codecOptions = (Object.keys(CODECS) as CodecKey[]).map((key) => ({
  label: CODECS[key].label,
  value: key,
}));

export const EncoderTool: React.FC = () => {
  const [plainText, setPlainText] = useState('');
  const [encodedText, setEncodedText] = useState('');
  const [activeCodec, setActiveCodec] = useState<CodecKey>('base64');
  const [copied, setCopied] = useState(false);
  const { token } = theme.useToken();

  const current = CODECS[activeCodec];

  const handleEncode = () => {
    try {
      setEncodedText(current.encode(plainText));
      message.success(`${current.label} 编码成功`);
    } catch {
      message.error('编码失败');
    }
  };

  const handleDecode = () => {
    try {
      setEncodedText(current.decode(plainText));
      message.success(`${current.label} 解码成功`);
    } catch {
      message.error(`解码失败，${current.label} 格式错误`);
    }
  };

  const handleSwap = () => {
    if (!encodedText) {
      message.warning('没有可互换的结果');
      return;
    }
    setPlainText(encodedText);
    setEncodedText('');
    message.success('已将结果移入原文');
  };

  const handleCopy = () => {
    if (!encodedText) return;
    navigator.clipboard.writeText(encodedText);
    setCopied(true);
    message.success('已复制到剪贴板');
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleEncode();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCodec, plainText]);

  const surface: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 120,
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Segmented
            value={activeCodec}
            onChange={(v) => setActiveCodec(v as CodecKey)}
            options={codecOptions}
          />
          <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{current.hint}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button
            icon={<ArrowLeftRight size={14} />}
            onClick={handleSwap}
            disabled={!encodedText}
          >
            互换
          </Button>
          <Button
            icon={<Eraser size={14} />}
            onClick={() => { setPlainText(''); setEncodedText(''); }}
            disabled={!plainText && !encodedText}
          >
            清空
          </Button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={surface}>
          <div style={panelHeader}>
            <span style={headerLabel}>原文</span>
            <span style={headerMeta}>{plainText.length} 字符</span>
          </div>
          <TextArea
            value={plainText}
            onChange={(e) => setPlainText(e.target.value)}
            placeholder="输入要编码或解码的文本...（Ctrl + Enter 编码）"
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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <motion.div whileTap={{ scale: 0.97 }} style={{ display: 'inline-flex' }}>
            <Button type="primary" icon={<ArrowRight size={14} />} iconPosition="end" onClick={handleEncode}>
              编码
            </Button>
          </motion.div>
          <Button icon={<ArrowLeft size={14} />} onClick={handleDecode}>
            解码
          </Button>
        </div>

        <div style={surface}>
          <div style={panelHeader}>
            <span style={headerLabel}>结果</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={headerMeta}>{encodedText.length} 字符</span>
              {encodedText && (
                <Button
                  type="text"
                  size="small"
                  icon={copied ? <Check size={13} /> : <Copy size={13} />}
                  onClick={handleCopy}
                  style={{ padding: '0 4px', height: 20 }}
                />
              )}
            </div>
          </div>
          <TextArea
            value={encodedText}
            onChange={(e) => setEncodedText(e.target.value)}
            placeholder="编码 / 解码结果..."
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
      </div>
    </div>
  );
};
