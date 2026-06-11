import React, { useState, useEffect } from 'react'
import { Card, Form, Input, Button, Space, Table, message, Typography, Divider, Alert, Modal, Switch, InputNumber, Select, Collapse, theme } from 'antd'
import { SaveOutlined, ReloadOutlined, FolderOpenOutlined, KeyOutlined, WarningOutlined, CheckCircleOutlined, CloseCircleFilled, UpOutlined, DownOutlined, EyeOutlined, EyeInvisibleOutlined, MenuOutlined, SaveOutlined as BackupOutlined, CloudUploadOutlined, HistoryOutlined, DeleteOutlined, PlayCircleOutlined, StarOutlined, StarFilled } from '@ant-design/icons'
import { toolRegistry } from '../registry'
const { Panel } = Collapse

const { Title, Text } = Typography
const { Option } = Select

interface ShortcutItem {
  toolId: string
  toolName: string
  shortcut: string
}

interface BackupItem {
  id: string
  timestamp: string
  time?: number
  note: string
  sizeBytes: number
  size: string
}

interface AppConfig {
  configDir: string
  shortcuts: Record<string, string>
  theme: 'light' | 'dark'
  toolbarOrder: string[]
  hiddenTools: string[]
  favoriteTools: string[]
  backupEnabled: boolean
  backupDir: string
  backupInterval: number
  backupIntervalUnit: 'hours' | 'days'
  backupCount: number
  lastBackupTime: number
  windowShortcut: string
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
}

interface ToolbarItem {
  toolId: string
  toolName: string
  visible: boolean
  favorite: boolean
}

interface ToolbarCategoryItem {
  categoryId: string
  categoryName: string
  categoryIcon: React.ReactNode
  tools: ToolbarItem[]
}

