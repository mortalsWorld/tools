import React, { useState, useMemo } from 'react';
import {
  InputNumber,
  Space,
  Tag,
  Row,
  Col,
  Tooltip,
  Button,
  Select
} from 'antd';
import {
  PlusOutlined,
  MinusOutlined,
  CloseOutlined,
  DeleteOutlined
} from '@ant-design/icons';

interface RaidConfig {
  name: string;
  shortName: string;
  minDisks: number;
  requiresEven: boolean;
  description: string;
  capacityFormula: (diskSize: number, diskCount: number) => number;
  protectionSize: (diskSize: number, diskCount: number) => number;
  color: string;
}

const RAID_CONFIGS: Record<string, RaidConfig> = {
  raid0: {
    name: 'RAID 0 (条带化)',
    shortName: 'RAID 0',
    minDisks: 2,
    requiresEven: false,
    description: '数据条带化分布，无冗余，性能最佳',
    capacityFormula: (size, count) => size * count,
    protectionSize: () => 0,
    color: '#ff4d4f'
  },
  raid1: {
    name: 'RAID 1 (镜像)',
    shortName: 'RAID 1',
    minDisks: 2,
    requiresEven: false,
    description: '数据完全镜像，高可靠性',
    capacityFormula: (size) => size,
    protectionSize: (size, count) => size * (count - 1),
    color: '#52c41a'
  },
  raid5: {
    name: 'RAID 5 (分布式奇偶校验)',
    shortName: 'RAID 5',
    minDisks: 3,
    requiresEven: false,
    description: '数据和奇偶校验分布式存储，兼顾容量和容错',
    capacityFormula: (size, count) => size * (count - 1),
    protectionSize: (size) => size,
    color: '#1890ff'
  },
  raid6: {
    name: 'RAID 6 (双分布式奇偶校验)',
    shortName: 'RAID 6',
    minDisks: 4,
    requiresEven: false,
    description: '双重奇偶校验，更高容错能力',
    capacityFormula: (size, count) => size * (count - 2),
    protectionSize: (size) => size * 2,
    color: '#722ed1'
  },
  raid10: {
    name: 'RAID 10 (镜像+条带化)',
    shortName: 'RAID 10',
    minDisks: 4,
    requiresEven: true,
    description: '先镜像后条带化，兼顾性能和容错',
    capacityFormula: (size, count) => size * (count / 2),
    protectionSize: (size, count) => size * (count / 2),
    color: '#13c2c2'
  }
};

const HDD_PRESETS = [
  { label: '24 TB', value: 24000 },
  { label: '20 TB', value: 20000 },
  { label: '18 TB', value: 18000 },
  { label: '16 TB', value: 16000 },
  { label: '14 TB', value: 14000 },
  { label: '12 TB', value: 12000 },
  { label: '10 TB', value: 10000 },
  { label: '8 TB', value: 8000 },
  { label: '6 TB', value: 6000 },
  { label: '4 TB', value: 4000 },
  { label: '3 TB', value: 3000 },
  { label: '2 TB', value: 2000 },
  { label: '1 TB', value: 1000 }
];

const SSD_PRESETS = [
  { label: '30.72 TB', value: 30720 },
  { label: '15.36 TB', value: 15360 },
  { label: '7.68 TB', value: 7680 },
  { label: '3.84 TB', value: 3840 },
  { label: '1.92 TB', value: 1920 },
  { label: '960 GB', value: 960 },
  { label: '480 GB', value: 480 },
  { label: '240 GB', value: 240 }
];

function formatSize(gb: number): string {
  if (gb >= 1000) {
    return (gb / 1000).toFixed(gb % 1000 === 0 ? 0 : 2) + ' TB';
  }
  return gb + ' GB';
}

function formatSizeBinary(gb: number): string {
  const tb = gb / 1024;
  if (tb >= 1) {
    return tb.toFixed(2) + ' TB';
  }
  return gb.toFixed(0) + ' GB';
}

interface DiskGroup {
  id: number;
  size: number;
  count: number;
}

