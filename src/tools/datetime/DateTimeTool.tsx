import React, { useState, useEffect } from 'react';
import { Input, Button, Segmented, message, theme } from 'antd';
import { Clock, Copy, ArrowRight, ArrowLeft, CircleAlert } from 'lucide-react';
import { motion } from 'framer-motion';

const MONO = "'JetBrains Mono', 'Cascadia Code', Monaco, Consolas, monospace";

export const DateTimeTool: React.FC = () => {
  const [timestamp, setTimestamp] = useState<string>('');
  const [timestampUnit, setTimestampUnit] = useState<'s' | 'ms'>('ms');
  const [dateString, setDateString] = useState('');
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [tsError, setTsError] = useState('');
  const [dateError, setDateError] = useState('');
  const { token } = theme.useToken();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (date: Date, includeMs: boolean): string => {
    const base = date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    if (includeMs) {
      const ms = date.getMilliseconds().toString().padStart(3, '0');
      return `${base}.${ms}`;
    }
    return base;
  };

  const timestampToDate = () => {
    try {
      let ts = parseInt(timestamp);
      if (isNaN(ts)) {
        throw new Error('Invalid timestamp');
      }
      if (timestampUnit === 's') {
        ts *= 1000;
      }
      const date = new Date(ts);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid timestamp');
      }
      setDateString(formatDate(date, timestampUnit === 'ms'));
      setTsError('');
      message.success('转换成功');
    } catch {
      setTsError('时间戳格式错误');
      message.error('时间戳格式错误');
    }
  };

  const dateToTimestamp = () => {
    try {
      const msMatch = dateString.match(/\.(\d{1,3})$/);
      const cleanDateStr = msMatch ? dateString.substring(0, dateString.length - msMatch[0].length) : dateString;
      const date = new Date(cleanDateStr);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date');
      }
      if (msMatch) {
        const ms = parseInt(msMatch[1].padEnd(3, '0'), 10);
        date.setMilliseconds(ms);
      }
      let ts = date.getTime();
      if (timestampUnit === 's') {
        ts = Math.floor(ts / 1000);
      }
      setTimestamp(ts.toString());
      setDateError('');
      message.success('转换成功');
    } catch {
      setDateError('日期格式错误');
      message.error('日期格式错误');
    }
  };

  const copyValue = (value: string) => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    message.success('已复制到剪贴板');
  };

  const useCurrentTime = () => {
    const tsMs = currentTime;
    const ts = timestampUnit === 's' ? Math.floor(tsMs / 1000) : tsMs;
    setTimestamp(ts.toString());
    setDateString(formatDate(new Date(tsMs), timestampUnit === 'ms'));
    setTsError('');
    setDateError('');
    message.success('已获取当前时间');
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: token.colorTextTertiary,
    letterSpacing: '0.02em',
  };

  const fieldLabel: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontSize: 12,
    color: token.colorTextSecondary,
  };

  const errorRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    fontSize: 12,
    color: token.colorError,
  };

  const cardStyle: React.CSSProperties = {
    background: token.colorBgElevated,
    border: `1px solid ${token.colorBorderSecondary}`,
    borderRadius: 10,
    padding: 20,
    minWidth: 0,
  };

  const copyRows = [
    { label: '时间戳 (ms)', value: currentTime.toString() },
    { label: '时间戳 (s)', value: Math.floor(currentTime / 1000).toString() },
    { label: 'ISO 8601', value: new Date(currentTime).toISOString() },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
      <style>{`
.dt-row { transition: background 0.15s ease; }
.dt-row:hover { background: ${token.colorBgLayout}; }
`}</style>

      <div style={{ ...cardStyle, borderLeft: `3px solid ${token.colorPrimary}` }}>
        <div style={sectionLabel}>当前时间</div>
        <div style={{
          margin: '8px 0 16px',
          fontFamily: MONO,
          fontSize: 30,
          letterSpacing: '-0.02em',
          color: token.colorText,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {formatDate(new Date(currentTime), false)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {copyRows.map((row) => (
            <div
              key={row.label}
              className="dt-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                borderRadius: 6,
              }}
            >
              <span style={{ fontSize: 12, color: token.colorTextTertiary, width: 96, flexShrink: 0 }}>
                {row.label}
              </span>
              <span style={{
                flex: 1,
                minWidth: 0,
                fontFamily: MONO,
                fontSize: 12,
                color: token.colorText,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {row.value}
              </span>
              <Button
                type="text"
                size="small"
                icon={<Copy size={13} />}
                onClick={() => copyValue(row.value)}
                style={{ padding: '0 4px', height: 20, flexShrink: 0 }}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 16 }}>
          <span style={sectionLabel}>转换</span>
          <Segmented
            size="small"
            value={timestampUnit}
            onChange={(v) => setTimestampUnit(v as 's' | 'ms')}
            options={[
              { label: '毫秒', value: 'ms' },
              { label: '秒', value: 's' },
            ]}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <span style={fieldLabel}>时间戳</span>
          <Input
            value={timestamp}
            onChange={(e) => { setTimestamp(e.target.value); setTsError(''); }}
            placeholder="请输入时间戳"
            style={{ fontFamily: MONO, fontSize: 13 }}
            suffix={
              <Button
                type="text"
                size="small"
                icon={<Clock size={13} />}
                onClick={useCurrentTime}
                style={{ padding: '0 4px', height: 18 }}
              />
            }
          />
          {tsError && (
            <div style={errorRow}>
              <CircleAlert size={14} />
              <span>{tsError}</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <motion.div whileTap={{ scale: 0.97 }} style={{ display: 'inline-flex' }}>
            <Button type="primary" icon={<ArrowRight size={14} />} iconPosition="end" onClick={timestampToDate}>
              时间戳 → 日期
            </Button>
          </motion.div>
          <Button icon={<ArrowLeft size={14} />} onClick={dateToTimestamp}>
            日期 → 时间戳
          </Button>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={fieldLabel}>日期</span>
            <Button
              type="text"
              size="small"
              icon={<Copy size={13} />}
              onClick={() => copyValue(dateString)}
              disabled={!dateString}
              style={{ padding: '0 4px', height: 20 }}
            />
          </div>
          <Input
            value={dateString}
            onChange={(e) => { setDateString(e.target.value); setDateError(''); }}
            placeholder="2024/01/01 12:00:00.000"
            style={{ fontFamily: MONO, fontSize: 13 }}
          />
          {dateError && (
            <div style={errorRow}>
              <CircleAlert size={14} />
              <span>{dateError}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
