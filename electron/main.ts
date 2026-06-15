import { app, BrowserWindow, dialog, ipcMain, shell, globalShortcut, Menu, nativeImage, safeStorage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { promisify } from 'node:util'
import { execFile } from 'child_process'
import crypto from 'node:crypto'
import { initLogger, logger } from './logger'

const execFilePromise = promisify(execFile)
const rmdir = promisify(fs.rmdir)

// ============================================================================
// Security helpers
// ============================================================================

// Validate that a URL only uses safe protocols
const isSafeUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') return false
  try {
    const u = new URL(url)
    // Allow common web protocols; block script/resource-URI schemes
    const safe = ['http:', 'https:', 'ftp:', 'mailto:', 'tel:', 'telnet:']
    return safe.includes(u.protocol)
  } catch {
    return false
  }
}

// Validate that a PID is strictly numeric (no injection)
const isValidPid = (pid: number): boolean => {
  return Number.isInteger(pid) && pid > 0 && pid <= 999999
}

// Validate that a filePath doesn't contain command injection characters.
// Windows valid filename chars: letters, digits, space, ._-,()&%$@!+=[]{};,#~`  etc.
// Windows INVALID filename chars: < > : " / \ | ? * (plus control chars 0x00-0x1F)
// We block control characters and genuinely dangerous patterns; legitimate
// Windows path characters like & and % are allowed for backward compatibility.
const isSafeFilePath = (filePath: string): boolean => {
  if (!filePath || typeof filePath !== 'string') return false
  if (filePath.length > 512) return false
  // Block control characters (0x00-0x1F, including null, tab, newline)
  if (/[\x00-\x1F]/.test(filePath)) return false
  // Block pipe/redirect which are never part of valid file paths
  if (/[|<>]/.test(filePath)) return false
  return true
}

// Validate accelerator strings for globalShortcut.register
const isValidAccelerator = (accelerator: string): boolean => {
  if (!accelerator || typeof accelerator !== 'string') return false
  if (accelerator.length > 64) return false
  // Only allow alphanumeric + modifier key symbols (+ space F keys etc)
  return /^[A-Za-z0-9+\-]+(?:\s*\+\s*[A-Za-z0-9]+)*$/.test(accelerator)
}

// Encrypt sensitive data (passwords) using Electron's safeStorage
// Falls back to base64 (obscured but not cryptographically secure)
// if safeStorage is unavailable (e.g., before app login on some OS)
const encryptSensitiveData = (data: string): string => {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(data).toString('base64')
    }
  } catch (e) {
    logger.warn('encryptSensitiveData: safeStorage unavailable, using fallback')
  }
  // Fallback: weak obfuscation (not encryption) - warn the user
  return '__b64__' + Buffer.from(data, 'utf-8').toString('base64')
}

const decryptSensitiveData = (data: string): string => {
  if (!data) return ''
  try {
    if (data.startsWith('__b64__')) {
      return Buffer.from(data.slice(7), 'base64').toString('utf-8')
    }
    if (safeStorage.isEncryptionAvailable()) {
      const buffer = Buffer.from(data, 'base64')
      return safeStorage.decryptString(buffer)
    }
  } catch (e) {
    logger.warn('decryptSensitiveData: decryption failed:', e instanceof Error ? e.message : String(e))
  }
  return ''
}

// Encrypt password fields in a password data structure
const encryptPasswordData = (data: any): any => {
  if (!data) return data
  const result: any = {}
  for (const [key, value] of Object.entries(data)) {
    if (key === 'password' && typeof value === 'string' && value.length > 0) {
      result[key] = encryptSensitiveData(value)
      result['__encrypted__'] = true
    } else {
      result[key] = value
    }
  }
  return result
}

const decryptPasswordData = (data: any): any => {
  if (!data) return data
  if (!data.__encrypted__) return data
  const result: any = { ...data }
  if (typeof result.password === 'string') {
    result.password = decryptSensitiveData(result.password)
  }
  delete result.__encrypted__
  return result
}

// Decrypt password fields in a passwords.json data structure.
// Handles both the old format { passwords: [...] } and new format { items: [...] }.
// Plaintext entries (no __encrypted__ flag) pass through unchanged,
// so existing configs remain fully backward-compatible.
const decryptPasswordFieldsInConfig = (data: any): any => {
  if (!data) return data
  const result: any = { ...data }

  // New format: data.items[].password
  if (Array.isArray(result.items)) {
    result.items = result.items.map((item: any) => {
      if (item && typeof item.password === 'string') {
        return decryptPasswordData(item)
      }
      return item
    })
  }

  // Old format: data.passwords[].password
  if (Array.isArray(result.passwords)) {
    result.passwords = result.passwords.map((entry: any) => {
      if (entry && typeof entry.password === 'string') {
        return decryptPasswordData(entry)
      }
      return entry
    })
  }

  return result
}

// Encrypt password fields in a passwords.json data structure.
// Handles both the old format { passwords: [...] } and new format { items: [...] }.
const encryptPasswordFieldsInConfig = (data: any): any => {
  if (!data) return data
  const result: any = { ...data }

  // New format: data.items[].password
  if (Array.isArray(result.items)) {
    result.items = result.items.map((item: any) => {
      if (item && typeof item.password === 'string' && item.password.length > 0) {
        return encryptPasswordData(item)
      }
      return item
    })
  }

  // Old format: data.passwords[].password
  if (Array.isArray(result.passwords)) {
    result.passwords = result.passwords.map((entry: any) => {
      if (entry && typeof entry.password === 'string' && entry.password.length > 0) {
        return encryptPasswordData(entry)
      }
      return entry
    })
  }

  return result
}

const formatMemory = (bytes: number): string => {
  if (bytes === 0 || isNaN(bytes)) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const readdir = promisify(fs.readdir)
const stat = promisify(fs.stat)
const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)
const copyFile = promisify(fs.copyFile)
const unlink = promisify(fs.unlink)
const mkdir = promisify(fs.mkdir)

const isDev = !!process.env.VITE_DEV_SERVER_URL
const isPackaged = !isDev
console.log('[DEBUG] isDev:', isDev)
console.log('[DEBUG] isPackaged:', isPackaged)

const DIST = path.join(__dirname, '../dist')
const PUBLIC = path.join(DIST, '../public')
process.env.DIST = DIST
process.env.PUBLIC = PUBLIC

let win: BrowserWindow | null
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

let CONFIG_PATH: string
let APP_DIR: string

let appConfig: any = null
const DEFAULT_APP_CONFIG = {
  configDir: '',
  shortcuts: {},
  theme: 'light',
  backupEnabled: true,
  backupCount: 5,
  toolbarOrder: [],
  categoryOrder: [],
  hiddenTools: [],
  hiddenCategories: [],
  backupDir: '',
  backupInterval: 24,
  backupIntervalUnit: 'hours',
  lastBackupTime: 0,
  windowShortcut: 'Ctrl+Shift+H',  // 默认窗口显示/隐藏快捷键
  logLevel: 'INFO'  // 日志等级
}

let backupTimer: NodeJS.Timeout | null = null

async function ensureConfigDir() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      logger.info(`ensureConfigDir: 创建配置目录: ${CONFIG_PATH}`)
      fs.mkdirSync(CONFIG_PATH, { recursive: true })
    }
  } catch (error) {
    logger.error(`ensureConfigDir: 创建配置目录失败: ${error}`)
  }
}

async function loadConfig(fileName: string) {
  try {
    await ensureConfigDir()
    const filePath = path.join(CONFIG_PATH, fileName)
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    console.error(`Error loading config ${fileName}:`, error)
    return null
  }
}

