import React, { useState, useMemo, useCallback } from 'react';
import { Card, Input, Button, Space, List, message, Tag, Select } from 'antd';
import { FolderOpenOutlined, SearchOutlined, FileOutlined, CopyOutlined, FilterOutlined } from '@ant-design/icons';

const MAX_RESULTS = 2000;

const FILE_TYPE_GROUPS: Record<string, { label: string; extensions: string[] }> = {
  all: { label: '全部文件', extensions: [] },
  code: { label: '代码文件', extensions: ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.go', '.rs', '.rb', '.php', '.cs', '.swift', '.kt', '.scala', '.vue', '.svelte'] },
  doc: { label: '文档文件', extensions: ['.txt', '.md', '.doc', '.docx', '.pdf', '.xls', '.xlsx', '.ppt', '.pptx', '.rtf', '.odt'] },
  media: { label: '媒体文件', extensions: ['.mp3', '.mp4', '.wav', '.avi', '.mkv', '.mov', '.flv', '.webm', '.ogg', '.m4a', '.flac'] },
  image: { label: '图片文件', extensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff', '.psd'] },
  archive: { label: '压缩文件', extensions: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'] },
  config: { label: '配置文件', extensions: ['.json', '.yaml', '.yml', '.xml', '.toml', '.ini', '.conf', '.env', '.config'] },
};

interface FileItem {
  path: string;
  filename: string;
  filenameLower: string;
  ext: string;
}

function parseFilePath(path: string): FileItem {
  const filename = path.split('\\').pop() || path.split('/').pop() || path;
  const lastDot = filename.lastIndexOf('.');
  const ext = lastDot > 0 && lastDot < filename.length - 1 ? filename.substring(lastDot).toLowerCase() : '';
  return {
    path,
    filename,
    filenameLower: filename.toLowerCase(),
    ext,
  };
}

export const FileSearchTool: React.FC = () => {
  const [directory, setDirectory] = useState('');
  const [searchPattern, setSearchPattern] = useState('');
  const [fileItems, setFileItems] = useState<FileItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const [filterText, setFilterText] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const availableTypes = useMemo(() => {
    const options: { value: string; label: string; count: number }[] = [];
    options.push({ value: 'all', label: '全部文件', count: fileItems.length });
    
    Object.entries(FILE_TYPE_GROUPS).forEach(([key, group]) => {
      if (key === 'all') return;
      const count = fileItems.filter(item => group.extensions.includes(item.ext)).length;
      if (count > 0) {
        options.push({ value: key, label: `${group.label} (${count})`, count });
      }
    });
    
    return options;
  }, [fileItems]);

  const filteredResults = useMemo(() => {
    let results = fileItems;
    
    if (filterType !== 'all') {
      const group = FILE_TYPE_GROUPS[filterType];
      if (group) {
        results = results.filter(item => group.extensions.includes(item.ext));
      }
    }
    
    if (filterText.trim()) {
      const lowerFilter = filterText.toLowerCase();
      results = results.filter(item => item.filenameLower.includes(lowerFilter) || item.path.toLowerCase().includes(lowerFilter));
    }
    
    return results;
  }, [fileItems, filterType, filterText]);

  const selectDirectory = async () => {
    try {
      const dir = await window.electronAPI.selectDirectory();
      if (dir) {
        setDirectory(dir);
      }
    } catch (e) {
      message.error('选择目录失败');
    }
  };

  const searchFiles = useCallback(async () => {
    if (!directory) {
      message.warning('请先选择目录');
      return;
    }
    if (!searchPattern.trim()) {
      message.warning('请输入搜索关键词');
      return;
    }

    setIsSearching(true);
    setFileItems([]);
    setFilterText('');
    setFilterType('all');
    try {
      const results = await (window.electronAPI as any).searchFiles(directory, searchPattern, MAX_RESULTS);
      const parsed = results.map((path: string) => parseFilePath(path));
      setFileItems(parsed);
      if (results.length >= MAX_RESULTS) {
        message.info(`找到超过 ${MAX_RESULTS} 个文件，仅显示前 ${MAX_RESULTS} 个`);
      } else {
        message.success(`找到 ${results.length} 个文件`);
      }
    } catch (e) {
      message.error('搜索失败');
    } finally {
      setIsSearching(false);
    }
  }, [directory, searchPattern]);

  const openFile = (filePath: string) => {
    try {
      window.electronAPI.openFile(filePath);
    } catch (e) {
      message.error('打开文件失败');
    }
  };

  const copyPath = (filePath: string) => {
    navigator.clipboard.writeText(filePath);
    message.success('路径已复制');
  };

  const clearFilters = () => {
    setFilterText('');
    setFilterType('all');
  };

  return (
    <Card title="文件搜索">
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Space style={{ width: '100%' }}>
          <Input
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
            placeholder="选择或输入目录路径"
            prefix={<FolderOpenOutlined />}
            style={{ flex: 1 }}
          />
          <Button icon={<FolderOpenOutlined />} onClick={selectDirectory}>
            选择目录
          </Button>
        </Space>

        <Space style={{ width: '100%' }}>
          <Input
            value={searchPattern}
            onChange={(e) => setSearchPattern(e.target.value)}
            placeholder="输入搜索关键词"
            prefix={<SearchOutlined />}
            onPressEnter={searchFiles}
            style={{ flex: 1 }}
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={searchFiles}
            loading={isSearching}
          >
            搜索
          </Button>
        </Space>

        {fileItems.length > 0 && (
          <Space style={{ width: '100%' }} wrap>
            <Input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="二次过滤（在结果中筛选）"
              prefix={<FilterOutlined />}
              style={{ width: 260 }}
              allowClear
            />
            <Select
              value={filterType}
              onChange={setFilterType}
              style={{ width: 180 }}
              options={availableTypes.map(opt => ({ value: opt.value, label: opt.label }))}
              placeholder="文件类型"
            />
            {(filterText || filterType !== 'all') && (
              <Button size="small" onClick={clearFilters}>
                清除过滤
              </Button>
            )}
            <Tag color="blue" style={{ marginLeft: 'auto' }}>
              显示 {filteredResults.length} / {fileItems.length} 项
            </Tag>
          </Space>
        )}

        {fileItems.length >= MAX_RESULTS && (
          <Tag color="warning">搜索结果较多，已限制显示前 {MAX_RESULTS} 个</Tag>
        )}

        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
          <List
            bordered
            dataSource={filteredResults}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button
                    key="open"
                    type="link"
                    size="small"
                    onClick={() => openFile(item.path)}
                  >
                    打开
                  </Button>,
                  <Button
                    key="copy"
                    type="link"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyPath(item.path)}
                  >
                    复制路径
                  </Button>
                ]}
                style={{ padding: '6px 12px', height: '60px' }}
              >
                <List.Item.Meta
                  avatar={<FileOutlined />}
                  title={item.filename}
                  description={
                    <span style={{ fontSize: '12px', color: '#888' }}>{item.path}</span>
                  }
                />
              </List.Item>
            )}
            locale={{ emptyText: '未找到文件' }}
          />
        </div>
      </Space>
    </Card>
  );
};