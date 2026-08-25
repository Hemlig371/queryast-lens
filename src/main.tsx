import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Show Tauri window safely after React mounts to prevent white flash
if (typeof window !== 'undefined' && '__TAURI__' in window) {
  import('@tauri-apps/api/window').then(({ appWindow }) => {
    appWindow.show();
  }).catch(console.error);
}
