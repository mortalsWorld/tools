import React, { useState, useEffect } from 'react';
import { Input, Button, Segmented, message, theme } from 'antd';
import { Clock, CalendarClock, Copy, ArrowRight, ArrowLeft, CircleAlert } from 'lucide-react';
import { motion } from 'framer-motion';

const MONO = "'JetBrains Mono', 'Cascadia Code', Monaco, Consolas, monospace";

const pad = (n: number, l = 2) => String(n).padStart(l, '0');

/** 本地时区 ISO 8601，与页面展示的本地时间保持一致 */
const toLocalISO = (ms: number): string => {
  const d = new Date(ms);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `.${pad(d.getMilliseconds(), 3)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
};

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

  const now = new Date(currentTime);

  const copyRows = [
    { label: '时间戳 (ms)', value: currentTime.toString() },
    { label: '时间戳 (s)', value: Math.floor(currentTime / 1000).toString() },
    { label: 'ISO 8601', value: toLocalISO(currentTime) },
  ];

  const cardStyle: React.CSSProperties = {
    background: token.colorBgElevated,
    border: `1px solid ${token.colorBorderSecondary}`,
    borderRadius: 12,
    padding: 20,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  };

  const iconBadgeStyle: React.CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: token.colorPrimaryBg,
    color: token.colorPrimary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };

  const fieldLabel: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: token.colorTextTertiary,
    letterSpacing: '0.02em',
  };

  const errorRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    fontSize: 12,
    color: token.colorError,
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'stretch', minHeight: '100%' }}>
      <style>{`
@keyframes dt-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.8); }
}
.dt-row { transition: background 0.15s ease; }
.dt-row:hover { background: ${token.colorBgLayout}; }
.dt-row:hover .dt-copy { opacity: 1; }
.dt-copy { opacity: 0.45; transition: opacity 0.15s ease; }
`}</style>

      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={iconBadgeStyle}>
            <Clock size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: token.colorText }}>当前时间</div>
            <div style={{ fontSize: 12, color: token.colorTextTertiary, marginTop: 1 }}>实时更新 · 本地时区</div>
          </div>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '2px 10px',
            borderRadius: 999,
            fontSize: 12,
            background: token.colorSuccessBg,
            color: token.colorSuccess,
          }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: token.colorSuccess,
              animation: 'dt-pulse 2s ease-in-out infinite',
            }} />
            实时
          </span>
        </div>

        <div style={{ padding: '4px 0 2px' }}>
          <div style={{
            fontFamily: MONO,
            fontSize: 36,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
            color: token.colorText,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.2,
          }}>
            {formatDate(now, false).slice(5)}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: token.colorTextSecondary }}>
            {now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, margin: '2px 0' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {copyRows.map((row) => (
            <div
              key={row.label}
              className="dt-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 10px',
                borderRadius: 8,
              }}
            >
              <span style={{ fontSize: 12, color: token.colorTextTertiary, flexShrink: 0 }}>
                {row.label}
              </span>
              <span style={{
                flex: 1,
                minWidth: 0,
                textAlign: 'right',
                fontFamily: MONO,
                fontSize: 13,
                fontVariantNumeric: 'tabular-nums',
                color: token.colorText,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {row.value}
              </span>
              <Button
                className="dt-copy"
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={iconBadgeStyle}>
            <CalendarClock size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: token.colorText }}>时间戳转换</div>
            <div style={{ fontSize: 12, color: token.colorTextTertiary, marginTop: 1 }}>双向转换 · 毫秒 / 秒</div>
          </div>
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

        <div>
          <span style={{ ...fieldLabel, display: 'block', marginBottom: 6 }}>时间戳</span>
          <Input
            value={timestamp}
            onChange={(e) => { setTimestamp(e.target.value); setTsError(''); }}
            placeholder="请输入时间戳"
            status={tsError ? 'error' : undefined}
            style={{ fontFamily: MONO, fontSize: 13 }}
            suffix={
              <Button
                type="text"
                size="small"
                icon={<Clock size={13} />}
                onClick={useCurrentTime}
                title="填入当前时间"
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

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <motion.div whileTap={{ scale: 0.97 }} style={{ display: 'inline-flex', flex: 1, minWidth: 140 }}>
            <Button
              type="primary"
              block
              icon={<ArrowRight size={14} />}
              iconPosition="end"
              onClick={timestampToDate}
            >
              时间戳 → 日期
            </Button>
          </motion.div>
          <motion.div whileTap={{ scale: 0.97 }} style={{ display: 'inline-flex', flex: 1, minWidth: 140 }}>
            <Button
              block
              icon={<ArrowLeft size={14} />}
              onClick={dateToTimestamp}
            >
              日期 → 时间戳
            </Button>
          </motion.div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={fieldLabel}>日期</span>
            <Button
              className="dt-copy"
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
            status={dateError ? 'error' : undefined}
            style={{ fontFamily: MONO, fontSize: 13 }}
          />
          {dateError && (
            <div style={errorRow}>
              <CircleAlert size={14} />
              <span>{dateError}</span>
            </div>
          )}
        </div>

        <div style={{
          marginTop: 'auto',
          paddingTop: 10,
          borderTop: `1px dashed ${token.colorBorderSecondary}`,
          fontSize: 12,
          color: token.colorTextTertiary,
          lineHeight: 1.6,
        }}>
          支持毫秒 / 秒级时间戳；日期支持「2024/01/01 12:00:00.000」格式，含毫秒可自动解析
        </div>
      </div>
    </div>
  );
};
