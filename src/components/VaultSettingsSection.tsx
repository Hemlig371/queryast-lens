import React, { useState, useEffect } from 'react';
import { Key, Lock, Unlock, Shield, Eye, EyeOff, Plus, Trash2, Check, Copy, AlertCircle, AlertTriangle, RotateCcw } from 'lucide-react';
import {
  isVaultConfigured,
  isVaultUnlocked,
  setupVaultPin,
  unlockVault,
  lockVault,
  resetVault,
  getVaultSecrets,
  addOrUpdateVaultSecret,
  deleteVaultSecret,
  changeVaultPin,
  VaultSecret,
} from '../utils/vaultStorage';

interface VaultSettingsSectionProps {
  theme: 'dark' | 'light';
}

export const VaultSettingsSection: React.FC<VaultSettingsSectionProps> = ({ theme }) => {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState<boolean>(false);
  const [secrets, setSecrets] = useState<VaultSecret[]>([]);

  // Input states
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [secretError, setSecretError] = useState<string | null>(null);

  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Change PIN state
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [changePinError, setChangePinError] = useState<string | null>(null);
  const [changePinSuccess, setChangePinSuccess] = useState(false);

  // Confirmation state for reset
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);

  // ClickHouse URI format copy state
  const [copiedFormat, setCopiedFormat] = useState(false);

  const handleCopyUriFormat = () => {
    navigator.clipboard.writeText('https://login:password@host:8443/database');
    setCopiedFormat(true);
    setTimeout(() => setCopiedFormat(false), 1500);
  };

  const refreshState = async () => {
    try {
      const isConf = await isVaultConfigured();
      setConfigured(isConf);
      const isUnl = isVaultUnlocked();
      setUnlocked(isUnl);
      if (isUnl) {
        setSecrets(getVaultSecrets() || []);
      } else {
        setSecrets([]);
      }
    } catch (e) {
      console.error('Failed to check vault status:', e);
    }
  };

  useEffect(() => {
    refreshState();

    const handleVaultChange = () => {
      refreshState();
    };

    window.addEventListener('sql_vault_status_changed', handleVaultChange);
    window.addEventListener('sql_vault_secrets_updated', handleVaultChange);
    return () => {
      window.removeEventListener('sql_vault_status_changed', handleVaultChange);
      window.removeEventListener('sql_vault_secrets_updated', handleVaultChange);
    };
  }, []);

  const handleSetupPin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setPinError(null);
    if (!/^\d{4,}$/.test(pinInput.trim())) {
      setPinError('ПИН-код должен состоять только из цифр (минимум 4 цифры)');
      return;
    }
    try {
      await setupVaultPin(pinInput.trim());
      setPinInput('');
      await refreshState();
    } catch (err: any) {
      setPinError(err.message || 'Ошибка установки ПИН-кода');
    }
  };

  const handleUnlock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setPinError(null);
    if (!pinInput.trim()) {
      setPinError('Введите ПИН-код');
      return;
    }
    try {
      const success = await unlockVault(pinInput.trim());
      if (success) {
        setPinInput('');
        await refreshState();
      } else {
        setPinError('Неверный ПИН-код');
      }
    } catch (err: any) {
      setPinError(err.message || 'Ошибка разблокировки');
    }
  };

  const handleLock = () => {
    lockVault();
    setIsChangingPin(false);
    setIsConfirmingReset(false);
    setOldPin('');
    setNewPin('');
    refreshState();
  };

  const handlePromptResetVault = () => {
    setIsConfirmingReset(true);
  };

  const handleCancelResetVault = () => {
    setIsConfirmingReset(false);
  };

  const handleConfirmResetVault = async () => {
    await resetVault();
    setIsConfirmingReset(false);
    setPinInput('');
    setPinError(null);
    setIsChangingPin(false);
    await refreshState();
  };

  const handleAddSecret = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSecretError(null);
    const cleanName = newKeyName.trim();
    const cleanVal = newKeyValue.trim();

    if (!cleanName) {
      setSecretError('Укажите имя ключа');
      return;
    }
    if (!cleanVal) {
      setSecretError('Укажите значение ключа');
      return;
    }

    try {
      await addOrUpdateVaultSecret(cleanName, cleanVal);
      setNewKeyName('');
      setNewKeyValue('');
      await refreshState();
    } catch (err: any) {
      setSecretError(err.message || 'Ошибка сохранения ключа');
    }
  };

  const handleDeleteSecret = async (name: string) => {
    try {
      await deleteVaultSecret(name);
      await refreshState();
    } catch (err: any) {
      console.error('Failed to delete secret:', err);
    }
  };

  const handleCopyValue = (name: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(name);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleChangePin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setChangePinError(null);
    setChangePinSuccess(false);

    if (!/^\d{4,}$/.test(newPin.trim())) {
      setChangePinError('Новый ПИН-код должен состоять минимум из 4 цифр');
      return;
    }

    try {
      await changeVaultPin(oldPin.trim(), newPin.trim());
      setChangePinSuccess(true);
      setOldPin('');
      setNewPin('');
      setTimeout(() => {
        setIsChangingPin(false);
        setChangePinSuccess(false);
      }, 1500);
      await refreshState();
    } catch (err: any) {
      setChangePinError(err.message || 'Неверный текущий ПИН-код');
    }
  };

  if (configured === null) {
    return null;
  }

  return (
    <div
      className={`p-4 rounded-xl border space-y-3.5 ${
        theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
      }`}
    >
      {/* SECTION HEADER */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-amber-500" />
          <h4 className={`font-bold text-xs ${theme === 'dark' ? 'text-slate-200' : 'text-slate-900'}`}>
            Ключи и секреты (PIN-код)
          </h4>
        </div>

        {unlocked && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleLock}
              className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md border font-semibold transition-colors ${
                theme === 'dark'
                  ? 'bg-amber-950/40 border-amber-600/40 text-amber-300 hover:bg-amber-900/60'
                  : 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
              }`}
              title="Заблокировать хранилище ключей"
            >
              <Lock className="w-3 h-3" />
              <span>Заблокировать</span>
            </button>
            <button
              onClick={handlePromptResetVault}
              className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border transition-colors ${
                theme === 'dark'
                  ? 'border-red-500/30 text-red-400 hover:bg-red-950/40'
                  : 'border-red-200 text-red-600 hover:bg-red-50'
              }`}
              title="Полный сброс хранилища"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Сбросить</span>
            </button>
          </div>
        )}
      </div>

      {/* CONFIRMATION BANNER FOR RESET */}
      {isConfirmingReset && (
        <div
          className={`p-3 rounded-lg border flex flex-col gap-2.5 ${
            theme === 'dark' ? 'bg-red-950/40 border-red-500/50 text-red-200' : 'bg-red-50 border-red-300 text-red-900'
          }`}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <span className="font-bold">Сбросить всё хранилище?</span>
              <p className={`mt-0.5 text-[11px] ${theme === 'dark' ? 'text-red-300/80' : 'text-red-800/80'}`}>
                Все сохраненные ключи будут безвозвратно удалены, а текущий ПИН-код сброшен.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleCancelResetVault}
              className={`px-2.5 py-1 text-xs rounded-md border font-medium transition-colors ${
                theme === 'dark'
                  ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleConfirmResetVault}
              className={`px-2.5 py-1 text-xs rounded-md border font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                theme === 'dark'
                  ? 'bg-red-950/60 hover:bg-red-900/80 text-red-300 border-red-500/40 hover:border-red-400/60'
                  : 'bg-red-100/90 hover:bg-red-200 text-red-700 border-red-300 hover:border-red-400'
              }`}
            >
              <RotateCcw className="w-3 h-3" />
              <span>Да, сбросить всё</span>
            </button>
          </div>
        </div>
      )}

      <p className={`text-[11px] leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
        Безопасное хранение URI подключений и секретов с шифрованием AES-GCM. Подстановка в SQL через{' '}
        <code className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold border ${
          theme === 'dark' ? 'bg-slate-700/60 text-amber-400 border-slate-600/50' : 'bg-amber-50 text-amber-800 border-amber-200'
        }`}>
          {'{{имя_ключа}}'}
        </code>{' '}
        и автозаполнение ClickHouse (ключи с префиксом{' '}
        <code className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold border ${
          theme === 'dark' ? 'bg-slate-700/60 text-amber-400 border-slate-600/50' : 'bg-amber-50 text-amber-800 border-amber-200'
        }`}>
          ch_*
        </code>).
      </p>

      {/* STATE 1: NOT CONFIGURED */}
      {!configured && (
        <form onSubmit={handleSetupPin} className="space-y-2.5 pt-1">
          <div className="flex items-center gap-2">
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={16}
              placeholder="Задайте ПИН-код (от 4 цифр)"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
              className={`flex-1 px-3 py-1.5 rounded-lg border font-mono text-xs outline-none ${
                theme === 'dark'
                  ? 'bg-slate-900 border-slate-700 text-slate-200 focus:border-blue-500'
                  : 'bg-white border-slate-300 text-slate-800 focus:border-blue-500'
              }`}
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition-all text-sm truncate"
            >
              Установить ПИН-код
            </button>
          </div>
          {pinError && (
            <div className="flex items-center gap-1.5 text-xs text-red-500 font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{pinError}</span>
            </div>
          )}
        </form>
      )}

      {/* STATE 2: CONFIGURED BUT LOCKED */}
      {configured && !unlocked && (
        <div className="space-y-2.5 pt-1">
          <form onSubmit={handleUnlock} className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={16}
                placeholder="Введите ПИН-код для доступа"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                className={`w-full px-3 py-1.5 rounded-lg border font-mono text-xs outline-none ${
                  theme === 'dark'
                    ? 'bg-slate-900 border-slate-700 text-slate-200 focus:border-amber-500'
                    : 'bg-white border-slate-300 text-slate-800 focus:border-amber-500'
                }`}
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Разблокировать</span>
            </button>
          </form>

          <div className="flex items-center justify-between pt-1">
            {pinError ? (
              <div className="flex items-center gap-1.5 text-xs text-red-500 font-medium">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{pinError}</span>
              </div>
            ) : <div />}

            <button
              type="button"
              onClick={handlePromptResetVault}
              className={`text-[11px] underline transition-colors cursor-pointer ${
                theme === 'dark' ? 'text-slate-500 hover:text-red-400' : 'text-slate-400 hover:text-red-600'
              }`}
            >
              Забыли ПИН-код? Сбросить хранилище
            </button>
          </div>
        </div>
      )}

      {/* STATE 3: UNLOCKED */}
      {configured && unlocked && (
        <div className="space-y-3 pt-1">
          {/* ADD SECRET FORM */}
          <form onSubmit={handleAddSecret} className="space-y-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Имя (напр. ch_prod)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className={`w-full sm:w-40 px-3 py-1.5 rounded-lg border font-mono text-xs outline-none shrink-0 ${
                  theme === 'dark'
                    ? 'bg-slate-900 border-slate-700 text-slate-200 focus:border-blue-500'
                    : 'bg-white border-slate-300 text-slate-800 focus:border-blue-500'
                }`}
              />
              <div className="flex-1 min-w-0 flex gap-2">
                <input
                  type="text"
                  placeholder="Значение / URI подключения"
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.target.value)}
                  className={`flex-1 min-w-0 px-3 py-1.5 rounded-lg border font-mono text-xs outline-none ${
                    theme === 'dark'
                      ? 'bg-slate-900 border-slate-700 text-slate-200 focus:border-blue-500'
                      : 'bg-white border-slate-300 text-slate-800 focus:border-blue-500'
                  }`}
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить</span>
                </button>
              </div>
            </div>
            {secretError && (
              <div className="flex items-center gap-1.5 text-xs text-red-500 font-medium">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{secretError}</span>
              </div>
            )}

            {/* CLICKHOUSE URI FORMAT COPYABLE HINT */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] pt-0.5">
              <span className={theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}>
                ClickHouse URI:
              </span>
              <button
                type="button"
                onClick={handleCopyUriFormat}
                title="Нажмите, чтобы скопировать шаблон URI"
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[10px] border transition-colors cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-slate-900 border-slate-700 text-amber-300 hover:border-amber-500/50 hover:bg-slate-800'
                    : 'bg-white border-amber-200 text-amber-900 hover:border-amber-400 hover:bg-amber-50'
                }`}
              >
                <span>https://login:password@host:8443/database</span>
                {copiedFormat ? (
                  <Check className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Copy className="w-3 h-3 opacity-60 hover:opacity-100" />
                )}
              </button>
            </div>
          </form>

          {/* SECRETS LIST */}
          <div className="space-y-1.5">
            {secrets.length === 0 ? (
              <div className={`p-3 rounded-lg border text-center text-xs ${
                theme === 'dark' ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'
              }`}>
                Нет сохраненных ключей. Добавьте первый ключ выше.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-0.5">
                {secrets.map((sec) => {
                  const isVisible = Boolean(showValues[sec.name]);
                  const isCh = sec.name.startsWith('ch_');
                  return (
                    <div
                      key={sec.name}
                      className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-xs transition-colors ${
                        theme === 'dark'
                          ? 'bg-slate-900/80 border-slate-700/80 text-slate-200'
                          : 'bg-white border-slate-200 text-slate-800 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={`font-mono font-bold truncate ${
                          isCh
                            ? (theme === 'dark' ? 'text-amber-400' : 'text-amber-700')
                            : (theme === 'dark' ? 'text-blue-400' : 'text-blue-700')
                        }`}>
                          {sec.name}
                        </span>
                        <span className="text-slate-500 font-mono text-[10px] shrink-0">→</span>
                        <span className="font-mono text-[11px] truncate text-slate-400 flex-1">
                          {isVisible ? sec.value : '••••••••••••••••'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setShowValues((prev) => ({ ...prev, [sec.name]: !prev[sec.name] }))
                          }
                          className={`p-1 rounded transition-colors ${
                            theme === 'dark' ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
                          }`}
                          title={isVisible ? 'Скрыть значение' : 'Показать значение'}
                        >
                          {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyValue(sec.name, sec.value)}
                          className={`p-1 rounded transition-colors ${
                            theme === 'dark' ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
                          }`}
                          title="Скопировать значение"
                        >
                          {copiedKey === sec.name ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSecret(sec.name)}
                          className={`p-1 rounded transition-colors ${
                            theme === 'dark' ? 'hover:bg-slate-800 text-red-400' : 'hover:bg-slate-100 text-red-500'
                          }`}
                          title="Удалить ключ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* CHANGE PIN TOGGLE & FORM */}
          <div className="pt-1">
            {!isChangingPin ? (
              <button
                type="button"
                onClick={() => setIsChangingPin(true)}
                className={`text-[11px] underline transition-colors ${
                  theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Сменить ПИН-код
              </button>
            ) : (
              <form onSubmit={handleChangePin} className={`p-3 rounded-lg border space-y-2 ${
                theme === 'dark' ? 'bg-slate-900/60 border-slate-700' : 'bg-white border-slate-200'
              }`}>
                <div className="text-[11px] font-bold">Смена ПИН-кода</div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="password"
                    inputMode="numeric"
                    placeholder="Текущий ПИН"
                    value={oldPin}
                    onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ''))}
                    className={`px-2.5 py-1 rounded border text-xs outline-none ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-600' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    placeholder="Новый ПИН (4+ цифр)"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    className={`px-2.5 py-1 rounded border text-xs outline-none ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-600' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="px-2.5 py-1 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500"
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangingPin(false);
                      setOldPin('');
                      setNewPin('');
                      setChangePinError(null);
                    }}
                    className={`px-2.5 py-1 rounded border text-xs ${
                      theme === 'dark' ? 'border-slate-700 text-slate-300' : 'border-slate-300 text-slate-700'
                    }`}
                  >
                    Отмена
                  </button>
                  {changePinSuccess && (
                    <span className="text-xs text-emerald-500 font-semibold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      ПИН изменен
                    </span>
                  )}
                </div>
                {changePinError && (
                  <div className="text-xs text-red-500 font-medium">{changePinError}</div>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
