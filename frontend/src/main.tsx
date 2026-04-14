import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { SocketProvider } from './services/socket';
import { Toaster } from 'sonner';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SocketProvider />
    <App />
    <Toaster
      theme="dark"
      position="top-right"
      richColors
      toastOptions={{
        style: {
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          color: 'var(--text-primary)',
        },
      }}
    />
  </StrictMode>,
);
