import { ThemeProvider } from './context/ThemeContext';
import { MainLayout } from './components/MainLayout';
import { initializeTools } from './tools/index.jsx';

initializeTools();

function App() {
  return (
    <ThemeProvider>
      <MainLayout />
    </ThemeProvider>
  );
}

export default App;
