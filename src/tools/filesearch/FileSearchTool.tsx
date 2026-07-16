import React, { useState } from 'react';
import { Card, Input, Button, Space, List, message } from 'antd';
import { FolderOpenOutlined, SearchOutlined, FileOutlined, CopyOutlined } from '@ant-design/icons';

export const FileSearchTool: React.FC = () => {
  const [directory, setDirectory] = useState('');
  const [searchPattern, setSearchPattern] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);

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

  const searchFiles = async () => {
    if (!directory) {
      message.warning('请先选择目录');
      return;
    }
    if (!searchPattern.trim()) {
      message.warning('请输入搜索关键词');
      return;
    }

    setIsSearching(true);
    try {
      const results = await window.electronAPI.searchFiles(directory, searchPattern);
      setSearchResults(results);
      message.success(`找到 ${results.length} 个文件`);
    } catch (e) {
      message.error('搜索失败');
    } finally {
      setIsSearching(false);
    }
  };

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

        <List
          bordered
          dataSource={searchResults}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button
                  key="open"
                  type="link"
                  size="small"
                  onClick={() => openFile(item)}
                >
                  打开
                </Button>,
                <Button
                  key="copy"
                  type="link"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => copyPath(item)}
                >
                  复制路径
                </Button>
              ]}
            >
              <List.Item.Meta
                avatar={<FileOutlined />}
                title={item.split('\\').pop() || item.split('/').pop()}
                description={item}
              />
            </List.Item>
          )}
          locale={{ emptyText: '未找到文件' }}
        />
      </Space>
    </Card>
  );
};
