import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root container missing');

createRoot(container).render(
  <StrictMode>
    {/* HashRouter：静态托管（GitHub Pages）下无需服务端重写规则 */}
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
