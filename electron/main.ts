import { app, BrowserWindow, dialog, ipcMain, shell, globalShortcut, Menu, nativeImage, safeStorage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { promisify } from 'node:util'
import { execFile } from 'child_process'
import crypto from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'
import { initLogger, logger } from './logger'

const execFilePromise = promisify(execFile)
const rmdir = promisify(fs.rmdir)

// ============================================================================
// HTTP 请求函数（在主进程中发起请求，不受浏览器 CORS 限制）
// ============================================================================

/**
 * HTTP 请求选项类型定义
 * @property url - 请求的完整 URL
 * @property method - HTTP 请求方法
 * @property headers - 请求头对象
 * @property body - 请求体内容（可为字符串或表单数据）
 * @property timeoutMs - 超时时间，单位为毫秒
 * @property proxy - 代理配置对象，包含地址和认证信息
 */
interface HttpRequestOptions {
  url: string
  method: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  proxy?: {
    url: string
    auth?: { username: string; password: string }
  }
  useSystemProxy?: boolean  // 是否使用系统代理配置
}

/**
 * HTTP 响应结果类型定义
 * @property status - HTTP 状态码
 * @property statusText - 状态描述文本
 * @property headers - 响应头对象
 * @property body - 响应体内容
 * @property duration - 请求耗时，单位为毫秒
 */
interface HttpResponseResult {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  duration: number
}

// ============================================================================
// 系统代理配置获取函数
// ============================================================================

// 系统代理配置缓存 - 避免每次请求都调用 PowerShell
let cachedSystemProxy: { httpProxy?: string; httpsProxy?: string } | null = null
let systemProxyCached = false

/**
 * 获取 Windows 系统代理配置（带缓存和超时）
 * 通过 PowerShell 查询系统代理设置
 * @param forceRefresh - 是否强制刷新缓存
 * @returns 系统代理配置对象，包含 HTTP 和 HTTPS 代理地址
 */
async function getSystemProxyConfig(forceRefresh = false): Promise<{ httpProxy?: string; httpsProxy?: string } | null> {
  if (systemProxyCached && !forceRefresh) {
    return cachedSystemProxy
  }

  try {
    const psScript = `
      $ErrorActionPreference = 'Stop'
      try {
        $proxy = Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -ErrorAction SilentlyContinue
        $result = @{
          ProxyEnable = $proxy.ProxyEnable
          ProxyServer = $proxy.ProxyServer
        }
        $result | ConvertTo-Json -Compress
      } catch {
        @{ ProxyEnable = 0; ProxyServer = '' } | ConvertTo-Json -Compress
      }
    `

    const timeoutMs = 3000
    const psPromise = execFilePromise('powershell', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command', psScript
    ], { encoding: 'utf-8', timeout: timeoutMs })

    const { stdout } = await psPromise

    const result = JSON.parse(stdout.trim())

    if (result.ProxyEnable === 1 && result.ProxyServer) {
      const proxyServer = result.ProxyServer as string
      let httpProxy: string | undefined
      let httpsProxy: string | undefined

      const parts = proxyServer.split(';')
      for (const part of parts) {
        if (part.includes('=')) {
          const [protocol, address] = part.split('=')
          if (protocol.toLowerCase() === 'http') {
            httpProxy = `http://${address}`
          } else if (protocol.toLowerCase() === 'https') {
            httpsProxy = `http://${address}`
          }
        }
      }

      if (!httpProxy && !httpsProxy && proxyServer) {
        if (proxyServer.startsWith('http://') || proxyServer.startsWith('https://')) {
          httpProxy = proxyServer
          httpsProxy = proxyServer
        } else {
          httpProxy = `http://${proxyServer}`
          httpsProxy = `http://${proxyServer}`
        }
      }

      cachedSystemProxy = { httpProxy, httpsProxy }
      systemProxyCached = true
      logger.info(`[getSystemProxyConfig] 系统代理已启用: HTTP=${httpProxy}, HTTPS=${httpsProxy}`)
      return cachedSystemProxy
    }

    cachedSystemProxy = null
    systemProxyCached = true
    logger.info('[getSystemProxyConfig] 系统代理未启用')
    return null
  } catch (error) {
    logger.warn('[getSystemProxyConfig] 获取系统代理配置失败:', error instanceof Error ? error.message : String(error))
    if (!systemProxyCached) {
      cachedSystemProxy = null
      systemProxyCached = true
    }
    return cachedSystemProxy
  }
}

/**
 * 在主进程中发起 HTTP 请求
 * @param options - 请求配置选项
 * @returns Promise 包含响应数据或抛出错误
 */
