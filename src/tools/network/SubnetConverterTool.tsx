import React, { useState, useMemo } from 'react';
import { Card, Input, Button, Space, message, Descriptions, Tag, Divider, Alert, Checkbox } from 'antd';
import { ReloadOutlined, CalculatorOutlined, ExportOutlined, MergeCellsOutlined } from '@ant-design/icons';

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

// IPv6转bigint
const ipv6ToBigInt = (ipStr: string): bigint | null => {
  try {
    let expanded = ipStr;
    
    if (expanded.includes('::')) {
      const [left, right] = expanded.split('::');
      const leftParts = left ? left.split(':').filter(p => p !== '') : [];
      const rightParts = right ? right.split(':').filter(p => p !== '') : [];
      const missingParts = 8 - leftParts.length - rightParts.length;
      expanded = [...leftParts, ...Array(missingParts).fill('0'), ...rightParts].join(':');
    }
    
    const parts = expanded.split(':');
    if (parts.length !== 8) return null;
    
    let result = 0n;
    for (const part of parts) {
      const n = BigInt(parseInt(part, 16));
      if (n > 0xFFFFn) return null;
      result = (result << 16n) | n;
    }
    return result;
  } catch {
    return null;
  }
};

// bigint转IPv6
const bigIntToIPv6 = (num: bigint): string => {
  const parts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const part = (num >> (112n - BigInt(i * 16))) & 0xFFFFn;
    parts.push(part.toString(16));
  }
  
  let result = parts.join(':');
  const longestZeroSequence = result.match(/(?:^|:)(0(?::0)*)(?::|$)/);
  if (longestZeroSequence) {
    result = result.replace(longestZeroSequence[0], '::');
  }
  
  return result.toLowerCase();
};

// 判断是否为私有IP
const isPrivateIP = (ip: string): boolean => {
  if (ip.includes(':')) {
    return isIPv6Private(ip);
  }
  
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  
  return false;
};

// 判断IPv6私有地址
const isIPv6Private = (ip: string): boolean => {
  const ipNum = ipv6ToBigInt(ip);
  if (ipNum === null) return false;
  
  const fc00 = 0xFC000000000000000000000000000000n;
  const fdff = 0xFDFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn;
  
  return ipNum >= fc00 && ipNum <= fdff;
};

// 获取IP类别
const getIPClass = (ip: string): string => {
  if (ip.includes(':')) return 'IPv6';
  
  const firstOctet = parseInt(ip.split('.')[0], 10);
  
  if (firstOctet >= 1 && firstOctet <= 126) return 'A';
  if (firstOctet >= 128 && firstOctet <= 191) return 'B';
  if (firstOctet >= 192 && firstOctet <= 223) return 'C';
  if (firstOctet >= 224 && firstOctet <= 239) return 'D (多播)';
  if (firstOctet >= 240 && firstOctet <= 255) return 'E (保留)';
  
  return '未知';
};

// 判断是否为IPv6
const isIPv6 = (ip: string): boolean => ip.includes(':');

interface CIDRBlock {
  network: bigint;
  prefixLen: number;
  isIPv6: boolean;
  original: SubnetResult;
}

const subnetResultToCIDR = (result: SubnetResult): CIDRBlock | null => {
  const parts = result.cidr.split('/');
  if (parts.length !== 2) return null;
  
  const prefixLen = parseInt(parts[1], 10);
  if (isNaN(prefixLen)) return null;
  
  const isV6 = isIPv6(parts[0]);
  const network = isV6 ? ipv6ToBigInt(result.networkAddress) : BigInt(ipv4ToUint32(result.networkAddress) ?? 0);
  
  if (network === null) return null;
  
  return {
    network,
    prefixLen,
    isIPv6: isV6,
    original: result,
  };
};

