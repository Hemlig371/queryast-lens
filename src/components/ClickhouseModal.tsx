import React, { useState } from 'react';
import { X, Database, Check, AlertCircle, Loader2, Unplug } from 'lucide-react';
import { ClickhouseConfig, getClickhouseUrl, getClickhouseHeaders, isTauriEnvironment, executeClickhouseQueryTauri } from '../lib/clickhouse';

interface ClickhouseModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ClickhouseConfig | null;
  onConnect: (config: ClickhouseConfig) => void;
  onDisconnect: () => void;
  theme: 'dark' | 'light';
  fetchApiJson: (endpoint: string, options?: RequestInit) => Promise<any>;
}

export const ClickhouseModal: React.FC<ClickhouseModalProps> = ({
  isOpen,
  onClose,
  config,
  onConnect,
  onDisconnect,
  theme,
  fetchApiJson,
}) => {
  const [protocol, setProtocol] = useState<'http' | 'https'>(config?.protocol || 'http');
  const [host, setHost] = useState(config?.host || '127.0.0.1:8123');
  const [user, setUser] = useState(config?.user || 'default');
  const [key, setKey] = useState(config?.key || '');
  const [database, setDatabase] = useState(config?.database || 'default');

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; rows?: any[] } | null>(null);

  if (!isOpen) return null;

  const currentConfig: ClickhouseConfig = {
    protocol,
    host: host.trim(),
    user: user.trim(),
    key,
    database: database.trim(),
  };

  const handleTestConnection = async () => {
    if (!host.trim()) {
      setTestResult({ success: false, message: 'Укажите хост сервера ClickHouse' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      if (isTauriEnvironment()) {
        try {
          const res = await executeClickhouseQueryTauri(currentConfig, 'SELECT 1');
          const textRes = res.text || (typeof res.data === 'string' ? res.data : JSON.stringify(res.data));
          setTestResult({
            success: true,
            message: `Подключение успешно! Ответ на query "SELECT 1" :  ${textRes || '1'}`,
          });
        } catch (err: any) {
          setTestResult({
            success: false,
            message: err.message || String(err) || 'Ошибка сети или недоступности хоста ClickHouse (Tauri)',
          });
        }
      } else {
        // First try via backend proxy endpoint
        try {
          const proxyData = await fetchApiJson('/api/clickhouse/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentConfig),
          });

          if (proxyData && !proxyData.error) {
            const textRes = proxyData.text || (typeof proxyData.data === 'string' ? proxyData.data : JSON.stringify(proxyData.data));
            setTestResult({
              success: true,
              message: `Подключение успешно! Ответ на query "SELECT 1" :  ${textRes || '1'}`,
            });
            setIsTesting(false);
            return;
          } else if (proxyData?.error) {
            setTestResult({
              success: false,
              message: proxyData.error,
            });
            setIsTesting(false);
            return;
          }
        } catch (proxyErr: any) {
          // Fallback: direct HTTP fetch
          const url = getClickhouseUrl(currentConfig);
          const headers = getClickhouseHeaders(currentConfig);
          const res = await fetch(url, {
            method: 'POST',
            headers,
            body: 'SELECT 1',
          });

          const responseText = await res.text();
          if (res.ok) {
            setTestResult({
              success: true,
              message: `Подключение успешно! Ответ на query "SELECT 1" :  ${responseText.trim()}`,
            });
          } else {
            setTestResult({
              success: false,
              message: `Ошибка HTTP ${res.status}: ${responseText.trim() || 'Не удалось подключиться к серверу ClickHouse'}`,
            });
          }
        }
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Ошибка сети или недоступности хоста ClickHouse',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleApplyConnect = () => {
    if (!host.trim()) {
      alert('Пожалуйста, введите хост и порт (например, 127.0.0.1:8123)');
      return;
    }
    onConnect(currentConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className={`w-full max-w-md rounded-xl border shadow-2xl overflow-hidden flex flex-col ${
        theme === 'dark' ? 'bg-slate-850 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
      }`}>
        {/* HEADER */}
        <div className={`flex items-center justify-between px-4 py-3 border-b select-none ${
          theme === 'dark' ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-200'
        }`}>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-amber-500" />
            <h3 className="font-bold text-sm">Подключение ClickHouse</h3>
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded-md transition-colors ${
              theme === 'dark' ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* BODY */}
        <div className="p-4 space-y-4 text-xs overflow-y-auto max-h-[75vh]">
          {/* HOST & PROTOCOL */}
          <div className="space-y-1.5">
            <label className="font-semibold block text-slate-400">Протокол и Хост:Порт</label>
            <div className="flex gap-2">
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as 'http' | 'https')}
                className={`px-2.5 py-1.5 rounded-lg border font-mono outline-none text-xs ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
                }`}
              >
                <option value="http">http://</option>
                <option value="https">https://</option>
              </select>
              <input
                type="text"
                placeholder="127.0.0.1:8123 или ch.server.com:8443"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className={`flex-1 px-3 py-1.5 rounded-lg border font-mono outline-none text-xs ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200 focus:border-amber-500' : 'bg-slate-50 border-slate-300 text-slate-800 focus:border-amber-500'
                }`}
              />
            </div>
          </div>

          {/* USER & PASSWORD */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="font-semibold block text-slate-400">Логин (User)</label>
              <input
                type="text"
                placeholder="default"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none text-xs ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200 focus:border-amber-500' : 'bg-slate-50 border-slate-300 text-slate-800 focus:border-amber-500'
                }`}
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-semibold block text-slate-400">Пароль (Password)</label>
              <input
                type="password"
                placeholder="без пароля"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none text-xs ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200 focus:border-amber-500' : 'bg-slate-50 border-slate-300 text-slate-800 focus:border-amber-500'
                }`}
              />
            </div>
          </div>

          {/* DATABASE */}
          <div className="space-y-1.5">
            <label className="font-semibold block text-slate-400">База данных (Database)</label>
            <input
              type="text"
              placeholder="default"
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              className={`w-full px-3 py-1.5 rounded-lg border font-mono outline-none text-xs ${
                theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200 focus:border-amber-500' : 'bg-slate-50 border-slate-300 text-slate-800 focus:border-amber-500'
              }`}
            />
          </div>

          {/* TEST CONNECTION BUTTON & STATUS */}
          <div className="pt-2 space-y-2">
            <button
              onClick={handleTestConnection}
              disabled={isTesting}
              className={`w-full py-2 px-3 rounded-lg border font-semibold flex items-center justify-center gap-2 transition-all ${
                theme === 'dark'
                  ? 'bg-amber-950/40 hover:bg-amber-900/60 border-amber-500/40 text-amber-300'
                  : 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-800'
              } disabled:opacity-50`}
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                  <span>Проверка подключения...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 text-amber-500" />
                  <span>Проверить подключение</span>
                </>
              )}
            </button>

            {testResult && (
              <div className={`p-3 rounded-lg border text-xs leading-relaxed space-y-1.5 ${
                testResult.success
                  ? theme === 'dark' ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200' : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : theme === 'dark' ? 'bg-red-950/50 border-red-500/40 text-red-200' : 'bg-red-50 border-red-300 text-red-900'
              }`}>
                <div className="flex items-center gap-1.5 font-bold">
                  {testResult.success ? (
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </div>

                {testResult.rows && testResult.rows.length > 0 && (
                  <div className={`p-2 rounded font-mono text-[11px] overflow-x-auto ${
                    theme === 'dark' ? 'bg-slate-900 border border-slate-700 text-emerald-300' : 'bg-white border border-slate-200 text-emerald-800'
                  }`}>
                    <pre>{JSON.stringify(testResult.rows, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* FOOTER BUTTONS */}
        <div className={`flex items-center justify-between px-4 py-3 border-t select-none ${
          theme === 'dark' ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-200'
        }`}>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                theme === 'dark' ? 'border-slate-700 text-slate-300 hover:bg-slate-700' : 'border-slate-300 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Отмена
            </button>
            <button
              onClick={handleApplyConnect}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition-all active:scale-95"
            >
              Подключиться
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
