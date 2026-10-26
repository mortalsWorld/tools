import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  Card,
  Input,
  Button,
  Space,
  Table,
  message,
  Tag,
  Segmented,
  Typography,
  Tooltip,
  Empty,
  Alert,
  Spin,
  theme,
} from 'antd';
import type { InputRef, TableProps } from 'antd';
import {
  FolderOpen,
  Search,
  File,
  Folder,
  Copy,
  RotateCw,
  Settings,
  Lightbulb,
} from 'lucide-react';

const { Text } = Typography;

/** 后端返回结果上限 */
const MAX_RESULTS = 2000;

type SearchSource = 'files' | 'settings';

interface SearchHit {
  path: string;
  name: string;
  /** 小写扩展名（含点号），目录为空字符串 */
  ext: string;
  isDir: boolean;
  size: number;
  modified: number;
  score: number;
}

/** 可点击排序的字段 */
type SortField = 'name' | 'type' | 'size' | 'modified';

interface WindowsSettingItem {
  name: string;
  uri: string;
  category: string;
}

/** 单条语法说明 */
interface SyntaxItem {
  /** 展示用的语法片段 */
  syntax: string;
  /** 语法说明 */
  desc: string;
  /** 点击后插入搜索框的内容，缺省时使用 syntax */
  insert?: string;
  /** 是否插入到查询开头（如盘符限定必须位于开头） */
  prepend?: boolean;
}

/** 支持的查询语法，按用途分组 */
const SYNTAX_GROUPS: { title: string; items: SyntaxItem[] }[] = [
  {
    title: '基础匹配',
    items: [
      { syntax: 'report', desc: '默认模糊匹配：字符按顺序出现即命中，无需连续' },
      { syntax: "'final report'", desc: '单引号包裹：精确子串匹配，关闭模糊跳跃' },
      { syntax: 'IMG_????.jpg', desc: '通配符：* 匹配任意字符，? 匹配单个字符' },
    ],
  },
  {
    title: '组合与逻辑',
    items: [
      { syntax: 'report final', desc: '空格为 AND，多个关键词需同时命中' },
      { syntax: 'png | jpg', desc: '竖线为 OR，任意一个命中即可' },
      { syntax: '!temp', desc: '感叹号排除，过滤掉含该词的结果' },
    ],
  },
  {
    title: '词修饰符',
    items: [
      { syntax: '^IMG', desc: '前缀匹配：名称必须以该内容开头' },
      { syntax: '.pdf$', desc: '后缀匹配：名称必须以该内容结尾' },
      { syntax: '^readme.txt$', desc: '完全匹配：名称与该内容完全相同' },
    ],
  },
  {
    title: '查询标记',
    items: [
      { syntax: ':.pdf', desc: '限定扩展名，可叠加使用：:.png.jpg' },
      { syntax: ':@doc', desc: '限定分类：doc / img / video / audio / zip / code，用 | 组合' },
      { syntax: ':?(2026*)', desc: '通配符二次过滤，多个条件用 | 或 ; 分隔' },
      { syntax: '::src', desc: '路径限定：完整路径中必须包含该片段' },
      { syntax: ':F', desc: '仅保留文件夹；:-F 则仅保留文件' },
    ],
  },
  {
    title: '排序',
    items: [
      { syntax: ':S-', desc: '按大小降序（大文件优先），:S 为升序' },
      { syntax: ':M-', desc: '按修改时间降序，:M 为升序' },
      { syntax: ':C-', desc: '按创建时间降序，:C 为升序' },
    ],
  },
  {
    title: '范围限定',
    items: [
      {
        syntax: 'd:',
        desc: '盘符限定：只在指定盘内检索，如 d: report（需位于查询开头）',
        insert: 'd:',
        prepend: true,
      },
    ],
  },
];