async function sendHttpRequestInMain(
  options: HttpRequestOptions
): Promise<HttpResponseResult> {
  const startTime = Date.now()

  // 如果请求使用系统代理，先获取系统代理配置
  let effectiveProxy = options.proxy
  if (options.useSystemProxy && !options.proxy) {
    const systemProxy = await getSystemProxyConfig()
    if (systemProxy) {
      const targetUrl = new URL(options.url)
      const isHttps = targetUrl.protocol === 'https:'
      const proxyAddress = isHttps ? systemProxy.httpsProxy : systemProxy.httpProxy
      if (proxyAddress) {
        effectiveProxy = { url: proxyAddress }
        logger.info(`[sendHttpRequestInMain] 使用系统代理: ${proxyAddress}`)
      }
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const targetUrl = new URL(options.url)
      const isHttps = targetUrl.protocol === 'https:'

      // 如果配置了代理，则通过代理发起请求
      if (effectiveProxy && effectiveProxy.url) {
        const proxyUrl = new URL(effectiveProxy.url)
        
        // HTTPS 通过代理需要先建立 CONNECT 隧道
        if (isHttps) {
          connectProxyTunnel(proxyUrl, targetUrl, options, startTime, resolve, reject)
        } else {
          // HTTP 通过代理直接发送请求
          sendHttpViaProxy(proxyUrl, targetUrl, options, startTime, resolve, reject)
        }
      } else {
        // 直接连接目标服务器
        sendDirectRequest(targetUrl, options, startTime, resolve, reject)
      }
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * 通过 HTTP 代理直接发送 HTTP 请求（非 HTTPS）
 * @param proxyUrl - 代理服务器地址
 * @param targetUrl - 目标服务器地址
 * @param options - 请求配置
 * @param startTime - 请求开始时间
 * @param resolve - Promise 成功回调
 * @param reject - Promise 失败回调
 */
function sendHttpViaProxy(
  proxyUrl: URL,
  targetUrl: URL,
  options: HttpRequestOptions,
  startTime: number,
  resolve: (value: HttpResponseResult) => void,
  reject: (reason: any) => void
) {
  const requestOptions: http.RequestOptions = {
    method: options.method,
    hostname: proxyUrl.hostname,
    port: proxyUrl.port ? parseInt(proxyUrl.port) : 80,
    path: options.url,
    headers: {
      ...(options.headers || {}),
      Host: targetUrl.host,
    },
    timeout: options.timeoutMs || 30000,
  }

  // 代理 Basic 认证支持
  if (options.proxy?.auth) {
    const authToken = Buffer.from(
      `${options.proxy.auth.username}:${options.proxy.auth.password}`
    ).toString('base64')
    ;(requestOptions.headers as Record<string, string>)['Proxy-Authorization'] = `Basic ${authToken}`
  }

  const req = http.request(requestOptions, (res) => {
    handleResponse(res, startTime, resolve, reject)
  })

  setupRequest(req, options.body, reject)
}

/**
 * 通过 HTTP 代理建立 CONNECT 隧道，然后发送 HTTPS 请求
 * @param proxyUrl - 代理服务器地址
 * @param targetUrl - 目标服务器地址
 * @param options - 请求配置
 * @param startTime - 请求开始时间
 * @param resolve - Promise 成功回调
 * @param reject - Promise 失败回调
 */
function connectProxyTunnel(
  proxyUrl: URL,
  targetUrl: URL,
  options: HttpRequestOptions,
  startTime: number,
  resolve: (value: HttpResponseResult) => void,
  reject: (reason: any) => void
) {
  const proxyOptions: http.RequestOptions = {
    method: 'CONNECT',
    hostname: proxyUrl.hostname,
    port: proxyUrl.port ? parseInt(proxyUrl.port) : 80,
    path: `${targetUrl.hostname}:${targetUrl.port || 443}`,
    headers: {},
    timeout: options.timeoutMs || 30000,
  }

  // 代理 Basic 认证支持
  if (options.proxy?.auth) {
    const authToken = Buffer.from(
      `${options.proxy.auth.username}:${options.proxy.auth.password}`
    ).toString('base64')
    ;(proxyOptions.headers as Record<string, string>)['Proxy-Authorization'] = `Basic ${authToken}`
  }

  const tunnelReq = http.request(proxyOptions)

  tunnelReq.on('error', reject)

  tunnelReq.on('timeout', () => {
    tunnelReq.destroy(new Error('代理连接超时'))
  })

  tunnelReq.on('connect', (res, socket) => {
    if (res.statusCode !== 200) {
      socket.destroy()
      reject(new Error(`代理连接失败，状态码: ${res.statusCode}`))
      return
    }

    // 隧道建立成功，发送 HTTPS 请求
    const httpsOptions: https.RequestOptions = {
      hostname: targetUrl.hostname,
      port: targetUrl.port ? parseInt(targetUrl.port) : 443,
      path: targetUrl.pathname + targetUrl.search,
      method: options.method,
      headers: options.headers || {},
      agent: new https.Agent({ socket }),
    }

    const req = https.request(httpsOptions, (httpsRes) => {
      handleResponse(httpsRes, startTime, resolve, reject)
    })

    setupRequest(req, options.body, reject)
  })

  tunnelReq.end()
}

/**
 * 直接连接目标服务器发送请求（不经过代理）
 * @param targetUrl - 目标服务器地址
 * @param options - 请求配置
 * @param startTime - 请求开始时间
 * @param resolve - Promise 成功回调
 * @param reject - Promise 失败回调
 */
function sendDirectRequest(
  targetUrl: URL,
  options: HttpRequestOptions,
  startTime: number,
  resolve: (value: HttpResponseResult) => void,
  reject: (reason: any) => void
) {
  const isHttps = targetUrl.protocol === 'https:'
  const client = isHttps ? https : http

  const requestOptions: http.RequestOptions | https.RequestOptions = {
    method: options.method,
    hostname: targetUrl.hostname,
    port: targetUrl.port ? parseInt(targetUrl.port) : (isHttps ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    headers: options.headers || {},
    timeout: options.timeoutMs || 30000,
  }

  const req = client.request(requestOptions, (res) => {
    handleResponse(res, startTime, resolve, reject)
  })

  setupRequest(req, options.body, reject)
}

/**
 * 处理 HTTP 响应：收集响应数据、解析响应头
 * @param res - Node.js HTTP 响应对象
 * @param startTime - 请求开始时间戳（用于计算耗时）
 * @param resolve - Promise 成功回调
 * @param reject - Promise 失败回调
 */
function handleResponse(
  res: http.IncomingMessage,
  startTime: number,
  resolve: (value: HttpResponseResult) => void,
  reject: (reason: any) => void
) {
  const chunks: Buffer[] = []

  // 收集响应数据
  res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))

  // 响应接收完成时，拼接数据、尝试 JSON 格式化、组装响应结果
  res.on('end', () => {
    const bodyBuffer = Buffer.concat(chunks)
    let bodyText = bodyBuffer.toString('utf8')

    // 尝试将 JSON 响应格式化，提升可读性
    try {
      const contentType = res.headers['content-type'] || ''
      if (contentType.includes('application/json') || bodyText.trim().startsWith('{') || bodyText.trim().startsWith('[')) {
        const parsed = JSON.parse(bodyText)
        bodyText = JSON.stringify(parsed, null, 2)
      }
    } catch {
      // 非 JSON 内容，保留原始文本
    }

    // 将响应头数组转为对象
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(res.headers)) {
      if (Array.isArray(value)) {
        headers[key] = value.join(', ')
      } else if (value !== undefined) {
        headers[key] = value
      }
    }

    // 组装并返回最终响应
    resolve({
      status: res.statusCode || 0,
      statusText: res.statusMessage || '',
      headers,
      body: bodyText,
      duration: Date.now() - startTime,
    })
  })

  res.on('error', reject)
}

/**
 * 配置 HTTP 请求：超时、错误处理、写入请求体
 * @param req - Node.js 请求对象
 * @param body - 请求体内容（可为字符串）
 * @param reject - Promise 失败回调
 */
function setupRequest(
  req: http.ClientRequest,
  body: string | undefined,
  reject: (reason: any) => void
) {
  req.on('timeout', () => {
    req.destroy(new Error('请求超时'))
  })

  req.on('error', reject)

  // 写入请求体并结束请求
  if (body) {
    req.write(body)
  }
  req.end()
}

// ============================================================================
// 安全辅助函数
// ============================================================================

/**
 * 验证URL是否只使用安全协议
 * @param url - 要验证的URL字符串
 * @returns 如果URL使用安全协议返回true，否则返回false
 */
const isSafeUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') return false
  try {
    const u = new URL(url)
    // 允许常见的安全协议；阻止脚本/资源URI协议
    const safe = ['http:', 'https:', 'ftp:', 'mailto:', 'tel:', 'telnet:']
    return safe.includes(u.protocol)
  } catch {
    return false
  }
}