async function createBackup(fileName: string) {
  try {
    const sourcePath = path.join(CONFIG_PATH, fileName)
    if (!fs.existsSync(sourcePath)) {
      return
    }
    
    const timestamp = Date.now()
    const backupFileName = `${fileName}.${timestamp}.backup`
    const backupPath = path.join(CONFIG_PATH, backupFileName)
    await copyFile(sourcePath, backupPath)
    await cleanupOldBackups(fileName)
  } catch (error) {
    console.error(`Error creating backup for ${fileName}:`, error)
  }
}

async function cleanupOldBackups(fileName: string) {
  try {
    const files = await readdir(CONFIG_PATH)
    const backupPattern = new RegExp(`^${fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\d+\\.backup$`)
    const backupFiles = files
      .filter(f => backupPattern.test(f))
      .map(f => ({
        name: f,
        time: parseInt(f.match(/\.(\d+)\.backup$/)?.[1] || '0', 10)
      }))
      .sort((a, b) => b.time - a.time)
    
    const count = appConfig?.backupCount || DEFAULT_APP_CONFIG.backupCount
    if (backupFiles.length > count) {
      const filesToDelete = backupFiles.slice(count)
      for (const file of filesToDelete) {
        try {
          await unlink(path.join(CONFIG_PATH, file.name))
        } catch (deleteError) {
          console.error(`Error deleting backup ${file.name}:`, deleteError)
        }
      }
    }
  } catch (error) {
    console.error(`Error cleaning up backups for ${fileName}:`, error)
  }
}

async function copyDirectory(source: string, destination: string, excludeDirs: string[] = []) {
  try {
    await mkdir(destination, { recursive: true })
    const files = await readdir(source)
    
    for (const file of files) {
      if (excludeDirs.includes(file)) {
        continue
      }
      
      const srcPath = path.join(source, file)
      const destPath = path.join(destination, file)
      const fileStat = await stat(srcPath)
      
      if (fileStat.isDirectory()) {
        await copyDirectory(srcPath, destPath, excludeDirs)
      } else {
        await copyFile(srcPath, destPath)
      }
    }
    return true
  } catch (error) {
    console.error(`Error copying directory from ${source} to ${destination}:`, error)
    return false
  }
}

async function removeDirectory(dir: string) {
  try {
    if (!fs.existsSync(dir)) {
      return true
    }
    const files = await readdir(dir)
    for (const file of files) {
      const filePath = path.join(dir, file)
      const fileStat = await stat(filePath)
      if (fileStat.isDirectory()) {
        await removeDirectory(filePath)
      } else {
        await unlink(filePath)
      }
    }
    await rmdir(dir)
    return true
  } catch (error) {
    logger.error(`Error removing directory ${dir}:`, error)
    return false
  }
}

function getBackupDir() {
  if (appConfig?.backupDir) {
    return appConfig.backupDir
  }
  return path.join(CONFIG_PATH, 'backups')
}

async function ensureBackupDir() {
  const backupDir = getBackupDir()
  try {
    if (!fs.existsSync(backupDir)) {
      logger.info(`ensureBackupDir: 创建备份目录: ${backupDir}`)
      await mkdir(backupDir, { recursive: true })
    }
    return backupDir
  } catch (error) {
    logger.error(`ensureBackupDir: 创建备份目录失败: ${error}`)
    throw error
  }
}

async function calculateDirectorySize(dir: string) {
  let totalSize = 0
  try {
    const files = await readdir(dir)
    for (const file of files) {
      const filePath = path.join(dir, file)
      const fileStat = await stat(filePath)
      if (fileStat.isDirectory()) {
        totalSize += await calculateDirectorySize(filePath)
      } else {
        totalSize += fileStat.size
      }
    }
  } catch (error) {
    logger.error(`calculateDirectorySize: 计算目录大小失败: ${error}`)
  }
  return totalSize
}

async function createFullBackup(note?: string) {
  try {
    logger.info('createFullBackup: 开始创建完整备份')
    
    const backupDir = await ensureBackupDir()
    const now = new Date()
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupId = timestamp
    const backupPath = path.join(backupDir, backupId)
    
    logger.debug(`createFullBackup: 备份目录: ${backupPath}`)
    
    if (!fs.existsSync(CONFIG_PATH)) {
      logger.error(`createFullBackup: 配置目录不存在: ${CONFIG_PATH}`)
      throw new Error(`配置目录不存在: ${CONFIG_PATH}`)
    }
    
    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true })
      logger.debug(`createFullBackup: 创建备份目录成功: ${backupPath}`)
    }
    
    logger.debug('createFullBackup: 备份前保存当前配置')
    logger.debug('createFullBackup: 当前 appConfig toolbarOrder:', JSON.stringify(appConfig?.toolbarOrder))
    logger.debug('createFullBackup: 当前 appConfig hiddenTools:', JSON.stringify(appConfig?.hiddenTools))
    await saveConfig('app-config.json', appConfig)
    
    const entries = await readdir(CONFIG_PATH)
    logger.debug(`createFullBackup: 配置目录内容: ${JSON.stringify(entries)}`)
    
    const filteredEntries = entries.filter(entry => entry !== 'backups')
    logger.debug(`createFullBackup: 过滤后的条目: ${JSON.stringify(filteredEntries)}`)
    
    if (filteredEntries.length === 0) {
      logger.warn('createFullBackup: 配置目录为空，无法创建有效备份')
    }
    
    for (const entry of filteredEntries) {
      const sourcePath = path.join(CONFIG_PATH, entry)
      const destPath = path.join(backupPath, entry)
      
      try {
        const statInfo = await stat(sourcePath)
        if (statInfo.isDirectory()) {
          await copyDirectory(sourcePath, destPath)
          logger.debug(`createFullBackup: 复制目录: ${sourcePath} -> ${destPath}`)
        } else {
          const content = await readFile(sourcePath)
          await writeFile(destPath, content)
          logger.debug(`createFullBackup: 复制文件: ${sourcePath} -> ${destPath}`)
        }
      } catch (copyError) {
        logger.warn(`createFullBackup: 复制文件失败 ${entry}:`, copyError)
      }
    }
    
    const sizeBytes = await calculateDirectorySize(backupPath)
    const sizeFormatted = formatMemory(sizeBytes)
    logger.debug(`createFullBackup: 备份大小: ${sizeBytes} bytes`)
    
    const backupInfo = {
      id: backupId,
      timestamp: now.toISOString(),
      sizeBytes,
      size: sizeFormatted,
      note: note || '',
      sourcePath: CONFIG_PATH
    }
    
    const infoFilePath = path.join(backupPath, 'backup-info.json')
    await writeFile(infoFilePath, JSON.stringify(backupInfo, null, 2), 'utf-8')
    logger.debug(`createFullBackup: 写入备份信息: ${infoFilePath}`)
    
    appConfig.lastBackupTime = Date.now()
    await saveConfig('app-config.json', appConfig)
    logger.debug(`createFullBackup: 更新最后备份时间: ${appConfig.lastBackupTime}`)
    
    logger.info(`createFullBackup: 备份创建成功: ${backupId}, 大小: ${sizeFormatted}`)
    return backupInfo
  } catch (error) {
    logger.error('createFullBackup: 创建备份失败:', error)
    throw error
  }
}

function calculateIntervalMs(interval: number, unit: string): number {
  const ms = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000
  }
  return interval * (ms[unit as keyof typeof ms] || ms.hours)
}

