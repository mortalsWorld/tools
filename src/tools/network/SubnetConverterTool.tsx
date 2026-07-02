import React, { useState } from 'react';
import { Card, Input, Button, Space, message, Descriptions, Tag, Divider, Alert } from 'antd';
import { ReloadOutlined, CalculatorOutlined, DownloadOutlined } from '@ant-design/icons';

const { TextArea } = Input;

interface SubnetResult {
  input: string;
  startIP: string;
  endIP: string;
  subnetMask: string;
  wildcardMask: string;
  totalAddresses: number;
  usableHosts: number;
  networkAddress: string;
  broadcastAddress: string;
  isPrivate: boolean;
  ipClass: string;
  cidr: string;
  error?: string;
}

// IPv4转Uint32
const ipv4ToUint32 = (ipStr: string): number | null => {
  const match = ipStr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  
  let result = 0;
  for (let i = 1; i <= 4; i++) {
    const n = parseInt(match[i], 10);
    if (n > 255) return null;
    result = (result * 256 + n) >>> 0;
  }
  return result >>> 0;
};

// Uint32转IPv4
const uint32ToIPv4 = (num: number): string => {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255
  ].join('.');
};

// 判断是否为私有IP
const isPrivateIP = (ip: string): boolean => {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  
  // 10.0.0.0 - 10.255.255.255
  if (parts[0] === 10) return true;
  
  // 172.16.0.0 - 172.31.255.255
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  
  // 192.168.0.0 - 192.168.255.255
  if (parts[0] === 192 && parts[1] === 168) return true;
  
  return false;
};

// 获取IP类别
const getIPClass = (ip: string): string => {
  const firstOctet = parseInt(ip.split('.')[0], 10);
  
  if (firstOctet >= 1 && firstOctet <= 126) return 'A';
  if (firstOctet >= 128 && firstOctet <= 191) return 'B';
  if (firstOctet >= 192 && firstOctet <= 223) return 'C';
  if (firstOctet >= 224 && firstOctet <= 239) return 'D (多播)';
  if (firstOctet >= 240 && firstOctet <= 255) return 'E (保留)';
  
  return '未知';
};

// 解析CIDR格式
const parseCIDR = (cidr: string): SubnetResult | null => {
  const parts = cidr.trim().split('/');
  if (parts.length !== 2) return null;
  
  const ip = parts[0];
  const prefixLen = parseInt(parts[1], 10);
  
  if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 32) return null;
  
  const ipNum = ipv4ToUint32(ip);
  if (ipNum === null) return null;
  
  // 计算子网掩码
  const mask = prefixLen === 0 ? 0 : ((0xFFFFFFFF << (32 - prefixLen)) >>> 0);
  
  // 计算网络地址
  const networkAddr = (ipNum & mask) >>> 0;
  
  // 计算广播地址
  const wildcardMask = (~mask) >>> 0;
  const broadcastAddr = (networkAddr | wildcardMask) >>> 0;
  
  // 计算可用主机数
  const totalAddrs = Math.pow(2, 32 - prefixLen);
  const usableHosts = prefixLen >= 31 ? totalAddrs : totalAddrs - 2;
  
  return {
    input: cidr,
    startIP: prefixLen >= 31 ? uint32ToIPv4(networkAddr) : uint32ToIPv4(networkAddr + 1),
    endIP: prefixLen >= 31 ? uint32ToIPv4(broadcastAddr) : uint32ToIPv4(broadcastAddr - 1),
    subnetMask: uint32ToIPv4(mask),
    wildcardMask: uint32ToIPv4(wildcardMask),
    totalAddresses: totalAddrs,
    usableHosts: usableHosts,
    networkAddress: uint32ToIPv4(networkAddr),
    broadcastAddress: uint32ToIPv4(broadcastAddr),
    isPrivate: isPrivateIP(ip),
    ipClass: getIPClass(ip),
    cidr: cidr
  };
};