/**
 * 验证PID是否为有效的正整数（防止命令注入）
 * @param pid - 进程ID
 * @returns 如果是有效PID返回true，否则返回false
 */
const isValidPid = (pid: number): boolean => {
  return Number.isInteger(pid) && pid > 0 && pid <= 999999
}

/**
 * 验证文件路径是否不包含命令注入字符
 * Windows有效文件名字符：字母、数字、空格、._-,()&%$@!+=[]{};,#~`等
 * Windows无效文件名字符：< > : " / \ | ? *（以及控制字符0x00-0x1F）
 * 我们阻止控制字符和真正危险的模式；为了向后兼容，允许合法的Windows路径字符如&和%
 * @param filePath - 文件路径
 * @returns 如果路径安全返回true，否则返回false
 */
const isSafeFilePath = (filePath: string): boolean => {
  if (!filePath || typeof filePath !== 'string') return false
  if (filePath.length > 512) return false
  // 阻止控制字符（0x00-0x1F，包括null、tab、换行）
  if (/[\x00-\x1F]/.test(filePath)) return false
  // 阻止管道/重定向字符，它们永远不是有效文件路径的一部分
  if (/[|<>]/.test(filePath)) return false
  return true
}

/**
 * 验证全局快捷键加速器字符串
 * @param accelerator - 加速器字符串
 * @returns 如果格式有效返回true，否则返回false
 */
