import { ThemeProvider } from './context/ThemeContext';
import { MainLayout } from './components/MainLayout';
import { initializeTools } from './tools/index.jsx';
import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { message } from 'antd';

initializeTools();

function App() {
  useEffect(() => {
    // 监听显示关于对话框事件
    const unlistenAbout = listen('show-about', () => {
      message.info({
        content: (
          <div style={{ textAlign: 'center' }}>
            <h2>工具箱</h2>
            <p>版本 1.6.0</p>
            <p>一个纯离线的通用工具集合，无需网络即可使用</p>
            <p style={{ marginTop: 16, fontSize: 12, color: '#888' }}>
              技术栈：Tauri 2.x + React + TypeScript + Ant Design
            </p>
          </div>
        ),
        duration: 0,
      });
    });

    return () => {
      unlistenAbout.then(fn => fn());
    };
  }, []);

  return (
    <ThemeProvider>
      <MainLayout />
    </ThemeProvider>
  );
}

export default App;
