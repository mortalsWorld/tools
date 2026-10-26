import React, { useState, useMemo } from 'react';
import { Card, Input, Button, Space, message, Table, Alert, Divider, Statistic, Row, Col, Badge, Tag, theme, Select } from 'antd';
import { Search, Eraser, Copy, Download, CircleCheck, CircleX, ListFilter } from 'lucide-react';

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

// 将解析记录转为统一的 start/end 范围
function getRange(rec: ParsedRecord): { start: number | bigint; end: number | bigint } | null {
  if (rec.type === 'v4-range') {
    return { start: rec.start!, end: rec.end! };
  }
  if (rec.type === 'v4-cidr') {
    const base = rec.base as number;
    const mask = rec.mask as number;
    const end = (base | (~mask >>> 0)) >>> 0;
    return { start: base, end };
  }
  if (rec.type === 'v6-cidr') {
    const base = rec.base as bigint;
    const mask = rec.mask as bigint;
    const max128 = (1n << 128n) - 1n;
    const wildcard = (~mask) & max128;
    const end = base | wildcard;
    return { start: base, end };
  }
  return null;
}

// 匹配关系类型
type MatchRelation = 'exact' | 'contained' | 'contains' | 'overlap';

const RELATION_LABELS: Record<MatchRelation, { text: string; color: string }> = {
  exact: { text: '完全相同', color: 'purple' },
  contained: { text: '被包含', color: 'processing' },
  contains: { text: '包含', color: 'success' },
  overlap: { text: '范围重叠', color: 'warning' },
};

// 两个解析记录的匹配关系
function matchRelation(a: ParsedRecord, b: ParsedRecord): MatchRelation | null {
  const aIsV6 = a.type === 'v6-cidr';
  const bIsV6 = b.type === 'v6-cidr';
  if (aIsV6 !== bIsV6) return null;

  const ra = getRange(a);
  const rb = getRange(b);
  if (!ra || !rb) return null;

  const aStart = typeof ra.start === 'bigint' ? ra.start : BigInt(ra.start);
  const aEnd = typeof ra.end === 'bigint' ? ra.end : BigInt(ra.end);
  const bStart = typeof rb.start === 'bigint' ? rb.start : BigInt(rb.start);
  const bEnd = typeof rb.end === 'bigint' ? rb.end : BigInt(rb.end);

  return computeRelation(aStart, aEnd, bStart, bEnd);
}

function computeRelation(aStart: bigint, aEnd: bigint, bStart: bigint, bEnd: bigint): MatchRelation | null {
  // 完全相同
  if (aStart === bStart && aEnd === bEnd) return 'exact';
  // a 完全在 b 内 (被包含)
  if (aStart >= bStart && aEnd <= bEnd) return 'contained';
  // b 完全在 a 内 (包含)
  if (bStart >= aStart && bEnd <= aEnd) return 'contains';
  // 有交集但不完全包含 → 重叠
  if (aStart <= bEnd && bStart <= aEnd) return 'overlap';
  return null;
}

// 匹配单IP（向后兼容）
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

interface MatchedSubnet {
  subnet: string;
  relation: MatchRelation;
}

interface MatchResult {
  ip: string;
  status: 'match' | 'miss' | 'invalid';
  matched: MatchedSubnet[];
}