const isValidAccelerator = (accelerator: string): boolean => {
  if (!accelerator || typeof accelerator !== 'string') return false
  if (accelerator.length > 64) return false
  // 只允许字母数字+修饰键符号（+空格F键等）
  return /^[A-Za-z0-9+\-]+(?:\s*\+\s*[A-Za-z0-9]+)*$/.test(accelerator)
}

/**
 * 使用Electron的safeStorage加密敏感数据（密码）
 * 如果safeStorage不可用（例如某些操作系统上应用登录前），回退到base64编码
 * @param data - 要加密的敏感数据
 * @returns 加密后的字符串
 */
const encryptSensitiveData = (data: string): string => {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(data).toString('base64')
    }
  } catch (e) {
    logger.warn('encryptSensitiveData: safeStorage不可用，使用回退方案')
  }
  // 回退方案：弱混淆（不是加密）- 记录警告
  return '__b64__' + Buffer.from(data, 'utf-8').toString('base64')
}

/**
 * 解密敏感数据
 * 如果数据看起来不像base64编码，原样返回（与旧版明文配置向后兼容）
 * safeStorage加密的数据看起来像一个长base64字符串；base64回退方案以'__b64__'开头
 * @param data - 要解密的数据
 * @returns 解密后的明文
 */
const decryptSensitiveData = (data: string): string => {
  if (!data) return ''
  // 如果数据不以'__b64__'开头，检查是否可能是明文
  // 如果不匹配base64模式，假设是旧版明文数据
  if (!data.startsWith('__b64__')) {
    const looksLikeBase64 = /^[A-Za-z0-9+/=]{20,}$/.test(data)
    if (!looksLikeBase64) {
      return data  // 旧配置中的明文 - 原样返回
    }
  }
  try {
    if (data.startsWith('__b64__')) {
      return Buffer.from(data.slice(7), 'base64').toString('utf-8')
    }
    if (safeStorage.isEncryptionAvailable()) {
      const buffer = Buffer.from(data, 'base64')
      const decrypted = safeStorage.decryptString(buffer)
      return decrypted
    }
  } catch (e) {
    logger.warn('decryptSensitiveData: 解密失败，返回原始数据:', e instanceof Error ? e.message : String(e))
    // 继续执行 - 返回原始数据不变（可能是旧配置的明文）
  }
  // 最后手段：返回原始数据不变
  // 处理：safeStorage不可用但数据看起来像base64，或加密错误
  return data
}

/**
 * 加密密码数据结构中的密码字段
 * 如果数据已经有__encrypted__标记，原样返回（防止重复加密）
 * @param data - 密码数据对象
 * @returns 加密后的密码数据
 */