export const SettingsTool: React.FC = () => {
  const [form] = Form.useForm()
  const [shortcuts, setShortcuts] = useState<ShortcutItem[]>([])
  const [toolbarItems, setToolbarItems] = useState<ToolbarCategoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [originalConfigDir, setOriginalConfigDir] = useState('')
  const [configDirValue, setConfigDirValue] = useState('')
  const [showMigrateModal, setShowMigrateModal] = useState(false)
  const [migrateLoading, setMigrateLoading] = useState(false)
  const [backupList, setBackupList] = useState<BackupItem[]>([])
  const [backupDirValue, setBackupDirValue] = useState('')
  const [loadingBackup, setLoadingBackup] = useState(false)
  const [shortcutCollapsed, setShortcutCollapsed] = useState(true)
  const [toolbarCollapsed, setToolbarCollapsed] = useState(true)
  const { token } = theme.useToken()

  useEffect(() => {
    loadConfig()
  }, [])

  useEffect(() => {
    if ((window as any).electronAPI?.onConfigChanged) {
      const cleanup = (window.electronAPI as any).onConfigChanged(() => {
        loadConfig()
      })
      return cleanup
    }
  }, [])

  const loadConfig = async () => {
    setLoading(true)
    try {
      if (!(window as any).electronAPI) {
        setLoading(false)
        return
      }
      
      const config = await (window.electronAPI as any).getAppConfig()
      if (config) {
        setOriginalConfigDir(config.configDir || '')
        const dirValue = config.configDir || ''
        setConfigDirValue(dirValue)
        const bDirValue = config.backupDir || ''
        setBackupDirValue(bDirValue)
        form.setFieldsValue({
          configDir: dirValue,
          theme: config.theme || 'light',
          backupEnabled: config.backupEnabled || false,
          backupInterval: config.backupInterval || 24,
          backupIntervalUnit: config.backupIntervalUnit || 'hours',
          backupCount: config.backupCount || 7,
          backupDir: bDirValue,
          windowShortcut: config.windowShortcut || 'Ctrl+Shift+H',
          logLevel: config.logLevel || 'INFO'
        })

        const allTools = toolRegistry.getTools()
        
        const shortcutList: ShortcutItem[] = allTools.map(tool => ({
          toolId: tool.id,
          toolName: tool.name,
          shortcut: config.shortcuts?.[tool.id] || ''
        }))
        setShortcuts(shortcutList)

        const hiddenTools = config.hiddenTools || []
        const toolbarOrder = config.toolbarOrder || []
        const favoriteTools = config.favoriteTools || []
        
        const categories = toolRegistry.getCategories()
        const toolbarCategoryItems: ToolbarCategoryItem[] = []
        
        categories.forEach(category => {
          if (category.id === 'settings') return
          
          let tools = toolRegistry.getToolsByCategory(category.id)
          tools = tools.filter(tool => tool.id !== 'settings')
          
          tools.sort((a, b) => {
            const aIndex = toolbarOrder.indexOf(a.id)
            const bIndex = toolbarOrder.indexOf(b.id)
            if (aIndex === -1 && bIndex === -1) return 0
            if (aIndex === -1) return 1
            if (bIndex === -1) return -1
            return aIndex - bIndex
          })
          
          if (tools.length > 0) {
            toolbarCategoryItems.push({
              categoryId: category.id,
              categoryName: category.name,
              categoryIcon: category.icon,
              tools: tools.map(tool => ({
                toolId: tool.id,
                toolName: tool.name,
                visible: !hiddenTools.includes(tool.id),
                favorite: favoriteTools.includes(tool.id)
              }))
            })
          }
        })
        
        setToolbarItems(toolbarCategoryItems)
        
        await loadBackupList()
      }
    } catch (error) {
      message.error('加载配置失败')
    }
    setLoading(false)
  }

  const loadBackupList = async () => {
    setLoadingBackup(true)
    try {
      if ((window as any).electronAPI) {
        const list = await (window.electronAPI as any).getBackupList?.() || []
        setBackupList(list)
      }
    } catch (error) {
      console.error('加载备份列表失败:', error)
    }
    setLoadingBackup(false)
  }

  const handleSelectBackupDirectory = async () => {
    try {
      if (!(window as any).electronAPI) {
        message.warning('请在 Electron 环境中运行此功能')
        return
      }
      
      const dir = await window.electronAPI.selectDirectory()
      if (dir) {
        setBackupDirValue(dir)
        form.setFieldsValue({ backupDir: dir })
        message.success('已选择备份目录')
      }
    } catch (error) {
      console.error('选择备份目录失败:', error)
      message.error('选择备份目录失败')
    }
  }

  const handleCreateBackup = async () => {
    setLoadingBackup(true)
    console.log('[SettingsTool] handleCreateBackup: 用户点击手动备份按钮')
    try {
      if (!(window as any).electronAPI) {
        console.log('[SettingsTool] handleCreateBackup: 不在 Electron 环境中')
        message.warning('请在 Electron 环境中运行此功能')
        return
      }
      
      console.log('[SettingsTool] handleCreateBackup: 调用 createFullBackup API')
      const result = await (window.electronAPI as any).createFullBackup?.('手动备份')
      console.log('[SettingsTool] handleCreateBackup: API 返回结果:', result)
      
      if (result) {
        if (result.sizeBytes === 0) {
          message.warning('备份已创建，但配置目录为空。建议先保存设置后再进行备份。')
        } else {
          message.success('备份创建成功')
        }
        console.log('[SettingsTool] handleCreateBackup: 备份创建成功，备份ID:', result.id, '大小:', result.size)
        await loadBackupList()
      } else {
        message.error('备份创建失败')
        console.log('[SettingsTool] handleCreateBackup: API 返回空结果')
      }
    } catch (error) {
      console.error('[SettingsTool] handleCreateBackup: 创建备份失败:', error)
      message.error('备份创建失败: ' + String(error))
    }
    setLoadingBackup(false)
  }

  const handleDeleteBackup = async (backupId: string) => {
    try {
      if (!(window as any).electronAPI) {
        message.warning('请在 Electron 环境中运行此功能')
        return
      }
      
      const confirmResult = window.confirm('确定要删除这个备份吗？此操作不可恢复。')
      if (!confirmResult) return
      
      const success = await (window.electronAPI as any).deleteBackup?.(backupId)
      if (success) {
        message.success('备份删除成功')
        await loadBackupList()
      } else {
        message.error('备份删除失败')
      }
    } catch (error) {
      console.error('删除备份失败:', error)
      message.error('删除备份失败')
    }
  }

  const handleRestoreBackup = async (backupId: string) => {
    try {
      if (!(window as any).electronAPI) {
        message.warning('请在 Electron 环境中运行此功能')
        return
      }
      
      const confirmResult = window.confirm('确定要从这个备份恢复吗？当前配置将被覆盖。')
      if (!confirmResult) return
      
      const success = await (window.electronAPI as any).restoreBackup?.(backupId)
      if (success) {
        message.success('备份恢复成功')
        await loadConfig()
      } else {
        message.error('备份恢复失败')
      }
    } catch (error) {
      console.error('恢复备份失败:', error)
      message.error('恢复备份失败')
    }
  }

  const handleImportBackup = async () => {
    try {
      if (!(window as any).electronAPI) {
        message.warning('请在 Electron 环境中运行此功能')
        return
      }
      
      const result = await (window.electronAPI as any).importBackup?.()
      if (result?.success) {
        message.success('备份导入成功')
        await loadBackupList()
      } else {
        message.error(result?.error || '备份导入失败')
      }
    } catch (error) {
      console.error('导入备份失败:', error)
      message.error('导入备份失败')
    }
  }

  const handleSelectDirectory = async () => {
    if ((window as any).electronAPI?.saveConfig) {
      await (window.electronAPI as any).saveConfig('debug-log.json', { 
        timestamp: Date.now(), 
        action: 'handleSelectDirectory called' 
      }).catch(() => {})
    }
    
    console.log('[SettingsTool] handleSelectDirectory: 用户点击选择目录按钮')
    try {
      if (!(window as any).electronAPI) {
        console.log('[SettingsTool] handleSelectDirectory: 不在 Electron 环境中')
        message.warning('请在 Electron 环境中运行此功能')
        return
      }
      
      console.log('[SettingsTool] handleSelectDirectory: 调用 selectDirectory API')
      const dir = await window.electronAPI.selectDirectory()
      console.log('[SettingsTool] handleSelectDirectory: 选择结果:', dir)
      
      if (dir) {
        console.log('[SettingsTool] handleSelectDirectory: 设置表单值前，当前表单值:', form.getFieldsValue())
        setConfigDirValue(dir)
        form.setFieldsValue({ configDir: dir })
        console.log('[SettingsTool] handleSelectDirectory: 设置表单值后，当前表单值:', form.getFieldsValue())
        const currentValue = form.getFieldValue('configDir')
        console.log('[SettingsTool] handleSelectDirectory: 表单字段 configDir 的当前值:', currentValue)
        console.log('[SettingsTool] handleSelectDirectory: 成功设置配置目录:', dir)
        message.success('已选择目录，请点击保存设置完成迁移')
        
        if ((window as any).electronAPI?.saveConfig) {
          await (window.electronAPI as any).saveConfig('debug-log.json', { 
            timestamp: Date.now(), 
            action: 'directory_selected',
            directory: dir,
            formValue: form.getFieldsValue(),
            configDirValue: currentValue
          }).catch(() => {})
        }
      } else {
        console.log('[SettingsTool] handleSelectDirectory: 选择结果为空')
        if ((window as any).electronAPI?.saveConfig) {
          await (window.electronAPI as any).saveConfig('debug-log.json', { 
            timestamp: Date.now(), 
            action: 'directory_selected_empty'
          }).catch(() => {})
        }
      }
    } catch (error) {
      console.error('选择目录失败:', error)
      
      if ((window as any).electronAPI?.saveConfig) {
        await (window.electronAPI as any).saveConfig('debug-log.json', { 
          timestamp: Date.now(), 
          action: 'select_directory_error',
          error: String(error)
        }).catch(() => {})
      }
      
      message.error('选择目录失败')
    }
  }

  const handleReset = async () => {
    const confirm = window.confirm('确定要重置所有设置为默认值吗？此操作无法撤销。')
    if (!confirm) return

    try {
      await (window.electronAPI as any).resetAppConfig()
      message.success('设置已重置为默认值')
      await loadConfig()
    } catch (error) {
      console.error('[SettingsTool] handleReset: 重置失败:', error)
      message.error('重置设置失败')
    }
  }

  const handleSave = async () => {
    console.log('[SettingsTool] handleSave: 用户点击保存设置')
    try {
      const values = await form.validateFields()
      console.log('[SettingsTool] handleSave: 表单验证通过，values:', values)
      console.log('[SettingsTool] handleSave: originalConfigDir:', originalConfigDir)
      
      const existingConfig = (window as any).electronAPI 
        ? await (window.electronAPI as any).getAppConfig() 
        : null
      
      if (values.configDir && values.configDir !== originalConfigDir) {
        console.log('[SettingsTool] handleSave: 配置目录有变化，显示迁移确认')
        const confirmResult = window.confirm(
          `您正在更改配置文件保存目录，系统将自动迁移现有配置文件。\n\n` +
          `原配置目录: ${originalConfigDir || '(默认目录)'}\n` +
          `新配置目录: ${values.configDir}\n\n` +
          `迁移过程将复制所有配置文件到新目录。原目录的配置文件不会被删除，您可以在迁移完成后手动清理。\n\n` +
          `确定要继续吗？`
        )
        if (confirmResult) {
          console.log('[SettingsTool] handleSave: 用户确认迁移')
          await handleMigrate(existingConfig)
        } else {
          console.log('[SettingsTool] handleSave: 用户取消迁移')
        }
        return
      }
      
      console.log('[SettingsTool] handleSave: 配置目录没有变化，直接保存')
      await saveConfig(values, existingConfig)
    } catch (error) {
      console.error('[SettingsTool] handleSave: 保存失败:', error)
      message.error('保存失败')
    }
  }

  const getFlattenedToolbarItems = (): ToolbarItem[] => {
    const flattened: ToolbarItem[] = []
    toolbarItems.forEach(category => {
      category.tools.forEach(tool => {
        flattened.push(tool)
      })
    })
    return flattened
  }

  const saveConfig = async (values: any, existingConfig?: any) => {
    console.log('[SettingsTool] saveConfig: 开始保存配置')
    if (!(window as any).electronAPI) {
      message.warning('请在 Electron 环境中运行此功能')
      return
    }
    
    const flattenedItems = getFlattenedToolbarItems()
    
    const config: AppConfig = {
      configDir: values.configDir || '',
      theme: values.theme || 'light',
      shortcuts: shortcuts.reduce((acc, item) => {
        if (item.shortcut) {
          acc[item.toolId] = item.shortcut
        }
        return acc
      }, {} as Record<string, string>),
      toolbarOrder: flattenedItems.map(item => item.toolId),
      hiddenTools: flattenedItems.filter(item => !item.visible).map(item => item.toolId),
      favoriteTools: flattenedItems.filter(item => item.favorite).map(item => item.toolId),
      backupEnabled: values.backupEnabled ?? existingConfig?.backupEnabled ?? false,
      backupDir: values.backupDir || existingConfig?.backupDir || '',
      backupInterval: values.backupInterval ?? existingConfig?.backupInterval ?? 24,
      backupIntervalUnit: values.backupIntervalUnit || existingConfig?.backupIntervalUnit || 'hours',
      backupCount: values.backupCount ?? existingConfig?.backupCount ?? 7,
      lastBackupTime: existingConfig?.lastBackupTime || 0,
      windowShortcut: values.windowShortcut || existingConfig?.windowShortcut || 'Ctrl+Shift+H',
      logLevel: values.logLevel || existingConfig?.logLevel || 'INFO'
    }
    console.log('[SettingsTool] saveConfig: 准备保存的配置:', config)
    
    const success = await (window.electronAPI as any).saveAppConfig(config)
    console.log('[SettingsTool] saveConfig: 保存结果:', success)
    if (success) {
      message.success('设置已保存')
      setOriginalConfigDir(config.configDir)
    } else {
      message.error('保存失败')
    }
  }

  const handleMigrate = async (existingConfig?: any) => {
    console.log('[SettingsTool] handleMigrate: 用户确认迁移配置目录')
    if (!(window as any).electronAPI) {
      message.warning('请在 Electron 环境中运行此功能')
      return
    }
    
    setMigrateLoading(true)
    try {
      const values = await form.validateFields()
      console.log('[SettingsTool] handleMigrate: 表单验证通过，values:', values)
      
      const flattenedItems = getFlattenedToolbarItems()
      
      const config: AppConfig = {
        configDir: values.configDir || '',
        theme: values.theme || 'light',
        shortcuts: shortcuts.reduce((acc, item) => {
          if (item.shortcut) {
            acc[item.toolId] = item.shortcut
          }
          return acc
        }, {} as Record<string, string>),
        toolbarOrder: flattenedItems.map(item => item.toolId),
        hiddenTools: flattenedItems.filter(item => !item.visible).map(item => item.toolId),
        favoriteTools: flattenedItems.filter(item => item.favorite).map(item => item.toolId),
        backupEnabled: values.backupEnabled ?? existingConfig?.backupEnabled ?? false,
        backupDir: values.backupDir || existingConfig?.backupDir || '',
        backupInterval: values.backupInterval ?? existingConfig?.backupInterval ?? 24,
        backupIntervalUnit: values.backupIntervalUnit || existingConfig?.backupIntervalUnit || 'hours',
        backupCount: values.backupCount ?? existingConfig?.backupCount ?? 7,
        lastBackupTime: existingConfig?.lastBackupTime || 0,
        windowShortcut: values.windowShortcut || existingConfig?.windowShortcut || 'Ctrl+Shift+H',
        logLevel: values.logLevel || existingConfig?.logLevel || 'INFO'
      }
      console.log('[SettingsTool] handleMigrate: 准备迁移的配置:', config)
      
      console.log('[SettingsTool] handleMigrate: 调用 migrateConfigDir API，新目录:', values.configDir)
      const result = await (window.electronAPI as any).migrateConfigDir(values.configDir, config)
      console.log('[SettingsTool] handleMigrate: migrateConfigDir 返回结果:', result)
      
      if (result.success) {
        message.success('配置目录迁移成功')
        setOriginalConfigDir(values.configDir)
        setShowMigrateModal(false)
        console.log('[SettingsTool] handleMigrate: 重新加载配置')
        await loadConfig()
      } else {
        message.error(result.error || '配置目录迁移失败')
      }
    } catch (error) {
      console.error('[SettingsTool] handleMigrate: 配置目录迁移失败:', error)
      message.error('配置目录迁移失败')
    }
    setMigrateLoading(false)
  }

  const handleShortcutChange = (toolId: string, value: string) => {
    setShortcuts(prev => prev.map(item => 
      item.toolId === toolId ? { ...item, shortcut: value } : item
    ))
  }

  const handleToolVisibilityChange = (categoryId: string, toolId: string, visible: boolean) => {
    setToolbarItems(prev => prev.map(category => {
      if (category.categoryId === categoryId) {
        return {
          ...category,
          tools: category.tools.map(tool => 
            tool.toolId === toolId ? { ...tool, visible } : tool
          )
        }
      }
      return category
    }))
  }

  const handleToolFavoriteChange = (categoryId: string, toolId: string, favorite: boolean) => {
    setToolbarItems(prev => prev.map(category => {
      if (category.categoryId === categoryId) {
        return {
          ...category,
          tools: category.tools.map(tool => 
            tool.toolId === toolId ? { ...tool, favorite } : tool
          )
        }
      }
      return category
    }))
  }

  const handleMoveUp = (categoryId: string, index: number) => {
    if (index === 0) return
    setToolbarItems(prev => prev.map(category => {
      if (category.categoryId === categoryId) {
        const newTools = [...category.tools]
        const temp = newTools[index]
        newTools[index] = newTools[index - 1]
        newTools[index - 1] = temp
        return { ...category, tools: newTools }
      }
      return category
    }))
  }

  const handleMoveDown = (categoryId: string, index: number) => {
    setToolbarItems(prev => prev.map(category => {
      if (category.categoryId === categoryId) {
        if (index === category.tools.length - 1) return category
        const newTools = [...category.tools]
        const temp = newTools[index]
        newTools[index] = newTools[index + 1]
        newTools[index + 1] = temp
        return { ...category, tools: newTools }
      }
      return category
    }))
  }

  const shortcutColumns = [
    {
      title: '工具',
      dataIndex: 'toolName',
      key: 'toolName',
      width: 200
    },
    {
      title: '快捷键',
      dataIndex: 'shortcut',
      key: 'shortcut',
      render: (_: any, record: ShortcutItem) => (
        <Input 
          placeholder="例如: Ctrl+Shift+P"
          value={record.shortcut}
          onChange={(e) => handleShortcutChange(record.toolId, e.target.value)}
          style={{ width: 200 }}
        />
      )
    }
  ]

  const formatTime = (timestamp: string | number) => {
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) {
      return '未知时间'
    }
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0 || isNaN(bytes)) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const backupColumns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (timestamp: string) => formatTime(timestamp)
    },
    {
      title: '备注',
      dataIndex: 'note',
      key: 'note'
    },
    {
      title: '大小',
      dataIndex: 'sizeBytes',
      key: 'sizeBytes',
      render: (sizeBytes: number) => formatSize(sizeBytes)
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: BackupItem) => (
        <Space size="small">
          <Button
            type="text"
            icon={<PlayCircleOutlined />}
            size="small"
            onClick={() => handleRestoreBackup(record.id)}
          >
            恢复
          </Button>
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            size="small"
            onClick={() => handleDeleteBackup(record.id)}
          >
            删除
          </Button>
        </Space>
      )
    }
  ]

  const getTotalToolCount = () => {
    let count = 0
    toolbarItems.forEach(category => {
      count += category.tools.length
    })
    return count
  }

  return (
    <>
      <Modal
        title={
          <Space>
            <WarningOutlined style={{ color: '#faad14' }} />
            <span>确认迁移配置目录</span>
          </Space>
        }
        visible={showMigrateModal}
        onOk={handleMigrate}
        onCancel={() => setShowMigrateModal(false)}
        okText="确认迁移"
        cancelText="取消"
        confirmLoading={migrateLoading}
        width={500}
      >
        <div style={{ marginBottom: 16 }}>
          <p style={{ marginBottom: 8 }}>
            <Text strong>您正在更改配置文件保存目录，系统将自动迁移现有配置文件。</Text>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <CloseCircleFilled style={{ color: '#ff4d4f', marginTop: 2 }} />
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>原配置目录</Text>
                <p style={{ margin: 4, fontFamily: 'monospace', fontSize: 13, color: '#666' }}>
                  {originalConfigDir || '(默认目录)'}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <CheckCircleOutlined style={{ color: '#52c41a', marginTop: 2 }} />
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>新配置目录</Text>
                <p style={{ margin: 4, fontFamily: 'monospace', fontSize: 13, color: '#666' }}>
                  {form.getFieldValue('configDir') || '(未选择)'}
                </p>
              </div>
            </div>
          </div>
        </div>
        <Alert
          title="迁移说明"
          description="迁移过程将复制所有配置文件到新目录。原目录的配置文件不会被删除，您可以在迁移完成后手动清理。"
          type="info"
          showIcon
          style={{ marginBottom: 0 }}
        />
      </Modal>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={4} style={{ margin: 0 }}>设置</Title>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              重置
            </Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
              保存设置
            </Button>
          </Space>
        </div>

      <Alert
        title="设置说明"
        description="在此页面可以配置应用程序的基本设置，包括配置文件保存目录、窗口快捷键和工具快捷键。使用 Ctrl+Shift+H 可以快速隐藏或显示应用窗口。"
        type="info"
        showIcon
      />

      <Card title="基本设置" size="small">
        <Form form={form} layout="vertical">
          <Form.Item
            label="配置文件保存目录"
            name="configDir"
            tooltip="所有工具的配置文件将保存在此目录"
            initialValue={configDirValue}
          >
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="选择或输入配置文件保存目录"
                style={{ flex: 1 }}
                value={configDirValue}
                onChange={(e) => {
                  setConfigDirValue(e.target.value)
                  form.setFieldsValue({ configDir: e.target.value })
                }}
              />
              <Button 
                icon={<FolderOpenOutlined />}
                onClick={handleSelectDirectory}
              >
                选择
              </Button>
            </Space.Compact>
          </Form.Item>
          
          <Form.Item
            label="窗口显示/隐藏快捷键"
            name="windowShortcut"
            tooltip="使用此快捷键快速隐藏或显示应用窗口"
          >
            <Input 
              placeholder="例如: Ctrl+Shift+H"
              style={{ width: '100%' }}
            />
          </Form.Item>
          
          <Form.Item
            label="日志等级"
            name="logLevel"
            tooltip="设置日志输出的详细程度。DEBUG最详细，ERROR最简略"
          >
            <Select>
              <Option value="DEBUG">DEBUG - 调试信息（最详细）</Option>
              <Option value="INFO">INFO - 一般信息（默认）</Option>
              <Option value="WARN">WARN - 警告信息</Option>
              <Option value="ERROR">ERROR - 错误信息（最简略）</Option>
            </Select>
          </Form.Item>
        </Form>
      </Card>

      <Card 
        title={
          <Space>
            <KeyOutlined />
            <span>快捷键设置</span>
            <Button 
              type="link" 
              size="small" 
              onClick={(e) => {
                e.stopPropagation()
                setShortcutCollapsed(!shortcutCollapsed)
              }}
            >
              {shortcutCollapsed ? '展开' : '折叠'}
            </Button>
          </Space>
        } 
        size="small"
        extra={
          <Text type="secondary">
            共 {shortcuts.length} 个工具
          </Text>
        }
      >
        <Collapse 
          activeKey={shortcutCollapsed ? [] : ['shortcut-panel']}
          onChange={() => setShortcutCollapsed(!shortcutCollapsed)}
          ghost
        >
          <Panel 
            key="shortcut-panel"
            header={
              <Text type="secondary">
                {shortcutCollapsed ? '点击展开查看快捷键设置' : '快捷键设置列表'}
              </Text>
            }
          >
            <Table
              columns={shortcutColumns}
              dataSource={shortcuts}
              rowKey="toolId"
              size="small"
              pagination={false}
              loading={loading}
            />
          </Panel>
        </Collapse>
      </Card>

      <Card 
        title={
          <Space>
            <MenuOutlined />
            <span>工具栏自定义</span>
            <Button 
              type="link" 
              size="small" 
              onClick={(e) => {
                e.stopPropagation()
                setToolbarCollapsed(!toolbarCollapsed)
              }}
            >
              {toolbarCollapsed ? '展开' : '折叠'}
            </Button>
          </Space>
        } 
        size="small"
        extra={
          <Text type="secondary">
            共 {getTotalToolCount()} 个工具
          </Text>
        }
      >
        <Collapse 
          activeKey={toolbarCollapsed ? [] : ['toolbar-panel']}
          onChange={() => setToolbarCollapsed(!toolbarCollapsed)}
          ghost
        >
          <Panel 
            key="toolbar-panel"
            header={
              <Text type="secondary">
                {toolbarCollapsed ? '点击展开查看工具栏自定义' : '按分类调整工具顺序和可见性'}
              </Text>
            }
          >
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {toolbarItems.map((category) => (
                <div key={category.categoryId} style={{ marginBottom: 16 }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8,
                    padding: '8px 12px',
                    background: token.colorBgContainer,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    fontWeight: 500,
                    color: token.colorTextHeading
                  }}>
                    {category.categoryIcon}
                    <span>{category.categoryName}</span>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      ({category.tools.length} 个工具)
                    </Text>
                  </div>
                  {category.tools.map((item, index) => (
                    <div
                      key={item.toolId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px 8px 36px',
                        borderBottom: `1px solid ${token.colorBorder}`,
                        opacity: item.visible ? 1 : 0.5,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 12, color: '#999', width: 24 }}>{index + 1}</span>
                        <span>{item.toolName}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Space size="small">
                          <Button
                            size="small"
                            icon={<UpOutlined />}
                            onClick={() => handleMoveUp(category.categoryId, index)}
                            disabled={index === 0}
                            title="上移"
                          />
                          <Button
                            size="small"
                            icon={<DownOutlined />}
                            onClick={() => handleMoveDown(category.categoryId, index)}
                            disabled={index === category.tools.length - 1}
                            title="下移"
                          />
                        </Space>
                        <Button
                          size="small"
                          icon={item.favorite ? <StarFilled /> : <StarOutlined />}
                          onClick={() => handleToolFavoriteChange(category.categoryId, item.toolId, !item.favorite)}
                          title={item.favorite ? '取消收藏' : '添加到收藏'}
                          style={{
                            color: item.favorite ? '#faad14' : undefined
                          }}
                        />
                        <Switch
                          checked={item.visible}
                          onChange={(checked) => handleToolVisibilityChange(category.categoryId, item.toolId, checked)}
                          checkedChildren={<EyeOutlined />}
                          unCheckedChildren={<EyeInvisibleOutlined />}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Panel>
        </Collapse>
      </Card>

      <Card 
        title={
          <Space>
            <BackupOutlined />
            <span>备份设置</span>
          </Space>
        } 
        size="small"
      >
        <Form form={form} layout="vertical">
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <Form.Item
              label="启用自动备份"
              name="backupEnabled"
              valuePropName="checked"
              style={{ flex: 1 }}
            >
              <Switch />
            </Form.Item>
            <Form.Item
              label="备份间隔"
              name="backupInterval"
              style={{ flex: 2 }}
            >
              <Space.Compact style={{ width: '100%' }}>
                <InputNumber
                  min={1}
                  style={{ width: '45%' }}
                  placeholder="间隔"
                  value={form.getFieldValue('backupInterval') || 24}
                  onChange={(value) => form.setFieldsValue({ backupInterval: value })}
                />
                <Form.Item
                  name="backupIntervalUnit"
                  noStyle
                >
                  <Select 
                    style={{ width: '55%' }}
                    value={form.getFieldValue('backupIntervalUnit') || 'hours'}
                    onChange={(value) => form.setFieldsValue({ backupIntervalUnit: value })}
                  >
                    <Option value="hours">小时</Option>
                    <Option value="days">天</Option>
                  </Select>
                </Form.Item>
              </Space.Compact>
            </Form.Item>
            <Form.Item
              label="保留数量"
              name="backupCount"
              tooltip="超过此数量时，最旧的备份将被自动删除"
              style={{ flex: 1 }}
            >
              <InputNumber min={1} max={365} style={{ width: '100%' }} placeholder="数量" />
            </Form.Item>
          </div>
          <Form.Item
            label="备份目录"
            name="backupDir"
          >
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="选择或输入备份文件保存目录"
                style={{ flex: 1 }}
                value={backupDirValue}
                onChange={(e) => {
                  setBackupDirValue(e.target.value)
                  form.setFieldsValue({ backupDir: e.target.value })
                }}
              />
              <Button 
                icon={<FolderOpenOutlined />}
                onClick={handleSelectBackupDirectory}
              >
                选择
              </Button>
            </Space.Compact>
          </Form.Item>
        </Form>
      </Card>

      <Card 
        title={
          <Space>
            <HistoryOutlined />
            <span>备份管理</span>
          </Space>
        } 
        size="small"
      >
        <Space style={{ marginBottom: 16 }}>
          <Button
            type="primary"
            icon={<BackupOutlined />}
            onClick={handleCreateBackup}
            loading={loadingBackup}
          >
            手动备份
          </Button>
          <Button
            icon={<CloudUploadOutlined />}
            onClick={handleImportBackup}
          >
            导入备份
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadBackupList}
            loading={loadingBackup}
          >
            刷新列表
          </Button>
        </Space>
        <Table
          columns={backupColumns}
          dataSource={backupList}
          rowKey="id"
          size="small"
          pagination={false}
          loading={loadingBackup}
        />
      </Card>

      <Divider />

      <Card size="small">
        <Title level={5}>快捷键格式说明</Title>
        <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
          <li><Text code>Ctrl</Text> + <Text code>Shift</Text> + <Text code>H</Text> - 隐藏/显示应用窗口（可在设置中自定义）</li>
          <li><Text code>Ctrl</Text> + <Text code>Shift</Text> + <Text code>Key</Text> - 同时按下 Ctrl、Shift 和指定键</li>
          <li><Text code>Alt</Text> + <Text code>Key</Text> - 同时按下 Alt 和指定键</li>
          <li><Text code>Ctrl</Text> + <Text code>Key</Text> - 同时按下 Ctrl 和指定键</li>
        </ul>
        <Text type="secondary">
          注意: 快捷键可能与系统或其他应用程序的快捷键冲突，请选择不冲突的组合键。窗口快捷键默认是 Ctrl+Shift+H。
        </Text>
      </Card>
    </div>
    </>
  )
}
