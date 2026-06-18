import { toolRegistry } from './registry'
import { WelcomeTool } from './examples/WelcomeTool'
import { CodeFormatter } from './text/CodeFormatter'
import { MarkdownPreview } from './text/MarkdownPreview'
import { RegexTool } from './text/RegexTool'
import { EncoderTool } from './encoding/EncoderTool'
import { DateTimeTool } from './datetime/DateTimeTool'
import { FileSearchTool } from './filesearch/FileSearchTool'
import { FileLauncherTool } from './filelauncher/FileLauncherTool'
import { WebOpenerTool } from './webopener/WebOpenerTool'
import { NetworkTool } from './network/NetworkTool'
import { SubnetConverterTool } from './network/SubnetConverterTool'
import { IPLookupTool } from './network/IPLookupTool'
import { HttpTestTool } from './network/HttpTestTool'
import { ProcessTool } from './system/ProcessTool'
import { PasswordTool } from './security/PasswordTool'
import { SettingsTool } from './settings/SettingsTool'
import {
  HomeOutlined,
  FileTextOutlined,
  SwapOutlined,
  ClockCircleOutlined,
  SearchOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  WifiOutlined,
  AppstoreOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  CalculatorOutlined,
  SendOutlined
} from '@ant-design/icons'

export const initializeTools = () => {
  toolRegistry.registerCategory({
    id: 'general',
    name: '通用工具',
    icon: <HomeOutlined />
  })

  toolRegistry.registerCategory({
    id: 'text',
    name: '文本处理',
    icon: <FileTextOutlined />
  })

  toolRegistry.registerCategory({
    id: 'encoding',
    name: '编码转换',
    icon: <SwapOutlined />
  })

  toolRegistry.registerCategory({
    id: 'datetime',
    name: '时间日期',
    icon: <ClockCircleOutlined />
  })

  toolRegistry.registerCategory({
    id: 'filesearch',
    name: '文件搜索',
    icon: <SearchOutlined />
  })

  toolRegistry.registerCategory({
    id: 'tools',
    name: '快捷工具',
    icon: <FolderOpenOutlined />
  })

  toolRegistry.registerCategory({
    id: 'network',
    name: '网络工具',
    icon: <WifiOutlined />
  })

  toolRegistry.registerCategory({
    id: 'system',
    name: '系统工具',
    icon: <AppstoreOutlined />
  })

  toolRegistry.registerCategory({
    id: 'security',
    name: '安全工具',
    icon: <SafetyCertificateOutlined />
  })

  toolRegistry.registerCategory({
    id: 'settings',
    name: '设置',
    icon: <SettingOutlined />
  })

  // General tools
  toolRegistry.registerTool({
    id: 'welcome',
    name: '欢迎',
    description: '欢迎页面',
    category: 'general',
    icon: <HomeOutlined />,
    component: WelcomeTool
  })

  // Text tools
  toolRegistry.registerTool({
    id: 'code-formatter',
    name: '代码格式化',
    description: 'JSON/XML 代码格式化与压缩工具',
    category: 'text',
    icon: <FileTextOutlined />,
    component: CodeFormatter
  })

  toolRegistry.registerTool({
    id: 'markdown-preview',
    name: 'Markdown 预览',
    description: 'Markdown 实时预览',
    category: 'text',
    icon: <FileTextOutlined />,
    component: MarkdownPreview
  })

  toolRegistry.registerTool({
    id: 'regex-tool',
    name: '正则表达式测试',
    description: '正则表达式测试工具，支持实时匹配高亮',
    category: 'text',
    icon: <SearchOutlined />,
    component: RegexTool
  })

  // Encoding tools
  toolRegistry.registerTool({
    id: 'encoder',
    name: '编码解码',
    description: 'Base64/URL/Hex/Unicode 编码解码工具',
    category: 'encoding',
    icon: <SwapOutlined />,
    component: EncoderTool
  })

  // Date time tools
  toolRegistry.registerTool({
    id: 'datetime',
    name: '时间日期转换',
    description: '时间戳与日期转换',
    category: 'datetime',
    icon: <ClockCircleOutlined />,
    component: DateTimeTool
  })

  // File search tools
  toolRegistry.registerTool({
    id: 'file-search',
    name: '文件搜索',
    description: '本地文件搜索工具',
    category: 'filesearch',
    icon: <SearchOutlined />,
    component: FileSearchTool
  })

  // Quick tools
  toolRegistry.registerTool({
    id: 'file-launcher',
    name: '文件快速启动',
    description: '快速访问常用文件和目录',
    category: 'tools',
    icon: <FolderOpenOutlined />,
    component: FileLauncherTool
  })

  toolRegistry.registerTool({
    id: 'web-opener',
    name: '网页快速打开',
    description: '快速访问常用网站',
    category: 'tools',
    icon: <GlobalOutlined />,
    component: WebOpenerTool
  })

  // Network tools
  toolRegistry.registerTool({
    id: 'network',
    name: '网络信息',
    description: '查看网络IP信息',
    category: 'network',
    icon: <WifiOutlined />,
    component: NetworkTool
  })

  toolRegistry.registerTool({
    id: 'ip-subnet-converter',
    name: 'IP子网计算',
    description: 'IP子网掩码范围转换工具，支持CIDR、范围格式',
    category: 'network',
    icon: <CalculatorOutlined />,
    component: SubnetConverterTool
  })

  toolRegistry.registerTool({
    id: 'ip-lookup',
    name: 'IP查找',
    description: '批量IP查找工具，支持多格式子网匹配、IPv4/IPv6',
    category: 'network',
    icon: <SearchOutlined />,
    component: IPLookupTool
  })

  toolRegistry.registerTool({
    id: 'http-test',
    name: 'HTTP测试',
    description: 'HTTP请求测试工具，支持GET/POST/PUT/DELETE等方法',
    category: 'network',
    icon: <SendOutlined />,
    component: HttpTestTool
  })

  // System tools
  toolRegistry.registerTool({
    id: 'process-tool',
    name: '进程查看',
    description: '查看系统进程、CPU、内存、GPU信息',
    category: 'system',
    icon: <AppstoreOutlined />,
    component: ProcessTool
  })

  // Security tools
  toolRegistry.registerTool({
    id: 'password-tool',
    name: '密码管理',
    description: '密码生成与存储管理工具',
    category: 'security',
    icon: <SafetyCertificateOutlined />,
    component: PasswordTool
  })

  // Settings tools
  toolRegistry.registerTool({
    id: 'settings',
    name: '设置',
    description: '应用程序设置',
    category: 'settings',
    icon: <SettingOutlined />,
    component: SettingsTool
  })
};
