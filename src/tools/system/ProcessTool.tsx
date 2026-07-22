import React, { useState, useEffect, useMemo } from 'react'
import { 
  Card, Table, Button, Input, Space, Tag, message, Modal, Descriptions, Progress, 
  Row, Col, Typography, Checkbox, Radio, theme, Tooltip, Badge, Empty, Spin,
  Tabs
} from 'antd'
import { 
  ReloadOutlined, DeleteOutlined, SearchOutlined, FileSearchOutlined, 
  CiOutlined, DatabaseOutlined, MacCommandOutlined, WifiOutlined, 
  MoreOutlined, CloseCircleOutlined, AppstoreOutlined, FolderOpenOutlined,
  FolderAddOutlined, FileAddOutlined
} from '@ant-design/icons'

const { Title, Text } = Typography

interface ProcessInfo {
  pid: number
  name: string
  memory: string
  memoryBytes: number
  cpuUsage: number
  ports: number[]
}

interface SystemInfo {
  cpu: {
    name: string
    cores: number
    logicalProcessors: number
    maxSpeed: number
    usage?: number
  }
  memory: {
    total: number
    free: number
    used: number
  }
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0 || isNaN(bytes)) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const getStatusColor = (percent: number): string => {
  if (percent > 80) return '#ff4d4f'
  if (percent > 50) return '#fa8c16'
  return '#52c41a'
}

