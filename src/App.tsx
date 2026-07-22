import { ThemeProvider } from './context/ThemeContext';
import { MainLayout } from './components/MainLayout';
import { initializeTools } from './tools/index.jsx';
import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Modal, Button } from 'antd';
import { MinusCircleOutlined, LogoutOutlined, CloseOutlined } from '@ant-design/icons';

initializeTools();

function App() {
  const [showAbout, setShowAbout] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  useEffect(() => {
    const unlistenAbout = listen('show-about', () => {
      setShowAbout(true);
    });

    const unlistenClose = listen('close-requested', () => {
      setShowCloseConfirm(true);
    });

    return () => {
      unlistenAbout.then(fn => fn());
      unlistenClose.then(fn => fn());
    };
  }, []);

  const handleMinimizeToTray = async () => {
    setShowCloseConfirm(false);
    await window.electronAPI?.minimizeWindow();
  };

  const handleExit = async () => {
    setShowCloseConfirm(false);
    await window.electronAPI?.quitApp();
  };

  return (
    <ThemeProvider>
      <MainLayout />
      <Modal
        title="关于工具箱"
        open={showAbout}
        onCancel={() => setShowAbout(false)}
        footer={null}
      >
        <div style={{ textAlign: 'center' }}>
          <h2>工具箱</h2>
          <p>版本 1.6.0</p>
          <p>一个纯离线的通用工具集合，无需网络即可使用</p>
          <p style={{ marginTop: 16, fontSize: 12, color: '#888' }}>
            技术栈：Tauri 2.x + React + TypeScript + Ant Design
          </p>
        </div>
      </Modal>
      <Modal
        title="确认退出"
        open={showCloseConfirm}
        onCancel={() => setShowCloseConfirm(false)}
        footer={null}
        width={400}
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <CloseOutlined style={{ fontSize: 48, color: '#faad14', marginBottom: 16 }} />
          <p style={{ fontSize: 16, marginBottom: 24 }}>确定要关闭窗口吗？</p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            <Button
              type="default"
              icon={<MinusCircleOutlined />}
              onClick={handleMinimizeToTray}
              style={{ width: 120 }}
            >
              最小化到托盘
            </Button>
            <Button
              type="primary"
              danger
              icon={<LogoutOutlined />}
              onClick={handleExit}
              style={{ width: 120 }}
            >
              退出程序
            </Button>
          </div>
        </div>
      </Modal>
    </ThemeProvider>
  );
}

export default App;