/** 字节数格式化 */
function formatSize(bytes: number): string {
  if (!bytes) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** 时间戳格式化 */
function formatTime(secs: number): string {
  if (!secs) return '-';
  const d = new Date(secs * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export const FileSearchTool: React.FC = () => {
  const { token } = theme.useToken();
  const [source, setSource] = useState<SearchSource>('files');

  // 文件搜索状态
  const [directory, setDirectory] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [response, setResponse] = useState<{
    indexedCount: number;
    fromCache: boolean;
    elapsedMs: number;
    warnings: string[];
  } | null>(null);
  const [resultFilter, setResultFilter] = useState('');
  /** 表头点击排序：field 为 null 表示按相关度排序 */
  const [sortState, setSortState] = useState<{ field: SortField | null; desc: boolean }>({
    field: null,
    desc: false,
  });
  // 语法面板默认展开，便于用户直接查看与套用
  const [showSyntax, setShowSyntax] = useState(true);

  /** 搜索输入框引用，套用语法后回焦 */
  const queryInputRef = useRef<InputRef>(null);

  // 系统设置搜索状态
  const [settingKeyword, setSettingKeyword] = useState('');
  const [settings, setSettings] = useState<WindowsSettingItem[]>([]);
  const [isSearchingSettings, setIsSearchingSettings] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  /** 结果内二次筛选 */
  const filteredHits = useMemo(() => {
    if (!resultFilter.trim()) return hits;
    const kw = resultFilter.toLowerCase();
    return hits.filter(
      (h) => h.name.toLowerCase().includes(kw) || h.path.toLowerCase().includes(kw)
    );
  }, [hits, resultFilter]);

  /** 系统设置按分类归组 */
  const groupedSettings = useMemo(() => {
    const map = new Map<string, WindowsSettingItem[]>();
    settings.forEach((item) => {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    });
    return Array.from(map.entries());
  }, [settings]);

  const selectDirectory = async () => {
    try {
      const dir = await window.electronAPI.selectDirectory();
      if (dir) {
        setDirectory(dir);
        // 切换目录后旧结果失效，避免误导
        setHits([]);
        setResponse(null);
      }
    } catch {
      message.error('选择目录失败');
    }
  };

  /**
   * 执行文件搜索
   *
   * - `refresh`：是否强制重建索引
   * - `sort`：本次生效的排序（表头点击会覆盖查询串中的排序标记）
   * - `keepFilter`：排序变化触发重搜时保留结果内筛选条件
   */
  const runSearch = useCallback(
    async (refresh = false, sort = sortState, keepFilter = false) => {
      if (!directory.trim()) {
        message.warning('请先选择目录');
        return;
      }
      if (!query.trim()) {
        message.warning('请输入搜索内容');
        return;
      }

      setIsSearching(true);
      if (!keepFilter) setResultFilter('');
      try {
        const res = await window.electronAPI.searchFilesAdvanced(
          directory,
          query,
          MAX_RESULTS,
          refresh,
          sort.field ?? undefined,
          sort.desc
        );
        setHits(res.results);
        setResponse({
          indexedCount: res.indexedCount,
          fromCache: res.fromCache,
          elapsedMs: res.elapsedMs,
          warnings: res.warnings || [],
        });
        if (res.results.length >= MAX_RESULTS) {
          message.info(`结果较多，仅显示前 ${MAX_RESULTS} 项`);
        }
      } catch (e) {
        message.error(`搜索失败：${(e as Error)?.message || e}`);
      } finally {
        setIsSearching(false);
      }
    },
    [directory, query, sortState]
  );

  /** 表头排序变化：切换排序字段后重新搜索（排序由后端执行，保证结果完整） */
  const handleTableChange: TableProps<SearchHit>['onChange'] = (_, _filters, sorter) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    const order = s?.order;
    // order 为空表示取消了排序，此时回到默认的相关度排序
    const next = {
      field: order ? ((s?.columnKey as SortField | undefined) ?? null) : null,
      desc: order === 'descend',
    };
    setSortState(next);
    runSearch(false, next, true);
  };

  /** 系统设置检索：空关键词返回完整目录 */
  const runSettingsSearch = useCallback(async (keyword: string) => {
    setIsSearchingSettings(true);
    try {
      const list = await window.electronAPI.searchWindowsSettings(keyword, 300);
      setSettings(list);
      setSettingsLoaded(true);
    } catch (e) {
      message.error(`检索系统设置失败：${(e as Error)?.message || e}`);
    } finally {
      setIsSearchingSettings(false);
    }
  }, []);

  const openSetting = async (item: WindowsSettingItem) => {
    try {
      await window.electronAPI.openWindowsSetting(item.uri);
    } catch (e) {
      message.error(`打开失败：${(e as Error)?.message || e}`);
    }
  };

  const openHit = (hit: SearchHit) => {
    window.electronAPI.openFile(hit.path).catch(() => message.error('打开失败'));
  };

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    message.success('路径已复制');
  };

  /** 将语法片段套用到搜索框，方便用户直接使用 */
  const applySyntax = (text: string, prepend = false) => {
    setQuery((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return text;
      return prepend ? `${text} ${trimmed}` : `${trimmed} ${text}`;
    });
    requestAnimationFrame(() => queryInputRef.current?.focus());
  };

  /** 名称/类型/大小列的表头排序状态 */
  const sortOrderFor = (field: SortField) =>
    sortState.field === field ? (sortState.desc ? 'descend' : 'ascend') : null;

  /** 文件搜索结果表格：名称、类型、大小支持点击排序（后端排序，保证结果完整） */
  const columns: TableProps<SearchHit>['columns'] = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      sorter: true,
      sortOrder: sortOrderFor('name'),
      ellipsis: true,
      render: (_: unknown, item: SearchHit) => (
        <Space size={6}>
          {item.isDir ? (
            <Folder size={14} style={{ color: token.colorWarning }} />
          ) : (
            <File size={14} style={{ color: token.colorPrimary }} />
          )}
          <Text strong>{item.name}</Text>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'ext',
      key: 'type',
      width: 100,
      sorter: true,
      sortOrder: sortOrderFor('type'),
      render: (_: unknown, item: SearchHit) => (
        <Text type="secondary">
          {item.isDir ? '文件夹' : item.ext ? item.ext.replace(/^\./, '').toUpperCase() : '文件'}
        </Text>
      ),
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 110,
      align: 'right',
      sorter: true,
      sortOrder: sortOrderFor('size'),
      render: (_: unknown, item: SearchHit) => (
        <Text type="secondary">{item.isDir ? '-' : formatSize(item.size)}</Text>
      ),
    },
    {
      title: '修改时间',
      dataIndex: 'modified',
      key: 'modified',
      width: 160,
      sorter: true,
      sortOrder: sortOrderFor('modified'),
      render: (_: unknown, item: SearchHit) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {formatTime(item.modified)}
        </Text>
      ),
    },
    {
      title: '路径',
      dataIndex: 'path',
      key: 'path',
      ellipsis: true,
      render: (_: unknown, item: SearchHit) => (
        <Tooltip title={item.path}>
          <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
            {item.path}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 130,
      render: (_: unknown, item: SearchHit) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => openHit(item)}>
            打开
          </Button>
          <Button
            type="link"
            size="small"
            icon={<Copy size={14} />}
            onClick={() => copyPath(item.path)}
          >
            复制
          </Button>
        </Space>
      ),
    },
  ];

  const renderFileResults = () => (
    <Table<SearchHit>
      rowKey="path"
      bordered
      size="small"
      columns={columns}
      dataSource={filteredHits}
      onChange={handleTableChange}
      scroll={{ y: 420 }}
      pagination={{
        pageSize: 50,
        showSizeChanger: true,
        pageSizeOptions: ['20', '50', '100', '200'],
        showTotal: (total) => `共 ${total} 项`,
      }}
      locale={{ emptyText: <Empty description="未找到匹配项" /> }}
    />
  );

  /** 系统设置结果列表 */
  const renderSettingResults = () => (
    <div style={{ maxHeight: '460px', overflowY: 'auto' }}>
      {groupedSettings.map(([category, items]) => (
        <div key={category} style={{ marginBottom: 12 }}>
          <Text strong style={{ display: 'block', margin: '8px 0' }}>
            {category}
          </Text>
          <Space wrap>
            {items.map((item) => (
              <Tag
                key={item.uri + item.name}
                color="processing"
                style={{ cursor: 'pointer', padding: '4px 10px', fontSize: 13 }}
                onClick={() => openSetting(item)}
              >
                {item.name}
              </Tag>
            ))}
          </Space>
        </div>
      ))}
    </div>
  );

  return (
    <Card title="文件搜索">
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Segmented
          value={source}
          onChange={(v) => setSource(v as SearchSource)}
          options={[
            { label: '文件搜索', value: 'files', icon: <File size={14} /> },
            { label: '系统设置', value: 'settings', icon: <Settings size={14} /> },
          ]}
        />

        {source === 'files' ? (
          <>
            <Space style={{ width: '100%' }}>
              <Input
                value={directory}
                onChange={(e) => setDirectory(e.target.value)}
                placeholder="选择或输入搜索目录"
                prefix={<FolderOpen size={14} />}
                style={{ flex: 1 }}
              />
              <Button icon={<FolderOpen size={14} />} onClick={selectDirectory}>
                选择目录
              </Button>
              <Tooltip title="重新扫描目录并重建索引（目录内容变化后使用）">
                <Button
                  icon={<RotateCw size={14} />}
                  disabled={!directory || isSearching}
                  onClick={() => runSearch(true)}
                >
                  刷新索引
                </Button>
              </Tooltip>
            </Space>

            <Space style={{ width: '100%' }}>
              <Input
                ref={queryInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="输入搜索内容，支持模糊匹配、! 排除、^ 前缀、$ 后缀、:@doc 等语法"
                prefix={<Search size={14} />}
                onPressEnter={() => runSearch(false)}
                style={{ flex: 1 }}
                allowClear
              />
              <Tooltip title={showSyntax ? '收起语法说明' : '查看支持的查询语法'}>
                <Button
                  icon={<Lightbulb size={14} />}
                  type={showSyntax ? 'primary' : 'default'}
                  onClick={() => setShowSyntax((v) => !v)}
                />
              </Tooltip>
              <Button
                type="primary"
                icon={<Search size={14} />}
                loading={isSearching}
                onClick={() => runSearch(false)}
              >
                搜索
              </Button>
            </Space>

            {showSyntax && (
              <Alert
                type="info"
                showIcon={false}
                message="支持的查询语法（点击任一语法即可套用到搜索框）"
                description={
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                      gap: '10px 20px',
                      marginTop: 4,
                    }}
                  >
                    {SYNTAX_GROUPS.map((group) => (
                      <div key={group.title}>
                        <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                          {group.title}
                        </Text>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            marginTop: 4,
                          }}
                        >
                          {group.items.map((item) => (
                            <div
                              key={item.syntax}
                              style={{
                                fontSize: 12,
                                display: 'flex',
                                alignItems: 'baseline',
                                gap: 8,
                              }}
                            >
                              <Tag
                                color="geekblue"
                                style={{
                                  cursor: 'pointer',
                                  margin: 0,
                                  flexShrink: 0,
                                  fontFamily: 'Consolas, Monaco, monospace',
                                }}
                                onClick={() => applySyntax(item.insert ?? item.syntax, item.prepend)}
                              >
                                {item.syntax}
                              </Tag>
                              <Text type="secondary">{item.desc}</Text>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                }
              />
            )}

            {response?.warnings?.length ? (
              <Alert type="warning" showIcon message={response.warnings.join('；')} />
            ) : null}

            {hits.length > 0 && (
              <Space style={{ width: '100%' }} wrap>
                <Input
                  value={resultFilter}
                  onChange={(e) => setResultFilter(e.target.value)}
                  placeholder="在当前结果中筛选"
                  prefix={<Search size={14} />}
                  style={{ width: 240 }}
                  allowClear
                />
                <Tag color="processing">
                  显示 {filteredHits.length} / {hits.length} 项
                </Tag>
                {response && (
                  <Tag color={response.fromCache ? 'green' : 'orange'}>
                    索引 {response.indexedCount.toLocaleString()} 条 · 耗时 {response.elapsedMs} ms
                    {response.fromCache ? ' · 缓存' : ' · 新建'}
                  </Tag>
                )}
              </Space>
            )}

            {isSearching ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Spin tip="正在搜索…" />
              </div>
            ) : (
              renderFileResults()
            )}
          </>
        ) : (
          <>
            <Space style={{ width: '100%' }}>
              <Input
                value={settingKeyword}
                onChange={(e) => setSettingKeyword(e.target.value)}
                placeholder="搜索 Windows 设置项与系统工具，如 蓝牙、网络、环境变量、任务管理器"
                prefix={<Settings size={14} />}
                onPressEnter={() => runSettingsSearch(settingKeyword)}
                style={{ flex: 1 }}
                allowClear
              />
              <Button
                type="primary"
                icon={<Search size={14} />}
                loading={isSearchingSettings}
                onClick={() => runSettingsSearch(settingKeyword)}
              >
                搜索
              </Button>
            </Space>

            <Text type="secondary" style={{ fontSize: 12 }}>
              覆盖 Windows 设置页、控制面板项与常用系统工具，点击标签即可直达对应界面。
            </Text>

            {isSearchingSettings ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Spin tip="正在检索…" />
              </div>
            ) : settingsLoaded || settings.length > 0 ? (
              groupedSettings.length > 0 ? (
                renderSettingResults()
              ) : (
                <Empty description="未找到匹配的系统设置" />
              )
            ) : (
              <Empty description="输入关键词开始检索，留空可浏览全部系统设置" />
            )}
          </>
        )}
      </Space>
    </Card>
  );
};
