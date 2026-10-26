import { lazy } from 'react';
import { toolRegistry } from './registry'
import { WelcomeTool } from './examples/WelcomeTool'
import {
  House,
  FileText,
  ArrowLeftRight,
  Clock,
  Search,
  FolderOpen,
  Globe,
  Wifi,
  LayoutGrid,
  ShieldCheck,
  Settings,
  Calculator,
  Send,
  HardDrive
} from 'lucide-react'

const lazyNamed = <T extends { [key: string]: React.ComponentType<any> }, K extends keyof T>(
  importFn: () => Promise<T>,
  name: K
) => lazy(() => importFn().then(m => ({ default: m[name] } as { default: React.ComponentType<any> })));

const CodeFormatter = lazyNamed(() => import('./text/CodeFormatter'), 'CodeFormatter');
const MarkdownPreview = lazyNamed(() => import('./text/MarkdownPreview'), 'MarkdownPreview');
const RegexTool = lazyNamed(() => import('./text/RegexTool'), 'RegexTool');
const EncoderTool = lazyNamed(() => import('./encoding/EncoderTool'), 'EncoderTool');
const DateTimeTool = lazyNamed(() => import('./datetime/DateTimeTool'), 'DateTimeTool');
const FileSearchTool = lazyNamed(() => import('./filesearch/FileSearchTool'), 'FileSearchTool');
const FileLauncherTool = lazyNamed(() => import('./filelauncher/FileLauncherTool'), 'FileLauncherTool');
const WebOpenerTool = lazyNamed(() => import('./webopener/WebOpenerTool'), 'WebOpenerTool');
const NetworkTool = lazyNamed(() => import('./network/NetworkTool'), 'NetworkTool');
const SubnetConverterTool = lazyNamed(() => import('./network/SubnetConverterTool'), 'SubnetConverterTool');
const IPLookupTool = lazyNamed(() => import('./network/IPLookupTool'), 'IPLookupTool');
const HttpTestTool = lazyNamed(() => import('./network/HttpTestTool'), 'HttpTestTool');
const ProcessTool = lazyNamed(() => import('./system/ProcessTool'), 'ProcessTool');
const RaidCalculator = lazyNamed(() => import('./system/RaidCalculator'), 'RaidCalculator');
const PasswordTool = lazyNamed(() => import('./security/PasswordTool'), 'PasswordTool');
const SettingsTool = lazyNamed(() => import('./settings/SettingsTool'), 'SettingsTool');