const encryptPasswordData = (data: any): any => {
  if (!data) return data
  // 不对已加密的条目重新加密
  if (data.__encrypted__) return data
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

/**
 * 解密密码数据结构中的密码字段
 * 没有__encrypted__标记表示这是明文（旧格式或从未加密）
 * 原样返回以保持向后兼容
 * @param data - 加密的密码数据对象
 * @returns 解密后的密码数据
 */
const decryptPasswordData = (data: any): any => {
  if (!data) return data
  // 没有__encrypted__标记表示这是明文（旧格式或从未加密）
  // 原样返回以保持向后兼容
  if (!data.__encrypted__) return data
  const result: any = { ...data }
  if (typeof result.password === 'string') {
    result.password = decryptSensitiveData(result.password)
  }
  delete result.__encrypted__
  return result
}

/**
 * 解密passwords.json数据结构中的密码字段
 * 支持旧格式{ passwords: [...] }和新格式{ items: [...] }
 * 明文条目（没有__encrypted__标记）原样通过，因此现有配置完全向后兼容
 * @param data - passwords.json配置数据
 * @returns 解密后的配置数据
 */
const decryptPasswordFieldsInConfig = (data: any): any => {
  if (!data) return data
  const result: any = { ...data }

  // 新格式：data.items[].password
  if (Array.isArray(result.items)) {
    result.items = result.items.map((item: any) => {
      if (item && typeof item.password === 'string') {
        return decryptPasswordData(item)
      }
      return item
    })
  }

  // 旧格式：data.passwords[].password
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

/**
 * 加密passwords.json数据结构中的密码字段
 * 支持旧格式{ passwords: [...] }和新格式{ items: [...] }
 * @param data - passwords.json配置数据
 * @returns 加密后的配置数据
 */
const encryptPasswordFieldsInConfig = (data: any): any => {
  if (!data) return data
  const result: any = { ...data }

  // 新格式：data.items[].password
  if (Array.isArray(result.items)) {
    result.items = result.items.map((item: any) => {
      if (item && typeof item.password === 'string' && item.password.length > 0) {
        return encryptPasswordData(item)
      }
      return item
    })
  }

  // 旧格式：data.passwords[].password
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

/**
 * 将字节数格式化为可读的内存大小字符串
 * @param bytes - 字节数
 * @returns 格式化的大小字符串（如 "1.5 MB）
 */
const formatMemory = (bytes: number): string => {
  if (bytes === 0 || isNaN(bytes)) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Node.js 文件系统 Promise 封装
const readdir = promisify(fs.readdir)
const stat = promisify(fs.stat)
const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)
const copyFile = promisify(fs.copyFile)
const unlink = promisify(fs.unlink)
const mkdir = promisify(fs.mkdir)

// 是否为开发模式标志
const isDev = !!process.env.VITE_DEV_SERVER_URL
const isPackaged = !isDev
console.log('[DEBUG] isDev:', isDev)
console.log('[DEBUG] isPackaged:', isPackaged)

// Vite 构建产物目录
const DIST = path.join(__dirname, '../dist')
const PUBLIC = path.join(DIST, '../public')
process.env.DIST = DIST
process.env.PUBLIC = PUBLIC

let win: BrowserWindow | null
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

// 配置路径变量
let CONFIG_PATH: string
let APP_DIR: string

/**
 * 默认应用配置
 */
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
  logLevel: 'INFO',  // 日志等级
  closeToMinimize: false  // 关闭按钮行为：false=退出程序，true=最小化到托盘
}

// 应用配置对象 - 初始化为默认值，避免异步加载前访问报错
let appConfig: any = { ...DEFAULT_APP_CONFIG }

// 退出标志位 - 防止 close 事件与 app.quit() 递归触发
let isQuitting = false

// 备份定时器
let backupTimer: NodeJS.Timeout | null = null

/**
 * 确保配置目录存在，如果不存在则创建
 */
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

/**
 * 加载配置文件
 * 对于passwords.json，自动解密密码字段
 * 支持旧格式{ passwords: [] }和新格式{ items: [] }
 * 明文条目（没有__encrypted__标记）原样返回以保持向后兼容
 * @param fileName - 配置文件名
 * @returns 配置数据，如果加载失败返回null
 */
async function loadConfig(fileName: string) {
  try {
    await ensureConfigDir()
    const filePath = path.join(CONFIG_PATH, fileName)
    const content = await readFile(filePath, 'utf-8')
    const data = JSON.parse(content)
    // 对passwords.json解密密码字段
    // 支持旧格式{ passwords: [] }和新格式{ items: [] }
    // 明文条目（没有__encrypted__标记）原样返回以保持向后兼容
    if (fileName === 'passwords.json' && data) {
      const decrypted = decryptPasswordFieldsInConfig(data)
      return decrypted
    }
    return data
  } catch (error) {
    logger.error(`loadConfig: 加载 ${fileName} 失败:`, error instanceof Error ? error.message : String(error))
    return null
  }
}

/**
 * 创建配置文件的备份（带有时间戳）
 * @param fileName - 要备份的配置文件名
 */
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
    console.error(`createBackup: 创建 ${fileName} 备份失败:`, error)
  }
}

/**
 * 清理旧的备份文件，只保留最近 N 个
 * @param fileName - 要清理备份的配置文件名
 */
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
          console.error(`cleanupOldBackups: 删除备份 ${file.name} 失败:`, deleteError)
        }
      }
    }
  } catch (error) {
    console.error(`cleanupOldBackups: 清理 ${fileName} 备份失败:`, error)
  }
}

/**
 * 递归复制目录内容（支持排除子目录）
 * @param source - 源目录路径
 * @param destination - 目标目录路径
 * @param excludeDirs - 要排除的子目录名数组
 * @returns 复制成功返回true，失败返回false
 */
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
    console.error(`copyDirectory: 从 ${source} 复制到 ${destination} 失败:`, error)
    return false
  }
}

/**
 * 递归删除目录及其内容
 * @param dir - 要删除的目录路径
 * @returns 删除成功返回true，失败返回false
 */
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
    logger.error(`removeDirectory: 删除目录 ${dir} 失败:`, error)
    return false
  }
}

/**
 * 获取备份目录路径
 * @returns 备份目录路径
 */
function getBackupDir() {
  if (appConfig?.backupDir) {
    return appConfig.backupDir
  }
  return path.join(CONFIG_PATH, 'backups')
}

/**
 * 确保备份目录存在，如果不存在则创建
 * @returns 备份目录路径
 */
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

/**
 * 递归计算目录的总大小（字节数）
 * @param dir - 要计算的目录路径
 * @returns 目录总大小（字节数）
 */
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

/**
 * 创建完整备份（复制整个配置目录到备份目录）
 * @param note - 备份备注信息
 * @returns 备份信息对象（id、时间戳、大小等）
 */
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

/**
 * 将备份间隔时间转换为毫秒数
 * @param interval - 间隔数值
 * @param unit - 时间单位（minutes/hours/days）
 * @returns 毫秒数
 */
function calculateIntervalMs(interval: number, unit: string): number {
  const ms = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000
  }
  return interval * (ms[unit as keyof typeof ms] || ms.hours)
}

/**
 * 检查是否应该立即执行备份（首次启动或达到间隔时间）
 * @returns 是否需要备份
 */
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

