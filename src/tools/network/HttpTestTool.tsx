import React, { useState, useCallback } from 'react';
import { Card, Input, Select, Button, Table, message, Spin, Tabs, Tag, Tooltip, Empty, Switch, Collapse, Space } from 'antd';
import { SendOutlined, ClockCircleOutlined, DeleteOutlined, PlusOutlined, CopyOutlined, LockOutlined, GlobalOutlined, UploadOutlined, FileOutlined } from '@ant-design/icons';

const { Option } = Select;
const { TabPane } = Tabs;
const { Panel } = Collapse;

interface HeaderItem {
  key: string;
  name: string;
  value: string;
}

interface QueryParamItem {
  key: string;
  name: string;
  value: string;
}

interface UploadFileItem {
  key: string;
  fieldName: string;
  filePath: string;
  fileName: string;
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

type BodyType = 'json' | 'text' | 'form' | 'multipart';
type AuthType = 'none' | 'basic' | 'bearer' | 'apikey';
type ApiKeyLocation = 'header' | 'query';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

export const HttpTestTool: React.FC = () => {
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState<HeaderItem[]>([
    { key: '1', name: 'Content-Type', value: 'application/json' },
  ]);
  const [queryParams, setQueryParams] = useState<QueryParamItem[]>([]);
  const [bodyType, setBodyType] = useState<BodyType>('json');
  const [body, setBody] = useState('');
  const [uploadFiles, setUploadFiles] = useState<UploadFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ResponseData | null>(null);
  const [history, setHistory] = useState<RequestHistory[]>([]);
  const [timeoutMs, setTimeoutMs] = useState(30000);
  const [error, setError] = useState('');

  // 认证相关状态
  const [authType, setAuthType] = useState<AuthType>('none');
  const [basicUsername, setBasicUsername] = useState('');
  const [basicPassword, setBasicPassword] = useState('');
  const [bearerToken, setBearerToken] = useState('');
  const [apiKeyName, setApiKeyName] = useState('X-API-Key');
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [apiKeyLocation, setApiKeyLocation] = useState<ApiKeyLocation>('header');

  // 代理相关状态
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyUrl, setProxyUrl] = useState('');
  const [proxyAuthEnabled, setProxyAuthEnabled] = useState(false);
  const [proxyUsername, setProxyUsername] = useState('');
  const [proxyPassword, setProxyPassword] = useState('');

  const generateKey = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

  // ========== Headers ==========
  const addHeader = () => {
    setHeaders([...headers, { key: generateKey(), name: '', value: '' }]);
  };

  const removeHeader = (key: string) => {
    setHeaders(headers.filter(h => h.key !== key));
  };

  const updateHeader = (key: string, field: 'name' | 'value', value: string) => {
    setHeaders(headers.map(h => h.key === key ? { ...h, [field]: value } : h));
  };

  // ========== Query Params ==========
  const addQueryParam = () => {
    setQueryParams([...queryParams, { key: generateKey(), name: '', value: '' }]);
  };

  const removeQueryParam = (key: string) => {
    setQueryParams(queryParams.filter(p => p.key !== key));
  };

  const updateQueryParam = (key: string, field: 'name' | 'value', value: string) => {
    setQueryParams(queryParams.map(p => p.key === key ? { ...p, [field]: value } : p));
  };

  // ========== Upload Files ==========
  const addUploadFile = async () => {
    try {
      const filePath = await (window as any).electronAPI?.selectFile?.();
      if (filePath) {
        const fileName = filePath.split(/[\\/]/).pop() || 'file';
        setUploadFiles(prev => [...prev, {
          key: generateKey(),
          fieldName: 'file',
          filePath,
          fileName,
        }]);
      }
    } catch (e) {
      console.error('选择文件失败:', e);
    }
  };

  const removeUploadFile = (key: string) => {
    setUploadFiles(uploadFiles.filter(f => f.key !== key));
  };

