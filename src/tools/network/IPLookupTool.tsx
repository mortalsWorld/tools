import React, { useState } from 'react';
import { Card, Input, Button, Space, message, Table, Alert, Divider, Statistic, Row, Col, Badge } from 'antd';
import { SearchOutlined, ClearOutlined, CopyOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';

const { TextArea } = Input;

// ==================== IP解析引擎 ====================

// IPv4 正则
const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4ToUint32(ipStr: string): number | null {
  const m = ipStr.match(IPV4_REGEX);
  if (!m) return null;
  let result = 0;
  for (let i = 1; i <= 4; i++) {
    const n = parseInt(m[i], 10);
    if (n > 255) return null;
    result = (result * 256 + n) >>> 0;
  }
  return result >>> 0;
}

// IPv6 转 BigInt
function ipv6ToBigInt(ipStr: string): bigint | null {
  try {
    if (!ipStr.includes(':')) return null;
    const cleanIp = ipStr.split('%')[0];
    let parts = cleanIp.split('::');
    let left = parts[0] ? parts[0].split(':') : [];
    let right = parts.length > 1 && parts[1] ? parts[1].split(':') : [];
    if (parts.length > 2) return null;
    const missing = 8 - left.length - right.length;
    if (missing < 0) return null;
    const expanded = [...left, ...Array(missing).fill('0'), ...right];
    if (expanded.length !== 8) return null;
    let result = 0n;
    for (const part of expanded) {
      if (!/^[0-9a-fA-F]{0,4}$/.test(part)) return null;
      const val = parseInt(part || '0', 16);
      result = (result << 16n) | BigInt(val);
    }
    return result;
  } catch { return null; }
}

function isIPv6(str: string): boolean {
  return str.includes(':');
}

// 解析单条记录
interface ParsedRecord {
  type: 'v4-range' | 'v4-cidr' | 'v6-cidr';
  start?: number;
  end?: number;
  base?: bigint | number;
  mask?: bigint | number;
  original: string;
}

interface ParseError {
  lineNo: number;
  content: string;
  reason: string;
}

function parseRecord(rawLine: string): { record: ParsedRecord | null; error: string | null } {
  const line = rawLine.trim().replace(/^["'\s]+|["'\s]+$/g, '');
  if (!line || line.startsWith('#')) return { record: null, error: null };

  // 1. IP 范围
  if (line.includes('-') && !line.includes('/')) {
    const dashIdx = line.indexOf('-');
    const startStr = line.substring(0, dashIdx).trim();
    const endStr = line.substring(dashIdx + 1).trim();

    // 短格式: 192.168.1.0-255
    const shortMatch = startStr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})$/);
    if (shortMatch && /^\d{1,3}$/.test(endStr)) {
      const prefix = shortMatch[1];
      const sLast = parseInt(shortMatch[2], 10);
      const eLast = parseInt(endStr, 10);
      if (sLast > 255 || eLast > 255) return { record: null, error: 'IP范围数值超过255' };
      if (sLast > eLast) return { record: null, error: '范围起始值大于结束值' };
      const startIp = ipv4ToUint32(`${prefix}.${sLast}`);
      const endIp = ipv4ToUint32(`${prefix}.${eLast}`);
      if (startIp !== null && endIp !== null) {
        return { record: { type: 'v4-range', start: startIp, end: endIp, original: line }, error: null };
      }
      return { record: null, error: 'IP范围格式无效' };
    }

    // 完整范围: 192.168.1.0-192.168.1.255
    const startFull = ipv4ToUint32(startStr);
    const endFull = ipv4ToUint32(endStr);
    if (startFull === null && isIPv6(startStr)) return { record: null, error: 'IPv6不支持范围格式，请使用CIDR' };
    if (startFull === null || endFull === null) return { record: null, error: '范围中包含无效的IPv4地址' };
    if (startFull > endFull) return { record: null, error: '范围起始IP大于结束IP' };
    return { record: { type: 'v4-range', start: startFull, end: endFull, original: line }, error: null };
  }

  // 2. CIDR
  if (line.includes('/')) {
    const slashIdx = line.lastIndexOf('/');
    const ipPart = line.substring(0, slashIdx).trim();
    const prefixStr = line.substring(slashIdx + 1).trim();
    const prefixLen = parseInt(prefixStr, 10);

    if (isIPv6(ipPart)) {
      const ip = ipv6ToBigInt(ipPart);
      if (ip === null) return { record: null, error: '无效的IPv6地址' };
      if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 128) return { record: null, error: `IPv6前缀长度无效(${prefixStr})，应为0-128` };
      const mask = prefixLen === 0 ? 0n : ((1n << BigInt(prefixLen)) - 1n) << BigInt(128 - prefixLen);
      return { record: { type: 'v6-cidr', base: ip & mask, mask, original: line }, error: null };
    } else {
      const ip = ipv4ToUint32(ipPart);
      if (ip === null) return { record: null, error: '无效的IPv4地址' };
      if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 32) return { record: null, error: `IPv4前缀长度无效(${prefixStr})，应为0-32` };
      const mask = prefixLen === 0 ? 0 : ((0xFFFFFFFF << (32 - prefixLen)) >>> 0);
      return { record: { type: 'v4-cidr', base: (ip & mask) >>> 0, mask, original: line }, error: null };
    }
  }

  // 3. 单 IP
  if (isIPv6(line)) {
    const ip = ipv6ToBigInt(line);
    if (ip === null) return { record: null, error: '无效的IPv6地址' };
    const mask = (1n << 128n) - 1n;
    return { record: { type: 'v6-cidr', base: ip, mask, original: line }, error: null };
  } else {
    const ip = ipv4ToUint32(line);
    if (ip === null) return { record: null, error: '无效的IPv4地址格式' };
    return { record: { type: 'v4-cidr', base: ip, mask: 0xFFFFFFFF, original: line }, error: null };
  }
}

