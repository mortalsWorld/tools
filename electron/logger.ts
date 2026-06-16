import fs from 'node:fs'
import path from 'node:path'

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

interface LoggerConfig {
  logDir: string
  retentionDays: number
  level: LogLevel  // 日志等级配置
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  'DEBUG': 0,
  'INFO': 1,
  'WARN': 2,
  'ERROR': 3
}

const DEFAULT_CONFIG: LoggerConfig = {
  logDir: path.join(process.cwd(), 'logs'),
  retentionDays: 7,
  level: 'INFO'  // 默认日志等级为 INFO
}

let config: LoggerConfig = { ...DEFAULT_CONFIG }

/**
 * 初始化日志记录器
 * @param logDir - 日志文件存储目录
 * @param retentionDays - 日志保留天数
 * @param level - 日志等级
 */
export const initLogger = (logDir: string, retentionDays: number = 7, level: LogLevel = 'INFO') => {
  config = { logDir, retentionDays, level }
  
  if (!fs.existsSync(config.logDir)) {
    fs.mkdirSync(config.logDir, { recursive: true })
  }
  
  cleanupOldLogs()
}

/**
 * 更新日志等级
 * @param level - 新的日志等级
 */
export const setLogLevel = (level: LogLevel) => {
  config.level = level
}

/**
 * 获取今天的日期字符串（格式：YYYY-MM-DD）
 * @returns 日期字符串
 */
const getTodayString = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 获取日志文件路径
 * @returns 日志文件完整路径
 */
const getLogFilePath = () => {
  return path.join(config.logDir, `${getTodayString()}.log`)
}

/**
 * 获取时间戳字符串（格式：HH:MM:SS.ms）
 * @returns 时间戳字符串
 */
const getTimestamp = () => {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const ms = String(now.getMilliseconds()).padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${ms}`
}

/**
 * 通用日志记录函数
 * @param level - 日志等级
 * @param message - 日志消息
 * @param args - 附加参数（会被序列化为JSON）
 */
const log = (level: LogLevel, message: string, ...args: any[]) => {
  // 检查日志等级，如果当前日志等级低于配置的等级，则不输出
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[config.level]) {
    return
  }
  
  const timestamp = getTimestamp()
  let logMessage = `[${timestamp}] [${level}] ${message}`
  
  if (args.length > 0) {
    try {
      const extra = args.map(arg => {
        if (typeof arg === 'object') {
          return JSON.stringify(arg, null, 2)
        }
        return String(arg)
      }).join(' ')
      logMessage += `\n${extra}`
    } catch (e) {
      logMessage += `\n参数序列化错误: ${e}`
    }
  }
  
  console.log(logMessage)
  
  try {
    if (!fs.existsSync(config.logDir)) {
      fs.mkdirSync(config.logDir, { recursive: true })
    }
    fs.appendFileSync(getLogFilePath(), logMessage + '\n')
  } catch (e) {
    console.error('写入日志文件失败:', e)
  }
}

/**
 * 清理过期日志文件
 */
const cleanupOldLogs = () => {
  try {
    if (!fs.existsSync(config.logDir)) {
      return
    }
    
    const files = fs.readdirSync(config.logDir)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays)
    
    for (const file of files) {
      const match = file.match(/^(\d{4}-\d{2}-\d{2})\.log$/)
      if (match) {
        const fileDate = new Date(match[1])
        if (fileDate < cutoffDate) {
          const filePath = path.join(config.logDir, file)
          fs.unlinkSync(filePath)
          console.log(`清理过期日志文件: ${file}`)
        }
      }
    }
  } catch (e) {
    console.error('清理过期日志失败:', e)
  }
}

export const logger = {
  debug: (message: string, ...args: any[]) => log('DEBUG', message, ...args),
  info: (message: string, ...args: any[]) => log('INFO', message, ...args),
  warn: (message: string, ...args: any[]) => log('WARN', message, ...args),
  error: (message: string, ...args: any[]) => log('ERROR', message, ...args),
  cleanup: cleanupOldLogs,
  setLevel: setLogLevel
}

export default logger