/**
 * 启动定时备份调度器
 */
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

/**
 * 停止定时备份调度器
 */
function stopBackupScheduler(): void {
  if (backupTimer) {
    logger.info('stopBackupScheduler: 停止备份定时器')
    clearInterval(backupTimer)
    backupTimer = null
  }
}

/**
 * 获取所有备份列表
 * @returns 备份信息对象数组（按时间倒序）
 */
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

/**
 * 删除指定的备份
 * @param backupId - 备份ID（即备份目录名）
 * @returns 删除成功返回true
 */
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

/**
 * 从指定备份恢复配置
 * @param backupId - 备份ID
 * @returns 恢复成功返回true
 */
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

/**
 * 从外部目录导入备份配置
 * @param backupPath - 外部备份目录路径
 * @returns 导入成功返回true
 */
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

/**
 * 保存配置文件
 * 对于passwords.json，保存前自动加密密码字段
 * 支持旧格式{ passwords: [] }和新格式{ items: [] }
 * 明文密码会被加密；已加密的条目（带有__encrypted__标记）会跳过
 * @param fileName - 配置文件名
 * @param data - 要保存的配置数据
 * @returns 如果保存成功返回true，否则返回false
 */
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
    
    // 保存前对passwords.json加密密码字段
    // 支持旧格式{ passwords: [] }和新格式{ items: [] }
    // 明文密码会被加密；已加密的条目（带有__encrypted__标记）会跳过
    let dataToSave = data
    if (fileName === 'passwords.json' && data) {
      dataToSave = encryptPasswordFieldsInConfig(data)
    }
    
    const filePath = path.join(CONFIG_PATH, fileName)
    const jsonContent = JSON.stringify(dataToSave, null, 2)
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

/**
 * 加载应用配置（app-config.json）
 * @returns 应用配置对象（加载失败时返回默认配置）
 */
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

/**
 * 通知渲染进程配置已更改
 */
function notifyConfigChanged() {
  if (win) {
    logger.debug('notifyConfigChanged: 发送配置更改通知')
    win.webContents.send('config-changed')
  } else {
    logger.debug('notifyConfigChanged: 窗口不存在，无法发送通知')
  }
}

/**
 * 保存应用配置（处理配置目录迁移、备份调度器重启、日志等级更新等）
 * @param config - 新的应用配置对象
 * @returns 保存成功返回true
 */
async function saveAppConfig(config: any) {
  const oldBackupEnabled = appConfig?.backupEnabled
  const oldBackupInterval = appConfig?.backupInterval
  const oldBackupIntervalUnit = appConfig?.backupIntervalUnit
  const oldConfigPath = CONFIG_PATH
  const oldBackupDir = getBackupDir()
  
  logger.info(`saveAppConfig: 开始处理, CONFIG_PATH=${CONFIG_PATH}, closeToMinimize=${config?.closeToMinimize}`)
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

/**
 * 注册全局快捷键（工具快捷键和窗口显示/隐藏快捷键）
 * @param shortcuts - 工具ID到快捷键的映射对象
 */
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
        logger.warn(`registerShortcuts: 注册 ${toolId} 快捷键失败:`, error instanceof Error ? error.message : String(error))
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
      logger.warn('registerShortcuts: 注册窗口快捷键失败:', error instanceof Error ? error.message : String(error))
    }
  }
}

/**
 * 创建主窗口（设置应用目录、配置目录、初始化日志、迁移旧配置、加载应用配置、创建窗口）
 */