// 解析范围格式 (192.168.1.0-255)
const parseRangePrefix = (range: string): SubnetResult | null => {
  const dashIdx = range.indexOf('-');
  if (dashIdx === -1) return null;
  
  const startStr = range.substring(0, dashIdx).trim();
  const endSuffix = range.substring(dashIdx + 1).trim();
  
  // 检查是否为短格式 (192.168.1.0-255)
  const shortMatch = startStr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})$/);
  
  if (shortMatch && /^\d{1,3}$/.test(endSuffix)) {
    const prefix = shortMatch[1];
    const startLast = parseInt(shortMatch[2], 10);
    const endLast = parseInt(endSuffix, 10);
    
    if (startLast > 255 || endLast > 255) return null;
    if (startLast > endLast) return null;
    
    const startIP = ipv4ToUint32(`${prefix}.${startLast}`);
    const endIP = ipv4ToUint32(`${prefix}.${endLast}`);
    
    if (startIP === null || endIP === null) return null;
    
    // 计算CIDR前缀
    const totalHosts = endLast - startLast + 1;
    const prefixLen = Math.round(Math.log2(totalHosts));
    
    const mask = ((0xFFFFFFFF << prefixLen) >>> 0);
    const networkAddr = (startIP & mask) >>> 0;
    
    return {
      input: range,
      startIP: `${prefix}.${startLast}`,
      endIP: `${prefix}.${endLast}`,
      subnetMask: uint32ToIPv4(mask),
      wildcardMask: uint32ToIPv4(~mask >>> 0),
      totalAddresses: totalHosts,
      usableHosts: totalHosts,
      networkAddress: uint32ToIPv4(networkAddr),
      broadcastAddress: uint32ToIPv4((networkAddr | ~mask >>> 0) >>> 0),
      isPrivate: isPrivateIP(`${prefix}.${startLast}`),
      ipClass: getIPClass(`${prefix}.${startLast}`),
      cidr: `${prefix}.${startLast}/${32 - prefixLen}`
    };
  }
  
  return null;
};

// 解析完整范围格式 (192.168.1.0-192.168.1.255)
const parseFullRange = (range: string): SubnetResult | null => {
  const dashIdx = range.indexOf('-');
  if (dashIdx === -1) return null;
  
  const startIP = range.substring(0, dashIdx).trim();
  const endIP = range.substring(dashIdx + 1).trim();
  
  const startNum = ipv4ToUint32(startIP);
  const endNum = ipv4ToUint32(endIP);
  
  if (startNum === null || endNum === null) return null;
  if (startNum > endNum) return null;
  
  const totalHosts = endNum - startNum + 1;
  const prefixLen = 32 - Math.round(Math.log2(totalHosts));
  const mask = ((0xFFFFFFFF << (32 - prefixLen)) >>> 0);
  const networkAddr = (startNum & mask) >>> 0;
  
  return {
    input: range,
    startIP,
    endIP,
    subnetMask: uint32ToIPv4(mask),
    wildcardMask: uint32ToIPv4(~mask >>> 0),
    totalAddresses: totalHosts,
    usableHosts: totalHosts,
    networkAddress: uint32ToIPv4(networkAddr),
    broadcastAddress: uint32ToIPv4((networkAddr | ~mask >>> 0) >>> 0),
    isPrivate: isPrivateIP(startIP),
    ipClass: getIPClass(startIP),
    cidr: `${startIP}/${prefixLen}`
  };
};

// 解析IP或网段
const parseInput = (input: string): SubnetResult => {
  const trimmed = input.trim();
  
  if (!trimmed) {
    return { 
      input, 
      error: '输入为空',
      startIP: '', endIP: '', subnetMask: '', wildcardMask: '',
      totalAddresses: 0, usableHosts: 0, networkAddress: '', broadcastAddress: '',
      isPrivate: false, ipClass: '', cidr: ''
    };
  }
  
  // CIDR格式 (192.168.1.0/24)
  if (trimmed.includes('/')) {
    const result = parseCIDR(trimmed);
    if (result) return result;
  }
  
  // 范围前缀格式 (192.168.1.0-255)
  if (trimmed.includes('-') && !trimmed.includes('/')) {
    const shortResult = parseRangePrefix(trimmed);
    if (shortResult) return shortResult;
    
    const fullResult = parseFullRange(trimmed);
    if (fullResult) return fullResult;
  }
  
  // 单IP格式
  const ipNum = ipv4ToUint32(trimmed);
  if (ipNum !== null) {
    return {
      input: trimmed,
      startIP: trimmed,
      endIP: trimmed,
      subnetMask: '255.255.255.255',
      wildcardMask: '0.0.0.0',
      totalAddresses: 1,
      usableHosts: 1,
      networkAddress: trimmed,
      broadcastAddress: trimmed,
      isPrivate: isPrivateIP(trimmed),
      ipClass: getIPClass(trimmed),
      cidr: `${trimmed}/32`
    };
  }
  
  return {
    input: trimmed,
    error: '格式无效',
    startIP: '', endIP: '', subnetMask: '', wildcardMask: '',
    totalAddresses: 0, usableHosts: 0, networkAddress: '', broadcastAddress: '',
    isPrivate: false, ipClass: '', cidr: ''
  };
};