export const RaidCalculator: React.FC = () => {
  const [diskType, setDiskType] = useState<'hdd' | 'ssd'>('hdd');
  const [diskGroups, setDiskGroups] = useState<DiskGroup[]>([
    { id: 1, size: 1000, count: 4 }
  ]);
  const [nextId, setNextId] = useState(2);
  const [comparisonRows, setComparisonRows] = useState<string[]>(['raid5', 'raid6', 'raid10']);

  const presets = diskType === 'hdd' ? HDD_PRESETS : SSD_PRESETS;

  // 混合硬盘计算逻辑（参考群晖）
  const totalDisks = diskGroups.reduce((sum, g) => sum + g.count, 0);
  const rawTotal = diskGroups.reduce((sum, g) => sum + g.size * g.count, 0);
  const minSize = diskGroups.length > 0 ? Math.min(...diskGroups.map(g => g.size)) : 0;
  const sizeAfterReserve = Math.max(0, minSize - 10);
  const reserved = totalDisks * 10;

  const results = useMemo(() => {
    return comparisonRows.map((raidType, index) => {
      const config = RAID_CONFIGS[raidType];
      const meetsMin = totalDisks >= config.minDisks;
      const meetsEven = !config.requiresEven || totalDisks % 2 === 0;
      const valid = meetsMin && meetsEven;

      const usable = valid ? config.capacityFormula(sizeAfterReserve, totalDisks) : 0;
      const protection = valid ? config.protectionSize(sizeAfterReserve, totalDisks) : 0;
      const unused = valid ? Math.max(0, rawTotal - reserved - usable - protection) : 0;
      const usablePercent = rawTotal > 0 ? ((usable / rawTotal) * 100).toFixed(1) : '0';

      return {
        index,
        raidType,
        name: config.name,
        shortName: config.shortName,
        valid,
        meetsMin,
        meetsEven,
        usable,
        protection,
        reserved,
        unused,
        rawTotal,
        usablePercent,
        minDisks: config.minDisks,
        requiresEven: config.requiresEven,
        color: config.color
      };
    });
  }, [comparisonRows, totalDisks, sizeAfterReserve, rawTotal, reserved]);

  const addDiskGroup = () => {
    setDiskGroups([...diskGroups, { id: nextId, size: 1000, count: 1 }]);
    setNextId(nextId + 1);
  };

  const removeDiskGroup = (id: number) => {
    if (diskGroups.length <= 1) return;
    setDiskGroups(diskGroups.filter(g => g.id !== id));
  };

  const updateDiskGroup = (id: number, updates: Partial<DiskGroup>) => {
    setDiskGroups(diskGroups.map(g => g.id === id ? { ...g, ...updates } : g));
  };

  const addRow = () => {
    const allKeys = Object.keys(RAID_CONFIGS);
    const unused = allKeys.find(k => !comparisonRows.includes(k));
    if (unused) {
      setComparisonRows([...comparisonRows, unused]);
    } else if (comparisonRows.length < allKeys.length + 2) {
      setComparisonRows([...comparisonRows, 'raid5']);
    }
  };

  const removeRow = (idx: number) => {
    if (comparisonRows.length <= 1) return;
    const newRows = [...comparisonRows];
    newRows.splice(idx, 1);
    setComparisonRows(newRows);
  };

  const changeRow = (idx: number, value: string) => {
    const newRows = [...comparisonRows];
    newRows[idx] = value;
    setComparisonRows(newRows);
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* 步骤1：选择硬盘 */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
          <span style={{
            background: '#374151',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: '4px',
            marginRight: '12px'
          }}>步骤 1</span>
          <span style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937' }}>选择硬盘</span>
        </div>

        {/* HDD / SSD 标签页 */}
        <div style={{ borderBottom: '1px solid #e5e7eb', marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => setDiskType('hdd')}
              style={{
                padding: '8px 20px',
                fontSize: '15px',
                fontWeight: 600,
                border: 'none',
                borderBottom: diskType === 'hdd' ? '2px solid #2563eb' : '2px solid transparent',
                background: 'transparent',
                color: diskType === 'hdd' ? '#2563eb' : '#6b7280',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              HDD
            </button>
            <button
              onClick={() => setDiskType('ssd')}
              style={{
                padding: '8px 20px',
                fontSize: '15px',
                fontWeight: 600,
                border: 'none',
                borderBottom: diskType === 'ssd' ? '2px solid #2563eb' : '2px solid transparent',
                background: 'transparent',
                color: diskType === 'ssd' ? '#2563eb' : '#6b7280',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              SSD
            </button>
          </div>
        </div>

        {/* 预设容量选择 */}
        <div style={{ marginBottom: '20px' }}>
          <Row gutter={[12, 12]}>
            {presets.map((preset) => (
              <Col key={preset.value}>
                <Button
                  size="large"
                  onClick={() => {
                    // 点击预设：如果只有一组且是默认状态，替换；否则新增一组
                    if (diskGroups.length === 1 && diskGroups[0].size === 1000 && diskGroups[0].count === 4) {
                      setDiskGroups([{ ...diskGroups[0], size: preset.value }]);
                    } else {
                      setDiskGroups([...diskGroups, { id: nextId, size: preset.value, count: 1 }]);
                      setNextId(nextId + 1);
                    }
                  }}
                  style={{
                    minWidth: '100px',
                    height: '44px',
                    fontSize: '14px',
                    fontWeight: 500
                  }}
                >
                  {preset.label}
                </Button>
              </Col>
            ))}
          </Row>
        </div>

        {/* 硬盘组列表 */}
        <div style={{ marginBottom: '16px' }}>
          {diskGroups.map((group) => (
            <Row key={group.id} gutter={16} style={{ marginBottom: '12px', alignItems: 'center' }}>
              <Col>
                <div style={{ marginBottom: '4px', color: '#666', fontSize: '13px' }}>单盘容量 (GB)</div>
                <InputNumber
                  min={1}
                  max={100000}
                  value={group.size}
                  onChange={(v) => updateDiskGroup(group.id, { size: v || 1 })}
                  style={{ width: '140px' }}
                  addonAfter="GB"
                />
              </Col>
              <Col>
                <div style={{ marginBottom: '4px', color: '#666', fontSize: '13px' }}>数量</div>
                <Space>
                  <Button
                    icon={<MinusOutlined />}
                    onClick={() => updateDiskGroup(group.id, { count: Math.max(1, group.count - 1) })}
                    disabled={group.count <= 1}
                  />
                  <InputNumber
                    min={1}
                    max={64}
                    value={group.count}
                    onChange={(v) => updateDiskGroup(group.id, { count: v || 1 })}
                    style={{ width: '70px', textAlign: 'center' }}
                    controls={false}
                  />
                  <Button
                    icon={<PlusOutlined />}
                    onClick={() => updateDiskGroup(group.id, { count: Math.min(64, group.count + 1) })}
                    disabled={group.count >= 64}
                  />
                </Space>
              </Col>
              <Col style={{ display: 'flex', alignItems: 'flex-end' }}>
                <Button
                  icon={<DeleteOutlined />}
                  danger
                  onClick={() => removeDiskGroup(group.id)}
                  disabled={diskGroups.length <= 1}
                >
                  删除
                </Button>
              </Col>
            </Row>
          ))}
          <Button icon={<PlusOutlined />} onClick={addDiskGroup} style={{ marginTop: '8px' }}>
            添加不同容量硬盘
          </Button>
        </div>

        {/* 硬盘槽位可视化 */}
        <div
          style={{
            background: '#1f2937',
            borderRadius: '8px',
            padding: '16px',
            minHeight: '100px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            alignItems: 'center'
          }}
        >
          {diskGroups.flatMap((group) =>
            Array.from({ length: group.count }).map((_, i) => (
              <div
                key={`${group.id}-${i}`}
                style={{
                  width: '72px',
                  height: '50px',
                  borderRadius: '4px',
                  background: diskType === 'ssd' ? '#374151' : '#4b5563',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '12px',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontWeight: 600 }}>{formatSize(group.size)}</div>
                <div style={{ fontSize: '10px', opacity: 0.7 }}>{diskType.toUpperCase()}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <span style={{ color: '#666' }}>硬盘总数:</span>
            <Tag color="blue">{totalDisks}</Tag>
            <span style={{ color: '#666' }}>原始总容量:</span>
            <Tag color="green">{formatSizeBinary(rawTotal)}</Tag>
            {diskGroups.length > 1 && (
              <>
                <span style={{ color: '#666' }}>最小盘容量:</span>
                <Tag color="orange">{formatSizeBinary(minSize)}</Tag>
              </>
            )}
          </Space>
          <Button
            icon={<CloseOutlined />}
            onClick={() => { setDiskGroups([{ id: 1, size: 1000, count: 4 }]); setNextId(2); }}
          >
            重置
          </Button>
        </div>
      </div>

      {/* 步骤2：预计使用情况 */}
      <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
          <span style={{
            background: '#374151',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: '4px',
            marginRight: '12px'
          }}>步骤 2</span>
          <span style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937' }}>预计使用情况</span>
        </div>

        {/* RAID 对比行 */}
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {results.map((result) => (
            <div key={result.index}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <Space>
                  <Select
                    value={result.raidType}
                    style={{ width: '160px' }}
                    size="small"
                    onChange={(value) => changeRow(result.index, value)}
                    options={Object.entries(RAID_CONFIGS).map(([key, config]) => ({
                      value: key,
                      label: config.shortName
                    }))}
                  />
                  {!result.meetsMin && (
                    <Tag color="red">需 ≥{result.minDisks} 块硬盘</Tag>
                  )}
                  {result.meetsMin && !result.meetsEven && (
                    <Tag color="red">需偶数块硬盘</Tag>
                  )}
                </Space>
                <Space>
                  {result.valid && (
                    <>
                      <span style={{ fontSize: '13px', color: '#666' }}>
                        可用: <strong style={{ color: '#52c4c4' }}>{formatSizeBinary(result.usable)}</strong>
                      </span>
                      <span style={{ fontSize: '13px', color: '#666' }}>
                        利用率: <strong>{result.usablePercent}%</strong>
                      </span>
                    </>
                  )}
                  <Button
                    icon={<CloseOutlined />}
                    size="small"
                    onClick={() => removeRow(result.index)}
                    disabled={comparisonRows.length <= 1}
                  />
                </Space>
              </div>

              {result.valid ? (
                <div style={{ display: 'flex', height: '40px', borderRadius: '6px', overflow: 'hidden', background: '#e5e7eb' }}>
                  {/* 系统保留 */}
                  {result.reserved > 0 && (
                    <Tooltip title={`系统保留: ${formatSizeBinary(result.reserved)}`}>
                      <div
                        style={{
                          width: `${(result.reserved / result.rawTotal) * 100}%`,
                          background: '#fa8c16',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 600,
                          minWidth: result.reserved / result.rawTotal > 0.02 ? undefined : '4px'
                        }}
                      >
                        {result.reserved / result.rawTotal > 0.05 && formatSizeBinary(result.reserved)}
                      </div>
                    </Tooltip>
                  )}
                  {/* 可用容量 */}
                  <Tooltip title={`可用容量: ${formatSizeBinary(result.usable)}`}>
                    <div
                      style={{
                        width: `${(result.usable / result.rawTotal) * 100}%`,
                        background: '#52c4c4',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 600,
                        minWidth: result.usable / result.rawTotal > 0.02 ? undefined : '4px'
                      }}
                    >
                      {result.usable / result.rawTotal > 0.08 && formatSizeBinary(result.usable)}
                    </div>
                  </Tooltip>
                  {/* 保护/冗余 */}
                  {result.protection > 0 && (
                    <Tooltip title={`保护/冗余: ${formatSizeBinary(result.protection)}`}>
                      <div
                        style={{
                          width: `${(result.protection / result.rawTotal) * 100}%`,
                          background: '#2b6cb0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 600,
                          minWidth: result.protection / result.rawTotal > 0.02 ? undefined : '4px'
                        }}
                      >
                        {result.protection / result.rawTotal > 0.05 && formatSizeBinary(result.protection)}
                      </div>
                    </Tooltip>
                  )}
                  {/* 未使用 */}
                  {result.unused > 0 && (
                    <Tooltip title={`未使用: ${formatSizeBinary(result.unused)}`}>
                      <div
                        style={{
                          width: `${(result.unused / result.rawTotal) * 100}%`,
                          background: '#a0aec0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 600,
                          minWidth: result.unused / result.rawTotal > 0.02 ? undefined : '4px'
                        }}
                      >
                        {result.unused / result.rawTotal > 0.05 && formatSizeBinary(result.unused)}
                      </div>
                    </Tooltip>
                  )}
                </div>
              ) : (
                <div style={{ height: '40px', borderRadius: '6px', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                  {!result.meetsMin
                    ? `硬盘数量不足，${result.shortName} 最少需要 ${result.minDisks} 块硬盘`
                    : `${result.shortName} 需要偶数块硬盘（当前 ${totalDisks} 块）`}
                </div>
              )}
            </div>
          ))}
        </Space>

        <Button icon={<PlusOutlined />} onClick={addRow} style={{ marginTop: '16px' }}>
          添加对比
        </Button>

        {/* 图例 */}
        <div style={{ marginTop: '20px', padding: '12px 16px', background: '#fff', borderRadius: '6px', display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Space>
            <div style={{ width: '16px', height: '16px', background: '#fa8c16', borderRadius: '3px' }} />
            <span style={{ fontSize: '13px' }}>系统保留容量</span>
          </Space>
          <Space>
            <div style={{ width: '16px', height: '16px', background: '#52c4c4', borderRadius: '3px' }} />
            <span style={{ fontSize: '13px' }}>可用容量</span>
          </Space>
          <Space>
            <div style={{ width: '16px', height: '16px', background: '#2b6cb0', borderRadius: '3px' }} />
            <span style={{ fontSize: '13px' }}>保护</span>
          </Space>
          <Space>
            <div style={{ width: '16px', height: '16px', background: '#a0aec0', borderRadius: '3px' }} />
            <span style={{ fontSize: '13px' }}>未使用</span>
          </Space>
        </div>

        <div style={{ marginTop: '16px', fontSize: '12px', color: '#888' }}>
          计算逻辑说明：当使用不同容量的硬盘时，RAID 以最小盘容量为基准，大容量硬盘的多余空间标记为"未使用"。每块盘保留 10GB 系统空间。
        </div>
      </div>
    </div>
  );
};
