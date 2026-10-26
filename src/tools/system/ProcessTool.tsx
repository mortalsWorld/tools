import React, { useState, useEffect, useMemo } from 'react'
import { 
  Card, Table, Button, Input, Space, Tag, message, Modal, Descriptions, Progress, 
  Row, Col, Typography, Checkbox, Radio, theme, Tooltip, Badge, Empty, Spin,
  Tabs, Switch
} from 'antd'
import { 
  RotateCw, Trash2, Search, FileSearch, 
  Cpu, MemoryStick, SquareTerminal, Wifi, 
  ChevronDown, ChevronUp, LayoutGrid, FolderOpen,
  FolderPlus, FilePlus, Merge
} from 'lucide-react'

const { Text } = Typography

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

const getStatusColor = (percent: number, token: any): string => {
  if (percent > 80) return token.colorError
  if (percent > 50) return token.colorWarning
  return token.colorSuccess
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
  const [expandedPorts, setExpandedPorts] = useState<Set<string | number>>(new Set())
  const [activeTab, setActiveTab] = useState<'process' | 'file'>('process')
  const [mergeByName, setMergeByName] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

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

  const togglePortExpand = (key: string | number) => {
    const newExpanded = new Set(expandedPorts)
    if (newExpanded.has(key)) {
      newExpanded.delete(key)
    } else {
      newExpanded.add(key)
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

  interface MergedProcessInfo {
    key: string
    name: string
    count: number
    pids: number[]
    totalCpu: number
    totalMemoryBytes: number
    totalMemory: string
    allPorts: number[]
    processes: ProcessInfo[]
  }

  const mergedProcesses = useMemo<MergedProcessInfo[]>(() => {
    if (!mergeByName) return []
    const map = new Map<string, MergedProcessInfo>()
    for (const p of filteredProcesses) {
      const existing = map.get(p.name)
      if (existing) {
        existing.count++
        existing.pids.push(p.pid)
        // CPU使用率累加，因为多个同名进程可能运行在不同的CPU核心上
        existing.totalCpu += p.cpuUsage
        existing.totalMemoryBytes += p.memoryBytes
        existing.processes.push(p)
        if (p.ports && p.ports.length > 0) {
          for (const port of p.ports) {
            if (!existing.allPorts.includes(port)) {
              existing.allPorts.push(port)
            }
          }
        }
      } else {
        map.set(p.name, {
          key: p.name,
          name: p.name,
          count: 1,
          pids: [p.pid],
          totalCpu: p.cpuUsage,
          totalMemoryBytes: p.memoryBytes,
          totalMemory: p.memory,
          allPorts: p.ports ? [...p.ports] : [],
          processes: [p]
        })
      }
    }
    const result = Array.from(map.values())
    result.forEach(m => {
      m.totalMemory = formatBytes(m.totalMemoryBytes)
    })
    result.sort((a, b) => b.totalMemoryBytes - a.totalMemoryBytes)
    return result
  }, [filteredProcesses, mergeByName])

  const displayProcesses = mergeByName 
    ? mergedProcesses 
    : filteredProcesses

  const memoryTotal = systemInfo?.memory?.total || 1

  const handleKillMergedProcesses = async (merged: MergedProcessInfo) => {
    Modal.confirm({
      title: `确认结束所有 "${merged.name}" 进程`,
      content: `将结束 <strong>${merged.count}</strong> 个 "${merged.name}" 进程 (PIDs: ${merged.pids.join(', ')})`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        const result = await (window.electronAPI as any).killProcesses(merged.pids)
        if (result.success) {
          message.success(`成功结束 ${merged.count - (result.errors?.length || 0)} 个进程`)
          loadProcesses()
        } else {
          message.error('结束进程失败')
        }
      }
    })
  }

  const columns = useMemo(() => {
    if (mergeByName) {
      return [
        {
          title: 'PID 列表',
          key: 'pids',
          width: 150,
          fixed: 'left' as const,
          render: (_: any, record: MergedProcessInfo) => (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {record.pids.slice(0, 3).map(pid => (
                <code key={pid} style={{ 
                  fontSize: 11, 
                  padding: '2px 6px', 
                  background: token.colorFillAlter, 
                  borderRadius: 4,
                  color: token.colorPrimary
                }}>
                  {pid}
                </code>
              ))}
              {record.pids.length > 3 && (
                <Tooltip title={record.pids.join(', ')}>
                  <code style={{ 
                    fontSize: 11, 
                    padding: '2px 6px', 
                    background: token.colorWarningBg, 
                    borderRadius: 4,
                    color: token.colorWarning
                  }}>
                    +{record.pids.length - 3}
                  </code>
                </Tooltip>
              )}
            </div>
          )
        },
        {
          title: (
            <Space size="small">
              <LayoutGrid size={14} style={{ color: token.colorTextSecondary }} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>进程名称</span>
            </Space>
          ),
          dataIndex: 'name',
          key: 'name',
          width: 250,
          sorter: (a: MergedProcessInfo, b: MergedProcessInfo) => a.name.localeCompare(b.name),
          render: (text: string, record: MergedProcessInfo) => (
            <Tooltip title={text} placement="topLeft">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: '100%' }}>
                <span style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
                <Badge 
                  count={record.count} 
                  style={{ 
                    backgroundColor: record.count > 1 ? token.colorPrimary : token.colorSuccess,
                    fontSize: 11,
                    boxShadow: 'none',
                    flexShrink: 0
                  }}
                />
              </div>
            </Tooltip>
          )
        },
        {
          title: (
            <Space size="small">
              <Cpu size={14} style={{ color: token.colorTextSecondary }} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>CPU (合计)</span>
            </Space>
          ),
          dataIndex: 'totalCpu',
          key: 'totalCpu',
          width: 130,
          sorter: (a: MergedProcessInfo, b: MergedProcessInfo) => a.totalCpu - b.totalCpu,
          render: (usage: number) => (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: token.colorTextSecondary }}>总使用率</span>
                <span style={{ 
                  fontSize: 13, 
                  fontWeight: 500, 
                  color: getStatusColor(usage, token) 
                }}>
                  {usage.toFixed(1)}%
                </span>
              </div>
              <Progress
                percent={Math.min(usage, 100)}
                size="small"
                showInfo={false}
                strokeColor={getStatusColor(usage, token)}
                strokeWidth={6}
                trailColor={token.colorBorderSecondary}
              />
            </div>
          )
        },
        {
          title: (
            <Space size="small">
              <MemoryStick size={14} style={{ color: token.colorTextSecondary }} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>内存 (合计)</span>
            </Space>
          ),
          key: 'totalMemory',
          width: 160,
          sorter: (a: MergedProcessInfo, b: MergedProcessInfo) => a.totalMemoryBytes - b.totalMemoryBytes,
          render: (_: any, record: MergedProcessInfo) => {
            const usagePercent = (record.totalMemoryBytes / memoryTotal * 100)
            return (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: token.colorTextSecondary }}>总占用</span>
                  <span style={{ 
                    fontSize: 12, 
                    fontWeight: 500, 
                    color: getStatusColor(usagePercent, token) 
                  }}>
                    {record.totalMemory}
                  </span>
                </div>
                <Progress
                  percent={Math.min(usagePercent, 100)}
                  size="small"
                  showInfo={false}
                  strokeColor={getStatusColor(usagePercent, token)}
                  strokeWidth={6}
                  trailColor={token.colorBorderSecondary}
                />
              </div>
            )
          }
        },
        {
          title: (
            <Space size="small">
              <Wifi size={14} style={{ color: token.colorTextSecondary }} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>端口 (合并)</span>
            </Space>
          ),
          dataIndex: 'allPorts',
          key: 'allPorts',
          width: 200,
          render: (ports: number[], record: MergedProcessInfo) => {
            if (!ports || ports.length === 0) {
              return <Text type="secondary" style={{ fontSize: 12 }}>-</Text>
            }
            
            const isExpanded = expandedPorts.has(record.name)
            const displayPorts = isExpanded ? ports : ports.slice(0, 5)
            
            return (
              <div>
                <Space size="small" wrap>
                  {displayPorts.map(port => (
                    <Tag 
                      key={port} 
                      color="processing" 
                      style={{ 
                        fontSize: 11, 
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontWeight: 500,
                        marginInlineEnd: 0
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
                    icon={isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    onClick={() => togglePortExpand(record.name)}
                    style={{ padding: 0, marginLeft: 4, color: token.colorPrimary, fontSize: 12 }}
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
          width: 120,
          fixed: 'right' as const,
          render: (_: any, record: MergedProcessInfo) => (
            <Tooltip title={`结束全部 ${record.count} 个进程`}>
              <Button
                type="text"
                danger
                size="small"
                icon={<Trash2 size={13} />}
                onClick={() => handleKillMergedProcesses(record)}
                style={{ fontSize: 12, padding: '4px 8px' }}
              >
                结束全部
              </Button>
            </Tooltip>
          )
        }
      ]
    } else {
      return [
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
              <SquareTerminal size={14} style={{ color: token.colorTextSecondary }} />
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
              background: token.colorFillAlter, 
              borderRadius: 6,
              color: token.colorPrimary
            }}>
              {pid}
            </code>
          )
        },
        {
          title: (
            <Space size="small">
              <LayoutGrid size={14} style={{ color: token.colorTextSecondary }} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>进程名称</span>
            </Space>
          ),
          dataIndex: 'name',
          key: 'name',
          width: 250,
          sorter: (a: ProcessInfo, b: ProcessInfo) => a.name.localeCompare(b.name),
          render: (text: string, record: ProcessInfo) => (
            <Tooltip title={text} placement="topLeft">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
                <span style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
                {fileHandles.includes(record.pid) && (
                  <Badge status="error" text="占用" style={{ fontSize: 11, flexShrink: 0 }} />
                )}
              </div>
            </Tooltip>
          )
        },
        {
          title: (
            <Space size="small">
              <Cpu size={14} style={{ color: token.colorTextSecondary }} />
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
                  color: getStatusColor(usage, token) 
                }}>
                  {usage.toFixed(1)}%
                </span>
              </div>
              <Progress
                percent={Math.min(usage, 100)}
                size="small"
                showInfo={false}
                strokeColor={getStatusColor(usage, token)}
                strokeWidth={6}
                trailColor={token.colorBorderSecondary}
              />
            </div>
          )
        },
        {
          title: (
            <Space size="small">
              <MemoryStick size={14} style={{ color: token.colorTextSecondary }} />
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
                    color: getStatusColor(usagePercent, token) 
                  }}>
                    {formatBytes(record.memoryBytes)}
                  </span>
                </div>
                <Progress
                  percent={Math.min(usagePercent, 100)}
                  size="small"
                  showInfo={false}
                  strokeColor={getStatusColor(usagePercent, token)}
                  strokeWidth={6}
                  trailColor={token.colorBorderSecondary}
                />
              </div>
            )
          }
        },
        {
          title: (
            <Space size="small">
              <Wifi size={14} style={{ color: token.colorTextSecondary }} />
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
                      color="processing" 
                      style={{ 
                        fontSize: 11, 
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontWeight: 500,
                        marginInlineEnd: 0
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
                    icon={isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    onClick={() => togglePortExpand(record.pid)}
                    style={{ padding: 0, marginLeft: 4, color: token.colorPrimary, fontSize: 12 }}
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
                icon={<Trash2 size={14} />}
                onClick={() => handleKillProcess(record.pid)}
                style={{ fontSize: 13, padding: '4px 8px' }}
              />
            </Tooltip>
          )
        }
      ]
    }
  }, [mergeByName, token, filteredProcesses, selectedPids, selectAll, expandedPorts, fileHandles, memoryTotal])

  const memoryUsed = systemInfo?.memory?.used || 0
  const memoryTotalBytes = systemInfo?.memory?.total || 1
  const memoryPercent = Math.round((memoryUsed / memoryTotalBytes) * 100)

  const statsSummary = useMemo(() => {
    const total = processes.length
    const withPorts = processes.filter(p => p.ports && p.ports.length > 0).length
    return { total, withPorts }
  }, [processes])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: token.colorText, letterSpacing: '-0.01em' }}>
          进程查看
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: token.colorTextTertiary }}>
          查看系统进程资源占用，支持合并同名进程与文件占用查询
        </p>
      </div>

      {systemInfo ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <Card 
              hoverable
              style={{ 
                height: '100%',
                background: token.colorBgElevated,
                borderLeft: `3px solid ${token.colorPrimary}`,
              }}
              styles={{ body: { padding: 20 } }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ 
                    width: 44, 
                    height: 44, 
                    borderRadius: 10, 
                    background: 'rgb(99 102 241 / 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: token.colorPrimary,
                    flexShrink: 0
                  }}>
                    <Cpu size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: token.colorText }}>CPU</div>
                    <div style={{ fontSize: 12, color: token.colorTextTertiary, marginTop: 2, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {systemInfo.cpu?.name || 'Unknown'}
                    </div>
                    <div style={{ fontSize: 11, color: token.colorTextTertiary, marginTop: 1 }}>
                      {systemInfo.cpu?.cores || 0} 核心 / {systemInfo.cpu?.logicalProcessors || 0} 线程
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: token.colorTextTertiary }}>使用率</div>
                  <div style={{ 
                    fontSize: 28, 
                    fontWeight: 600, 
                    color: getStatusColor(cpuUsage, token),
                    fontVariantNumeric: 'tabular-nums'
                  }}>
                    {cpuUsage.toFixed(1)}%
                  </div>
                </div>
              </div>
              <Progress
                percent={Math.min(cpuUsage, 100)}
                strokeColor={getStatusColor(cpuUsage, token)}
                strokeWidth={6}
                showInfo={false}
                trailColor={token.colorBorderSecondary}
                style={{ marginTop: 16 }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12}>
            <Card 
              hoverable
              style={{ 
                height: '100%',
                background: token.colorBgElevated,
                borderLeft: `3px solid ${token.colorSuccess}`,
              }}
              styles={{ body: { padding: 20 } }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ 
                    width: 44, 
                    height: 44, 
                    borderRadius: 10, 
                    background: 'rgb(16 185 129 / 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: token.colorSuccess,
                    flexShrink: 0
                  }}>
                    <MemoryStick size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: token.colorText }}>内存</div>
                    <div style={{ fontSize: 12, color: token.colorTextTertiary, marginTop: 2 }}>
                      {formatBytes(memoryUsed)} / {formatBytes(memoryTotalBytes)}
                    </div>
                    <div style={{ fontSize: 11, color: token.colorTextTertiary, marginTop: 1 }}>
                      空闲: {formatBytes(systemInfo.memory?.free || 0)}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: token.colorTextTertiary }}>已用</div>
                  <div style={{ 
                    fontSize: 28, 
                    fontWeight: 600, 
                    color: getStatusColor(memoryPercent, token),
                    fontVariantNumeric: 'tabular-nums'
                  }}>
                    {memoryPercent}%
                  </div>
                </div>
              </div>
              <Progress
                percent={memoryPercent}
                strokeColor={getStatusColor(memoryPercent, token)}
                strokeWidth={6}
                showInfo={false}
                trailColor={token.colorBorderSecondary}
                style={{ marginTop: 16 }}
              />
            </Card>
          </Col>
        </Row>
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <Card style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spin size="large" />
            </Card>
          </Col>
          <Col xs={24} sm={12}>
            <Card style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spin size="large" />
            </Card>
          </Col>
        </Row>
      )}

      <Card styles={{ body: { padding: 20 } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: token.colorText }}>进程列表</h3>
            <Badge 
              count={`${statsSummary.withPorts}/${statsSummary.total}`} 
              overflowCount={999}
              style={{ 
                backgroundColor: token.colorSuccess,
                fontSize: 12,
                padding: '0 6px',
                borderRadius: 6,
                boxShadow: 'none'
              }}
            />
          </div>
          <Space size="middle">
            <Tooltip title="刷新进程列表">
              <Button
                icon={<RotateCw size={14} />}
                onClick={handleRefresh}
                loading={loading}
              >
                刷新
              </Button>
            </Tooltip>
            {selectedPids.size > 0 && (
              <Button
                type="primary"
                danger
                icon={<Trash2 size={14} />}
                onClick={handleKillProcesses}
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
                <Space size={6}>
                  <Search size={14} />
                  <span>进程搜索</span>
                </Space>
              ),
              children: (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                  <Input
                    placeholder="搜索进程名称或PID"
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    prefix={<Search size={14} style={{ color: token.colorTextTertiary }} />}
                    style={{ width: 260 }}
                    allowClear
                    size="middle"
                  />
                  <Input
                    placeholder="搜索端口"
                    value={portSearchText}
                    onChange={e => setPortSearchText(e.target.value)}
                    prefix={<Wifi size={14} style={{ color: token.colorTextTertiary }} />}
                    style={{ width: 160 }}
                    allowClear
                    size="middle"
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8, padding: '4px 12px', background: token.colorFillAlter, borderRadius: 8 }}>
                    <Merge size={14} style={{ color: token.colorPrimary }} />
                    <Text style={{ fontSize: 13 }}>合并同名进程</Text>
                    <Switch
                      checked={mergeByName}
                      onChange={(checked) => { 
                        setMergeByName(checked)
                        setCurrentPage(1)
                      }}
                      size="small"
                    />
                  </div>
                </div>
              )
            },
            {
              key: 'file',
              label: (
                <Space size={6}>
                  <FileSearch size={14} />
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
                      <Space size={6}>
                        <Search size={13} />
                        文件
                      </Space>
                    </Radio.Button>
                    <Radio.Button value="directory">
                      <Space size={6}>
                        <FolderOpen size={13} />
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
                          icon={searchType === 'directory' ? <FolderPlus size={14} /> : <FilePlus size={14} />}
                          onClick={handleSelectPath}
                          style={{ padding: '0 4px', color: token.colorPrimary }}
                        />
                      </Tooltip>
                    }
                    style={{ flex: 1, minWidth: 280 }}
                    allowClear
                    size="middle"
                  />
                  <Button
                    type="primary"
                    onClick={handleFileSearch}
                    loading={fileSearching}
                    disabled={!fileSearchText.trim()}
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
            padding: '10px 16px', 
            background: token.colorWarningBg, 
            border: `1px solid ${token.colorWarningBorder}`, 
            borderRadius: 8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <Text style={{ fontSize: 13 }}>
                找到 <strong style={{ color: token.colorWarning }}>{fileHandles.length}</strong> 个占用该{searchType === 'directory' ? '目录' : '文件'}的进程，已在下方列表中标红显示
              </Text>
            </div>
            <Button
              size="small"
              onClick={() => {
                setFileSearchText('');
                setFileHandles([]);
              }}
            >
              清除
            </Button>
          </div>
        )}

        {displayProcesses.length === 0 ? (
          <Empty
            description={loading ? '加载中...' : '未找到匹配的进程'}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ padding: '60px 0' }}
          >
            {!loading && (
              <Button type="primary" onClick={handleRefresh}>
                刷新列表
              </Button>
            )}
          </Empty>
        ) : (
          <Table<any>
            columns={columns as any}
            dataSource={displayProcesses as any[]}
            rowKey={mergeByName ? 'key' : 'pid'}
            size="middle"
            loading={loading}
            pagination={{ 
              current: currentPage,
              pageSize: pageSize, 
              onChange: (page, size) => { 
                setCurrentPage(page)
                setPageSize(size)
              },
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条记录`,
              style: { borderRadius: 8 }
            }}
            scroll={{ y: 480, x: 'max-content' }}
            rowClassName={(record: any) => {
              if (!mergeByName) {
                if (fileHandles.includes(record.pid)) {
                  return 'ant-table-row-highlight'
                }
                if (selectedPids.has(record.pid)) {
                  return 'ant-table-row-selected'
                }
              }
              return ''
            }}
            onRow={(record: any) => {
              if (mergeByName) {
                return {
                  className: 'custom-table-row',
                  style: { cursor: 'default' }
                }
              }
              return {
                onClick: () => setSelectedProcess(record),
                onDoubleClick: () => handleKillProcess(record.pid),
                className: 'custom-table-row',
                style: { cursor: 'pointer' }
              }
            }}
            style={{ borderRadius: 8 }}
            components={{
              header: {
                cell: (props) => (
                  <th style={{ 
                    background: token.colorFillAlter, 
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
            icon={<Trash2 size={14} />}
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
          </Button>,
        ]}
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
                    <Tag key={port} color="processing" style={{ borderRadius: 4, marginInlineEnd: 0 }}>{port}</Tag>
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