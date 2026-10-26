import { ThemeProvider } from './context/ThemeContext';
import { MainLayout } from './components/MainLayout';
import { initializeTools } from './tools/index.jsx';
import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Modal, Button } from 'antd';
import { Wrench, LogOut, Minus } from 'lucide-react';
import { motion } from 'framer-motion';

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
        title={null}
        open={showAbout}
        onCancel={() => setShowAbout(false)}
        footer={null}
        width={380}
        centered
      >
        <div className="flex flex-col items-center text-center py-4">
          <div
            className="flex items-center justify-center rounded-2xl mb-4"
            style={{
              width: 56,
              height: 56,
              background: 'linear-gradient(135deg, #6366f1, #818cf8)',
              boxShadow: '0 6px 16px -4px rgb(99 102 241 / 0.45)',
            }}
          >
            <Wrench size={26} color="#fff" strokeWidth={2.2} />
          </div>
          <h2 className="!m-0 font-semibold" style={{ fontSize: 18 }}>
            工具箱
          </h2>
          <span
            className="mt-1 inline-block rounded-full px-2 py-0.5"
            style={{
              fontSize: 11,
              background: 'rgb(99 102 241 / 0.1)',
              color: '#6366f1',
            }}
          >
            v1.6.0
          </span>
          <p className="!mt-3 !mb-0" style={{ fontSize: 13, opacity: 0.75 }}>
            纯离线的通用工具集合，无需网络即可使用
          </p>
          <div
            className="mt-4 pt-4 grid grid-cols-2 gap-x-6 gap-y-1 w-full"
            style={{ borderTop: '1px solid rgb(128 128 128 / 0.15)', fontSize: 12, opacity: 0.6 }}
          >
            <span>Tauri 2.x</span>
            <span>React 19</span>
            <span>TypeScript</span>
            <span>Ant Design 6</span>
          </div>
        </div>
      </Modal>
      <Modal
        title={null}
        open={showCloseConfirm}
        onCancel={() => setShowCloseConfirm(false)}
        footer={null}
        width={360}
        centered
      >
        <div className="flex flex-col items-center text-center py-4">
          <div
            className="flex items-center justify-center rounded-full mb-3"
            style={{ width: 52, height: 52, background: 'rgb(245 158 11 / 0.1)' }}
          >
            <LogOut size={24} style={{ color: '#f59e0b' }} />
          </div>
          <p className="!m-0 font-medium" style={{ fontSize: 15 }}>
            确定要关闭窗口吗？
          </p>
          <div className="flex gap-3 mt-5">
            <motion.div whileTap={{ scale: 0.97 }}>
              <Button icon={<Minus size={14} />} onClick={handleMinimizeToTray} style={{ width: 128 }}>
                最小化到托盘
              </Button>
            </motion.div>
            <motion.div whileTap={{ scale: 0.97 }}>
              <Button
                type="primary"
                danger
                icon={<LogOut size={14} />}
                onClick={handleExit}
                style={{ width: 112 }}
              >
                退出程序
              </Button>
            </motion.div>
          </div>
        </div>
      </Modal>
    </ThemeProvider>
  );
}

export default App;