  const updateFileFieldName = (key: string, fieldName: string) => {
    setUploadFiles(uploadFiles.map(f => f.key === key ? { ...f, fieldName } : f));
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

  const formatQueryParams = (): [string, string][] => {
    return queryParams
      .filter(p => p.name.trim())
      .map(p => [p.name.trim(), p.value.trim()] as [string, string]);
  };

  const getAuthHeaders = (): Record<string, string> => {
    const authHeaders: Record<string, string> = {};

    switch (authType) {
      case 'basic':
        if (basicUsername) {
          const credentials = btoa(`${basicUsername}:${basicPassword}`);
          authHeaders['Authorization'] = `Basic ${credentials}`;
        }
        break;
      case 'bearer':
        if (bearerToken) {
          authHeaders['Authorization'] = `Bearer ${bearerToken}`;
        }
        break;
      case 'apikey':
        if (apiKeyLocation === 'header' && apiKeyName && apiKeyValue) {
          authHeaders[apiKeyName] = apiKeyValue;
        }
        break;
    }

    return authHeaders;
  };

  const getAuthQueryParams = (): URLSearchParams => {
    const params = new URLSearchParams();

    if (authType === 'apikey' && apiKeyLocation === 'query' && apiKeyName && apiKeyValue) {
      params.append(apiKeyName, apiKeyValue);
    }

    return params;
  };

  const getRequestBody = () => {
    if (bodyType === 'form' || bodyType === 'multipart') {
      return body;
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

    // 添加 API Key Query 参数
    const authParams = getAuthQueryParams();
    if (authParams.toString()) {
      requestUrl += (requestUrl.includes('?') ? '&' : '?') + authParams.toString();
    }

    setLoading(true);
    setError('');
    setResponse(null);

    try {
      // 合并请求头
      const requestHeaders: Record<string, string> = {
        ...formatHeaders(),
        ...getAuthHeaders(),
      };

      // 如果是 multipart，移除 Content-Type（让客户端自动设置 boundary）
      if (bodyType === 'multipart') {
        delete requestHeaders['Content-Type'];
        delete requestHeaders['content-type'];
      }

      // 构建文件上传列表
      const files = bodyType === 'multipart' && uploadFiles.length > 0
        ? uploadFiles.map(f => ({
            fieldName: f.fieldName || 'file',
            filePath: f.filePath,
            fileName: f.fileName,
          }))
        : undefined;

      // 构建主进程请求配置
      const mainRequestOptions = {
        url: requestUrl,
        method,
        headers: requestHeaders,
        timeoutMs,
        body: (method !== 'GET' && method !== 'HEAD' && body.trim()) ? getRequestBody() : undefined,
        queryParams: formatQueryParams(),
        files,
        proxy: proxyEnabled && proxyUrl ? {
          url: proxyUrl,
          auth: proxyAuthEnabled && proxyUsername ? { username: proxyUsername, password: proxyPassword } : undefined,
        } : undefined,
      };

      // 通过主进程发起 HTTP 请求，不受 CORS 限制
      const res = await (window as any).electronAPI.httpRequest(mainRequestOptions);

      setResponse({
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
        body: res.body,
        duration: res.duration,
      });

      setHistory(prev => [{
        id: generateKey(),
        method,
        url: requestUrl,
        status: res.status,
        time: new Date().toLocaleString(),
        duration: res.duration,
      }, ...prev].slice(0, 50));

      message.success(`请求成功，状态码 ${res.status}，耗时 ${res.duration}ms`);
    } catch (err: any) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      message.error(`请求失败: ${errorMsg}`);

      setHistory(prev => [{
        id: generateKey(),
        method,
        url: requestUrl,
        status: 0,
        time: new Date().toLocaleString(),
        duration: 0,
      }, ...prev].slice(0, 50));
    } finally {
      setLoading(false);
    }
  }, [method, url, headers, body, bodyType, timeoutMs, authType, basicUsername, basicPassword, bearerToken, apiKeyName, apiKeyValue, apiKeyLocation, proxyEnabled, proxyUrl, proxyAuthEnabled, proxyUsername, proxyPassword, queryParams, uploadFiles]);

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