const cidrToSubnetResult = (block: CIDRBlock): SubnetResult => {
  const { network, prefixLen, isIPv6 } = block;
  const maxBits = isIPv6 ? 128n : 32n;
  const mask = prefixLen === 0 ? 0n : ((0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn << (maxBits - BigInt(prefixLen))) & (isIPv6 ? 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn : 0xFFFFFFFFn));
  const networkAddr = network & mask;
  const wildcardMask = ~mask & (isIPv6 ? 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn : 0xFFFFFFFFn);
  const broadcastAddr = networkAddr | wildcardMask;
  const totalAddrs = 1n << (maxBits - BigInt(prefixLen));
  const usableHosts = BigInt(prefixLen) >= maxBits - 1n ? totalAddrs : totalAddrs - 2n;
  
  const toIP = (n: bigint): string => isIPv6 ? bigIntToIPv6(n) : uint32ToIPv4(Number(n & 0xFFFFFFFFn));
  
  const networkStr = toIP(networkAddr);
  
  return {
    input: `${networkStr}/${prefixLen}`,
    startIP: BigInt(prefixLen) >= maxBits - 1n ? toIP(networkAddr) : toIP(networkAddr + 1n),
    endIP: BigInt(prefixLen) >= maxBits - 1n ? toIP(broadcastAddr) : toIP(broadcastAddr - 1n),
    subnetMask: toIP(mask),
    wildcardMask: toIP(wildcardMask),
    totalAddresses: Number(totalAddrs),
    usableHosts: Number(usableHosts),
    networkAddress: networkStr,
    broadcastAddress: toIP(broadcastAddr),
    isPrivate: isPrivateIP(networkStr),
    ipClass: getIPClass(networkStr),
    cidr: `${networkStr}/${prefixLen}`,
  };
};

const mergeSubnets = (results: SubnetResult[]): SubnetResult[] => {
  if (results.length <= 1) return results;
  
  const ipv4Blocks: CIDRBlock[] = [];
  const ipv6Blocks: CIDRBlock[] = [];
  
  for (const r of results) {
    const block = subnetResultToCIDR(r);
    if (!block) continue;
    if (block.isIPv6) {
      ipv6Blocks.push(block);
    } else {
      ipv4Blocks.push(block);
    }
  }
  
  const mergeBlocks = (blocks: CIDRBlock[]): CIDRBlock[] => {
    if (blocks.length === 0) return [];
    const isV6 = blocks[0].isIPv6;
    const maxBits = isV6 ? 128n : 32n;
    const fullMask = isV6 ? 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn : 0xFFFFFFFFn;
    
    let sorted = [...blocks].sort((a, b) => {
      if (a.network < b.network) return -1;
      if (a.network > b.network) return 1;
      return a.prefixLen - b.prefixLen;
    });
    
    // 第一步：去除被包含的子网
    const filtered: CIDRBlock[] = [];
    for (const block of sorted) {
      if (filtered.length === 0) {
        filtered.push(block);
        continue;
      }
      const last = filtered[filtered.length - 1];
      const lastMask = last.prefixLen === 0 ? 0n : ((fullMask << (maxBits - BigInt(last.prefixLen))) & fullMask);
      const lastBroadcast = last.network | (~lastMask & fullMask);
      const blockMask = block.prefixLen === 0 ? 0n : ((fullMask << (maxBits - BigInt(block.prefixLen))) & fullMask);
      const blockBroadcast = block.network | (~blockMask & fullMask);
      
      if (block.network <= lastBroadcast + 1n && blockBroadcast <= lastBroadcast) {
        continue;
      }
      filtered.push(block);
    }
    
    // 第二步：合并相邻的相同前缀长度的子网
    let changed = true;
    let current = filtered;
    
    while (changed) {
      changed = false;
      const merged: CIDRBlock[] = [];
      let i = 0;
      
      while (i < current.length) {
        if (i + 1 < current.length) {
          const a = current[i];
          const b = current[i + 1];
          
          if (a.prefixLen === b.prefixLen && a.prefixLen > 0) {
            const step = 1n << (maxBits - BigInt(a.prefixLen));
            const supernetMask = (fullMask << (maxBits - BigInt(a.prefixLen - 1))) & fullMask;
            const aSupernet = a.network & supernetMask;
            const bSupernet = b.network & supernetMask;
            
            if (b.network === a.network + step && aSupernet === bSupernet) {
              merged.push({
                ...a,
                prefixLen: a.prefixLen - 1,
                network: aSupernet,
              });
              i += 2;
              changed = true;
              continue;
            }
          }
        }
        merged.push(current[i]);
        i++;
      }
      
      current = merged;
    }
    
    return current;
  };
  
  const mergedIPv4 = mergeBlocks(ipv4Blocks);
  const mergedIPv6 = mergeBlocks(ipv6Blocks);
  
  return [...mergedIPv4, ...mergedIPv6].map(cidrToSubnetResult);
};