async function createWindow() {
  // 获取应用程序安装目录（打包后）或项目根目录（开发模式）
  if (isPackaged) {
    APP_DIR = path.dirname(app.getPath('exe'))
  } else {
    APP_DIR = path.dirname(__dirname)
  }
  
  // 配置文件存储在安装目录下的 config/ 子目录
  CONFIG_PATH = path.join(APP_DIR, 'config')
  const logDir = path.join(APP_DIR, 'logs')
  initLogger(logDir, 7)
  logger.info(`[MAIN] 应用安装目录: ${APP_DIR}`)
  logger.info(`[MAIN] 配置目录: ${CONFIG_PATH}`)
  
  await ensureConfigDir()
  
  // 优化启动速度：先创建窗口显示界面，然后再加载配置
  // 这样用户可以更快看到应用窗口，而不是等待所有初始化完成
  
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

  // 窗口关闭事件处理 - 根据设置决定是退出还是最小化
  win.on('close', async (event) => {
    if (isQuitting) {
      // 已经确认退出，不拦截
      return
    }
    if (appConfig?.closeToMinimize) {
      // 设置为最小化到托盘时，弹出确认对话框
      event.preventDefault()
      const choice = await dialog.showMessageBox(win!, {
        type: 'question',
        buttons: ['最小化到托盘', '退出程序', '取消'],
        defaultId: 0,
        cancelId: 2,
        title: '关闭窗口',
        message: '点击关闭按钮将最小化到托盘而不是退出程序',
        detail: '选择"最小化到托盘"将隐藏窗口到系统托盘；选择"退出程序"将完全关闭应用；选择"取消"将保持窗口打开。'
      })

      if (choice.response === 0) {
        // 最小化到托盘
        if (win) {
          win.hide()
        }
        logger.info('[MAIN] 窗口已最小化到托盘（用户确认）')
      } else if (choice.response === 1) {
        // 退出程序
        logger.info('[MAIN] 用户选择退出程序')
        isQuitting = true
        app.quit()
      } else {
        // 取消，保持窗口打开
        logger.info('[MAIN] 用户取消关闭')
      }
    }
  })

  // 仅在开发模式下打开开发者工具，生产构建中永远不打开
  if (!app.isPackaged && VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(DIST, 'index.html'))
  }

  // 优化启动速度：在窗口创建并开始加载页面后，后台执行配置加载
  // 这样用户可以更快看到应用窗口
  loadAppConfig().then(() => {
    // 检查旧配置目录（用户数据目录），如有配置则迁移到新目录
    const oldConfigPath = path.join(app.getPath('userData'), 'config')
    if (fs.existsSync(oldConfigPath) && fs.readdirSync(oldConfigPath).length > 0) {
      try {
        logger.info(`[MAIN] 检测到旧配置目录: ${oldConfigPath}，开始迁移`)
        if (!fs.existsSync(CONFIG_PATH)) {
          fs.mkdirSync(CONFIG_PATH, { recursive: true })
        }
        copyDirectory(oldConfigPath, CONFIG_PATH).then(() => {
          logger.info(`[MAIN] 旧配置迁移成功`)
        }).catch((e) => {
          logger.warn(`[MAIN] 旧配置迁移失败:`, e instanceof Error ? e.message : String(e))
        })
      } catch (e) {
        logger.warn(`[MAIN] 旧配置迁移失败:`, e instanceof Error ? e.message : String(e))
      }
    }
    
    // 检查 safeStorage 是否可用（用于密码加密）
    try {
      if (safeStorage.isEncryptionAvailable()) {
        logger.info('[MAIN] safeStorage 加密可用，密码将使用系统密钥链加密存储')
      } else {
        logger.warn('[MAIN] safeStorage 加密不可用，密码将使用 base64 编码存储')
      }
    } catch (e) {
      logger.warn('[MAIN] 检查 safeStorage 失败:', e instanceof Error ? e.message : String(e))
    }
    
    // 后台执行备份检查
    shouldBackupNow()
    
    logger.info('[MAIN] 后台初始化完成')
  }).catch((err) => {
    logger.error('[MAIN] 加载配置失败:', err instanceof Error ? err.message : String(err))
  })
  
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '设置',
          click: () => {
            win?.webContents.send('navigate-to', 'settings')
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'Ctrl+Q',
          click: () => {
            app.quit()
          }
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { type: 'separator' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '缩放', role: 'zoom' },
        { type: 'separator' },
        { label: '前置', role: 'front' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox({
              title: '关于工具箱',
              message: `工具箱 v${app.getVersion()}\n\n一个纯离线的通用工具集合，无需网络即可使用\n\n技术栈：\n- Electron ${process.versions.electron}\n- React 19.2.7\n- TypeScript 5.9.3\n- Ant Design 6.4.4\n- Vite 8.0.16\n\n代码仓库：\nhttps://gitee.com/hongchenshijie/tools`
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
  
  ipcMain.handle('http-request', async (_event, options: HttpRequestOptions) => {
    logger.info(`http-request: 发起 ${options.method} ${options.url}`)
    try {
      const result = await sendHttpRequestInMain(options)
      logger.info(`http-request: 请求成功，状态码 ${result.status}，耗时 ${result.duration}ms`)
      return result
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error(`http-request: 请求失败: ${errorMsg}`)
      throw err
    }
  })

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
    // 安全：验证路径不包含命令注入字符
    if (!isSafeFilePath(filePath)) {
      logger.warn('open-file: 拒绝不安全的路径:', JSON.stringify(filePath.substring(0, 100)))
      return
    }
    try {
      await (shell.openPath as any)(filePath)
    } catch (e) {
      logger.error('open-file: 打开失败:', e instanceof Error ? e.message : String(e))
    }
  })
  
  ipcMain.handle('open-url', async (_, url: string) => {
    if (!url) return
    // 安全：仅允许 http/https 等安全协议，防止 shell/protocol 滥用
    if (!isSafeUrl(url)) {
      logger.warn('open-url: 拒绝不安全的 URL:', JSON.stringify(url.substring(0, 100)))
      return
    }
    try {
      await shell.openExternal(url)
    } catch (e) {
      logger.error('open-url: 打开失败:', e instanceof Error ? e.message : String(e))
    }
  })
  
  ipcMain.handle('load-config', async (_, fileName: string) => {
    // loadConfig()自动处理passwords.json的密码解密
    return await loadConfig(fileName)
  })

  ipcMain.handle('save-config', async (_, fileName: string, data: any) => {
    // saveConfig()自动处理passwords.json的密码加密
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
    logger.debug('save-app-config: closeToMinimize:', config?.closeToMinimize)
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
        // 安全：验证PID是有效的正整数（注入防护）
        if (!isValidPid(pid)) {
          logger.warn('kill-processes: 拒绝无效的PID:', pid)
          errors.push(pid)
          continue
        }
        // 使用execFile和分离的参数，不使用shell字符串插值
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
        logger.warn('kill-process: 拒绝无效的PID:', pid)
        return { success: false, error: '无效的进程ID' }
      }
      // 使用execFile和分离的参数，不使用shell字符串插值
      await execFilePromise('taskkill', ['/F', '/PID', String(pid)])
      return { success: true }
    } catch (error) {
      logger.error('kill-process: 终止进程失败:', error instanceof Error ? error.message : String(error))
      return { success: false, error: '无法终止该进程' }
    }
  })
  
  ipcMain.handle('search-file-handle', async (_, filePath: string) => {
    try {
      if (!isSafeFilePath(filePath)) {
        logger.warn('search-file-handle: 拒绝不安全的路径')
        return []
      }
      // 仅提取文件名（不包含路径组件）
      const fileName = path.basename(filePath).replace(/\.[^/.]+$/, '')
      if (!fileName || fileName.length > 100) {
        return []
      }
      // 安全：通过单独的进程参数传递搜索词，而不是
      // 在shell/PowerShell中进行字符串插值 - 这样不可能进行注入
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
    // 安全：使用crypto.randomInt（均匀分布）而不是
    // randomBytes[i] % chars.length，后者会产生模运算偏差，
    // 稍微偏向字符池中前面的字符。
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
      // loadConfig()已经对passwords.json解密密码字段
      // 对没有__encrypted__标记的条目调用decryptPasswordData是安全的无操作
      if (Array.isArray(result.passwords)) {
        result.passwords = result.passwords.map((p: any) => decryptPasswordData(p))
      }
      if (Array.isArray(result.items)) {
        result.items = result.items.map((p: any) => decryptPasswordData(p))
      }
      return result
    } catch (error) {
      logger.error('get-passwords: 获取密码失败:', error instanceof Error ? error.message : String(error))
      return { groups: [], passwords: [] }
    }
  })
  
  ipcMain.handle('save-password', async (_, passwordData: any) => {
    try {
      // loadConfig()自动解密passwords.json，所以我们可以安全地修改条目
      const existingData = await loadConfig('passwords.json') || { groups: [], passwords: [] }
      const now = new Date().toISOString()
      if (passwordData.id) {
        const index = existingData.passwords.findIndex((p: any) => p.id === passwordData.id)
        if (index !== -1) {
          existingData.passwords[index] = {
            ...existingData.passwords[index],
            ...passwordData,
            updatedAt: now
          }
        }
      } else {
        existingData.passwords.push({
          ...passwordData,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now
        })
      }
      // saveConfig()保存前自动加密passwords.json
      await saveConfig('passwords.json', existingData)
      return true
    } catch (error) {
      logger.error('save-password: 保存密码失败:', error instanceof Error ? error.message : String(error))
      return false
    }
  })
  
  ipcMain.handle('delete-password', async (_, id: string) => {
    try {
      // loadConfig()自动解密；saveConfig()保存前会重新加密
      const existingData = await loadConfig('passwords.json') || { groups: [], passwords: [] }
      existingData.passwords = existingData.passwords.filter((p: any) => p.id !== id)
      if (Array.isArray(existingData.items)) {
        existingData.items = existingData.items.filter((p: any) => p.id !== id)
      }
      await saveConfig('passwords.json', existingData)
      return true
    } catch (error) {
      logger.error('delete-password: 删除密码失败:', error instanceof Error ? error.message : String(error))
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
        // 安全修复：不是通过字符串插值将用户路径嵌入PowerShell脚本（这可能允许脚本注入），
        // 而是在Node.js中将路径编码为Base64，并作为单独的参数传递，
        // 因此PowerShell脚本只通过$args[0]接收一个固定的Base64字符串
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

/**
 * 递归搜索目录中匹配指定模式的文件
 * @param directory - 要搜索的目录路径
 * @param pattern - 文件名匹配模式（不区分大小写的子字符串匹配）
 * @param depth - 当前递归深度（用于防止无限递归，最大深度10层）
 * @returns 匹配的文件路径数组
 */
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

// ============================================
// 防止应用重复启动 - 如果应用已启动，则聚焦到已有窗口
// ============================================
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // 已有实例在运行，直接退出
  logger.info('[MAIN] 检测到已有应用实例在运行，当前进程退出')
  app.quit()
} else {
  // 新实例接收已运行实例的激活请求
  app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
    logger.info('[MAIN] 收到第二个实例激活请求，聚焦到已有窗口')
    if (win) {
      // 如果窗口被最小化或隐藏，恢复显示
      if (win.isMinimized()) {
        win.restore()
      }
      // 显示并聚焦窗口
      win.show()
      win.focus()
    }
  })
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
