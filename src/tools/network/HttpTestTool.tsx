import React, { useState, useCallback } from 'react';
import { Card, Input, Select, Button, Table, message, Spin, Tabs, Tag, Tooltip, Empty } from 'antd';
import { SendOutlined, ClockCircleOutlined, DeleteOutlined, PlusOutlined, CopyOutlined } from '@ant-design/icons';

const { Option } = Select;
const { TabPane } = Tabs;

interface HeaderItem {
  key: string;
  name: string;
  value: string;
}

interface RequestHistory {
  id: string;
  method: string;
  url: string;
  status: number;
  time: string;
  duration: number;
}

interface ResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
}

type BodyType = 'json' | 'text' | 'form';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

export const HttpTestTool: React.FC = () => {
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState<HeaderItem[]>([
    { key: '1', name: 'Content-Type', value: 'application/json' },
  ]);
  const [bodyType, setBodyType] = useState<BodyType>('json');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ResponseData | null>(null);
  const [history, setHistory] = useState<RequestHistory[]>([]);
  const [timeoutMs, setTimeoutMs] = useState(30000);
  const [error, setError] = useState('');

  const generateKey = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

  const addHeader = () => {
    setHeaders([...headers, { key: generateKey(), name: '', value: '' }]);
  };

  const removeHeader = (key: string) => {
    setHeaders(headers.filter(h => h.key !== key));
  };

  const updateHeader = (key: string, field: 'name' | 'value', value: string) => {
    setHeaders(headers.map(h => h.key === key ? { ...h, [field]: value } : h));
  };

  const formatHeaders = () => {
    const result: Record<string, string> = {};
    headers.forEach(h => {
      if (h.name.trim()) {
        result[h.name.trim()] = h.value.trim();
      }
    });
    return result;
  };

  const parseFormBody = () => {
    try {
      const pairs = body.split('\n');
      const formData = new URLSearchParams();
      pairs.forEach(pair => {
        const [key, ...valueParts] = pair.split('=');
        if (key) {
          formData.append(key.trim(), valueParts.join('=').trim());
        }
      });
      return formData;
    } catch {
      return body;
    }
  };

  const getRequestBody = () => {
    if (bodyType === 'form') {
      return parseFormBody();
    }
    if (bodyType === 'json') {
      try {
        JSON.parse(body);
        return body;
      } catch {
        return body;
      }
    }
    return body;
  };

  const sendRequest = useCallback(async () => {
    if (!url.trim()) {
      message.warning('请输入URL');
      return;
    }

    let requestUrl = url.trim();
    if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
      requestUrl = 'https://' + requestUrl;
    }

    setLoading(true);
    setError('');
    setResponse(null);

    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

      const options: RequestInit = {
        method,
        headers: formatHeaders(),
        signal: controller.signal,
      };

      if (method !== 'GET' && method !== 'HEAD' && body.trim()) {
        options.body = getRequestBody();
      }

      const res = await fetch(requestUrl, options);

      window.clearTimeout(timeoutId);

      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      let responseBody = '';
      try {
        const text = await res.text();
        try {
          const parsed = JSON.parse(text);
          responseBody = JSON.stringify(parsed, null, 2);
        } catch {
          responseBody = text;
        }
      } catch {
        responseBody = '无法解析响应体';
      }

      const duration = Date.now() - startTime;

      setResponse({
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
        body: responseBody,
        duration,
      });

      setHistory(prev => [{
        id: generateKey(),
        method,
        url: requestUrl,
        status: res.status,
        time: new Date().toLocaleString(),
        duration,
      }, ...prev].slice(0, 50));

      message.success(`请求成功，耗时 ${duration}ms`);
    } catch (err: any) {
      const duration = Date.now() - startTime;

      if (err.name === 'AbortError') {
        setError('请求超时');
        message.error('请求超时');
      } else if (err.name === 'TypeError') {
        setError(`网络错误: ${err.message}`);
        message.error('网络错误，请检查网络连接');
      } else {
        setError(`请求失败: ${err.message}`);
        message.error('请求失败');
      }

      setHistory(prev => [{
        id: generateKey(),
        method,
        url: requestUrl,
        status: 0,
        time: new Date().toLocaleString(),
        duration,
      }, ...prev].slice(0, 50));
    } finally {
      setLoading(false);
    }
  }, [method, url, headers, body, bodyType, timeoutMs]);

  const useHistoryItem = (item: RequestHistory) => {
    setMethod(item.method);
    setUrl(item.url);
  };

  const clearHistory = () => {
    setHistory([]);
    message.success('历史记录已清空');
  };

  const copyResponse = () => {
    if (response?.body) {
      navigator.clipboard.writeText(response.body);
      message.success('响应体已复制');
    }
  };

  const isSuccess = response !== null && response.status >= 200 && response.status < 300;

  return (
    <div style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Card title="HTTP 请求测试" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Select
            value={method}
            onChange={setMethod}
            style={{ width: '120px' }}
            size="large"
          >
            {HTTP_METHODS.map(m => (
              <Option key={m} value={m}>{m}</Option>
            ))}
          </Select>

          <Input
            value={url}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
            placeholder="请输入 URL，如: https://api.example.com/users"
            size="large"
            style={{ flex: 1, minWidth: '300px' }}
            onPressEnter={sendRequest}
          />

          <Select
            value={timeoutMs}
            onChange={setTimeoutMs}
            style={{ width: '120px' }}
            size="large"
          >
            <Option value={10000}>10秒</Option>
            <Option value={30000}>30秒</Option>
            <Option value={60000}>60秒</Option>
          </Select>

          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={sendRequest}
            loading={loading}
            size="large"
          >
            发送
          </Button>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: '16px', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Card title="请求头" style={{ marginBottom: '16px', flex: 0.3 }}>
            <Table
              dataSource={headers}
              pagination={false}
              rowKey="key"
              size="small"
              bordered={false}
              footer={() => (
                <Button type="dashed" icon={<PlusOutlined />} onClick={addHeader}>
                  添加请求头
                </Button>
              )}
            >
              <Table.Column
                title="名称"
                dataIndex="name"
                render={(text, record) => (
                  <Input
                    value={text}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateHeader(record.key, 'name', e.target.value)}
                    placeholder="Header 名称"
                    style={{ width: '100%' }}
                  />
                )}
              />
              <Table.Column
                title="值"
                dataIndex="value"
                render={(text, record) => (
                  <Input
                    value={text}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateHeader(record.key, 'value', e.target.value)}
                    placeholder="Header 值"
                    style={{ width: '100%' }}
                  />
                )}
              />
              <Table.Column
                title="操作"
                render={(_, record) => (
                  <Tooltip title="删除">
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeHeader(record.key)}
                    />
                  </Tooltip>
                )}
              />
            </Table>
          </Card>

          <Card
            title={`请求体 (${bodyType === 'json' ? 'JSON' : bodyType === 'form' ? '表单' : '文本'})`}
            style={{ flex: 0.7 }}
            extra={
              <Select
                value={bodyType}
                onChange={(v) => setBodyType(v as BodyType)}
                size="small"
              >
                <Option value="json">JSON</Option>
                <Option value="form">表单</Option>
                <Option value="text">文本</Option>
              </Select>
            }
          >
            <Input.TextArea
              value={body}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
              placeholder={
                bodyType === 'json'
                  ? '{"key": "value"}'
                  : bodyType === 'form'
                  ? 'key1=value1\nkey2=value2'
                  : '请输入请求体内容'
              }
              rows={8}
              style={{ fontFamily: 'monospace, monospace', fontSize: '13px' }}
              autoSize={{ minRows: 8, maxRows: 20 }}
              disabled={method === 'GET' || method === 'HEAD'}
            />
            {method === 'GET' || method === 'HEAD' ? (
              <div style={{ marginTop: '8px', color: '#999', fontSize: '12px' }}>
                GET/HEAD 请求不支持请求体
              </div>
            ) : null}
          </Card>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Card
            title={
              response ? (
                <span>
                  响应
                  <Tag color={isSuccess ? 'green' : 'red'} style={{ marginLeft: '8px' }}>
                    {response.status} {response.statusText}
                  </Tag>
                  <span style={{ marginLeft: '8px', color: '#999' }}>
                    <ClockCircleOutlined /> {response.duration}ms
                  </span>
                </span>
              ) : (
                <span>响应</span>
              )
            }
            style={{ flex: 1 }}
            extra={
              response?.body ? (
                <Button type="text" icon={<CopyOutlined />} onClick={copyResponse}>
                  复制
                </Button>
              ) : null
            }
          >
            <Spin spinning={loading}>
              {error ? (
                <div style={{ color: '#ff4d4f', padding: '16px' }}>{error}</div>
              ) : response ? (
                <Tabs defaultActiveKey="body" style={{ height: '100%' }}>
                  <TabPane tab="响应头" key="headers">
                    <Table
                      dataSource={Object.entries(response.headers).map(([key, value], index) => ({
                        key: index,
                        name: key,
                        value,
                      }))}
                      pagination={false}
                      size="small"
                      rowKey="key"
                    >
                      <Table.Column title="名称" dataIndex="name" />
                      <Table.Column title="值" dataIndex="value" />
                    </Table>
                  </TabPane>
                  <TabPane tab="响应体" key="body">
                    <Input.TextArea
                      value={response.body}
                      readOnly
                      rows={12}
                      style={{ fontFamily: 'monospace, monospace', fontSize: '13px' }}
                      autoSize={{ minRows: 12, maxRows: 30 }}
                    />
                  </TabPane>
                </Tabs>
              ) : (
                <Empty description="发送请求后显示响应结果" />
              )}
            </Spin>
          </Card>
        </div>
      </div>

      {history.length > 0 && (
        <Card title="请求历史" style={{ marginTop: '16px' }} extra={
          <Button type="text" danger icon={<DeleteOutlined />} onClick={clearHistory}>
            清空
          </Button>
        }>
          <Table
            dataSource={history}
            pagination={{ pageSize: 10 }}
            size="small"
            rowKey="id"
            onRow={(record) => ({
              onClick: () => useHistoryItem(record),
            })}
          >
            <Table.Column
              title="方法"
              dataIndex="method"
              render={(text) => (
                <Tag color={text === 'GET' ? 'blue' : text === 'POST' ? 'green' : 'orange'}>
                  {text}
                </Tag>
              )}
            />
            <Table.Column
              title="URL"
              dataIndex="url"
              ellipsis
              width={300}
            />
            <Table.Column
              title="状态码"
              dataIndex="status"
              render={(text) => (
                <Tag color={text >= 200 && text < 300 ? 'green' : text >= 300 && text < 400 ? 'orange' : 'red'}>
                  {text || '错误'}
                </Tag>
              )}
            />
            <Table.Column
              title="耗时"
              dataIndex="duration"
              render={(text) => `${text}ms`}
            />
            <Table.Column
              title="时间"
              dataIndex="time"
            />
          </Table>
        </Card>
      )}
    </div>
  );
};