async function shouldBackupNow(): Promise<boolean> {
  try {
    if (!appConfig.backupEnabled) {
      logger.info('shouldBackupNow: 备份已禁用')
      return false
    }
    
    const now = Date.now()
    const lastBackup = appConfig.lastBackupTime || 0
    const intervalMs = calculateIntervalMs(
      appConfig.backupInterval || DEFAULT_APP_CONFIG.backupInterval,
      appConfig.backupIntervalUnit || DEFAULT_APP_CONFIG.backupIntervalUnit
    )
    
    const needsBackup = now - lastBackup >= intervalMs
    
    if (needsBackup) {
      logger.info('shouldBackupNow: 需要备份，将延迟执行')
      setTimeout(async () => {
        try {
          const entries = await readdir(CONFIG_PATH)
          const hasContent = entries.length > 0 && entries.some(e => e !== 'backups')
          
          if (!hasContent) {
            logger.info('shouldBackupNow: 配置目录为空，跳过备份')
            return
          }
          
          logger.info('shouldBackupNow: 开始执行延迟备份')
          await createFullBackup('应用启动时自动备份')
        } catch (error) {
          logger.error('shouldBackupNow: 延迟备份失败:', error)
        }
      }, 5000)
      return true
    }
    
    logger.info('shouldBackupNow: 不需要立即备份')
    return false
  } catch (error) {
    logger.error('shouldBackupNow: 检查备份时机失败', error)
    return false
  }
}

async function startBackupScheduler(): Promise<void> {
  try {
    stopBackupScheduler()
    
    if (!appConfig.backupEnabled) {
      logger.info('startBackupScheduler: 备份已禁用，不启动定时器')
      return
    }
    
    const intervalMs = calculateIntervalMs(
      appConfig.backupInterval || DEFAULT_APP_CONFIG.backupInterval,
      appConfig.backupIntervalUnit || DEFAULT_APP_CONFIG.backupIntervalUnit
    )
    
    logger.info(`startBackupScheduler: 启动备份定时器，间隔: ${appConfig.backupInterval} ${appConfig.backupIntervalUnit}`)
    
    backupTimer = setInterval(async () => {
      try {
        logger.info('startBackupScheduler: 定时器触发，开始备份')
        await createFullBackup('定时自动备份')
      } catch (error) {
        logger.error('startBackupScheduler: 定时备份失败:', error)
      }
    }, intervalMs)
  } catch (error) {
    logger.error('startBackupScheduler: 启动备份定时器失败', error)
  }
}

function stopBackupScheduler(): void {
  if (backupTimer) {
    logger.info('stopBackupScheduler: 停止备份定时器')
    clearInterval(backupTimer)
    backupTimer = null
  }
}

async function getBackupList() {
  try {
    const backupDir = getBackupDir()
    if (!fs.existsSync(backupDir)) {
      return []
    }
    
    const entries = await readdir(backupDir, { withFileTypes: true })
    const backups: any[] = []
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const backupPath = path.join(backupDir, entry.name)
        const infoFilePath = path.join(backupPath, 'backup-info.json')
        
        if (fs.existsSync(infoFilePath)) {
          try {
            const infoContent = await readFile(infoFilePath, 'utf-8')
            const backupInfo = JSON.parse(infoContent)
            backups.push(backupInfo)
          } catch (error) {
            logger.warn(`getBackupList: 读取备份信息失败 ${entry.name}:`, error)
          }
        } else {
          const sizeBytes = await calculateDirectorySize(backupPath)
          const statInfo = await stat(backupPath)
          backups.push({
            id: entry.name,
            timestamp: statInfo.mtime.toISOString(),
            sizeBytes,
            size: formatMemory(sizeBytes),
            note: ''
          })
        }
      }
    }
    
    backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    return backups
  } catch (error) {
    logger.error('getBackupList: 获取备份列表失败:', error)
    throw error
  }
}

async function deleteBackup(backupId: string) {
  try {
    logger.info(`deleteBackup: 删除备份: ${backupId}`)
    
    const backupDir = getBackupDir()
    const backupPath = path.join(backupDir, backupId)
    
    if (!fs.existsSync(backupPath)) {
      throw new Error(`备份不存在: ${backupId}`)
    }
    
    const success = await removeDirectory(backupPath)
    if (!success) {
      throw new Error(`删除备份失败: ${backupId}`)
    }
    
    logger.info(`deleteBackup: 备份删除成功: ${backupId}`)
    return true
  } catch (error) {
    logger.error('deleteBackup: 删除备份失败:', error)
    throw error
  }
}

async function restoreBackup(backupId: string) {
  try {
    logger.info(`restoreBackup: 从备份恢复: ${backupId}`)
    
    const backupDir = getBackupDir()
    const backupPath = path.join(backupDir, backupId)
    
    logger.debug(`restoreBackup: 备份路径: ${backupPath}`)
    
    if (!fs.existsSync(backupPath)) {
      logger.error(`restoreBackup: 备份不存在: ${backupPath}`)
      throw new Error(`备份不存在: ${backupId}`)
    }
    
    const backupEntries = await readdir(backupPath)
    logger.debug(`restoreBackup: 备份内容: ${JSON.stringify(backupEntries)}`)
    
    try {
      logger.debug('restoreBackup: 直接复制备份文件到配置目录')
      
      const backupFiles = await readdir(backupPath)
      logger.debug(`restoreBackup: 备份文件列表: ${JSON.stringify(backupFiles)}`)
      
      for (const file of backupFiles) {
        if (file === 'backup-info.json') {
          continue
        }
        
        const srcPath = path.join(backupPath, file)
        const destPath = path.join(CONFIG_PATH, file)
        
        try {
          const fileStat = await stat(srcPath)
          if (fileStat.isDirectory()) {
            await copyDirectory(srcPath, destPath)
          } else {
            await copyFile(srcPath, destPath)
          }
          logger.debug(`restoreBackup: 复制文件 ${file} 成功`)
        } catch (fileError) {
          logger.error(`restoreBackup: 复制文件 ${file} 失败:`, fileError)
        }
      }
      
      logger.debug('restoreBackup: 重新加载配置')
      await loadAppConfig()
      logger.debug(`restoreBackup: 重新加载后的配置: ${JSON.stringify(appConfig)}`)
      
      logger.debug('restoreBackup: 调用 notifyConfigChanged')
      notifyConfigChanged()
      
      logger.info(`restoreBackup: 备份恢复成功: ${backupId}`)
      return true
    } catch (error) {
      logger.error('restoreBackup: 恢复过程出错:', error)
      throw error
    }
  } catch (error) {
    logger.error('restoreBackup: 恢复备份失败:', error)
    throw error
  }
}

async function importBackup(backupPath: string) {
  try {
    logger.info(`importBackup: 导入备份: ${backupPath}`)
    
    if (!fs.existsSync(backupPath)) {
      throw new Error(`备份路径不存在: ${backupPath}`)
    }
    
    const statInfo = await stat(backupPath)
    if (!statInfo.isDirectory()) {
      throw new Error('导入的备份必须是一个目录')
    }
    
    const backupFiles = await readdir(backupPath)
    for (const file of backupFiles) {
      if (file === 'backup-info.json') {
        continue
      }
      
      const srcPath = path.join(backupPath, file)
      const destPath = path.join(CONFIG_PATH, file)
      
      try {
        const fileStat = await stat(srcPath)
        if (fileStat.isDirectory()) {
          await copyDirectory(srcPath, destPath)
        } else {
          await copyFile(srcPath, destPath)
        }
        logger.debug(`importBackup: 复制文件 ${file} 成功`)
      } catch (fileError) {
        logger.error(`importBackup: 复制文件 ${file} 失败:`, fileError)
      }
    }
    
    await loadAppConfig()
    notifyConfigChanged()
    
    logger.info(`importBackup: 备份导入成功: ${backupPath}`)
    return true
  } catch (error) {
    logger.error('importBackup: 导入备份失败:', error)
    throw error
  }
}