// 解析CIDR格式
const parseCIDR = (cidr: string): SubnetResult | null => {
  const parts = cidr.trim().split('/');
  if (parts.length !== 2) return null;
  
  const ip = parts[0];
  const prefixLen = parseInt(parts[1], 10);
  
  if (isNaN(prefixLen)) return null;
  
  if (isIPv6(ip)) {
    if (prefixLen < 0 || prefixLen > 128) return null;
    
    const ipNum = ipv6ToBigInt(ip);
    if (ipNum === null) return null;
    
    const mask = (0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn << (128n - BigInt(prefixLen))) & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn;
    const networkAddr = ipNum & mask;
    const wildcardMask = ~mask & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn;
    const broadcastAddr = networkAddr | wildcardMask;
    
    const totalAddrs = BigInt(Math.pow(2, 128 - prefixLen));
    const usableHosts = prefixLen >= 127 ? totalAddrs : totalAddrs - 2n;
    
    return {
      input: cidr,
      startIP: prefixLen >= 127 ? bigIntToIPv6(networkAddr) : bigIntToIPv6(networkAddr + 1n),
      endIP: prefixLen >= 127 ? bigIntToIPv6(broadcastAddr) : bigIntToIPv6(broadcastAddr - 1n),
      subnetMask: bigIntToIPv6(mask),
      wildcardMask: bigIntToIPv6(wildcardMask),
      totalAddresses: Number(totalAddrs),
      usableHosts: Number(usableHosts),
      networkAddress: bigIntToIPv6(networkAddr),
      broadcastAddress: bigIntToIPv6(broadcastAddr),
      isPrivate: isPrivateIP(ip),
      ipClass: getIPClass(ip),
      cidr: cidr
    };
  } else {
    if (prefixLen < 0 || prefixLen > 32) return null;
    
    const ipNum = ipv4ToUint32(ip);
    if (ipNum === null) return null;
    
    const mask = prefixLen === 0 ? 0 : ((0xFFFFFFFF << (32 - prefixLen)) >>> 0);
    const networkAddr = (ipNum & mask) >>> 0;
    const wildcardMask = (~mask) >>> 0;
    const broadcastAddr = (networkAddr | wildcardMask) >>> 0;
    
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
  }
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

// 解析连续网段范围格式 (10.1.8.0/24-10.1.15.0/24 或 IPv6)
const parseCIDRRange = (range: string): SubnetResult[] => {
  const results: SubnetResult[] = [];
  const dashIdx = range.indexOf('-');
  if (dashIdx === -1) return results;
  
  const startCIDR = range.substring(0, dashIdx).trim();
  const endCIDR = range.substring(dashIdx + 1).trim();
  
  const startParts = startCIDR.split('/');
  const endParts = endCIDR.split('/');
  
  if (startParts.length !== 2 || endParts.length !== 2) return results;
  
  const startPrefixLen = parseInt(startParts[1], 10);
  const endPrefixLen = parseInt(endParts[1], 10);
  
  if (isNaN(startPrefixLen) || isNaN(endPrefixLen) || startPrefixLen !== endPrefixLen) return results;
  
  const prefixLen = startPrefixLen;
  
  if (isIPv6(startParts[0])) {
    const startIPNum = ipv6ToBigInt(startParts[0]);
    const endIPNum = ipv6ToBigInt(endParts[0]);
    
    if (startIPNum === null || endIPNum === null) return results;
    if (startIPNum > endIPNum) return results;
    
    const subnetSize = 1n << (128n - BigInt(prefixLen));
    
    for (let ipNum = startIPNum; ipNum <= endIPNum; ipNum += subnetSize) {
      const mask = (0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn << (128n - BigInt(prefixLen))) & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn;
      const networkAddr = ipNum & mask;
      const wildcardMask = ~mask & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn;
      const broadcastAddr = networkAddr | wildcardMask;
      const totalAddrs = 1n << (128n - BigInt(prefixLen));
      const usableHosts = prefixLen >= 127 ? totalAddrs : totalAddrs - 2n;
      const ipStr = bigIntToIPv6(ipNum);
      
      results.push({
        input: `${ipStr}/${prefixLen}`,
        startIP: prefixLen >= 127 ? bigIntToIPv6(networkAddr) : bigIntToIPv6(networkAddr + 1n),
        endIP: prefixLen >= 127 ? bigIntToIPv6(broadcastAddr) : bigIntToIPv6(broadcastAddr - 1n),
        subnetMask: bigIntToIPv6(mask),
        wildcardMask: bigIntToIPv6(wildcardMask),
        totalAddresses: Number(totalAddrs),
        usableHosts: Number(usableHosts),
        networkAddress: bigIntToIPv6(networkAddr),
        broadcastAddress: bigIntToIPv6(broadcastAddr),
        isPrivate: isPrivateIP(ipStr),
        ipClass: getIPClass(ipStr),
        cidr: `${ipStr}/${prefixLen}`
      });
    }
  } else {
    const startIPNum = ipv4ToUint32(startParts[0]);
    const endIPNum = ipv4ToUint32(endParts[0]);
    
    if (startIPNum === null || endIPNum === null) return results;
    if (startIPNum > endIPNum) return results;
    
    const subnetSize = Math.pow(2, 32 - prefixLen);
    
    for (let ipNum = startIPNum; ipNum <= endIPNum; ipNum += subnetSize) {
      const mask = prefixLen === 0 ? 0 : ((0xFFFFFFFF << (32 - prefixLen)) >>> 0);
      const networkAddr = (ipNum & mask) >>> 0;
      const wildcardMask = (~mask) >>> 0;
      const broadcastAddr = (networkAddr | wildcardMask) >>> 0;
      const totalAddrs = Math.pow(2, 32 - prefixLen);
      const usableHosts = prefixLen >= 31 ? totalAddrs : totalAddrs - 2;
      const ipStr = uint32ToIPv4(ipNum);
      
      results.push({
        input: `${ipStr}/${prefixLen}`,
        startIP: prefixLen >= 31 ? uint32ToIPv4(networkAddr) : uint32ToIPv4(networkAddr + 1),
        endIP: prefixLen >= 31 ? uint32ToIPv4(broadcastAddr) : uint32ToIPv4(broadcastAddr - 1),
        subnetMask: uint32ToIPv4(mask),
        wildcardMask: uint32ToIPv4(wildcardMask),
        totalAddresses: totalAddrs,
        usableHosts: usableHosts,
        networkAddress: uint32ToIPv4(networkAddr),
        broadcastAddress: uint32ToIPv4(broadcastAddr),
        isPrivate: isPrivateIP(ipStr),
        ipClass: getIPClass(ipStr),
        cidr: `${ipStr}/${prefixLen}`
      });
    }
  }
  
  return results;
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
  
  if (trimmed.includes('/')) {
    const result = parseCIDR(trimmed);
    if (result) return result;
  }
  
  if (trimmed.includes('-') && !trimmed.includes('/')) {
    const shortResult = parseRangePrefix(trimmed);
    if (shortResult) return shortResult;
    
    const fullResult = parseFullRange(trimmed);
    if (fullResult) return fullResult;
  }
  
  if (isIPv6(trimmed)) {
    const ipNum = ipv6ToBigInt(trimmed);
    if (ipNum !== null) {
      return {
        input: trimmed,
        startIP: trimmed,
        endIP: trimmed,
        subnetMask: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
        wildcardMask: '::',
        totalAddresses: 1,
        usableHosts: 1,
        networkAddress: trimmed,
        broadcastAddress: trimmed,
        isPrivate: isPrivateIP(trimmed),
        ipClass: getIPClass(trimmed),
        cidr: `${trimmed}/128`
      };
    }
  } else {
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
  const [mergeEnabled, setMergeEnabled] = useState(false);

  const displayResults = useMemo(() => {
    if (!mergeEnabled) return results;
    return mergeSubnets(results);
  }, [results, mergeEnabled]);

  const handleConvert = () => {
    const lines = input.split('\n').filter(line => line.trim());
    const newResults: SubnetResult[] = [];
    const newErrors: string[] = [];
    
    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      
      if (trimmedLine.includes('/') && trimmedLine.includes('-')) {
        const cidrRangeResults = parseCIDRRange(trimmedLine);
        if (cidrRangeResults.length > 0) {
          newResults.push(...cidrRangeResults);
          return;
        }
      }
      
      const result = parseInput(trimmedLine);
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

  const handleExportCSV = async () => {
    if (displayResults.length === 0) {
      message.warning('没有可导出的数据');
      return;
    }

    const headers = [
      '输入', '起始IP', '结束IP', 'CIDR表示', '网络地址', '广播地址',
      '子网掩码', '通配符掩码', '总地址数', '可用主机数', '是否私有IP', 'IP类别'
    ];

    const rows = displayResults.map(r => [
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
    const content = BOM + csvContent;

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const fileName = `子网转换结果_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`;

    try {
      const savedPath = await (window.electronAPI as any).saveFileDialog(content, fileName);
      message.success(`CSV 导出成功: ${savedPath}`);
    } catch (e) {
      message.info('已取消导出');
    }
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
                <li><strong>IPv4 CIDR格式：</strong>192.168.1.0/24</li>
                <li><strong>IPv4 CIDR范围格式：</strong>10.1.8.0/24-10.1.15.0/24 (连续网段)</li>
                <li><strong>IPv4范围前缀格式：</strong>192.168.1.0-255</li>
                <li><strong>IPv4完整范围格式：</strong>192.168.1.0-192.168.1.255</li>
                <li><strong>IPv4单IP格式：</strong>192.168.1.1</li>
                <li><strong>IPv6 CIDR格式：</strong>2001:db8::/32</li>
                <li><strong>IPv6 CIDR范围格式：</strong>fd00:1::/64-fd00:4::/64</li>
                <li><strong>IPv6单IP格式：</strong>2001:db8::1</li>
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

        <Space style={{ width: '100%', marginBottom: '16px' }}>
          <Checkbox checked={mergeEnabled} onChange={(e) => setMergeEnabled(e.target.checked)}>
            <MergeCellsOutlined style={{ marginRight: '4px' }} />
            合并去重（CIDR聚合）
          </Checkbox>
        </Space>

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
        {displayResults.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Divider style={{ margin: 0 }}>
                  {mergeEnabled && results.length !== displayResults.length ? (
                    <span>合并结果 ({displayResults.length} 个 / 原 {results.length} 个)</span>
                  ) : (
                    <span>转换结果 ({displayResults.length} 个)</span>
                  )}
                </Divider>
              </div>
              <Button
                size="small"
                icon={<ExportOutlined />}
                onClick={handleExportCSV}
              >
                导出 CSV
              </Button>
            </div>
            {displayResults.map((result, index) => (
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