export const initializeTools = () => {
  toolRegistry.registerCategory({
    id: 'general',
    name: '通用工具',
    icon: <House size={15} />
  })

  toolRegistry.registerCategory({
    id: 'text',
    name: '文本处理',
    icon: <FileText size={15} />
  })

  toolRegistry.registerCategory({
    id: 'encoding',
    name: '编码转换',
    icon: <ArrowLeftRight size={15} />
  })

  toolRegistry.registerCategory({
    id: 'datetime',
    name: '时间日期',
    icon: <Clock size={15} />
  })

  toolRegistry.registerCategory({
    id: 'filesearch',
    name: '文件搜索',
    icon: <Search size={15} />
  })

  toolRegistry.registerCategory({
    id: 'tools',
    name: '快捷工具',
    icon: <FolderOpen size={15} />
  })

  toolRegistry.registerCategory({
    id: 'network',
    name: '网络工具',
    icon: <Wifi size={15} />
  })

  toolRegistry.registerCategory({
    id: 'system',
    name: '系统工具',
    icon: <LayoutGrid size={15} />
  })

  toolRegistry.registerCategory({
    id: 'security',
    name: '安全工具',
    icon: <ShieldCheck size={15} />
  })

  toolRegistry.registerCategory({
    id: 'settings',
    name: '设置',
    icon: <Settings size={15} />
  })

  toolRegistry.registerTool({
    id: 'welcome',
    name: '欢迎',
    description: '欢迎页面',
    category: 'general',
    icon: <House size={15} />,
    component: WelcomeTool
  })

  toolRegistry.registerTool({
    id: 'code-formatter',
    name: '代码格式化',
    description: 'JSON/XML 代码格式化与压缩工具',
    category: 'text',
    icon: <FileText size={15} />,
    component: CodeFormatter
  })

  toolRegistry.registerTool({
    id: 'markdown-preview',
    name: 'Markdown 预览',
    description: 'Markdown 实时预览',
    category: 'text',
    icon: <FileText size={15} />,
    component: MarkdownPreview
  })

  toolRegistry.registerTool({
    id: 'regex-tool',
    name: '正则表达式测试',
    description: '正则表达式测试工具，支持实时匹配高亮',
    category: 'text',
    icon: <Search size={15} />,
    component: RegexTool
  })

  toolRegistry.registerTool({
    id: 'encoder',
    name: '编码解码',
    description: 'Base64/URL/Hex/Unicode 编码解码工具',
    category: 'encoding',
    icon: <ArrowLeftRight size={15} />,
    component: EncoderTool
  })

  toolRegistry.registerTool({
    id: 'datetime',
    name: '时间日期转换',
    description: '时间戳与日期转换',
    category: 'datetime',
    icon: <Clock size={15} />,
    component: DateTimeTool
  })

  toolRegistry.registerTool({
    id: 'file-search',
    name: '文件搜索',
    description: '本地文件搜索工具',
    category: 'filesearch',
    icon: <Search size={15} />,
    component: FileSearchTool
  })

  toolRegistry.registerTool({
    id: 'file-launcher',
    name: '文件快速启动',
    description: '快速访问常用文件和目录',
    category: 'tools',
    icon: <FolderOpen size={15} />,
    component: FileLauncherTool
  })

  toolRegistry.registerTool({
    id: 'web-opener',
    name: '网页快速打开',
    description: '快速访问常用网站',
    category: 'tools',
    icon: <Globe size={15} />,
    component: WebOpenerTool
  })

  toolRegistry.registerTool({
    id: 'network',
    name: '网络信息',
    description: '查看网络IP信息',
    category: 'network',
    icon: <Wifi size={15} />,
    component: NetworkTool
  })

  toolRegistry.registerTool({
    id: 'ip-subnet-converter',
    name: 'IP子网计算',
    description: 'IP子网掩码范围转换工具，支持CIDR、范围格式',
    category: 'network',
    icon: <Calculator size={15} />,
    component: SubnetConverterTool
  })

  toolRegistry.registerTool({
    id: 'ip-lookup',
    name: 'IP查找',
    description: '批量IP查找工具，支持多格式子网匹配、IPv4/IPv6',
    category: 'network',
    icon: <Search size={15} />,
    component: IPLookupTool
  })

  toolRegistry.registerTool({
    id: 'http-test',
    name: 'HTTP测试',
    description: 'HTTP请求测试工具，支持GET/POST/PUT/DELETE等方法',
    category: 'network',
    icon: <Send size={15} />,
    component: HttpTestTool
  })

  toolRegistry.registerTool({
    id: 'process-tool',
    name: '进程查看',
    description: '查看系统进程、CPU、内存、GPU信息',
    category: 'system',
    icon: <LayoutGrid size={15} />,
    component: ProcessTool
  })

  toolRegistry.registerTool({
    id: 'raid-calculator',
    name: 'RAID计算器',
    description: 'RAID磁盘阵列容量计算与对比工具',
    category: 'system',
    icon: <HardDrive size={15} />,
    component: RaidCalculator
  })

  toolRegistry.registerTool({
    id: 'password-tool',
    name: '密码管理',
    description: '密码生成与存储管理工具',
    category: 'tools',
    icon: <ShieldCheck size={15} />,
    component: PasswordTool
  })

  toolRegistry.registerTool({
    id: 'settings',
    name: '设置',
    description: '应用程序设置',
    category: 'settings',
    icon: <Settings size={15} />,
    component: SettingsTool
  })
};