// 匹配IP
function matchIP(targetIpStr: string, record: ParsedRecord): boolean {
  if (record.type === 'v4-range') {
    const ip = ipv4ToUint32(targetIpStr);
    return ip !== null && ip >= (record.start || 0) && ip <= (record.end || 0);
  }
  if (record.type === 'v4-cidr') {
    const ip = ipv4ToUint32(targetIpStr);
    const mask = record.mask as number;
    const base = record.base as number;
    return ip !== null && ((ip & mask) >>> 0) === base;
  }
  if (record.type === 'v6-cidr') {
    const ip = ipv6ToBigInt(targetIpStr);
    const mask = record.mask as bigint;
    const base = record.base as bigint;
    return ip !== null && (ip & mask) === base;
  }
  return false;
}

// ==================== 组件 ====================

interface MatchResult {
  ip: string;
  status: 'match' | 'miss' | 'invalid';
  matched: string;
}

export const IPLookupTool: React.FC = () => {
  const [ipList, setIpList] = useState('');
  const [subnetList, setSubnetList] = useState('');
  const [results, setResults] = useState<MatchResult[]>([]);
  const [errors, setErrors] = useState<ParseError[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = () => {
    if (!ipList.trim()) {
      message.warning('请输入要查找的IP地址列表');
      return;
    }
    if (!subnetList.trim()) {
      message.warning('请输入子网列表');
      return;
    }

    // 解析子网列表
    const lines = subnetList.split('\n').filter(line => line.trim());
    const parsedRecords: ParsedRecord[] = [];
    const parseErrors: ParseError[] = [];

    lines.forEach((line, i) => {
      const { record, error } = parseRecord(line);
      if (record) {
        parsedRecords.push(record);
      } else if (error) {
        parseErrors.push({ lineNo: i + 1, content: line.trim(), reason: error });
      }
    });

    if (parsedRecords.length === 0) {
      message.error('没有有效的子网记录');
      return;
    }

    // 解析IP列表并匹配
    const ipLines = ipList.split('\n').filter(line => line.trim());
    const matchResults: MatchResult[] = [];

    ipLines.forEach((ipLine) => {
      const rawIp = ipLine.trim().replace(/^["'\s]+|["'\s]+$/g, '');
      if (!rawIp) return;

      let found: string | null = null;
      for (const rec of parsedRecords) {
        if (matchIP(rawIp, rec)) {
          found = rec.original;
          break;
        }
      }

      if (found) {
        matchResults.push({ ip: rawIp, status: 'match', matched: found });
      } else {
        const isValidIPv4 = ipv4ToUint32(rawIp) !== null;
        const isValidIPv6 = isIPv6(rawIp) && ipv6ToBigInt(rawIp) !== null;
        matchResults.push({ ip: rawIp, status: isValidIPv4 || isValidIPv6 ? 'miss' : 'invalid', matched: '-' });
      }
    });

    setResults(matchResults);
    setErrors(parseErrors);
    setHasSearched(true);

    const matchCount = matchResults.filter(r => r.status === 'match').length;
    const missCount = matchResults.filter(r => r.status === 'miss').length;
    const invalidCount = matchResults.filter(r => r.status === 'invalid').length;

    if (matchCount > 0) {
      message.success(`匹配完成：${matchCount}个匹配，${missCount}个未匹配`);
    } else {
      message.info(`匹配完成：${missCount}个未匹配，${invalidCount}个无效`);
    }
  };

  const handleClear = () => {
    setIpList('');
    setSubnetList('');
    setResults([]);
    setErrors([]);
    setHasSearched(false);
  };

  const handleCopyResults = () => {
    const text = results.map(r => `${r.ip}\t${r.status === 'match' ? '匹配' : r.status === 'miss' ? '未匹配' : '无效IP'}\t${r.matched}`).join('\n');
    navigator.clipboard.writeText(text);
    message.success('结果已复制到剪贴板');
  };

  // 统计信息
  const totalCount = results.length;
  const matchCount = results.filter(r => r.status === 'match').length;
  const missCount = results.filter(r => r.status === 'miss').length;
  const invalidCount = results.filter(r => r.status === 'invalid').length;

  const columns = [
    {
      title: '序号',
      dataIndex: 'index',
      key: 'index',
      width: 60,
      render: (_: any, __: any, index: number) => index + 1,
    },
    {
      title: 'IP地址',
      dataIndex: 'ip',
      key: 'ip',
      render: (ip: string) => <code style={{ fontFamily: 'Monaco, Consolas, monospace' }}>{ip}</code>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        if (status === 'match') {
          return <Badge status="success" text={<span style={{ color: '#52c41a', fontWeight: 'bold' }}>匹配</span>} />;
        } else if (status === 'miss') {
          return <Badge status="error" text={<span style={{ color: '#ff4d4f' }}>未匹配</span>} />;
        } else {
          return <Badge status="warning" text={<span style={{ color: '#faad14' }}>无效IP</span>} />;
        }
      },
    },
    {
      title: '匹配的子网',
      dataIndex: 'matched',
      key: 'matched',
      render: (matched: string) => matched === '-' ? '-' : <code style={{ fontFamily: 'Monaco, Consolas, monospace', color: '#1890ff' }}>{matched}</code>,
    },
  ];

  return (
    <div style={{ padding: '16px' }}>
      <Card
        title={
          <span>
            <SearchOutlined style={{ marginRight: '8px' }} />
            IP查找工具（批量匹配）
          </span>
        }
        extra={
          <Space>
            <Button icon={<ClearOutlined />} onClick={handleClear}>
              清空
            </Button>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
              查找匹配
            </Button>
          </Space>
        }
      >
        <Alert
          message="支持格式说明"
          description={
            <div>
              <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                <li><strong>子网格式：</strong></li>
                <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                  <li>CIDR格式：<code>192.168.1.0/24</code>、<code>10.0.0.0/8</code>、<code>::1/128</code></li>
                  <li>范围前缀格式：<code>192.168.1.0-255</code>（起始IP-结束前缀）</li>
                  <li>完整范围格式：<code>192.168.1.0-192.168.1.255</code></li>
                  <li>单IP格式：<code>192.168.1.1</code>、<code>::1</code></li>
                </ul>
                <li><strong>支持IPv4和IPv6</strong></li>
                <li><strong>解析失败的记录会显示在错误面板中</strong></li>
              </ul>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: '16px' }}
        />

        <Row gutter={16}>
          <Col span={12}>
            <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>待查找IP列表（每行一个）</div>
            <TextArea
              value={ipList}
              onChange={(e) => setIpList(e.target.value)}
              placeholder="输入要查找的IP地址，每行一个，例如：&#10;192.168.1.100&#10;10.0.0.50&#10;172.16.0.1"
              autoSize={{ minRows: 6, maxRows: 12 }}
              style={{ 
                fontFamily: "'Monaco', 'Menlo', monospace",
                fontSize: '13px'
              }}
            />
          </Col>
          <Col span={12}>
            <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>子网列表（支持多种格式）</div>
            <TextArea
              value={subnetList}
              onChange={(e) => setSubnetList(e.target.value)}
              placeholder="输入子网或IP范围，每行一个，例如：&#10;192.168.1.0/24&#10;10.0.0.0/8&#10;172.16.0.0-20&#10;192.168.1.0-192.168.1.255"
              autoSize={{ minRows: 6, maxRows: 12 }}
              style={{ 
                fontFamily: "'Monaco', 'Menlo', monospace",
                fontSize: '13px'
              }}
            />
          </Col>
        </Row>

        {/* 错误面板 */}
        {errors.length > 0 && (
          <Alert
            message={<span style={{ fontWeight: 'bold' }}>⚠️ 以下子网记录无法解析，已自动跳过（共{errors.length}条）</span>}
            description={
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {errors.map((err, idx) => (
                  <div key={idx} style={{ 
                    padding: '4px 0', 
                    borderBottom: '1px dashed #f0d0d0',
                    fontSize: '13px',
                    fontFamily: "'Monaco', 'Menlo', monospace"
                  }}>
                    <span style={{ color: '#999', marginRight: '8px' }}>第{err.lineNo}行:</span>
                    <span style={{ background: '#ffeaea', padding: '2px 6px', borderRadius: '4px', marginRight: '8px' }}>
                      {err.content}
                    </span>
                    <span style={{ color: '#c0392b', fontWeight: 'bold' }}>{err.reason}</span>
                  </div>
                ))}
              </div>
            }
            type="error"
            showIcon
            style={{ marginTop: '16px' }}
          />
        )}

        {/* 统计信息 */}
        {hasSearched && results.length > 0 && (
          <>
            <Divider>匹配结果统计</Divider>
            <Row gutter={16} style={{ marginBottom: '16px' }}>
              <Col span={6}>
                <Statistic title="总计" value={totalCount} valueStyle={{ color: '#1890ff' }} />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="匹配" 
                  value={matchCount} 
                  valueStyle={{ color: '#52c41a' }}
                  prefix={<CheckCircleOutlined />}
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="未匹配" 
                  value={missCount} 
                  valueStyle={{ color: '#ff4d4f' }}
                  prefix={<CloseCircleOutlined />}
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title="无效IP" 
                  value={invalidCount} 
                  valueStyle={{ color: '#faad14' }}
                />
              </Col>
            </Row>

            <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold' }}>匹配结果详情</span>
              <Button size="small" icon={<CopyOutlined />} onClick={handleCopyResults}>
                复制结果
              </Button>
            </div>
            <Table
              columns={columns}
              dataSource={results.map((r, idx) => ({ ...r, key: idx }))}
              pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
              size="small"
              scroll={{ y: 400 }}
              style={{ 
                border: '1px solid #f0f0f0',
                borderRadius: '8px'
              }}
            />
          </>
        )}

        {/* 无结果提示 */}
        {hasSearched && results.length === 0 && (
          <Alert
            message="没有找到任何有效的IP地址"
            description="请检查您输入的IP地址列表是否正确"
            type="warning"
            showIcon
            style={{ marginTop: '16px' }}
          />
        )}
      </Card>
    </div>
  );
};