export const ProcessTool: React.FC = () => {
  const { token } = theme.useToken()
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null)
  const [fileSearchText, setFileSearchText] = useState('')
  const [fileHandles, setFileHandles] = useState<number[]>([])
  const [fileSearching, setFileSearching] = useState(false)
  const [searchType, setSearchType] = useState<'file' | 'directory'>('file')
  const [selectedPids, setSelectedPids] = useState<Set<number>>(new Set())
  const [selectAll, setSelectAll] = useState(false)
  const [cpuUsage, setCpuUsage] = useState<number>(0)
  const [portSearchText, setPortSearchText] = useState('')
  const [expandedPorts, setExpandedPorts] = useState<Set<number>>(new Set())
  const [activeTab, setActiveTab] = useState<'process' | 'file'>('process')

  const loadProcesses = async () => {
    setLoading(true)
    try {
      const data = await window.electronAPI.getProcesses()
      const filteredData = data.filter(p => p.pid !== 0 && p.name !== 'System Idle Process')
      setProcesses(filteredData)
      setSelectedPids(new Set())
      setSelectAll(false)
    } catch (error) {
      message.error('获取进程列表失败')
    }
    setLoading(false)
  }

  const loadSystemInfo = async () => {
    try {
      const info = await window.electronAPI.getSystemInfo()
      setSystemInfo(info)
      if (info && info.cpu) {
        setCpuUsage(info.cpu.usage || 0)
      }
    } catch (error) {
      message.error('获取系统信息失败')
    }
  }

  const handleRefresh = () => {
    setLoading(true)
    setFileHandles([])
    setFileSearchText('')
    Promise.all([
      loadProcesses(),
      loadSystemInfo()
    ]).finally(() => {
      setLoading(false)
    })
  }

  useEffect(() => {
    loadProcesses()
    loadSystemInfo()
  }, [])

  const handleKillProcess = async (pid: number) => {
    Modal.confirm({
      title: '确认关闭进程',
      content: `确定要关闭进程 <strong>PID: ${pid}</strong> 吗？`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        const result = await window.electronAPI.killProcess(pid)
        if (result.success) {
          message.success('进程已关闭')
          loadProcesses()
        } else {
          message.error(result.error || '关闭进程失败')
        }
      }
    })
  }

  const handleKillProcesses = async () => {
    const pids = Array.from(selectedPids)
    if (pids.length === 0) {
      message.warning('请先选择要关闭的进程')
      return
    }
    Modal.confirm({
      title: `确认批量关闭进程`,
      content: `确定要关闭选中的 <strong>${pids.length}</strong> 个进程吗？`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        const result = await (window.electronAPI as any).killProcesses(pids)
        if (result.success) {
          message.success(`成功关闭 ${pids.length - result.errors.length} 个进程`)
          if (result.errors.length > 0) {
            message.warning(`有 ${result.errors.length} 个进程关闭失败`)
          }
          loadProcesses()
        } else {
          message.error('批量关闭进程失败')
        }
      }
    })
  }

  const handleSelectPath = async () => {
    try {
      if (searchType === 'directory') {
        const dir = await window.electronAPI.selectDirectory()
        if (dir) {
          setFileSearchText(dir)
        }
      } else {
        const file = await window.electronAPI.selectFile()
        if (file) {
          setFileSearchText(file)
        }
      }
    } catch (error) {
      message.error('选择路径失败')
    }
  }

  const handleFileSearch = async () => {
    if (!fileSearchText.trim()) {
      setFileHandles([])
      return
    }
    setFileSearching(true)
    console.log('[ProcessTool] 开始搜索文件占用:', fileSearchText, '类型:', searchType)
    try {
      console.log('[ProcessTool] 调用 searchFileHandle...')
      const result = await window.electronAPI.searchFileHandle(fileSearchText)
      console.log('[ProcessTool] searchFileHandle 结果:', result)
      let pids = result.map(h => h.Id)
      
      if (searchType === 'directory') {
        console.log('[ProcessTool] 调用 searchDirectoryHandle...')
        const dirResult = await window.electronAPI.searchDirectoryHandle(fileSearchText)
        console.log('[ProcessTool] searchDirectoryHandle 结果:', dirResult)
        const dirPids = dirResult.map(h => h.Id)
        pids = [...new Set([...pids, ...dirPids])]
      }
      
      console.log('[ProcessTool] 最终匹配的 PIDs:', pids)
      setFileHandles(pids)
      if (pids.length === 0) {
        message.info(searchType === 'directory' ? '未找到占用该目录的进程' : '未找到占用该文件的进程')
      }
    } catch (error) {
      console.error('[ProcessTool] 搜索失败，详细错误:', error)
      message.error(searchType === 'directory' ? '搜索目录占用失败' : '搜索文件占用失败')
      setFileHandles([])
    }
    setFileSearching(false)
  }

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedPids(new Set())
    } else {
      setSelectedPids(new Set(filteredProcesses.map(p => p.pid)))
    }
    setSelectAll(!selectAll)
  }

  const toggleSelectPid = (pid: number) => {
    const newSelected = new Set(selectedPids)
    if (newSelected.has(pid)) {
      newSelected.delete(pid)
    } else {
      newSelected.add(pid)
    }
    setSelectedPids(newSelected)
    setSelectAll(newSelected.size === filteredProcesses.length && filteredProcesses.length > 0)
  }

  const togglePortExpand = (pid: number) => {
    const newExpanded = new Set(expandedPorts)
    if (newExpanded.has(pid)) {
      newExpanded.delete(pid)
    } else {
      newExpanded.add(pid)
    }
    setExpandedPorts(newExpanded)
  }

  const filteredProcesses = processes.filter(p => {
    const matchSearch = !searchText ||
      p.name.toLowerCase().includes(searchText.toLowerCase()) ||
      p.pid.toString().includes(searchText)
    const matchFileHandle = fileHandles.length === 0 || fileHandles.includes(p.pid)
    const matchPort = !portSearchText || 
      (p.ports && Array.isArray(p.ports) && p.ports.some(port => port.toString().includes(portSearchText.trim())))
    return matchSearch && matchFileHandle && matchPort
  })

  const memoryTotal = systemInfo?.memory?.total || 1

  const columns = [
    {
      title: (
        <Checkbox
          checked={selectAll}
          onChange={toggleSelectAll}
          disabled={filteredProcesses.length === 0}
        />
      ),
      key: 'checkbox',
      width: 56,
      fixed: 'left' as const,
      render: (_: any, record: ProcessInfo) => (
        <Checkbox
          checked={selectedPids.has(record.pid)}
          onChange={() => toggleSelectPid(record.pid)}
        />
      )
    },
    {
      title: (
        <Space size="small">
          <MacCommandOutlined style={{ fontSize: 14, color: token.colorTextSecondary }} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>PID</span>
        </Space>
      ),
      dataIndex: 'pid',
      key: 'pid',
      width: 90,
      fixed: 'left' as const,
      sorter: (a: ProcessInfo, b: ProcessInfo) => a.pid - b.pid,
      render: (pid: number) => (
        <code style={{ 
          fontSize: 12, 
          fontWeight: 500,
          padding: '4px 10px', 
          background: '#f0f5ff', 
          borderRadius: 6,
          color: '#1890ff'
        }}>
          {pid}
        </code>
      )
    },
    {
      title: (
        <Space size="small">
          <AppstoreOutlined style={{ fontSize: 14, color: token.colorTextSecondary }} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>进程名称</span>
        </Space>
      ),
      dataIndex: 'name',
      key: 'name',
      width: 180,
      sorter: (a: ProcessInfo, b: ProcessInfo) => a.name.localeCompare(b.name),
      ellipsis: true,
      render: (text: string, record: ProcessInfo) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
          <span style={{ fontWeight: 500, fontSize: 13 }}>{text}</span>
          {fileHandles.includes(record.pid) && (
            <Badge status="error" text="占用" style={{ fontSize: 11 }} />
          )}
        </div>
      )
    },
    {
      title: (
        <Space size="small">
          <CiOutlined style={{ fontSize: 14, color: token.colorTextSecondary }} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>CPU</span>
        </Space>
      ),
      dataIndex: 'cpuUsage',
      key: 'cpuUsage',
      width: 130,
      sorter: (a: ProcessInfo, b: ProcessInfo) => a.cpuUsage - b.cpuUsage,
      render: (usage: number) => (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: token.colorTextSecondary }}>使用率</span>
            <span style={{ 
              fontSize: 13, 
              fontWeight: 500, 
              color: getStatusColor(usage) 
            }}>
              {usage.toFixed(1)}%
            </span>
          </div>
          <Progress
            percent={Math.min(usage, 100)}
            size="small"
            showInfo={false}
            strokeColor={getStatusColor(usage)}
            strokeWidth={6}
            trailColor="#f0f0f0"
          />
        </div>
      )
    },
    {
      title: (
        <Space size="small">
          <DatabaseOutlined style={{ fontSize: 14, color: token.colorTextSecondary }} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>内存</span>
        </Space>
      ),
      key: 'memoryUsage',
      width: 160,
      sorter: (a: ProcessInfo, b: ProcessInfo) => a.memoryBytes - b.memoryBytes,
      render: (_: any, record: ProcessInfo) => {
        const usagePercent = (record.memoryBytes / memoryTotal * 100)
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: token.colorTextSecondary }}>已用</span>
              <span style={{ 
                fontSize: 12, 
                fontWeight: 500, 
                color: getStatusColor(usagePercent) 
              }}>
                {formatBytes(record.memoryBytes)}
              </span>
            </div>
            <Progress
              percent={Math.min(usagePercent, 100)}
              size="small"
              showInfo={false}
              strokeColor={getStatusColor(usagePercent)}
              strokeWidth={6}
              trailColor="#f0f0f0"
            />
          </div>
        )
      }
    },
    {
      title: (
        <Space size="small">
          <WifiOutlined style={{ fontSize: 14, color: token.colorTextSecondary }} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>端口</span>
        </Space>
      ),
      dataIndex: 'ports',
      key: 'ports',
      width: 200,
      sorter: (a: ProcessInfo, b: ProcessInfo) => (a.ports?.length || 0) - (b.ports?.length || 0),
      render: (ports: number[], record: ProcessInfo) => {
        if (!ports || ports.length === 0) {
          return <Text type="secondary" style={{ fontSize: 12 }}>-</Text>
        }
        
        const isExpanded = expandedPorts.has(record.pid)
        const displayPorts = isExpanded ? ports : ports.slice(0, 5)
        
        return (
          <div>
            <Space size="small" wrap>
              {displayPorts.map(port => (
                <Tag 
                  key={port} 
                  color="blue" 
                  style={{ 
                    fontSize: 11, 
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontWeight: 500
                  }}
                >
                  {port}
                </Tag>
              ))}
            </Space>
            {ports.length > 5 && (
              <Button
                type="link"
                size="small"
                icon={isExpanded ? <CloseCircleOutlined /> : <MoreOutlined />}
                onClick={() => togglePortExpand(record.pid)}
                style={{ padding: 0, marginLeft: 4, color: '#1890ff' }}
              >
                {isExpanded ? '收起' : `+${ports.length - 5}`}
              </Button>
            )}
          </div>
        )
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right' as const,
      render: (_: any, record: ProcessInfo) => (
        <Tooltip title="结束进程">
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => handleKillProcess(record.pid)}
            style={{ fontSize: 13, padding: '4px 8px' }}
          />
        </Tooltip>
      )
    }
  ]

  const memoryUsed = systemInfo?.memory?.used || 0
  const memoryTotalBytes = systemInfo?.memory?.total || 1
  const memoryPercent = Math.round((memoryUsed / memoryTotalBytes) * 100)

  const statsSummary = useMemo(() => {
    const total = processes.length
    const withPorts = processes.filter(p => p.ports && p.ports.length > 0).length
    return { total, withPorts }
  }, [processes])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '20px 0' }}>
      <div>
        <Title level={4} style={{ margin: 0, marginBottom: 16, color: token.colorTextHeading }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MacCommandOutlined style={{ fontSize: 20 }} />
            系统监控
          </span>
        </Title>
      </div>

      {systemInfo ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <Card 
              hoverable
              bordered={false}
              style={{ 
                height: '100%',
                borderRadius: 16,
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)',
                background: 'linear-gradient(135deg, #ffffff 0%, #f8faff 100%)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ 
                    width: 56, 
                    height: 56, 
                    borderRadius: 16, 
                    background: 'linear-gradient(135deg, #e6f7ff 0%, #b3d9ff 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(24, 144, 255, 0.15)'
                  }}>
                    <CiOutlined style={{ fontSize: 28, color: '#1890ff' }} />
                  </div>
                  <div>
                    <Text strong style={{ display: 'block', fontSize: 15, color: token.colorTextHeading }}>CPU</Text>
                    <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                      {systemInfo.cpu?.name || 'Unknown'}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11, marginTop: 1, display: 'block' }}>
                      {systemInfo.cpu?.cores || 0} 核心 / {systemInfo.cpu?.logicalProcessors || 0} 线程
                    </Text>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>使用率</Text>
                  <div style={{ 
                    fontSize: 40, 
                    fontWeight: 700, 
                    color: getStatusColor(cpuUsage),
                    textShadow: '0 2px 4px rgba(0,0,0,0.05)'
                  }}>
                    {cpuUsage.toFixed(1)}%
                  </div>
                </div>
              </div>
              <Progress
                percent={Math.min(cpuUsage, 100)}
                strokeColor={{
                  '0%': '#1890ff',
                  '100%': getStatusColor(cpuUsage)
                }}
                strokeWidth={10}
                showInfo={false}
                style={{ marginTop: 20 }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12}>
            <Card 
              hoverable
              bordered={false}
              style={{ 
                height: '100%',
                borderRadius: 16,
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)',
                background: 'linear-gradient(135deg, #ffffff 0%, #f6ffed 100%)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ 
                    width: 56, 
                    height: 56, 
                    borderRadius: 16, 
                    background: 'linear-gradient(135deg, #f6ffed 0%, #b7eb8f 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(82, 196, 26, 0.15)'
                  }}>
                    <DatabaseOutlined style={{ fontSize: 28, color: '#52c41a' }} />
                  </div>
                  <div>
                    <Text strong style={{ display: 'block', fontSize: 15, color: token.colorTextHeading }}>内存</Text>
                    <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                      {formatBytes(memoryUsed)} / {formatBytes(memoryTotalBytes)}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11, marginTop: 1, display: 'block' }}>
                      空闲: {formatBytes(systemInfo.memory?.free || 0)}
                    </Text>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>已用</Text>
                  <div style={{ 
                    fontSize: 40, 
                    fontWeight: 700, 
                    color: getStatusColor(memoryPercent),
                    textShadow: '0 2px 4px rgba(0,0,0,0.05)'
                  }}>
                    {memoryPercent}%
                  </div>
                </div>
              </div>
              <Progress
                percent={memoryPercent}
                strokeColor={{
                  '0%': '#52c41a',
                  '100%': getStatusColor(memoryPercent)
                }}
                strokeWidth={10}
                showInfo={false}
                style={{ marginTop: 20 }}
              />
            </Card>
          </Col>
        </Row>
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <Card bordered={false} style={{ height: 180, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spin size="large" />
            </Card>
          </Col>
          <Col xs={24} sm={12}>
            <Card bordered={false} style={{ height: 180, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spin size="large" />
            </Card>
          </Col>
        </Row>
      )}

      <Card
        bordered={false}
        style={{ 
          borderRadius: 16,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Title level={4} style={{ margin: 0, color: token.colorTextHeading }}>进程列表</Title>
            <Badge 
              count={`${statsSummary.withPorts}/${statsSummary.total}`} 
              overflowCount={999}
              style={{ 
                backgroundColor: '#52c41a',
                fontSize: 12,
                padding: '0 6px',
                borderRadius: 6
              }}
            />
          </div>
          <Space size="middle">
            <Tooltip title="刷新进程列表">
              <Button
                icon={<ReloadOutlined />}
                onClick={handleRefresh}
                loading={loading}
                size="middle"
                style={{ borderRadius: 8 }}
              >
                刷新
              </Button>
            </Tooltip>
            {selectedPids.size > 0 && (
              <Button
                type="primary"
                danger
                icon={<DeleteOutlined />}
                onClick={handleKillProcesses}
                size="middle"
                style={{ borderRadius: 8 }}
              >
                批量结束 ({selectedPids.size})
              </Button>
            )}
          </Space>
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'process' | 'file')}
          items={[
            {
              key: 'process',
              label: (
                <Space size="small">
                  <SearchOutlined />
                  <span>进程搜索</span>
                </Space>
              ),
              children: (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                  <Input
                    placeholder="搜索进程名称或PID"
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    prefix={<SearchOutlined style={{ color: token.colorTextSecondary }} />}
                    style={{ width: 260, borderRadius: 8 }}
                    allowClear
                    size="middle"
                  />
                  <Input
                    placeholder="搜索端口"
                    value={portSearchText}
                    onChange={e => setPortSearchText(e.target.value)}
                    prefix={<WifiOutlined style={{ color: token.colorTextSecondary }} />}
                    style={{ width: 160, borderRadius: 8 }}
                    allowClear
                    size="middle"
                  />
                </div>
              )
            },
            {
              key: 'file',
              label: (
                <Space size="small">
                  <FileSearchOutlined />
                  <span>文件占用查询</span>
                </Space>
              ),
              children: (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                  <Radio.Group
                    value={searchType}
                    onChange={e => setSearchType(e.target.value)}
                    buttonStyle="solid"
                    size="middle"
                  >
                    <Radio.Button value="file">
                      <Space size="small">
                        <SearchOutlined />
                        文件
                      </Space>
                    </Radio.Button>
                    <Radio.Button value="directory">
                      <Space size="small">
                        <FolderOpenOutlined />
                        目录
                      </Space>
                    </Radio.Button>
                  </Radio.Group>
                  <Input
                    placeholder={searchType === 'directory' ? '选择或输入目录路径查询占用进程' : '选择或输入文件路径查询占用进程'}
                    value={fileSearchText}
                    onChange={e => setFileSearchText(e.target.value)}
                    onPressEnter={handleFileSearch}
                    suffix={
                      <Tooltip title={searchType === 'directory' ? '选择目录' : '选择文件'}>
                        <Button
                          type="text"
                          size="small"
                          icon={searchType === 'directory' ? <FolderAddOutlined /> : <FileAddOutlined />}
                          onClick={handleSelectPath}
                          style={{ padding: '0 4px', color: token.colorPrimary }}
                        />
                      </Tooltip>
                    }
                    style={{ flex: 1, minWidth: 280, borderRadius: 8 }}
                    allowClear
                    size="middle"
                  />
                  <Button
                    type="primary"
                    onClick={handleFileSearch}
                    loading={fileSearching}
                    size="middle"
                    disabled={!fileSearchText.trim()}
                    style={{ borderRadius: 8 }}
                  >
                    {searchType === 'directory' ? '查询目录' : '查询文件'}
                  </Button>
                </div>
              )
            }
          ]}
          style={{ marginBottom: 16 }}
        />

        {fileHandles.length > 0 && (
          <div style={{ 
            marginBottom: 16, 
            padding: '12px 20px', 
            background: '#fff7e6', 
            border: '1px solid #ffe58f', 
            borderRadius: 10,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <Text style={{ fontSize: 14 }}>
                找到 <strong style={{ fontSize: 15, color: '#fa8c16' }}>{fileHandles.length}</strong> 个占用该{searchType === 'directory' ? '目录' : '文件'}的进程，已在下方列表中标红显示
              </Text>
            </div>
            <Button
              size="small"
              onClick={() => {
                setFileSearchText('');
                setFileHandles([]);
              }}
              style={{ borderRadius: 6 }}
            >
              清除
            </Button>
          </div>
        )}

        {filteredProcesses.length === 0 ? (
          <Empty
            description={loading ? '加载中...' : '未找到匹配的进程'}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ padding: '60px 0' }}
          >
            {!loading && (
              <Button type="primary" onClick={handleRefresh} style={{ borderRadius: 8 }}>
                刷新列表
              </Button>
            )}
          </Empty>
        ) : (
          <Table
            columns={columns}
            dataSource={filteredProcesses}
            rowKey="pid"
            size="middle"
            loading={loading}
            pagination={{ 
              pageSize: 15, 
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条记录`,
              style: { borderRadius: 8 }
            }}
            scroll={{ y: 480, x: 900 }}
            rowClassName={(record: ProcessInfo) => {
              if (fileHandles.includes(record.pid)) {
                return 'ant-table-row-highlight'
              }
              if (selectedPids.has(record.pid)) {
                return 'ant-table-row-selected'
              }
              return ''
            }}
            onRow={(record) => ({
              onClick: () => setSelectedProcess(record),
              onDoubleClick: () => handleKillProcess(record.pid),
              className: 'custom-table-row'
            })}
            style={{ borderRadius: 8 }}
            components={{
              header: {
                cell: (props) => (
                  <th style={{ 
                    background: '#fafafa', 
                    fontWeight: 600, 
                    fontSize: 13,
                    padding: '12px 16px'
                  }} {...props} />
                ),
              },
              body: {
                cell: (props) => (
                  <td style={{ padding: '12px 16px', fontSize: 13 }} {...props} />
                ),
              }
            }}
          />
        )}
      </Card>

      <Modal
        title="进程详情"
        open={!!selectedProcess}
        onCancel={() => setSelectedProcess(null)}
        footer={[
          <Button
            key="kill"
            type="primary"
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              if (selectedProcess) {
                handleKillProcess(selectedProcess.pid)
                setSelectedProcess(null)
              }
            }}
            style={{ borderRadius: 8 }}
          >
            结束进程
          </Button>,
          <Button key="close" onClick={() => setSelectedProcess(null)} style={{ borderRadius: 8 }}>
            关闭
          </Button>,
        ]}
        style={{ borderRadius: 16 }}
      >
        {selectedProcess && (
          <Descriptions column={2} bordered size="middle">
            <Descriptions.Item label="进程名称" span={2}>
              <Text strong style={{ fontSize: 15 }}>{selectedProcess.name}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="PID">
              <code style={{ fontSize: 14 }}>{selectedProcess.pid}</code>
            </Descriptions.Item>
            <Descriptions.Item label="内存使用">
              <Text style={{ fontSize: 14 }}>{formatBytes(selectedProcess.memoryBytes)}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="CPU 使用率">
              <Text style={{ fontSize: 14 }}>{selectedProcess.cpuUsage.toFixed(1)}%</Text>
            </Descriptions.Item>
            <Descriptions.Item label="端口" span={2}>
              {selectedProcess.ports && selectedProcess.ports.length > 0 ? (
                <Space size="small" wrap>
                  {selectedProcess.ports.map(port => (
                    <Tag key={port} color="blue" style={{ borderRadius: 4 }}>{port}</Tag>
                  ))}
                </Space>
              ) : (
                <Text type="secondary">-</Text>
              )}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}