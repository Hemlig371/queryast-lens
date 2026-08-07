import React, { useState } from 'react';
import { X, Zap, Check, AlertCircle, Loader2, Unplug, Info, Database } from 'lucide-react';
import { ConnectorxConfig, executeConnectorxQueryTauri, isTauriEnvironment } from '../lib/connectorx';

interface ConnectorxModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ConnectorxConfig | null;
  onConnect: (config: ConnectorxConfig) => void;
  onDisconnect: () => void;
  theme: 'dark' | 'light';
}

export const ConnectorxModal: React.FC<ConnectorxModalProps> = ({
  isOpen,
  onClose,
  config,
  onConnect,
  onDisconnect,
  theme,
}) => {
  const [uri, setUri] = useState<string>(config?.uri || '');
  const [partitionNum, setPartitionNum] = useState<string | number>(config?.partitionNum ?? 1);
  const [partitionOn, setPartitionOn] = useState<string>(config?.partitionOn || '');
  const [partitionRangeMin, setPartitionRangeMin] = useState<string | number>(config?.partitionRangeMin ?? '');
  const [partitionRangeMax, setPartitionRangeMax] = useState<string | number>(config?.partitionRangeMax ?? '');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; rows?: any[] } | null>(null);

  if (!isOpen) return null;

  const currentConfig: ConnectorxConfig = {
    uri: uri.trim(),
    partitionNum: partitionNum !== '' ? Number(partitionNum) : 1,
    partitionOn: partitionOn.trim() || undefined,
    partitionRangeMin: partitionRangeMin !== '' ? Number(partitionRangeMin) : undefined,
    partitionRangeMax: partitionRangeMax !== '' ? Number(partitionRangeMax) : undefined,
  };

  const handleTestConnection = async () => {
    if (!uri.trim()) {
      setTestResult({ success: false, message: 'Укажите URI строки подключения (например, oracle://user:pass@host:1521/service)' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      if (isTauriEnvironment()) {
        const res = await executeConnectorxQueryTauri(currentConfig, 'SELECT 1');
        const rowsCount = res?.rows?.length || 0;
        setTestResult({
          success: true,
          message: `Подключение успешно! Запрос "SELECT 1" вернул ${rowsCount} строк(у).`,
          rows: res.rows,
        });
      } else {
        setTestResult({
          success: false,
          message: 'Подключение ConnectorX требует десктопной версии приложения (Tauri). Для веб-версии используйте DuckDB или ClickHouse.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || String(err) || 'Ошибка подключения ConnectorX',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleApplyConnect = () => {
    if (!uri.trim()) {
      alert('Пожалуйста, введите URI подключения (например, oracle://user:pass@host:1521/service_name)');
      return;
    }
    onConnect(currentConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div 
        style={{
          width: 'calc(min(520px, 92vw) / var(--zoom-scale, 1))',
          maxHeight: 'calc(90vh / var(--zoom-scale, 1))',
        }}
        className={`rounded-xl border shadow-2xl overflow-hidden flex flex-col ${
          theme === 'dark' ? 'bg-slate-850 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
        }`}
      >
        {/* HEADER */}
        <div className={`flex items-center justify-between px-4 py-3 border-b select-none ${
          theme === 'dark' ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-200'
        }`}>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-400" />
            <h3 className="font-bold text-sm">Подключение ConnectorX (Высокоскоростной ETL)</h3>
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
          {/* URI INPUT */}
          <div className="space-y-1.5">
            <label className="font-semibold block text-slate-400">Строка подключения (URI)</label>
            <input
              type="text"
              placeholder="oracle://user:password@host:1521/service_name"
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border font-mono outline-none text-xs ${
                theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200 focus:border-purple-500' : 'bg-slate-50 border-slate-300 text-slate-800 focus:border-purple-500'
              }`}
            />
          </div>

          {/* PARALLEL ETL COPY PARAMETERS */}
          <div className={`p-3 rounded-lg border space-y-3 ${
            theme === 'dark' ? 'bg-slate-900/40 border-slate-700/80' : 'bg-slate-50/80 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300">Параметры многопоточности COPY (Экспорт в Parquet)</span>
              <span className="text-[10px] text-purple-400 font-mono">Опционально</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium block text-slate-400">Потоков (Partitions)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="1"
                  value={partitionNum}
                  onChange={(e) => setPartitionNum(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded border outline-none text-xs ${
                    theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200 focus:border-purple-500' : 'bg-white border-slate-300 text-slate-800 focus:border-purple-500'
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium block text-slate-400">Столбец нарезки (Partition Column)</label>
                <input
                  type="text"
                  placeholder="id"
                  value={partitionOn}
                  onChange={(e) => setPartitionOn(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded border outline-none text-xs font-mono ${
                    theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200 focus:border-purple-500' : 'bg-white border-slate-300 text-slate-800 focus:border-purple-500'
                  }`}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium block text-slate-400">Диапазон (Min / Max) <span className="text-[10px] text-slate-500 font-normal">(опционально для ручной нарезки)</span></label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min (например 1)"
                  value={partitionRangeMin}
                  onChange={(e) => setPartitionRangeMin(e.target.value)}
                  className={`w-1/2 px-2.5 py-1.5 rounded border outline-none text-xs ${
                    theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200 focus:border-purple-500' : 'bg-white border-slate-300 text-slate-800 focus:border-purple-500'
                  }`}
                />
                <span className="text-slate-500">—</span>
                <input
                  type="number"
                  placeholder="Max (например 100000)"
                  value={partitionRangeMax}
                  onChange={(e) => setPartitionRangeMax(e.target.value)}
                  className={`w-1/2 px-2.5 py-1.5 rounded border outline-none text-xs ${
                    theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200 focus:border-purple-500' : 'bg-white border-slate-300 text-slate-800 focus:border-purple-500'
                  }`}
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              Примечание: ConnectorX поддерживает нарезку <strong>только по числовому столбцу</strong> (INT / BIGINT). Для обычного превью используется 1 поток.
            </p>
          </div>

          {/* EXAMPLES HINT */}
          <div className={`p-3 rounded-lg border text-[11px] leading-relaxed space-y-1.5 ${
            theme === 'dark' ? 'bg-slate-900/60 border-slate-700/80 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            <div className="flex items-center gap-1.5 font-semibold text-purple-400">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>Примеры строк подключения:</span>
            </div>
            <ul className="space-y-1 font-mono text-[10.5px]">
              <li><span className="text-amber-400 font-bold">Oracle:</span> oracle://user:password@host:1521/service_name</li>
              <li><span className="text-blue-400 font-bold">PostgreSQL:</span> postgresql://user:password@host:5432/dbname</li>
              <li><span className="text-yellow-400 font-bold">ClickHouse:</span> clickhouse://user:password@host:9000/dbname</li>
            </ul>
            <p className="text-slate-400 pt-1 text-[10px]">
              Для Oracle Instant Client достаточно скопировать файлы клиента в папку с приложением без прав администратора.
            </p>
          </div>

          {/* TEST CONNECTION BUTTON & STATUS */}
          <div className="pt-1 space-y-2">
            <button
              onClick={handleTestConnection}
              disabled={isTesting}
              className={`w-full py-2 px-3 rounded-lg border font-semibold flex items-center justify-center gap-2 transition-all ${
                theme === 'dark'
                  ? 'bg-purple-950/40 hover:bg-purple-900/60 border-purple-500/40 text-purple-300'
                  : 'bg-purple-50 hover:bg-purple-100 border-purple-300 text-purple-800'
              } disabled:opacity-50`}
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                  <span>Проверка подключения...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 text-purple-400" />
                  <span>Проверить соединение</span>
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
          {config ? (
            <button
              onClick={() => {
                onDisconnect();
                onClose();
              }}
              className="px-3 py-1.5 rounded-lg border border-red-500/40 bg-red-950/30 text-red-300 hover:bg-red-900/50 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Unplug className="w-3.5 h-3.5" />
              <span>Отключить</span>
            </button>
          ) : (
            <div />
          )}

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
              className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md transition-all active:scale-95"
            >
              Подключиться
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