export const IPLookupTool: React.FC = () => {
  const { token } = theme.useToken();
  const [ipList, setIpList] = useState('');
  const [subnetList, setSubnetList] = useState('');
  const [results, setResults] = useState<MatchResult[]>([]);
  const [errors, setErrors] = useState<ParseError[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [relationFilter, setRelationFilter] = useState<string | undefined>(undefined);
  const [keywordFilter, setKeywordFilter] = useState('');

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

    // 解析IP列表并匹配（支持CIDR/范围/单IP，带关系类型）
    const ipLines = ipList.split('\n').filter(line => line.trim());
    const matchResults: MatchResult[] = [];

    ipLines.forEach((ipLine) => {
      const rawIp = ipLine.trim().replace(/^["'\s]+|["'\s]+$/g, '');
      if (!rawIp) return;

      const { record: ipRec } = parseRecord(rawIp);
      const matchedSubnets: MatchedSubnet[] = [];

      for (const subnetRec of parsedRecords) {
        if (ipRec) {
          const rel = matchRelation(ipRec, subnetRec);
          if (rel) {
            matchedSubnets.push({ subnet: subnetRec.original, relation: rel });
          }
        } else {
          if (matchIP(rawIp, subnetRec)) {
            matchedSubnets.push({ subnet: subnetRec.original, relation: 'contained' });
          }
        }
      }

      if (matchedSubnets.length > 0) {
        matchResults.push({ ip: rawIp, status: 'match', matched: matchedSubnets });
      } else {
        const isValid = ipRec !== null || ipv4ToUint32(rawIp) !== null || (isIPv6(rawIp) && ipv6ToBigInt(rawIp) !== null);
        matchResults.push({ ip: rawIp, status: isValid ? 'miss' : 'invalid', matched: [] });
      }
    });

    setResults(matchResults);
    setErrors(parseErrors);
    setHasSearched(true);
    setPagination(prev => ({ ...prev, current: 1 }));

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
    setStatusFilter(undefined);
    setRelationFilter(undefined);
    setKeywordFilter('');
  };

  // 过滤后的结果
  const filteredResults = useMemo(() => {
    return results.filter(r => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (relationFilter) {
        const hasRel = r.matched.some(m => m.relation === relationFilter);
        if (!hasRel) return false;
      }
      if (keywordFilter) {
        const kw = keywordFilter.toLowerCase();
        if (!r.ip.toLowerCase().includes(kw) && !r.matched.some(m => m.subnet.toLowerCase().includes(kw))) {
          return false;
        }
      }
      return true;
    });
  }, [results, statusFilter, relationFilter, keywordFilter]);

  const handleCopyResults = () => {
    const text = filteredResults.map(r => {
      const statusText = r.status === 'match' ? '匹配' : r.status === 'miss' ? '未匹配' : '无效IP';
      const matchText = r.matched.map(m => `${m.subnet}(${RELATION_LABELS[m.relation].text})`).join('; ');
      return `${r.ip}\t${statusText}\t${matchText}`;
    }).join('\n');
    navigator.clipboard.writeText(text);
    message.success('结果已复制到剪贴板');
  };

  const handleExportCSV = () => {
    if (filteredResults.length === 0) {
      message.warning('没有可导出的数据');
      return;
    }

    const headers = ['序号', 'IP地址', '状态', '匹配关系', '匹配的子网'];
    const rows: string[][] = [];
    filteredResults.forEach((r, idx) => {
      const statusText = r.status === 'match' ? '匹配' : r.status === 'miss' ? '未匹配' : '无效IP';
      if (r.matched.length === 0) {
        rows.push([(idx + 1).toString(), r.ip, statusText, '', '']);
      } else {
        r.matched.forEach((m, mIdx) => {
          rows.push([
            mIdx === 0 ? (idx + 1).toString() : '',
            mIdx === 0 ? r.ip : '',
            mIdx === 0 ? statusText : '',
            RELATION_LABELS[m.relation].text,
            m.subnet,
          ]);
        });
      }
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const fileName = `IP查找结果_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`;

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    message.success('结果已导出');
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
      title: 'IP/网段',
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
          return <Badge status="success" text={<span style={{ color: token.colorSuccess, fontWeight: 'bold' }}>匹配</span>} />;
        } else if (status === 'miss') {
          return <Badge status="error" text={<span style={{ color: token.colorError }}>未匹配</span>} />;
        } else {
          return <Badge status="warning" text={<span style={{ color: token.colorWarning }}>无效IP</span>} />;
        }
      },
    },
    {
      title: '匹配关系',
      dataIndex: 'matched',
      key: 'relations',
      width: 200,
      render: (matched: MatchedSubnet[]) => {
        if (matched.length === 0) return '-';
        return (
          <Space size={[4, 4]} wrap>
            {matched.map((m, idx) => {
              const info = RELATION_LABELS[m.relation];
              return (
                <Tag key={idx} color={info.color} style={{ fontSize: '12px' }}>
                  {info.text}
                </Tag>
              );
            })}
          </Space>
        );
      },
    },
    {
      title: '匹配的子网',
      dataIndex: 'matched',
      key: 'matched',
      render: (matched: MatchedSubnet[]) => {
        if (matched.length === 0) return '-';
        return (
          <Space size={[4, 4]} wrap>
            {matched.map((m, idx) => {
              const info = RELATION_LABELS[m.relation];
              return (
                <Tag
                  key={idx}
                  color={info.color}
                  style={{ fontFamily: 'Monaco, Consolas, monospace', margin: 0 }}
                  title={info.text}
                >
                  {m.subnet}
                </Tag>
              );
            })}
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ padding: '16px' }}>
      <Card
        title={
          <span>
            <Search size={20} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            IP查找工具（批量匹配）
          </span>
        }
        extra={
          <Space>
            <Button icon={<Eraser size={14} />} onClick={handleClear}>
              清空
            </Button>
            <Button type="primary" icon={<Search size={14} />} onClick={handleSearch}>
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
                <li><strong>待查找IP（左侧面板）：</strong></li>
                <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                  <li>CIDR格式：<code>192.168.1.0/24</code>、<code>10.0.0.0/8</code>、<code>::1/128</code></li>
                  <li>单IP格式：<code>192.168.1.1</code>、<code>::1</code></li>
                  <li>范围格式：<code>192.168.1.0-255</code>、<code>192.168.1.0-192.168.1.255</code></li>
                </ul>
                <li><strong>子网列表（右侧面板）：</strong></li>
                <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                  <li>CIDR格式：<code>192.168.1.0/24</code>、<code>10.0.0.0/8</code>、<code>::1/128</code></li>
                  <li>范围前缀格式：<code>192.168.1.0-255</code>（起始IP-结束前缀）</li>
                  <li>完整范围格式：<code>192.168.1.0-192.168.1.255</code></li>
                  <li>单IP格式：<code>192.168.1.1</code>、<code>::1</code></li>
                </ul>
                <li><strong>支持IPv4和IPv6，解析失败的记录会显示在错误面板中</strong></li>
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
              placeholder="输入要查找的IP或CIDR，每行一个，例如：&#10;192.168.1.100&#10;10.0.0.0/8&#10;192.168.1.0-255&#10;::1"
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
                    borderBottom: `1px dashed ${token.colorErrorBorder}`,
                    fontSize: '13px',
                    fontFamily: "'Monaco', 'Menlo', monospace"
                  }}>
                    <span style={{ color: token.colorTextSecondary, marginRight: '8px' }}>第{err.lineNo}行:</span>
                    <span style={{ background: token.colorErrorBg, padding: '2px 6px', borderRadius: '4px', marginRight: '8px' }}>
                      {err.content}
                    </span>
                    <span style={{ color: token.colorError, fontWeight: 'bold' }}>{err.reason}</span>
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
                <Statistic title="总计" value={totalCount} valueStyle={{ color: token.colorPrimary }} />
              </Col>
              <Col span={6}>
                <Statistic
                  title="匹配"
                  value={matchCount}
                  valueStyle={{ color: token.colorSuccess }}
                  prefix={<CircleCheck size={16} />}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="未匹配"
                  value={missCount}
                  valueStyle={{ color: token.colorError }}
                  prefix={<CircleX size={16} />}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="无效IP"
                  value={invalidCount}
                  valueStyle={{ color: token.colorWarning }}
                />
              </Col>
            </Row>

            <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontWeight: 'bold' }}>
                匹配结果详情
                {(statusFilter || relationFilter || keywordFilter) && (
                  <Tag color="processing" style={{ marginLeft: '8px' }}>
                    <ListFilter size={13} /> 已筛选 {filteredResults.length} / {results.length}
                  </Tag>
                )}
              </span>
              <Space>
                <Select
                  placeholder="按状态筛选"
                  allowClear
                  style={{ width: 130 }}
                  value={statusFilter}
                  onChange={(v) => { setStatusFilter(v); setPagination(prev => ({ ...prev, current: 1 })); }}
                  options={[
                    { value: 'match', label: '匹配' },
                    { value: 'miss', label: '未匹配' },
                    { value: 'invalid', label: '无效IP' },
                  ]}
                />
                <Select
                  placeholder="按关系类型筛选"
                  allowClear
                  style={{ width: 150 }}
                  value={relationFilter}
                  onChange={(v) => { setRelationFilter(v); setPagination(prev => ({ ...prev, current: 1 })); }}
                  options={[
                    { value: 'exact', label: '完全相同' },
                    { value: 'contained', label: '被包含' },
                    { value: 'contains', label: '包含' },
                    { value: 'overlap', label: '范围重叠' },
                  ]}
                />
                <Input
                  placeholder="关键词搜索"
                  allowClear
                  style={{ width: 160 }}
                  value={keywordFilter}
                  onChange={(e) => { setKeywordFilter(e.target.value); setPagination(prev => ({ ...prev, current: 1 })); }}
                />
                <Button size="small" icon={<Copy size={14} />} onClick={handleCopyResults}>
                  复制结果
                </Button>
                <Button size="small" icon={<Download size={14} />} onClick={handleExportCSV}>
                  导出 CSV
                </Button>
              </Space>
            </div>
            <Table
              columns={columns}
              dataSource={filteredResults.map((r, idx) => ({ ...r, key: idx }))}
              pagination={{
                ...pagination,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                showTotal: (total) => `共 ${total} 条`,
                onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
              }}
              size="small"
              scroll={{ y: 400 }}
              style={{
                border: `1px solid ${token.colorBorderSecondary}`,
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
