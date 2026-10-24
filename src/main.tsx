import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { t } from './utils/i18n';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* сбой отрисовки App показывает сообщение и кнопку перезапуска, а не белый экран. */}
    <ErrorBoundary
      title={t('Ошибка приложения')}
      theme={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}
    >
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Show Tauri window safely after React mounts to prevent white flash
if (typeof window !== 'undefined' && '__TAURI__' in window) {
  import('@tauri-apps/api/window').then(({ appWindow }) => {
    appWindow.show();
  }).catch(console.error);
}
