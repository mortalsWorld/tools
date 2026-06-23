import React, { useState, useEffect } from 'react'
import { Card, Table, Button, Input, Space, Tag, message, Modal, Descriptions, Progress, Row, Col, Typography, Checkbox, Radio } from 'antd'
import { ReloadOutlined, DeleteOutlined, SearchOutlined, FileSearchOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

interface ProcessInfo {
  pid: number
  name: string
  memory: string
  memoryBytes: number
  cpuUsage: number
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

export const ProcessTool: React.FC = () => {
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
      content: `确定要关闭进程 PID: ${pid} 吗？`,
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
      content: `确定要关闭选中的 ${pids.length} 个进程吗？`,
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

  const handleFileSearch = async () => {
    if (!fileSearchText.trim()) {
      setFileHandles([])
      return
    }
    setFileSearching(true)
    try {
      const result = await window.electronAPI.searchFileHandle(fileSearchText)
      let pids = result.map(h => h.Id)
      
      if (searchType === 'directory') {
        const dirResult = await window.electronAPI.searchDirectoryHandle(fileSearchText)
        const dirPids = dirResult.map(h => h.Id)
        pids = [...new Set([...pids, ...dirPids])]
      }
      
      setFileHandles(pids)
      if (pids.length === 0) {
        message.info(searchType === 'directory' ? '未找到占用该目录的进程' : '未找到占用该文件的进程')
      }
    } catch (error) {
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

  const filteredProcesses = processes.filter(p => {
    const matchSearch = !searchText ||
      p.name.toLowerCase().includes(searchText.toLowerCase()) ||
      p.pid.toString().includes(searchText)
    const matchFileHandle = fileHandles.length === 0 || fileHandles.includes(p.pid)
    return matchSearch && matchFileHandle
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
      width: 40,
      render: (_: any, record: ProcessInfo) => (
        <Checkbox
          checked={selectedPids.has(record.pid)}
          onChange={() => toggleSelectPid(record.pid)}
        />
      )
    },
    {
      title: 'PID',
      dataIndex: 'pid',
      key: 'pid',
      width: 80,
      sorter: (a: ProcessInfo, b: ProcessInfo) => a.pid - b.pid
    },
    {
      title: '进程名称',
      dataIndex: 'name',
      key: 'name',
      sorter: (a: ProcessInfo, b: ProcessInfo) => a.name.localeCompare(b.name),
      render: (text: string, record: ProcessInfo) => (
        <span>
          {text}
          {fileHandles.includes(record.pid) && (
            <Tag color="red" style={{ marginLeft: 8 }}>文件占用</Tag>
          )}
        </span>
      )
    },
    {
      title: 'CPU 使用率',
      dataIndex: 'cpuUsage',
      key: 'cpuUsage',
      width: 120,
      sorter: (a: ProcessInfo, b: ProcessInfo) => a.cpuUsage - b.cpuUsage,
      render: (usage: number) => (
        <div>
          <span>{usage.toFixed(1)}%</span>
          <Progress
            percent={Math.min(usage, 100)}
            size="small"
            showInfo={false}
            style={{ marginTop: 4 }}
          />
        </div>
      )
    },
    {
      title: '内存使用率',
      key: 'memoryUsage',
      width: 140,
      sorter: (a: ProcessInfo, b: ProcessInfo) => a.memoryBytes - b.memoryBytes,
      render: (_: any, record: ProcessInfo) => {
        const usagePercent = (record.memoryBytes / memoryTotal * 100)
        return (
          <div>
            <span>{usagePercent.toFixed(2)}% ({formatBytes(record.memoryBytes)})</span>
            <Progress
              percent={Math.min(usagePercent, 100)}
              size="small"
              showInfo={false}
              style={{ marginTop: 4 }}
            />
          </div>
        )
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, record: ProcessInfo) => (
        <Button
          type="link"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => handleKillProcess(record.pid)}
        >
          结束
        </Button>
      )
    }
  ]

  const memoryUsed = systemInfo?.memory?.used || 0
  const memoryTotalBytes = systemInfo?.memory?.total || 1
  const memoryPercent = Math.round((memoryUsed / memoryTotalBytes) * 100)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Title level={4} style={{ margin: 0 }}>系统信息</Title>
      {systemInfo && (
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Card style={{ height: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 4 }}>CPU</Text>
                  <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>{systemInfo.cpu?.name || 'Unknown'}</Text>
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary">
                      {systemInfo.cpu?.cores || 0} 核心 / {systemInfo.cpu?.logicalProcessors || 0} 线程
                    </Text>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>使用率</Text>
                  <div style={{ fontSize: 28, fontWeight: 'bold', color: cpuUsage > 80 ? '#f5222d' : cpuUsage > 50 ? '#fa8c16' : '#52c41a' }}>
                    {cpuUsage.toFixed(1)}%
                  </div>
                </div>
              </div>
              <Progress
                percent={Math.min(cpuUsage, 100)}
                size="small"
                strokeColor={cpuUsage > 80 ? '#f5222d' : cpuUsage > 50 ? '#fa8c16' : '#52c41a'}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12}>
            <Card style={{ height: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 4 }}>内存</Text>
                  <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                    {formatBytes(memoryUsed)} / {formatBytes(memoryTotalBytes)}
                  </Text>
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary">
                      空闲: {formatBytes(systemInfo.memory?.free || 0)}
                    </Text>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>已用</Text>
                  <div style={{ fontSize: 28, fontWeight: 'bold', color: memoryPercent > 80 ? '#f5222d' : memoryPercent > 50 ? '#fa8c16' : '#52c41a' }}>
                    {memoryPercent}%
                  </div>
                </div>
              </div>
              <Progress
                percent={memoryPercent}
                size="small"
                strokeColor={memoryPercent > 80 ? '#f5222d' : memoryPercent > 50 ? '#fa8c16' : '#52c41a'}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Card
        title="进程列表"
        extra={
          <Space wrap>
            <Input
              placeholder="搜索进程名称或PID"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              prefix={<SearchOutlined />}
              style={{ width: 180 }}
              allowClear
            />
            <Radio.Group
              value={searchType}
              onChange={e => setSearchType(e.target.value)}
              buttonStyle="solid"
              size="small"
            >
              <Radio.Button value="file">文件</Radio.Button>
              <Radio.Button value="directory">目录</Radio.Button>
            </Radio.Group>
            <Input
              placeholder={searchType === 'directory' ? '搜索占用目录的进程' : '搜索占用文件的进程'}
              value={fileSearchText}
              onChange={e => setFileSearchText(e.target.value)}
              onPressEnter={handleFileSearch}
              prefix={<FileSearchOutlined />}
              style={{ width: 220 }}
              allowClear
            />
            {fileSearchText && (
              <>
                <Button
                  type="primary"
                  onClick={handleFileSearch}
                  loading={fileSearching}
                >
                  {searchType === 'directory' ? '搜索目录' : '搜索文件'}
                </Button>
                <Button
                  onClick={() => {
                    setFileSearchText('');
                    setFileHandles([]);
                  }}
                >
                  清除
                </Button>
              </>
            )}
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              loading={loading}
            >
              刷新
            </Button>
            {selectedPids.size > 0 && (
              <Button
                type="primary"
                danger
                icon={<DeleteOutlined />}
                onClick={handleKillProcesses}
              >
                批量结束 ({selectedPids.size})
              </Button>
            )}
          </Space>
        }
      >
        {fileHandles.length > 0 && (
          <div style={{ marginBottom: 16, padding: '8px 12px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 4 }}>
            <Text>找到 <strong>{fileHandles.length}</strong> 个占用该文件的进程，已在下方列表中标红显示</Text>
          </div>
        )}
        <Table
          columns={columns}
          dataSource={filteredProcesses}
          rowKey="pid"
          size="small"
          loading={loading}
          pagination={{ pageSize: 15, showSizeChanger: true }}
          scroll={{ y: 400 }}
          rowClassName={(record: ProcessInfo) => fileHandles.includes(record.pid) ? 'highlight-row' : ''}
        />
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
          >
            结束进程
          </Button>,
          <Button key="close" onClick={() => setSelectedProcess(null)}>
            关闭
          </Button>
        ]}
      >
        {selectedProcess && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="进程名称">{selectedProcess.name}</Descriptions.Item>
            <Descriptions.Item label="PID">{selectedProcess.pid}</Descriptions.Item>
            <Descriptions.Item label="内存使用">{selectedProcess.memory}</Descriptions.Item>
            <Descriptions.Item label="CPU 使用率">{selectedProcess.cpuUsage.toFixed(1)}%</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}