async function saveConfig(fileName: string, data: any) {
  logger.info(`[saveConfig] 开始保存配置: ${fileName}`)
  logger.info(`[saveConfig] CONFIG_PATH: ${CONFIG_PATH}`)
  try {
    await ensureConfigDir()
    
    // 验证 CONFIG_PATH 是否存在
    if (!fs.existsSync(CONFIG_PATH)) {
      logger.error(`[saveConfig] CONFIG_PATH 不存在: ${CONFIG_PATH}`)
      // 尝试创建
      fs.mkdirSync(CONFIG_PATH, { recursive: true })
      logger.info(`[saveConfig] 已创建 CONFIG_PATH: ${CONFIG_PATH}`)
    }
    
    if (appConfig?.backupEnabled ?? DEFAULT_APP_CONFIG.backupEnabled) {
      await createBackup(fileName)
    }
    
    const filePath = path.join(CONFIG_PATH, fileName)
    const jsonContent = JSON.stringify(data, null, 2)
    logger.debug(`[saveConfig] 完整文件路径: ${filePath}`)
    logger.debug(`[saveConfig] 配置内容长度: ${jsonContent.length} 字符`)
    await writeFile(filePath, jsonContent, 'utf-8')
    
    // 验证文件是否真的写入成功
    if (fs.existsSync(filePath)) {
      const statInfo = fs.statSync(filePath)
      logger.info(`[saveConfig] 配置保存成功: ${filePath}, 大小: ${statInfo.size} 字节`)
    } else {
      logger.error(`[saveConfig] 配置保存后文件不存在: ${filePath}`)
    }
    
    return true
  } catch (error) {
    logger.error(`[saveConfig] 保存配置失败: ${fileName}`, error)
    return false
  }
}

async function loadAppConfig() {
  logger.info('loadAppConfig: 加载应用配置')
  try {
    const config = await loadConfig('app-config.json')
    appConfig = config || { ...DEFAULT_APP_CONFIG }
    logger.debug('loadAppConfig: 配置内容:', appConfig)
    return appConfig
  } catch (error) {
    logger.error('loadAppConfig: 加载配置失败:', error)
    appConfig = { ...DEFAULT_APP_CONFIG }
    return appConfig
  }
}

function notifyConfigChanged() {
  if (win) {
    logger.debug('notifyConfigChanged: 发送配置更改通知')
    win.webContents.send('config-changed')
  } else {
    logger.debug('notifyConfigChanged: 窗口不存在，无法发送通知')
  }
}

async function saveAppConfig(config: any) {
  const oldBackupEnabled = appConfig?.backupEnabled
  const oldBackupInterval = appConfig?.backupInterval
  const oldBackupIntervalUnit = appConfig?.backupIntervalUnit
  const oldConfigPath = CONFIG_PATH
  const oldBackupDir = getBackupDir()
  
  appConfig = config
  
  if (appConfig.configDir) {
    if (!fs.existsSync(appConfig.configDir)) {
      fs.mkdirSync(appConfig.configDir, { recursive: true })
    }
    
    if (oldConfigPath !== appConfig.configDir) {
      CONFIG_PATH = appConfig.configDir
      
      if (fs.existsSync(oldConfigPath)) {
        await copyDirectory(oldConfigPath, CONFIG_PATH)
      }
      
      if (!appConfig.backupDir && fs.existsSync(oldBackupDir)) {
        const newBackupDir = path.join(CONFIG_PATH, 'backups')
        logger.info(`saveAppConfig: 迁移备份目录: ${oldBackupDir} -> ${newBackupDir}`)
        if (fs.existsSync(newBackupDir)) {
          await removeDirectory(newBackupDir)
        }
        await copyDirectory(oldBackupDir, newBackupDir)
      }
    }
  }
  
  await saveConfig('app-config.json', appConfig)
  // 注册工具快捷键和窗口快捷键（registerShortcuts内部会处理窗口快捷键）
  registerShortcuts(appConfig.shortcuts)
  
  if (
    oldBackupEnabled !== appConfig.backupEnabled ||
    oldBackupInterval !== appConfig.backupInterval ||
    oldBackupIntervalUnit !== appConfig.backupIntervalUnit
  ) {
    logger.info('saveAppConfig: 备份配置发生变化，重新启动调度器')
    await startBackupScheduler()
  }
  
  // 如果日志等级发生变化，更新日志等级
  if (config.logLevel && config.logLevel !== appConfig.logLevel) {
    appConfig.logLevel = config.logLevel
    logger.setLevel(config.logLevel)
    logger.info(`日志等级已更新为: ${config.logLevel}`)
  }
  
  notifyConfigChanged()
  
  return true
}

function registerShortcuts(shortcuts: any) {
  globalShortcut.unregisterAll()
  if (!shortcuts) return

  Object.entries(shortcuts).forEach(([toolId, accelerator]) => {
    if (accelerator && typeof accelerator === 'string' && isValidAccelerator(accelerator)) {
      try {
        globalShortcut.register(accelerator, () => {
          if (win) {
            win.webContents.send('shortcut-triggered', toolId)
          }
        })
      } catch (error) {
        logger.warn(`registerShortcuts: failed for ${toolId}:`, error instanceof Error ? error.message : String(error))
      }
    }
  })

  const windowShortcut = appConfig?.windowShortcut || DEFAULT_APP_CONFIG.windowShortcut
  if (windowShortcut && typeof windowShortcut === 'string' && isValidAccelerator(windowShortcut)) {
    try {
      globalShortcut.register(windowShortcut, () => {
        if (win) {
          if (win.isVisible()) {
            win.hide()
          } else {
            win.show()
            win.focus()
          }
        }
      })
      logger.info(`窗口快捷键注册成功`)
    } catch (error) {
      logger.warn('registerShortcuts: failed to register window shortcut:', error instanceof Error ? error.message : String(error))
    }
  }
}