  const bodyTypeLabel = {
    json: 'JSON',
    text: '文本',
    form: '表单',
    multipart: 'Multipart',
  };

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

      <Collapse defaultActiveKey={['query', 'headers', 'auth', 'proxy']} ghost style={{ marginBottom: '16px' }}>
        {/* Query 参数 */}
        <Panel header="Query 参数" key="query">
          <Table
            dataSource={queryParams}
            pagination={false}
            rowKey="key"
            size="small"
            bordered={false}
            footer={() => (
              <Button type="dashed" icon={<PlusOutlined />} onClick={addQueryParam}>
                添加参数
              </Button>
            )}
          >
            <Table.Column
              title="名称"
              dataIndex="name"
              render={(text, record: any) => (
                <Input
                  value={text}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateQueryParam(record.key, 'name', e.target.value)}
                  placeholder="参数名"
                  style={{ width: '100%' }}
                />
              )}
            />
            <Table.Column
              title="值"
              dataIndex="value"
              render={(text, record: any) => (
                <Input
                  value={text}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateQueryParam(record.key, 'value', e.target.value)}
                  placeholder="参数值"
                  style={{ width: '100%' }}
                />
              )}
            />
            <Table.Column
              title="操作"
              render={(_, record: any) => (
                <Tooltip title="删除">
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeQueryParam(record.key)}
                  />
                </Tooltip>
              )}
            />
          </Table>
        </Panel>

        <Panel header="请求头" key="headers">
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
              render={(text, record: any) => (
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
              render={(text, record: any) => (
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
              render={(_, record: any) => (
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
        </Panel>

        <Panel
          header={
            <span>
              <LockOutlined style={{ marginRight: '8px' }} />
              认证
            </span>
          }
          key="auth"
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <span style={{ width: '80px' }}>认证类型：</span>
              <Select
                value={authType}
                onChange={(v) => setAuthType(v as AuthType)}
                style={{ width: '200px' }}
              >
                <Option value="none">无</Option>
                <Option value="basic">Basic Auth</Option>
                <Option value="bearer">Bearer Token</Option>
                <Option value="apikey">API Key</Option>
              </Select>
            </div>

            {authType === 'basic' && (
              <Space direction="horizontal" size="middle">
                <Input
                  placeholder="用户名"
                  value={basicUsername}
                  onChange={(e) => setBasicUsername(e.target.value)}
                  style={{ width: '200px' }}
                />
                <Input.Password
                  placeholder="密码"
                  value={basicPassword}
                  onChange={(e) => setBasicPassword(e.target.value)}
                  style={{ width: '200px' }}
                />
              </Space>
            )}

            {authType === 'bearer' && (
              <Input.Password
                placeholder="输入 Bearer Token"
                value={bearerToken}
                onChange={(e) => setBearerToken(e.target.value)}
                style={{ width: '400px' }}
              />
            )}

            {authType === 'apikey' && (
              <Space direction="horizontal" size="middle">
                <Input
                  placeholder="Key 名称，如 X-API-Key"
                  value={apiKeyName}
                  onChange={(e) => setApiKeyName(e.target.value)}
                  style={{ width: '180px' }}
                />
                <Input.Password
                  placeholder="API Key 值"
                  value={apiKeyValue}
                  onChange={(e) => setApiKeyValue(e.target.value)}
                  style={{ width: '200px' }}
                />
                <Select
                  value={apiKeyLocation}
                  onChange={(v) => setApiKeyLocation(v)}
                  style={{ width: '100px' }}
                >
                  <Option value="header">Header</Option>
                  <Option value="query">Query</Option>
                </Select>
              </Space>
            )}
          </Space>
        </Panel>

        <Panel
          header={
            <span>
              <GlobalOutlined style={{ marginRight: '8px' }} />
              代理设置
            </span>
          }
          key="proxy"
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <span style={{ width: '80px' }}>启用代理：</span>
              <Switch checked={proxyEnabled} onChange={setProxyEnabled} />
            </div>

            {proxyEnabled && (
              <>
                <Input
                  placeholder="代理地址，如 http://127.0.0.1:7890"
                  value={proxyUrl}
                  onChange={(e) => setProxyUrl(e.target.value)}
                  style={{ width: '400px' }}
                />

                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <span style={{ width: '80px' }}>代理认证：</span>
                  <Switch checked={proxyAuthEnabled} onChange={setProxyAuthEnabled} />
                </div>

                {proxyAuthEnabled && (
                  <Space direction="horizontal" size="middle">
                    <Input
                      placeholder="代理用户名"
                      value={proxyUsername}
                      onChange={(e) => setProxyUsername(e.target.value)}
                      style={{ width: '180px' }}
                    />
                    <Input.Password
                      placeholder="代理密码"
                      value={proxyPassword}
                      onChange={(e) => setProxyPassword(e.target.value)}
                      style={{ width: '180px' }}
                    />
                  </Space>
                )}

                <div style={{ color: '#999', fontSize: '12px' }}>
                  提示：浏览器环境下使用代理可能受 CORS 限制，实际代理功能需要在主进程中实现
                </div>
              </>
            )}
          </Space>
        </Panel>
      </Collapse>

      {/* 请求体 */}
      <Card
        title={`请求体 (${bodyTypeLabel[bodyType]})`}
        style={{ marginBottom: '16px' }}
        extra={
          <Select
            value={bodyType}
            onChange={(v) => setBodyType(v as BodyType)}
            size="small"
          >
            <Option value="json">JSON</Option>
            <Option value="form">表单</Option>
            <Option value="text">文本</Option>
            <Option value="multipart">文件上传</Option>
          </Select>
        }
      >
        {bodyType === 'multipart' ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Table
              dataSource={uploadFiles}
              pagination={false}
              rowKey="key"
              size="small"
              bordered={false}
              footer={() => (
                <Button type="dashed" icon={<UploadOutlined />} onClick={addUploadFile}>
                  添加文件
                </Button>
              )}
            >
              <Table.Column
                title="字段名"
                dataIndex="fieldName"
                render={(text, record: any) => (
                  <Input
                    value={text}
                    onChange={(e) => updateFileFieldName(record.key, e.target.value)}
                    placeholder="字段名"
                    style={{ width: '100%' }}
                  />
                )}
              />
              <Table.Column
                title="文件名"
                dataIndex="fileName"
                render={(text) => (
                  <span><FileOutlined style={{ marginRight: 4 }} />{text}</span>
                )}
              />
              <Table.Column
                title="操作"
                render={(_, record: any) => (
                  <Tooltip title="删除">
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeUploadFile(record.key)}
                    />
                  </Tooltip>
                )}
              />
            </Table>

            <Input.TextArea
              value={body}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
              placeholder="附加表单字段（可选）&#10;key1=value1&#10;key2=value2"
              rows={4}
              style={{ fontFamily: 'monospace, monospace', fontSize: '13px' }}
              autoSize={{ minRows: 4, maxRows: 8 }}
            />
            <div style={{ color: '#999', fontSize: '12px' }}>
              提示：Multipart 模式下，附加字段会作为普通表单字段随文件一起上传
            </div>
          </Space>
        ) : (
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
            rows={6}
            style={{ fontFamily: 'monospace, monospace', fontSize: '13px' }}
            autoSize={{ minRows: 6, maxRows: 16 }}
            disabled={method === 'GET' || method === 'HEAD'}
          />
        )}
        {method === 'GET' || method === 'HEAD' ? (
          <div style={{ marginTop: '8px', color: '#999', fontSize: '12px' }}>
            GET/HEAD 请求不支持请求体
          </div>
        ) : null}
      </Card>

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