export const SubnetConverterTool: React.FC = () => {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<SubnetResult[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const handleConvert = () => {
    const lines = input.split('\n').filter(line => line.trim());
    const newResults: SubnetResult[] = [];
    const newErrors: string[] = [];
    
    lines.forEach((line, index) => {
      const result = parseInput(line);
      if (result.error) {
        newErrors.push(`第${index + 1}行: ${line} - ${result.error}`);
      } else {
        newResults.push(result);
      }
    });
    
    setResults(newResults);
    setErrors(newErrors);
    
    if (newErrors.length > 0) {
      message.warning(`解析完成，发现 ${newErrors.length} 个错误`);
    } else if (newResults.length > 0) {
      message.success(`成功解析 ${newResults.length} 个网段`);
    } else {
      message.info('请输入有效的IP或网段');
    }
  };

  const handleClear = () => {
    setInput('');
    setResults([]);
    setErrors([]);
  };

  const handleExportCSV = () => {
    if (results.length === 0) {
      message.warning('没有可导出的数据');
      return;
    }

    const headers = [
      '输入', '起始IP', '结束IP', 'CIDR表示', '网络地址', '广播地址',
      '子网掩码', '通配符掩码', '总地址数', '可用主机数', '是否私有IP', 'IP类别'
    ];

    const rows = results.map(r => [
      r.input,
      r.startIP,
      r.endIP,
      r.cidr,
      r.networkAddress,
      r.broadcastAddress,
      r.subnetMask,
      r.wildcardMask,
      r.totalAddresses.toString(),
      r.usableHosts.toString(),
      r.isPrivate ? '是' : '否',
      r.ipClass
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const fileName = `子网转换结果_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`;

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    message.success('CSV 导出成功');
  };

  return (
    <div style={{ padding: '16px' }}>
      <Card
        title={
          <span>
            <CalculatorOutlined style={{ marginRight: '8px' }} />
            IP子网掩码范围转换
          </span>
        }
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={handleClear}>
              清空
            </Button>
            <Button type="primary" icon={<CalculatorOutlined />} onClick={handleConvert}>
              转换
            </Button>
          </Space>
        }
      >
        <Alert
          message="支持格式说明"
          description={
            <div>
              <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                <li><strong>CIDR格式：</strong>192.168.1.0/24</li>
                <li><strong>范围前缀格式：</strong>192.168.1.0-255 (起始IP-结束前缀)</li>
                <li><strong>完整范围格式：</strong>192.168.1.0-192.168.1.255</li>
                <li><strong>单IP格式：</strong>192.168.1.1</li>
              </ul>
              <div>每行输入一个IP或网段，支持批量输入</div>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: '16px' }}
        />

        <TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入IP或网段（每行一个），例如：&#10;192.168.1.0/24&#10;10.0.0.0/8&#10;172.16.0.0-20&#10;192.168.1.1"
          autoSize={{ minRows: 4, maxRows: 8 }}
          style={{ 
            fontFamily: "'Monaco', 'Menlo', monospace",
            fontSize: '13px',
            marginBottom: '16px'
          }}
        />

        {/* 错误显示 */}
        {errors.length > 0 && (
          <Alert
            message="解析错误"
            description={
              <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                {errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            }
            type="error"
            showIcon
            style={{ marginBottom: '16px' }}
          />
        )}

        {/* 结果显示 */}
        {results.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <Divider style={{ margin: 0, flex: 1 }}>转换结果</Divider>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={handleExportCSV}
                style={{ marginLeft: '12px' }}
              >
                导出 CSV
              </Button>
            </div>
            {results.map((result, index) => (
              <Card 
                key={index} 
                size="small" 
                title={
                  <Space>
                    <span>{result.input}</span>
                    {result.isPrivate && <Tag color="green">私有IP</Tag>}
                    <Tag color="blue">{result.ipClass}</Tag>
                  </Space>
                }
                style={{ marginBottom: '12px' }}
              >
                <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
                  <Descriptions.Item label="起始IP">{result.startIP}</Descriptions.Item>
                  <Descriptions.Item label="结束IP">{result.endIP}</Descriptions.Item>
                  <Descriptions.Item label="CIDR表示">{result.cidr}</Descriptions.Item>
                  <Descriptions.Item label="网络地址">{result.networkAddress}</Descriptions.Item>
                  <Descriptions.Item label="广播地址">{result.broadcastAddress}</Descriptions.Item>
                  <Descriptions.Item label="子网掩码">{result.subnetMask}</Descriptions.Item>
                  <Descriptions.Item label="通配符掩码">{result.wildcardMask}</Descriptions.Item>
                  <Descriptions.Item label="总地址数">
                    <Tag>{result.totalAddresses.toLocaleString()}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="可用主机数">
                    <Tag color="blue">{result.usableHosts.toLocaleString()}</Tag>
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
