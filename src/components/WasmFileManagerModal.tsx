import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, Trash2, HardDrive, FileText, Database, Check, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { registerWasmFile, dropWasmFile, getRegisteredWasmFiles } from '../lib/duckdbWasm';

interface WasmFileManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  onSchemaRefresh?: () => void;
}

interface VfsFileItem {
  name: string;
  size?: number;
  loadedAt?: Date;
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return 'Неизвестно';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function WasmFileManagerModal({
  isOpen,
  onClose,
  theme,
  onSchemaRefresh,
}: WasmFileManagerModalProps) {
  const [files, setFiles] = useState<VfsFileItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadFileList = async () => {
    setIsLoading(true);
    try {
      const list = await getRegisteredWasmFiles();
      setFiles(list);
    } catch (err) {
      console.warn("Failed to load WASM VFS files:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadFileList();
      setMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setIsLoading(true);
    setMessage(null);

    let successCount = 0;
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const buffer = new Uint8Array(await file.arrayBuffer());
        const ok = await registerWasmFile(file.name, buffer);
        if (ok) successCount++;
      }

      await loadFileList();
      setMessage({
        type: 'success',
        text: `Успешно загружено файлов в WASM VFS: ${successCount}`,
      });

      if (onSchemaRefresh) {
        onSchemaRefresh();
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: 'Ошибка при загрузке файла: ' + (err.message || String(err)),
      });
    } finally {
      setIsLoading(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleFileDelete = async (fileName: string) => {
    setIsLoading(true);
    setMessage(null);
    try {
      const ok = await dropWasmFile(fileName);
      if (ok) {
        await loadFileList();
        setMessage({
          type: 'success',
          text: `Файл "${fileName}" удален из виртуальной памяти`,
        });
        if (onSchemaRefresh) {
          onSchemaRefresh();
        }
      } else {
        setMessage({
          type: 'error',
          text: `Не удалось удалить файл "${fileName}"`,
        });
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: 'Ошибка при удалении: ' + (err.message || String(err)),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div
        className={`w-full max-w-2xl rounded-xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-colors ${
          theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
        }`}
      >
        {/* MODAL HEADER */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between shrink-0 ${
            theme === 'dark' ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100/90 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`font-bold text-sm sm:text-base ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                Виртуальная файловая система (WASM VFS)
              </h3>
              <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                Управление файлами в оперативной памяти мобильного движка DuckDB
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              theme === 'dark' ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* NOTIFICATION MESSAGES */}
        {message && (
          <div
            className={`px-5 py-2.5 text-xs font-medium flex items-center gap-2 border-b ${
              message.type === 'success'
                ? theme === 'dark'
                  ? 'bg-emerald-950/50 border-emerald-800/50 text-emerald-300'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : theme === 'dark'
                ? 'bg-rose-950/50 border-rose-800/50 text-rose-300'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {message.type === 'success' ? <Check className="w-4 h-4 shrink-0 text-emerald-500" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* MODAL BODY */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* TOP CONTROLS & UPLOAD BUTTON */}
          <div className="flex items-center justify-between gap-3">
            <span className={`text-xs font-semibold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
              Загруженные файлы ({files.length}):
            </span>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              multiple
              accept=".parquet,.csv,.json,.duckdb,.db,.sqlite"
              className="hidden"
            />

            <div className="flex items-center gap-2">
              <button
                onClick={loadFileList}
                disabled={isLoading}
                className={`p-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 border ${
                  theme === 'dark'
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 disabled:opacity-50'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 disabled:opacity-50'
                }`}
                title="Обновить список файлов VFS"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs shrink-0 ${
                  theme === 'dark'
                    ? 'bg-blue-600 hover:bg-blue-500 text-white disabled:bg-slate-800 disabled:text-slate-500'
                    : 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-200 disabled:text-slate-400'
                }`}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span>Загрузить файл</span>
              </button>
            </div>
          </div>

          {/* FILE LIST TABLE */}
          {files.length > 0 ? (
            <div className={`rounded-xl border overflow-hidden ${theme === 'dark' ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50/50'}`}>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {files.map((file) => (
                  <div
                    key={file.name}
                    className={`p-3.5 flex items-center justify-between gap-3 transition-colors ${
                      theme === 'dark' ? 'hover:bg-slate-800/60' : 'hover:bg-slate-100/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2 rounded-lg shrink-0 ${
                        file.name.endsWith('.parquet')
                          ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                          : file.name.endsWith('.csv')
                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                          : 'bg-cyan-500/10 text-cyan-500 border border-cyan-500/20'
                      }`}>
                        {file.name.endsWith('.duckdb') || file.name.endsWith('.db') ? (
                          <Database className="w-4 h-4" />
                        ) : (
                          <FileText className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className={`font-mono text-xs font-semibold truncate ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                          {file.name}
                        </div>
                        <div className={`text-[11px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                          Размер: {formatBytes(file.size)}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleFileDelete(file.name)}
                      disabled={isLoading}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                        theme === 'dark'
                          ? 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20'
                          : 'text-slate-500 hover:text-rose-600 hover:bg-rose-500/10 border border-transparent hover:border-rose-200'
                      }`}
                      title="Удалить из VFS"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Удалить</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              className={`p-8 rounded-xl border text-center flex flex-col items-center justify-center space-y-2 ${
                theme === 'dark' ? 'border-slate-800 bg-slate-900/40 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'
              }`}
            >
              <HardDrive className="w-8 h-8 text-slate-400 opacity-50" />
              <div className="text-xs font-medium">Виртуальная файловая система WASM пуста</div>
              <p className="text-[11px] max-w-sm text-slate-400">
                Загрузите файлы Parquet, CSV, JSON или DuckDB, чтобы они были доступны для SQL-запросов на мобильном устройстве.
              </p>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div
          className={`px-5 py-3 border-t flex items-center justify-end shrink-0 ${
            theme === 'dark' ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <button
            onClick={onClose}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              theme === 'dark'
                ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
            }`}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
