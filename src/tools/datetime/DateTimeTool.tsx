import React, { useState, useEffect } from 'react';
import { Card, Input, Button, Select, Space, message, Descriptions } from 'antd';
import { ClockCircleOutlined, CopyOutlined, SwapOutlined } from '@ant-design/icons';

const { Option } = Select;

export const DateTimeTool: React.FC = () => {
  const [timestamp, setTimestamp] = useState<string>('');
  const [timestampUnit, setTimestampUnit] = useState<'s' | 'ms'>('ms');
  const [dateString, setDateString] = useState('');
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const timestampToDate = () => {
    try {
      let ts = parseInt(timestamp);
      if (timestampUnit === 's') {
        ts *= 1000;
      }
      const date = new Date(ts);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid timestamp');
      }
      setDateString(date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }));
      message.success('转换成功');
    } catch (e) {
      message.error('时间戳格式错误');
    }
  };

  const dateToTimestamp = () => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date');
      }
      let ts = date.getTime();
      if (timestampUnit === 's') {
        ts = Math.floor(ts / 1000);
      }
      setTimestamp(ts.toString());
      message.success('转换成功');
    } catch (e) {
      message.error('日期格式错误');
    }
  };

  const copyTimestamp = () => {
    navigator.clipboard.writeText(timestamp);
    message.success('已复制到剪贴板');
  };

  const copyDate = () => {
    navigator.clipboard.writeText(dateString);
    message.success('已复制到剪贴板');
  };

  const useCurrentTime = () => {
    let ts = currentTime;
    if (timestampUnit === 's') {
      ts = Math.floor(ts / 1000);
    }
    setTimestamp(ts.toString());
    timestampToDate();
  };

  return (
    <Card title="时间日期转换">
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Card size="small" title="当前时间">
          <Descriptions bordered column={2}>
            <Descriptions.Item label="时间戳 (ms)">
              {currentTime}
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => {
                  navigator.clipboard.writeText(currentTime.toString());
                  message.success('已复制');
                }}
              />
            </Descriptions.Item>
            <Descriptions.Item label="时间戳 (s)">
              {Math.floor(currentTime / 1000)}
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => {
                  navigator.clipboard.writeText(Math.floor(currentTime / 1000).toString());
                  message.success('已复制');
                }}
              />
            </Descriptions.Item>
            <Descriptions.Item label="当前日期" span={2}>
              {new Date(currentTime).toLocaleString('zh-CN')}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <div>
          <div style={{ marginBottom: 8 }}>
            时间戳:
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={copyTimestamp}
              style={{ marginLeft: 8 }}
            >
              复制
            </Button>
            <Button
              type="text"
              size="small"
              icon={<ClockCircleOutlined />}
              onClick={useCurrentTime}
              style={{ marginLeft: 8 }}
            >
              当前时间
            </Button>
          </div>
          <Space style={{ width: '100%' }}>
            <Input
              value={timestamp}
              onChange={(e) => setTimestamp(e.target.value)}
              placeholder="请输入时间戳"
              style={{ flex: 1 }}
            />
            <Select
              value={timestampUnit}
              onChange={setTimestampUnit}
              style={{ width: 100 }}
            >
              <Option value="ms">毫秒</Option>
              <Option value="s">秒</Option>
            </Select>
          </Space>
        </div>

        <Space>
          <Button type="primary" icon={<SwapOutlined />} onClick={timestampToDate}>
            时间戳 → 日期
          </Button>
          <Button icon={<SwapOutlined />} onClick={dateToTimestamp}>
            日期 → 时间戳
          </Button>
        </Space>

        <div>
          <div style={{ marginBottom: 8 }}>
            日期:
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={copyDate}
              style={{ marginLeft: 8 }}
            >
              复制
            </Button>
          </div>
          <Input
            value={dateString}
            onChange={(e) => setDateString(e.target.value)}
            placeholder="如: 2024/01/01 12:00:00"
          />
        </div>
      </Space>
    </Card>
  );
};
