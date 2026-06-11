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

export const initLogger = (logDir: string, retentionDays: number = 7, level: LogLevel = 'INFO') => {
  config = { logDir, retentionDays, level }
  
  if (!fs.existsSync(config.logDir)) {
    fs.mkdirSync(config.logDir, { recursive: true })
  }
  
  cleanupOldLogs()
}

// 更新日志等级
export const setLogLevel = (level: LogLevel) => {
  config.level = level
}

const getTodayString = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getLogFilePath = () => {
  return path.join(config.logDir, `${getTodayString()}.log`)
}

const getTimestamp = () => {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const ms = String(now.getMilliseconds()).padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${ms}`
}

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
      logMessage += `\nError serializing args: ${e}`
    }
  }
  
  console.log(logMessage)
  
  try {
    if (!fs.existsSync(config.logDir)) {
      fs.mkdirSync(config.logDir, { recursive: true })
    }
    fs.appendFileSync(getLogFilePath(), logMessage + '\n')
  } catch (e) {
    console.error('Failed to write log to file:', e)
  }
}

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
          console.log(`Cleaned up old log file: ${file}`)
        }
      }
    }
  } catch (e) {
    console.error('Failed to cleanup old logs:', e)
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