async function createWindow() {
  if (isPackaged) {
    APP_DIR = path.dirname(app.getPath('exe'))
  } else {
    APP_DIR = path.dirname(__dirname)
  }
  
  CONFIG_PATH = path.join(APP_DIR, 'config')
  const logDir = path.join(APP_DIR, 'logs')
  initLogger(logDir, 7)
  logger.info(`[MAIN] APP_DIR: ${APP_DIR}`)
  logger.info(`[MAIN] CONFIG_PATH: ${CONFIG_PATH}`)
  
  await ensureConfigDir()
  await loadAppConfig()
  await shouldBackupNow()
  
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: '工具箱',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: true,
      allowRunningInsecureContent: false
    },
    icon: path.join(PUBLIC, 'favicon.ico')
  })

  // Only open DevTools in development mode, never in production builds
  if (!app.isPackaged && VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(DIST, 'index.html'))
  }
  
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Settings',
          click: () => {
            win?.webContents.send('navigate-to', 'settings')
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'Ctrl+Q',
          click: () => {
            app.quit()
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox({
              title: '工具箱',
              message: '工具箱 v1.0.0\n\n一个实用的工具集合应用'
            })
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(menuTemplate)
  Menu.setApplicationMenu(menu)
  
  // 注册快捷键（包括窗口显示/隐藏快捷键）
  registerShortcuts(appConfig.shortcuts)
  
  // 应用日志等级配置
  const logLevel = appConfig.logLevel || 'INFO'
  logger.setLevel(logLevel)
  logger.info(`日志等级已设置为: ${logLevel}`)
  
  ipcMain.handle('select-directory', async () => {
    logger.info('select-directory: 用户点击选择目录按钮')
    try {
      const currentWin = BrowserWindow.getAllWindows()[0]
      
      const result = await dialog.showOpenDialog(currentWin, {
        properties: ['openDirectory'],
        title: '选择配置文件保存目录'
      })
      
      if (!result.canceled && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0]
        logger.info('select-directory: 用户选择了目标目录:', selectedPath)
        
        const returnValue = selectedPath
        logger.info('select-directory: 成功返回结果给渲染进程:', returnValue)
        return returnValue
      }
      
      logger.info('select-directory: 用户取消选择')
      throw new Error('用户取消选择')
    } catch (error) {
      logger.error('select-directory: 选择目录失败:', error)
      throw error
    }
  })
  
  ipcMain.handle('select-backup-directory', async () => {
    logger.info('select-backup-directory: 用户点击选择备份目录按钮')
    try {
      const currentWin = BrowserWindow.getAllWindows()[0]
      
      const result = await dialog.showOpenDialog(currentWin, {
        properties: ['openDirectory'],
        title: '选择备份文件保存目录'
      })
      
      if (!result.canceled && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0]
        logger.info('select-backup-directory: 用户选择了备份目录:', selectedPath)
        return selectedPath
      }
      
      logger.info('select-backup-directory: 用户取消选择')
      throw new Error('用户取消选择')
    } catch (error) {
      logger.error('select-backup-directory: 选择备份目录失败:', error)
      throw error
    }
  })
  
  ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile']
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return null
  })
  
  ipcMain.handle('search-files', async (_, directory: string, pattern: string) => {
    if (!pattern.trim() || !directory) return []
    return await searchFilesRecursive(directory, pattern)
  })
  
  ipcMain.handle('open-file', async (_, filePath: string) => {
    if (!filePath) return
    // Security: validate the path is not used for command injection
    if (!isSafeFilePath(filePath)) {
      logger.warn('open-file: rejected unsafe path:', JSON.stringify(filePath.substring(0, 100)))
      return
    }
    try {
      await (shell.openPath as any)(filePath)
    } catch (e) {
      logger.error('open-file: failed:', e instanceof Error ? e.message : String(e))
    }
  })
  
  ipcMain.handle('open-url', async (_, url: string) => {
    if (!url) return
    // Security: only allow http/https URLs to prevent shell/protocol abuse
    if (!isSafeUrl(url)) {
      logger.warn('open-url: rejected unsafe URL:', JSON.stringify(url.substring(0, 100)))
      return
    }
    try {
      await shell.openExternal(url)
    } catch (e) {
      logger.error('open-url: failed:', e instanceof Error ? e.message : String(e))
    }
  })
  
  ipcMain.handle('load-config', async (_, fileName: string) => {
    const data = await loadConfig(fileName)
    // For passwords.json, decrypt password fields before returning to the UI.
    // Plaintext entries (without __encrypted__ flag) pass through unchanged,
    // so old configs are fully backward-compatible.
    if (fileName === 'passwords.json' && data) {
      return decryptPasswordFieldsInConfig(data)
    }
    return data
  })

  ipcMain.handle('save-config', async (_, fileName: string, data: any) => {
    // For passwords.json, encrypt password fields before writing to disk.
    if (fileName === 'passwords.json' && data) {
      data = encryptPasswordFieldsInConfig(data)
    }
    await saveConfig(fileName, data)
    return true
  })
  
  ipcMain.handle('get-app-config', async () => {
    logger.info('get-app-config: 加载应用配置')
    try {
      const config = await loadAppConfig()
      if (!config.configDir) {
        config.configDir = CONFIG_PATH
      }
      config.backupDir = getBackupDir()
      logger.debug('get-app-config: 配置加载成功:', config)
      return config
    } catch (error) {
      logger.error('get-app-config: 配置加载失败:', error)
      throw error
    }
  })
  
  ipcMain.handle('save-app-config', async (_, config: any) => {
    logger.info('save-app-config: 保存应用配置')
    logger.debug('save-app-config: 配置内容:', JSON.stringify(config, null, 2))
    logger.debug('save-app-config: toolbarOrder length:', config?.toolbarOrder?.length || 0)
    logger.debug('save-app-config: hiddenTools length:', config?.hiddenTools?.length || 0)
    try {
      const result = await saveAppConfig(config)
      logger.info('save-app-config: 配置保存成功')
      logger.debug('save-app-config: 保存后 appConfig toolbarOrder:', appConfig?.toolbarOrder?.length || 0)
      logger.debug('save-app-config: 保存后 appConfig hiddenTools:', appConfig?.hiddenTools?.length || 0)
      return result
    } catch (error) {
      logger.error('save-app-config: 配置保存失败:', error)
      throw error
    }
  })
  
  ipcMain.handle('reset-app-config', async () => {
    logger.info('reset-app-config: 重置应用配置')
    try {
      appConfig = { ...DEFAULT_APP_CONFIG }
      appConfig.configDir = CONFIG_PATH
      appConfig.backupDir = getBackupDir()
      
      await saveConfig('app-config.json', appConfig)
      logger.info('reset-app-config: 配置重置成功')
      
      notifyConfigChanged()
      return true
    } catch (error) {
      logger.error('reset-app-config: 配置重置失败:', error)
      throw error
    }
  })
  
  ipcMain.handle('get-backup-settings', async () => {
    await loadAppConfig()
    return {
      backupEnabled: appConfig?.backupEnabled ?? DEFAULT_APP_CONFIG.backupEnabled,
      backupCount: appConfig?.backupCount ?? DEFAULT_APP_CONFIG.backupCount
    }
  })
  
  ipcMain.handle('save-backup-settings', async (_, settings: { backupEnabled: boolean, backupCount: number }) => {
    await loadAppConfig()
    appConfig.backupEnabled = settings.backupEnabled
    appConfig.backupCount = settings.backupCount
    await saveAppConfig(appConfig)
    return true
  })
  
  ipcMain.handle('get-backup-dir', async () => {
    return getBackupDir()
  })
  
  ipcMain.handle('create-full-backup', async (_, note?: string) => {
    return await createFullBackup(note)
  })
  
  ipcMain.handle('get-backup-list', async () => {
    return await getBackupList()
  })
  
  ipcMain.handle('delete-backup', async (_, backupId: string) => {
    return await deleteBackup(backupId)
  })
  
  ipcMain.handle('restore-backup', async (_, backupId: string) => {
    return await restoreBackup(backupId)
  })
  
  ipcMain.handle('import-backup', async (_, backupPath: string) => {
    return await importBackup(backupPath)
  })
  
  ipcMain.handle('migrate-config-dir', async (_, newDir: string, fullConfig?: any) => {
    logger.info('migrate-config-dir: 开始配置目录迁移')
    logger.debug('migrate-config-dir: 参数:', { newDir, hasFullConfig: !!fullConfig })
    
    try {
      if (!newDir) {
        logger.error('migrate-config-dir: 新目录路径不能为空')
        throw new Error('新目录路径不能为空')
      }
      
      if (!fs.existsSync(newDir)) {
        logger.info(`migrate-config-dir: 创建新目录: ${newDir}`)
        fs.mkdirSync(newDir, { recursive: true })
      }
      
      const oldConfigPath = CONFIG_PATH
      logger.info(`migrate-config-dir: 旧配置路径: ${oldConfigPath}`)
      logger.info(`migrate-config-dir: 新配置路径: ${newDir}`)
      
      if (fullConfig) {
        logger.debug('migrate-config-dir: 使用从渲染进程提供的完整配置')
        appConfig = { ...fullConfig, configDir: newDir }
      } else {
        appConfig.configDir = newDir
      }
      
      if (fs.existsSync(oldConfigPath)) {
        logger.info(`migrate-config-dir: 复制文件从 ${oldConfigPath} 到 ${newDir}`)
        const copySuccess = await copyDirectory(oldConfigPath, newDir)
        if (!copySuccess) {
          logger.error('migrate-config-dir: 目录复制失败')
          throw new Error('目录复制失败')
        }
        logger.info('migrate-config-dir: 目录复制成功')
      } else {
        logger.warn(`migrate-config-dir: 旧配置路径不存在: ${oldConfigPath}`)
      }
      
      CONFIG_PATH = newDir
      logger.info(`migrate-config-dir: 更新 CONFIG_PATH 为: ${CONFIG_PATH}`)
      
      await ensureConfigDir()
      const filePath = path.join(CONFIG_PATH, 'app-config.json')
      logger.info(`migrate-config-dir: 保存 app-config.json 到: ${filePath}`)
      await writeFile(filePath, JSON.stringify(appConfig, null, 2), 'utf-8')
      logger.info('migrate-config-dir: app-config.json 保存成功')
      registerShortcuts(appConfig.shortcuts)
      
      logger.info('migrate-config-dir: 配置目录迁移成功')
      return { success: true }
    } catch (error) {
      logger.error('migrate-config-dir: 配置目录迁移失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })
  
  ipcMain.handle('get-processes', async () => {
    try {
      const { stdout } = await execFilePromise('wmic', [
        'process', 'get', 'ProcessId,Name,WorkingSetSize,UserModeTime,KernelModeTime', '/format:csv'
      ], { encoding: 'utf-8' })
      const lines = stdout.trim().split('\n').filter(l => l.trim())
      if (lines.length < 2) return []
      
      const header = lines[0].split(',')
      const pidIndex = header.findIndex(h => h.trim().toLowerCase() === 'processid')
      const nameIndex = header.findIndex(h => h.trim().toLowerCase() === 'name')
      const memoryIndex = header.findIndex(h => h.trim().toLowerCase() === 'workingsetsize')
      const userTimeIndex = header.findIndex(h => h.trim().toLowerCase() === 'usermodetime')
      const kernelTimeIndex = header.findIndex(h => h.trim().toLowerCase() === 'kernelmodetime')
      
      const processes: any[] = []
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',')
        const pid = parseInt(parts[pidIndex]) || 0
        const name = parts[nameIndex] || ''
        const memoryBytes = parseInt(parts[memoryIndex]) || 0
        
        const userTime = parseInt(parts[userTimeIndex]) || 0
        const kernelTime = parseInt(parts[kernelTimeIndex]) || 0
        const totalTime = userTime + kernelTime
        
        processes.push({
          pid,
          name,
          memory: formatMemory(memoryBytes),
          memoryBytes,
          cpuUsage: 0,
          totalTime
        })
      }
      
      const totalTimeSum = processes.reduce((sum, p) => sum + p.totalTime, 0)
      processes.forEach(p => {
        if (totalTimeSum > 0) {
          p.cpuUsage = (p.totalTime / totalTimeSum) * 100
        }
      })
      
      return processes
    } catch (error) {
      console.error('Error getting processes:', error)
      return []
    }
  })
  
  ipcMain.handle('kill-processes', async (_, pids: number[]) => {
    const errors: number[] = []
    for (const pid of pids) {
      try {
        // Security: validate PID is a valid positive integer (injection guard)
        if (!isValidPid(pid)) {
          logger.warn('kill-processes: rejected invalid PID:', pid)
          errors.push(pid)
          continue
        }
        // Use execFile with separate args, NOT shell string interpolation
        await execFilePromise('taskkill', ['/F', '/PID', String(pid)])
      } catch (error) {
        errors.push(pid)
      }
    }
    return { success: true, errors }
  })
  
  ipcMain.handle('get-system-info', async () => {
    try {
      const info: any = {}
      
      try {
        const { stdout: cpuStdout } = await execFilePromise('wmic', [
          'cpu', 'get', 'Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed', '/format:list'
        ], { encoding: 'utf-8' })
        const cpuLines = cpuStdout.trim().split('\n').filter(l => l.trim())
        
        let cpuName = 'Unknown'
        let cores = 0
        let logicalProcessors = 0
        let maxSpeed = 0
        
        for (const line of cpuLines) {
          if (line.startsWith('Name=')) {
            cpuName = line.substring('Name='.length).trim()
          } else if (line.startsWith('NumberOfCores=')) {
            cores = parseInt(line.substring('NumberOfCores='.length).trim()) || 0
          } else if (line.startsWith('NumberOfLogicalProcessors=')) {
            logicalProcessors = parseInt(line.substring('NumberOfLogicalProcessors='.length).trim()) || 0
          } else if (line.startsWith('MaxClockSpeed=')) {
            maxSpeed = parseInt(line.substring('MaxClockSpeed='.length).trim()) || 0
          }
        }
        
        info.cpu = {
          name: cpuName,
          cores: cores,
          logicalProcessors: logicalProcessors,
          maxSpeed: maxSpeed,
          usage: 0
        }
      } catch (e) {
        console.error('Error getting CPU info:', e)
        info.cpu = { name: 'Unknown', cores: 0, logicalProcessors: 0, maxSpeed: 0, usage: 0 }
      }
      
      try {
        const { stdout: usageStdout } = await execFilePromise('powershell', [
          '-NoProfile', '-Command', '(Get-Counter "\\Processor(_Total)\\% Processor Time").CounterSamples.CookedValue'
        ], { encoding: 'utf-8' })
        const usageStr = usageStdout.trim()
        const usage = parseFloat(usageStr)
        if (!isNaN(usage) && usage >= 0 && usage <= 100) {
          info.cpu.usage = Math.round(usage)
        }
      } catch (e) {
        console.error('Error getting CPU usage with PowerShell:', e)
        try {
          const { stdout: wmicStdout } = await execFilePromise('wmic', [
            'cpu', 'get', 'LoadPercentage'
          ], { encoding: 'utf-8' })
          const lines = wmicStdout.trim().split('\n').filter(l => l.trim())
          if (lines.length > 1) {
            const usages: number[] = []
            for (let i = 1; i < lines.length; i++) {
              const u = parseInt(lines[i].trim())
              if (!isNaN(u) && u >= 0 && u <= 100) {
                usages.push(u)
              }
            }
            if (usages.length > 0) {
              info.cpu.usage = Math.round(usages.reduce((a, b) => a + b, 0) / usages.length)
            }
          }
        } catch (fallbackError) {
          console.error('Error getting CPU usage with wmic:', fallbackError)
        }
      }
      
      try {
        const { stdout: memStdout } = await execFilePromise('wmic', [
          'OS', 'get', 'TotalVisibleMemorySize,FreePhysicalMemory', '/format:list'
        ], { encoding: 'utf-8' })
        const memLines = memStdout.trim().split('\n').filter(l => l.trim())
        
        let total = 0
        let free = 0
        
        for (const line of memLines) {
          if (line.startsWith('TotalVisibleMemorySize=')) {
            total = parseInt(line.substring('TotalVisibleMemorySize='.length).trim()) || 0
          } else if (line.startsWith('FreePhysicalMemory=')) {
            free = parseInt(line.substring('FreePhysicalMemory='.length).trim()) || 0
          }
        }
        
        if (total > 0) {
          info.memory = {
            total: total * 1024,
            free: free * 1024,
            used: (total - free) * 1024
          }
        }
      } catch (e) {
        console.error('Error getting memory info:', e)
        info.memory = { total: 0, free: 0, used: 0 }
      }
      
      try {
        const { stdout: gpuStdout } = await execFilePromise('wmic', [
          'path', 'win32_VideoController', 'get', 'Name,AdapterRAM', '/format:csv'
        ], { encoding: 'utf-8' })
        const gpuLines = gpuStdout.trim().split('\n').filter(l => l.trim())
        if (gpuLines.length > 1) {
          const gpuParts = gpuLines[gpuLines.length - 1].split(',')
          info.gpu = {
            name: gpuParts[1] || 'Unknown',
            memory: parseInt(gpuParts[2]) || 0
          }
        }
      } catch (e) {
        info.gpu = { name: 'Unknown', memory: 0 }
      }
      
      return info
    } catch (error) {
      console.error('Error getting system info:', error)
      return { cpu: {}, memory: {}, gpu: {} }
    }
  })
  
  ipcMain.handle('kill-process', async (_, pid: number) => {
    try {
      if (!isValidPid(pid)) {
        logger.warn('kill-process: rejected invalid PID:', pid)
        return { success: false, error: '无效的进程ID' }
      }
      // Use execFile with separate args, NOT shell string interpolation
      await execFilePromise('taskkill', ['/F', '/PID', String(pid)])
      return { success: true }
    } catch (error) {
      logger.error('kill-process: failed:', error instanceof Error ? error.message : String(error))
      return { success: false, error: '无法终止该进程' }
    }
  })
  
  ipcMain.handle('search-file-handle', async (_, filePath: string) => {
    try {
      if (!isSafeFilePath(filePath)) {
        logger.warn('search-file-handle: rejected unsafe path')
        return []
      }
      // Extract the file name only (no path components)
      const fileName = path.basename(filePath).replace(/\.[^/.]+$/, '')
      if (!fileName || fileName.length > 100) {
        return []
      }
      // Security: pass the search term via a separate process argument instead of
      // string interpolation in shell/PowerShell - no injection is possible this way
      const psCode = `
        $ErrorActionPreference = 'Stop'
        $searchTerm = $args[0]
        if ([string]::IsNullOrEmpty($searchTerm)) { exit }
        Get-Process | Where-Object {
          try { $_.Modules.ModuleName -like ('*' + $searchTerm + '*') } catch { $false }
        } | Select-Object Id, ProcessName | ConvertTo-Json -Compress
      `
      const { stdout } = await execFilePromise('powershell', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command', psCode,
        '-args', fileName
      ], { encoding: 'utf-8' })

      if (stdout && stdout.trim()) {
        const result = JSON.parse(stdout.trim())
        return Array.isArray(result) ? result : [result]
      }
      return []
    } catch (error) {
      logger.warn('search-file-handle: failed:', error instanceof Error ? error.message : String(error))
      return []
    }
  })
  
  ipcMain.handle('generate-password', async (_, options: {
    length: number
    includeNumbers: boolean
    includeSymbols: boolean
    includeUppercase: boolean
    includeLowercase: boolean
    customSymbols?: string[]
  }) => {
    const { length, includeNumbers, includeSymbols, includeUppercase, includeLowercase, customSymbols } = options
    const safeLength = Math.max(4, Math.min(128, length || 16))
    let chars = ''
    if (includeLowercase) chars += 'abcdefghijklmnopqrstuvwxyz'
    if (includeUppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    if (includeNumbers) chars += '0123456789'
    if (includeSymbols) {
      if (customSymbols && customSymbols.length > 0) {
        chars += customSymbols.join('')
      } else {
        chars += '!@#$%^&*()_+-=[]{}|;:,.<>?'
      }
    }
    if (!chars) chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    // Security: use crypto.randomInt (uniform distribution) instead of
    // randomBytes[i] % chars.length which creates a modulo bias and slightly
    // favors the first chars in the pool.
    let password = ''
    const charLen = chars.length
    for (let i = 0; i < safeLength; i++) {
      password += chars[crypto.randomInt(0, charLen)]
    }
    return password
  })
  
  ipcMain.handle('get-passwords', async () => {
    try {
      const data = await loadConfig('passwords.json')
      const result = data || { groups: [], passwords: [] }
      // Decrypt password fields before sending to renderer (they never live decrypted on disk)
      if (Array.isArray(result.passwords)) {
        result.passwords = result.passwords.map((p: any) => decryptPasswordData(p))
      }
      return result
    } catch (error) {
      logger.error('get-passwords: failed:', error instanceof Error ? error.message : String(error))
      return { groups: [], passwords: [] }
    }
  })
  
  ipcMain.handle('save-password', async (_, passwordData: any) => {
    try {
      const existingData = await loadConfig('passwords.json') || { groups: [], passwords: [] }
      const now = new Date().toISOString()
      if (passwordData.id) {
        const index = existingData.passwords.findIndex((p: any) => p.id === passwordData.id)
        if (index !== -1) {
          // Encrypt the password field before writing to disk
          const encrypted = encryptPasswordData({
            ...existingData.passwords[index],
            ...passwordData,
            updatedAt: now
          })
          existingData.passwords[index] = encrypted
        }
      } else {
        // Encrypt the password field before writing to disk
        const encrypted = encryptPasswordData({
          ...passwordData,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now
        })
        existingData.passwords.push(encrypted)
      }
      await saveConfig('passwords.json', existingData)
      return true
    } catch (error) {
      logger.error('save-password: failed:', error instanceof Error ? error.message : String(error))
      return false
    }
  })
  
  ipcMain.handle('delete-password', async (_, id: string) => {
    try {
      const existingData = await loadConfig('passwords.json') || { groups: [], passwords: [] }
      existingData.passwords = existingData.passwords.filter((p: any) => p.id !== id)
      await saveConfig('passwords.json', existingData)
      return true
    } catch (error) {
      console.error('Error deleting password:', error)
      return false
    }
  })

  ipcMain.handle('select-icon', async () => {
    logger.info('select-icon: 用户点击选择图标按钮')
    try {
      const currentWin = BrowserWindow.getAllWindows()[0]
      
      const result = await dialog.showOpenDialog(currentWin, {
        properties: ['openFile'],
        title: '选择图标文件',
        filters: [
          { name: '图标文件', extensions: ['png', 'jpg', 'jpeg', 'ico', 'bmp', 'gif'] }
        ]
      })
      
      if (!result.canceled && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0]
        logger.info('select-icon: 用户选择了图标:', selectedPath)
        
        const image = nativeImage.createFromPath(selectedPath)
        const base64 = image.toDataURL()
        logger.info('select-icon: 成功将图标转换为Base64')
        
        return {
          path: selectedPath,
          base64: base64
        }
      }
      
      logger.info('select-icon: 用户取消选择')
      return null
    } catch (error) {
      logger.error('select-icon: 选择图标失败:', error)
      throw error
    }
  })

  ipcMain.handle('resolve-shortcut', async (_, lnkPath: string) => {
    logger.info('[resolve-shortcut] 开始解析快捷方式')
    try {
      if (!lnkPath || lnkPath.trim() === '') {
        return { success: false, error: '路径为空' }
      }

      const trimmedPath = lnkPath.trim()

      if (!isSafeFilePath(trimmedPath)) {
        logger.warn('[resolve-shortcut] rejected unsafe path')
        return { success: false, error: '不安全的路径', targetPath: trimmedPath, isShortcut: false }
      }

      if (!trimmedPath.toLowerCase().endsWith('.lnk')) {
        return { success: true, targetPath: trimmedPath, isShortcut: false }
      }

      if (!fs.existsSync(trimmedPath)) {
        return { success: false, error: '文件不存在', targetPath: trimmedPath, isShortcut: false }
      }

      try {
        // SECURITY FIX: instead of embedding the user path into the PowerShell
        // script via string interpolation (which could allow script injection),
        // we encode the path to Base64 in Node.js and pass it as a separate arg
        // so the PowerShell script only receives a fixed Base64 string via $args[0]
        const pathBase64 = Buffer.from(trimmedPath, 'utf-8').toString('base64')

        const psScript = `
          $ErrorActionPreference = 'Stop'
          try {
            $lnkB64 = $args[0]
            if ([string]::IsNullOrEmpty($lnkB64)) { exit }
            $bytes = [System.Convert]::FromBase64String($lnkB64)
            $lnkPath = [System.Text.Encoding]::UTF8.GetString($bytes)
            $shell = New-Object -ComObject WScript.Shell
            $shortcut = $shell.CreateShortcut($lnkPath)
            $target = $shortcut.TargetPath
            $arguments = $shortcut.Arguments
            $workingDir = $shortcut.WorkingDirectory
            $isValid = $true
            if ([string]::IsNullOrEmpty($target)) { $target = $lnkPath; $isValid = $false }
            $enc = [System.Text.Encoding]::Unicode
            $output = [PSCustomObject]@{
              Success = $isValid
              TargetPathBase64 = [System.Convert]::ToBase64String($enc.GetBytes($target))
              ArgumentsBase64 = [System.Convert]::ToBase64String($enc.GetBytes($arguments))
              WorkingDirectoryBase64 = [System.Convert]::ToBase64String($enc.GetBytes($workingDir))
              IsShortcut = $true
            }
            $output | ConvertTo-Json -Compress
          } catch {
            $enc = [System.Text.Encoding]::Unicode
            $output = [PSCustomObject]@{
              Success = $false
              ErrorBase64 = [System.Convert]::ToBase64String($enc.GetBytes($_.Exception.Message))
              IsShortcut = $false
            }
            $output | ConvertTo-Json -Compress
          }
        `

        const { stdout } = await execFilePromise('powershell', [
          '-NoProfile',
          '-ExecutionPolicy', 'Bypass',
          '-Command', psScript,
          '-args', pathBase64
        ], { encoding: 'utf-8' })

        const trimmedStdout = (stdout || '').trim()
        if (!trimmedStdout) {
          return { success: true, targetPath: trimmedPath, isShortcut: false }
        }

        let result
        try {
          result = JSON.parse(trimmedStdout)
        } catch {
          return { success: true, targetPath: trimmedPath, isShortcut: false }
        }

        const decodeBase64 = (b64: string): string => {
          if (!b64) return ''
          try { return Buffer.from(b64, 'base64').toString('utf16le') } catch { return '' }
        }

        const targetPath = result.TargetPathBase64 ? decodeBase64(result.TargetPathBase64) : trimmedPath
        const argumentsStr = result.ArgumentsBase64 ? decodeBase64(result.ArgumentsBase64) : ''
        const workingDir = result.WorkingDirectoryBase64 ? decodeBase64(result.WorkingDirectoryBase64) : ''
        const isShortcutResult = result.IsShortcut === true || (result.Success === true && targetPath !== trimmedPath)

        if (result.Success !== true) {
          const errMsg = result.ErrorBase64 ? decodeBase64(result.ErrorBase64) : '未知错误'
          return { success: true, targetPath, isShortcut: false, error: errMsg }
        }

        logger.info('[resolve-shortcut] 快捷方式解析成功')
        return {
          success: true,
          targetPath,
          isShortcut: isShortcutResult,
          arguments: argumentsStr,
          workingDirectory: workingDir
        }
      } catch (psError) {
        const errMsg = psError instanceof Error ? psError.message : String(psError)
        logger.warn('[resolve-shortcut] PowerShell 执行异常', { error: errMsg })
        return { success: true, targetPath: trimmedPath, isShortcut: false, error: errMsg }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('[resolve-shortcut] 解析快捷方式时发生异常')
      return { success: false, error: errorMessage, targetPath: lnkPath }
    }
  })

  ipcMain.handle('get-file-icon', async (_, filePath: string) => {
    logger.info('[get-file-icon] 开始获取文件图标', { filePath })
    try {
      if (!filePath || filePath.trim() === '') {
        logger.warn('[get-file-icon] 无效的文件路径: 路径为空')
        return { base64: '', error: '路径为空' }
      }

      const trimmedPath = filePath.trim()
      logger.debug('[get-file-icon] 规范化后的路径:', trimmedPath)

      // 检查文件是否存在
      if (!fs.existsSync(trimmedPath)) {
        logger.warn('[get-file-icon] 文件不存在', { path: trimmedPath })
        return { base64: '', error: '文件不存在' }
      }

      // 获取文件状态信息用于日志
      try {
        const statInfo = fs.statSync(trimmedPath)
        logger.debug('[get-file-icon] 文件信息:', {
          size: statInfo.size,
          isDirectory: statInfo.isDirectory(),
          isFile: statInfo.isFile()
        })
      } catch (statError) {
        logger.warn('[get-file-icon] 无法获取文件状态信息', statError)
      }

      // 尝试获取图标，先尝试 normal size，失败则尝试 small size
      let icon = null
      let iconSizeUsed = ''
      
      try {
        logger.debug('[get-file-icon] 尝试获取 normal size 图标')
        icon = await app.getFileIcon(trimmedPath, { size: 'normal' })
        iconSizeUsed = 'normal'
      } catch (normalError: unknown) {
        const errMsg = normalError instanceof Error ? normalError.message : String(normalError)
        logger.warn('[get-file-icon] normal size 获取失败，尝试 small size', { error: errMsg })
        try {
          icon = await app.getFileIcon(trimmedPath, { size: 'small' })
          iconSizeUsed = 'small'
        } catch (smallError: unknown) {
          const smallErrMsg = smallError instanceof Error ? smallError.message : String(smallError)
          logger.error('[get-file-icon] small size 也获取失败', { error: smallErrMsg })
          return { base64: '', error: '图标获取失败' }
        }
      }

      if (!icon || icon.isEmpty()) {
        logger.warn('[get-file-icon] 获取到的图标为空', { path: trimmedPath, size: iconSizeUsed })
        return { base64: '', error: '图标为空' }
      }

      const base64 = icon.toDataURL()
      
      if (!base64 || base64.length === 0) {
        logger.warn('[get-file-icon] 图标转换为 Base64 后为空')
        return { base64: '', error: 'Base64 转换失败' }
      }

      // 检查 base64 是否包含 data:image 前缀
      const hasDataPrefix = base64.startsWith('data:image')
      logger.debug('[get-file-icon] Base64 数据检查:', {
        hasDataPrefix,
        startsWith: base64.substring(0, 50) + '...'
      })

      logger.info('[get-file-icon] 成功获取文件图标', {
        path: trimmedPath,
        size: iconSizeUsed,
        base64Length: base64.length,
        hasDataPrefix
      })
      
      return { base64 }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('[get-file-icon] 获取文件图标时发生异常:', { 
        filePath, 
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      })
      return { base64: '', error: errorMessage }
    }
  })
}

async function searchFilesRecursive(directory: string, pattern: string, depth = 0): Promise<string[]> {
  const MAX_DEPTH = 10
  if (depth > MAX_DEPTH) return []
  if (!isSafeFilePath(directory)) return []

  const results: string[] = []
  try {
    const files = await readdir(directory)
    for (const file of files) {
      const filePath = path.join(directory, file)
      const statInfo = await stat(filePath)
      if (statInfo.isDirectory()) {
        results.push(...(await searchFilesRecursive(filePath, pattern, depth + 1)))
      } else if (pattern && file.toLowerCase().includes(pattern.toLowerCase())) {
        results.push(filePath)
      }
    }
  } catch (error) {
    logger.warn('searchFilesRecursive: failed:', error instanceof Error ? error.message : String(error))
  }
  return results
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
