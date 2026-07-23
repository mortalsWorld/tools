import React, { useState, useMemo } from 'react';
import {
  Card,
  InputNumber,
  Select,
  Space,
  Tag,
  Row,
  Col,
  Alert,
  Tooltip,
  Button,
  Tabs
} from 'antd';
import {
  HddOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  PlusOutlined,
  MinusOutlined,
  CloseOutlined,
  DatabaseOutlined
} from '@ant-design/icons';

interface RaidConfig {
  name: string;
  shortName: string;
  minDisks: number;
  description: string;
  capacityFormula: (diskSize: number, diskCount: number) => number;
  protectionSize: (diskSize: number, diskCount: number) => number;
  reservedSize: (diskSize: number, diskCount: number) => number;
  color: string;
}

const RAID_CONFIGS: Record<string, RaidConfig> = {
  raid0: {
    name: 'RAID 0 (条带化)',
    shortName: 'RAID 0',
    minDisks: 2,
    description: '数据条带化分布，无冗余，性能最佳',
    capacityFormula: (size, count) => size * count,
    protectionSize: () => 0,
    reservedSize: () => 0,
    color: '#ff4d4f'
  },
  raid1: {
    name: 'RAID 1 (镜像)',
    shortName: 'RAID 1',
    minDisks: 2,
    description: '数据完全镜像，高可靠性',
    capacityFormula: (size) => size,
    protectionSize: (size, count) => size * (count - 1),
    reservedSize: () => 0,
    color: '#52c41a'
  },
  raid5: {
    name: 'RAID 5 (分布式奇偶校验)',
    shortName: 'RAID 5',
    minDisks: 3,
    description: '数据和奇偶校验分布式存储，兼顾容量和容错',
    capacityFormula: (size, count) => size * (count - 1),
    protectionSize: (size) => size,
    reservedSize: (size) => size * 0.02,
    color: '#1890ff'
  },
  raid6: {
    name: 'RAID 6 (双分布式奇偶校验)',
    shortName: 'RAID 6',
    minDisks: 4,
    description: '双重奇偶校验，更高容错能力',
    capacityFormula: (size, count) => size * (count - 2),
    protectionSize: (size) => size * 2,
    reservedSize: (size) => size * 0.02,
    color: '#722ed1'
  },
  raid10: {
    name: 'RAID 10 (镜像+条带化)',
    shortName: 'RAID 10',
    minDisks: 4,
    description: '先镜像后条带化，兼顾性能和容错',
    capacityFormula: (size, count) => size * (count / 2),
    protectionSize: (size, count) => size * (count / 2),
    reservedSize: () => 0,
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

export const RaidCalculator: React.FC = () => {
  const [diskType, setDiskType] = useState<'hdd' | 'ssd'>('hdd');
  const [diskSize, setDiskSize] = useState<number>(1000);
  const [diskCount, setDiskCount] = useState<number>(4);
  const [selectedRaids, setSelectedRaids] = useState<string[]>(['raid5', 'raid6', 'raid10']);

  const presets = diskType === 'hdd' ? HDD_PRESETS : SSD_PRESETS;

  const sizeInGB = diskSize;
  const rawTotal = sizeInGB * diskCount;

  const results = useMemo(() => {
    return selectedRaids.map(raidType => {
      const config = RAID_CONFIGS[raidType];
      const valid = diskCount >= config.minDisks;
      const usable = valid ? config.capacityFormula(sizeInGB, diskCount) : 0;
      const protection = valid ? config.protectionSize(sizeInGB, diskCount) : 0;
      const reserved = valid ? config.reservedSize(sizeInGB, diskCount) : 0;
      const unused = valid ? rawTotal - usable - protection - reserved : 0;
      const usablePercent = rawTotal > 0 ? ((usable / rawTotal) * 100).toFixed(1) : '0';

      return {
        key: raidType,
        raidType,
        name: config.name,
        shortName: config.shortName,
        valid,
        usable,
        protection,
        reserved,
        unused,
        rawTotal,
        usablePercent,
        minDisks: config.minDisks,
        color: config.color
      };
    });
  }, [selectedRaids, diskCount, sizeInGB, rawTotal]);

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* 步骤1：选择硬盘 */}
      <Card
        title={
          <Space>
            <Tag color="default" style={{ fontSize: '14px', padding: '2px 8px' }}>步骤 1</Tag>
            <span style={{ fontSize: '18px', fontWeight: 600 }}>选择硬盘</span>
          </Space>
        }
        style={{ marginBottom: '24px' }}
      >
        <Tabs
          activeKey={diskType}
          onChange={(key) => setDiskType(key as 'hdd' | 'ssd')}
          items={[
            {
              key: 'hdd',
              label: (
                <Space>
                  <HddOutlined />
                  <span>HDD</span>
                </Space>
              )
            },
            {
              key: 'ssd',
              label: (
                <Space>
                  <DatabaseOutlined />
                  <span>SSD</span>
                </Space>
              )
            }
          ]}
        />

        {/* 预设容量选择 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ marginBottom: '8px', color: '#666', fontSize: '13px' }}>快速选择容量</div>
          <Row gutter={[8, 8]}>
            {presets.map((preset) => (
              <Col key={preset.value}>
                <Button
                  type={diskSize === preset.value ? 'primary' : 'default'}
                  size="small"
                  onClick={() => setDiskSize(preset.value)}
                  style={{ minWidth: '80px' }}
                >
                  {preset.label}
                </Button>
              </Col>
            ))}
          </Row>
        </div>

        {/* 自定义容量和数量 */}
        <Row gutter={24} style={{ marginBottom: '16px' }}>
          <Col>
            <div style={{ marginBottom: '8px', color: '#666', fontSize: '13px' }}>单盘容量 (GB)</div>
            <InputNumber
              min={1}
              max={100000}
              value={diskSize}
              onChange={(v) => setDiskSize(v || 1)}
              style={{ width: '150px' }}
              addonAfter="GB"
            />
          </Col>
          <Col>
            <div style={{ marginBottom: '8px', color: '#666', fontSize: '13px' }}>磁盘数量</div>
            <Space>
              <Button
                icon={<MinusOutlined />}
                onClick={() => setDiskCount(Math.max(1, diskCount - 1))}
                disabled={diskCount <= 1}
              />
              <InputNumber
                min={1}
                max={64}
                value={diskCount}
                onChange={(v) => setDiskCount(v || 1)}
                style={{ width: '80px', textAlign: 'center' }}
                controls={false}
              />
              <Button
                icon={<PlusOutlined />}
                onClick={() => setDiskCount(Math.min(64, diskCount + 1))}
                disabled={diskCount >= 64}
              />
            </Space>
          </Col>
          <Col style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Button icon={<CloseOutlined />} onClick={() => { setDiskCount(4); setDiskSize(1000); }}>
              重置
            </Button>
          </Col>
        </Row>

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
          {Array.from({ length: Math.max(diskCount, 12) }).map((_, i) => (
            <div
              key={i}
              style={{
                width: '72px',
                height: '90px',
                borderRadius: '4px',
                border: i < diskCount ? 'none' : '2px dashed #4b5563',
                background: i < diskCount
                  ? diskType === 'ssd' ? '#374151' : '#4b5563'
                  : 'transparent',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: i < diskCount ? '#fff' : '#6b7280',
                fontSize: i < diskCount ? '13px' : '12px',
                transition: 'all 0.2s'
              }}
            >
              {i < diskCount ? (
                <>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                    {formatSize(diskSize)}
                  </div>
                  <div style={{ fontSize: '11px', opacity: 0.7 }}>
                    {diskType.toUpperCase()}
                  </div>
                </>
              ) : (
                <span style={{ fontSize: '18px' }}>+</span>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <span style={{ color: '#666' }}>硬盘总数:</span>
            <Tag color="blue">{diskCount}</Tag>
            <span style={{ color: '#666' }}>原始总容量:</span>
            <Tag color="green">{formatSizeBinary(rawTotal * 1024 * 1024 * 1024)}</Tag>
          </Space>
        </div>
      </Card>

      {/* 步骤2：预计使用情况 */}
      <Card
        title={
          <Space>
            <Tag color="default" style={{ fontSize: '14px', padding: '2px 8px' }}>步骤 2</Tag>
            <span style={{ fontSize: '18px', fontWeight: 600 }}>预计使用情况</span>
          </Space>
        }
      >
        <Alert
          message="选择 RAID 级别查看容量分配情况"
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          style={{ marginBottom: '16px' }}
        />

        {/* RAID 选择 */}
        <div style={{ marginBottom: '24px' }}>
          <Select
            mode="multiple"
            value={selectedRaids}
            onChange={setSelectedRaids}
            style={{ width: '100%' }}
            placeholder="选择要对比的 RAID 级别"
          >
            {Object.entries(RAID_CONFIGS).map(([key, config]) => (
              <Select.Option key={key} value={key}>
                <Space>
                  <span style={{ color: config.color, fontWeight: 600 }}>{config.shortName}</span>
                  <span style={{ color: '#999' }}>- {config.description}</span>
                  <Tag>最少 {config.minDisks} 块</Tag>
                </Space>
              </Select.Option>
            ))}
          </Select>
        </div>

        {/* RAID 容量分布可视化 */}
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {results.map((result) => (
            <div key={result.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <Space>
                  <Select
                    value={result.raidType}
                    style={{ width: '140px' }}
                    size="small"
                    onChange={(value) => {
                      const newRaids = [...selectedRaids];
                      const idx = newRaids.indexOf(result.raidType);
                      if (idx >= 0) newRaids[idx] = value;
                      setSelectedRaids(newRaids);
                    }}
                    options={Object.entries(RAID_CONFIGS).map(([key, config]) => ({
                      value: key,
                      label: config.shortName
                    }))}
                  />
                  {!result.valid && (
                    <Tag color="red">需 ≥{result.minDisks} 块硬盘</Tag>
                  )}
                </Space>
                {result.valid && (
                  <Space>
                    <span style={{ fontSize: '13px', color: '#666' }}>
                      可用: <strong style={{ color: '#52c41a' }}>{formatSizeBinary(result.usable * 1024 * 1024 * 1024)}</strong>
                    </span>
                    <span style={{ fontSize: '13px', color: '#666' }}>
                      利用率: <strong>{result.usablePercent}%</strong>
                    </span>
                  </Space>
                )}
              </div>

              {result.valid ? (
                <div style={{ display: 'flex', height: '40px', borderRadius: '6px', overflow: 'hidden', background: '#f0f0f0' }}>
                  {/* 系统保留 */}
                  {result.reserved > 0 && (
                    <Tooltip title={`系统保留: ${formatSizeBinary(result.reserved * 1024 * 1024 * 1024)}`}>
                      <div
                        style={{
                          width: `${(result.reserved / result.rawTotal) * 100}%`,
                          background: '#faad14',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 600,
                          minWidth: result.reserved / result.rawTotal > 0.02 ? undefined : '4px'
                        }}
                      >
                        {result.reserved / result.rawTotal > 0.05 && formatSizeBinary(result.reserved * 1024 * 1024 * 1024)}
                      </div>
                    </Tooltip>
                  )}
                  {/* 可用容量 */}
                  <Tooltip title={`可用容量: ${formatSizeBinary(result.usable * 1024 * 1024 * 1024)}`}>
                    <div
                      style={{
                        width: `${(result.usable / result.rawTotal) * 100}%`,
                        background: '#52c41a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 600,
                        minWidth: result.usable / result.rawTotal > 0.02 ? undefined : '4px'
                      }}
                    >
                      {result.usable / result.rawTotal > 0.08 && formatSizeBinary(result.usable * 1024 * 1024 * 1024)}
                    </div>
                  </Tooltip>
                  {/* 保护/冗余 */}
                  {result.protection > 0 && (
                    <Tooltip title={`保护/冗余: ${formatSizeBinary(result.protection * 1024 * 1024 * 1024)}`}>
                      <div
                        style={{
                          width: `${(result.protection / result.rawTotal) * 100}%`,
                          background: '#1890ff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 600,
                          minWidth: result.protection / result.rawTotal > 0.02 ? undefined : '4px'
                        }}
                      >
                        {result.protection / result.rawTotal > 0.05 && formatSizeBinary(result.protection * 1024 * 1024 * 1024)}
                      </div>
                    </Tooltip>
                  )}
                  {/* 未使用 */}
                  {result.unused > 0 && (
                    <Tooltip title={`未使用: ${formatSizeBinary(result.unused * 1024 * 1024 * 1024)}`}>
                      <div
                        style={{
                          width: `${(result.unused / result.rawTotal) * 100}%`,
                          background: '#d9d9d9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#666',
                          fontSize: '12px',
                          fontWeight: 600,
                          minWidth: result.unused / result.rawTotal > 0.02 ? undefined : '4px'
                        }}
                      >
                        {result.unused / result.rawTotal > 0.05 && formatSizeBinary(result.unused * 1024 * 1024 * 1024)}
                      </div>
                    </Tooltip>
                  )}
                </div>
              ) : (
                <div style={{ height: '40px', borderRadius: '6px', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                  硬盘数量不足，无法构建 {result.shortName}
                </div>
              )}
            </div>
          ))}
        </Space>

        {/* 图例 */}
        <div style={{ marginTop: '24px', padding: '12px 16px', background: '#f6ffed', borderRadius: '6px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <Space>
            <div style={{ width: '16px', height: '16px', background: '#faad14', borderRadius: '3px' }} />
            <span style={{ fontSize: '13px' }}>系统保留容量</span>
          </Space>
          <Space>
            <div style={{ width: '16px', height: '16px', background: '#52c41a', borderRadius: '3px' }} />
            <span style={{ fontSize: '13px' }}>可用容量</span>
          </Space>
          <Space>
            <div style={{ width: '16px', height: '16px', background: '#1890ff', borderRadius: '3px' }} />
            <span style={{ fontSize: '13px' }}>保护/冗余</span>
          </Space>
          <Space>
            <div style={{ width: '16px', height: '16px', background: '#d9d9d9', borderRadius: '3px' }} />
            <span style={{ fontSize: '13px' }}>未使用</span>
          </Space>
        </div>

        <Alert
          message="注意事项"
          description={
            <ul style={{ margin: 0, paddingLeft: '16px' }}>
              <li>实际可用容量会因磁盘厂商的十进制换算（1TB=1000GB）与操作系统的二进制换算（1TB=1024GB）而略有差异</li>
              <li>RAID 不是备份方案，仍需定期备份重要数据</li>
              <li>重建大容量磁盘时耗时较长，期间存在二次故障风险</li>
              <li>部分 RAID 级别会有少量系统保留空间用于元数据存储</li>
            </ul>
          }
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginTop: '16px' }}
        />
      </Card>

      {/* RAID 类型说明卡片 */}
      <Card title="RAID 类型速查" style={{ marginTop: '24px' }} size="small">
        <Row gutter={[16, 16]}>
          {Object.entries(RAID_CONFIGS).map(([key, config]) => (
            <Col xs={24} sm={12} md={8} key={key}>
              <Card size="small" style={{ height: '100%', borderLeft: `4px solid ${config.color}` }}>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>{config.name}</div>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>{config.description}</div>
                <Space>
                  <Tag color="default" style={{ fontSize: '12px' }}>最少 {config.minDisks} 块</Tag>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  );
};
