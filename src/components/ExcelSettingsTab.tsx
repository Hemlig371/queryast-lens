import React, { useState, useEffect } from 'react';
import { RotateCcw, FileSpreadsheet, Palette, Columns, Calculator, Printer, Save, Trash2, Bookmark, Copy, Check } from 'lucide-react';
import { ExcelSettings, ExcelPreset } from '../types/excelSettings';
import {
  CLASSIC_PRESET_ID,
  getSavedExcelPresets,
  saveOrUpdateExcelPreset,
  deleteExcelPreset
} from '../utils/excelSettingsStorage';

interface ExcelSettingsTabProps {
  theme: 'light' | 'dark';
  excelSettings: ExcelSettings;
  updateExcel: (partial: Partial<ExcelSettings>) => void;
  handleResetExcel: () => void;
}

export const ExcelSettingsTab: React.FC<ExcelSettingsTabProps> = ({
  theme,
  excelSettings,
  updateExcel,
  handleResetExcel,
}) => {
  const [presets, setPresets] = useState<ExcelPreset[]>(() => getSavedExcelPresets());
  const [selectedPresetId, setSelectedPresetId] = useState<string>(CLASSIC_PRESET_ID);
  const [presetNameInput, setPresetNameInput] = useState<string>('');
  const [savedFeedback, setSavedFeedback] = useState<boolean>(false);
  const [copiedTemplate, setCopiedTemplate] = useState<boolean>(false);

  const sampleSqlComment = '/* #Заголовок ##Подзаголовок @preset:ИмяПресета @file:ИмяФайла @sheet:ИмяЛиста @totals:SUM @split:№/Имя @group:№/Имя @group_cols:№ @group_hide:true @skip:№/Имя @protect:12345 */';

  const handleCopySqlCommentTemplate = () => {
    navigator.clipboard.writeText(sampleSqlComment);
    setCopiedTemplate(true);
    setTimeout(() => setCopiedTemplate(false), 2000);
  };

  // Sync preset name input when selection changes
  const handleSelectPreset = (id: string) => {
    setSelectedPresetId(id);
    const target = presets.find(p => p.id === id);
    if (target) {
      updateExcel(target.settings);
      if (!target.isBuiltIn && id !== CLASSIC_PRESET_ID) {
        setPresetNameInput(target.name);
      } else {
        setPresetNameInput('');
      }
    }
  };

  const handleSavePreset = () => {
    const isUserPreset = selectedPresetId !== CLASSIC_PRESET_ID;
    const targetName = presetNameInput.trim() || (isUserPreset ? presets.find(p => p.id === selectedPresetId)?.name || 'Пользовательский' : 'Мой пресет');
    
    // If we're updating a user preset and kept the same ID or creating a new one
    const idToUpdate = isUserPreset ? selectedPresetId : null;
    const { presets: updatedPresets, targetId } = saveOrUpdateExcelPreset(idToUpdate, targetName, excelSettings);
    
    setPresets(updatedPresets);
    setSelectedPresetId(targetId);
    setPresetNameInput(targetName);
    
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 1500);
  };

  const handleDeletePreset = () => {
    if (selectedPresetId === CLASSIC_PRESET_ID) return;
    const updated = deleteExcelPreset(selectedPresetId);
    setPresets(updated);
    setSelectedPresetId(CLASSIC_PRESET_ID);
    setPresetNameInput('');
    const classic = updated.find(p => p.id === CLASSIC_PRESET_ID);
    if (classic) {
      updateExcel(classic.settings);
    }
  };

  const cardClass = `p-4 rounded-xl border transition-colors ${
    theme === 'dark'
      ? 'bg-slate-800/50 border-slate-700/80'
      : 'bg-slate-50/80 border-slate-300 shadow-2xs'
  }`;

  const subHeaderClass = `font-bold text-xs uppercase tracking-wide ${
    theme === 'dark' ? 'text-slate-200' : 'text-slate-800'
  }`;

  const labelClass = `block mb-1 text-[11px] font-medium ${
    theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
  }`;

  const inputClass = `px-2.5 py-1.5 rounded border text-xs transition-colors focus:outline-hidden focus:ring-1 focus:ring-blue-500 ${
    theme === 'dark'
      ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500'
      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
  }`;

  const colorPickerClass = `w-7 h-7 min-w-[28px] rounded cursor-pointer border border-slate-300 dark:border-slate-700 bg-transparent p-0.5 shrink-0`;

  const dividerClass = `pt-2 border-t ${
    theme === 'dark' ? 'border-slate-700/50' : 'border-slate-200'
  }`;

  const hintClass = `text-[11px] ${
    theme === 'dark' ? 'text-slate-400' : 'text-slate-600'
  }`;

  const isSelectedCustom = selectedPresetId !== CLASSIC_PRESET_ID;

  return (
    <div className="space-y-6 text-xs">
      {/* HEADER ACTION */}
      <div className={`flex items-center justify-between border-b pb-2 ${
        theme === 'dark' ? 'border-slate-700/50' : 'border-slate-300'
      }`}>
        <div>
          <h3 className={`text-xs uppercase font-bold tracking-wider flex items-center gap-2 ${
            theme === 'dark' ? 'text-slate-200' : 'text-slate-900'
          }`}>
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
            <span>Настройки генерации Excel отчетов</span>
          </h3>
        </div>
        <button
          type="button"
          onClick={() => {
            handleResetExcel();
            setSelectedPresetId(CLASSIC_PRESET_ID);
            setPresetNameInput('');
          }}
          className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors shrink-0 ${
            theme === 'dark'
              ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-slate-100'
              : 'bg-white border-slate-300 text-slate-800 font-bold hover:bg-slate-100 shadow-2xs'
          }`}
          title="Сбросить все настройки экспорта к значениям по умолчанию"
        >
          <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
          <span>Сбросить</span>
        </button>
      </div>

      {/* PRESETS TOOLBAR */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-end gap-2.5">
          {/* Preset Selector */}
          <div className="w-full sm:w-44 md:w-48">
            <label className={labelClass}>
              Пресет:
            </label>
            <select
              value={selectedPresetId}
              onChange={(e) => handleSelectPreset(e.target.value)}
              className={`w-full h-8 ${inputClass} font-medium`}
            >
              <option value={CLASSIC_PRESET_ID}>По умолчанию</option>
              {presets
                .filter((p) => p.id !== CLASSIC_PRESET_ID)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Preset Name Input */}
          <div className="flex-1 min-w-[140px]">
            <label className={labelClass}>
              {isSelectedCustom ? 'Название:' : 'Новый пресет:'}
            </label>
            <input
              type="text"
              value={presetNameInput}
              onChange={(e) => setPresetNameInput(e.target.value)}
              placeholder={isSelectedCustom ? 'Название пресета' : 'Введите название...'}
              className={`w-full h-8 ${inputClass}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSavePreset();
                }
              }}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleSavePreset}
              className={`h-8 flex items-center justify-center gap-1.5 text-xs px-3 rounded border font-semibold transition-all whitespace-nowrap ${
                savedFeedback
                  ? 'bg-emerald-600 border-slate-700 dark:border-slate-700 text-white'
                  : theme === 'dark'
                  ? 'bg-blue-600 hover:bg-blue-500 border-slate-700 text-white shadow-xs'
                  : 'bg-blue-600 hover:bg-blue-700 border-slate-300 text-white shadow-xs'
              }`}
              title={isSelectedCustom ? 'Перезаписать текущий пресет' : 'Сохранить настройки как новый пресет'}
            >
              <Save className="w-3.5 h-3.5 shrink-0" />
              <span>{savedFeedback ? 'Сохранено!' : 'Сохранить'}</span>
            </button>

            {isSelectedCustom && (
              <button
                type="button"
                onClick={handleDeletePreset}
                className={`h-8 flex items-center justify-center gap-1 text-xs px-2.5 rounded border transition-colors shrink-0 ${
                  theme === 'dark'
                    ? 'bg-slate-900 border-slate-700 text-red-400 hover:bg-red-950/40 hover:border-red-700/60'
                    : 'bg-white border-slate-300 text-red-600 hover:bg-red-50 hover:border-red-300'
                }`}
                title="Удалить выбранный пользовательский пресет"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span>Удалить</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 1: СТИЛИ И ЦВЕТА */}
      <div className="space-y-4">
        <div className={`flex items-center gap-2 border-b pb-1.5 ${
          theme === 'dark' ? 'border-blue-500/30' : 'border-blue-500/40'
        }`}>
          <Palette className="w-4 h-4 text-blue-500" />
          <h4 className={`font-bold text-xs uppercase tracking-wider ${
            theme === 'dark' ? 'text-blue-400' : 'text-blue-700'
          }`}>
            1. Стили и Цвета
          </h4>
        </div>

        {/* 1.1 Шрифт, Размеры и Сетка таблицы */}
        <div className={cardClass}>
          <div className={`${subHeaderClass} mb-3`}>
            1.1 Шрифт, размеры и сетка
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-6">
              <label className={labelClass}>
                Шрифт:
              </label>
              <select
                value={excelSettings.fontFamily}
                onChange={(e) => updateExcel({ fontFamily: e.target.value })}
                className={`w-full ${inputClass}`}
              >
                <option value="Segoe UI">Segoe UI</option>
                <option value="Calibri">Calibri</option>
                <option value="Arial">Arial</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Courier New">Courier New</option>
                <option value="Verdana">Verdana</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className={labelClass} title="Размер шрифта заголовка таблицы">
                Заголовок (pt):
              </label>
              <input
                type="number"
                min={8}
                max={20}
                value={excelSettings.headerFontSize}
                onChange={(e) => updateExcel({ headerFontSize: Number(e.target.value) || 11 })}
                className={`w-full ${inputClass}`}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={labelClass} title="Размер шрифта ячеек данных">
                Данные (pt):
              </label>
              <input
                type="number"
                min={8}
                max={20}
                value={excelSettings.dataFontSize}
                onChange={(e) => updateExcel({ dataFontSize: Number(e.target.value) || 10 })}
                className={`w-full ${inputClass}`}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={labelClass} title="Размер шрифта строки и столбца итогов">
                Итоги (pt):
              </label>
              <input
                type="number"
                min={8}
                max={20}
                value={excelSettings.totalFontSize}
                onChange={(e) => updateExcel({ totalFontSize: Number(e.target.value) || 11 })}
                className={`w-full ${inputClass}`}
              />
            </div>
          </div>

          <div className={`${dividerClass} mt-3 pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end`}>
            <div className="sm:col-span-1">
              <label className={labelClass}>
                Границы ячеек:
              </label>
              <select
                value={excelSettings.borderStyle}
                onChange={(e) => updateExcel({ borderStyle: e.target.value as any })}
                className={`w-full ${inputClass}`}
              >
                <option value="thin">Тонкая линия</option>
                <option value="medium">Средняя линия</option>
                <option value="dashed">Штриховая</option>
                <option value="dotted">Пунктирная</option>
                <option value="horizontal_only">Только горизонтальные</option>
                <option value="none">Без границ</option>
              </select>
            </div>

            {excelSettings.borderStyle !== 'none' && (
              <div className="sm:col-span-1">
                <label className={labelClass}>
                  Цвет границ:
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={`#${excelSettings.borderColor}`}
                    onChange={(e) => updateExcel({ borderColor: e.target.value.replace('#', '').toUpperCase() })}
                    className={colorPickerClass}
                  />
                  <input
                    type="text"
                    value={excelSettings.borderColor}
                    onChange={(e) => updateExcel({ borderColor: e.target.value.toUpperCase() })}
                    className={`w-full font-mono uppercase ${inputClass}`}
                  />
                </div>
              </div>
            )}

            <div className="sm:col-span-1">
              <label className={labelClass}>
                Цвет текста данных:
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={`#${excelSettings.dataTextColor || '000000'}`}
                  onChange={(e) => updateExcel({ dataTextColor: e.target.value.replace('#', '').toUpperCase() })}
                  className={colorPickerClass}
                />
                <input
                  type="text"
                  value={excelSettings.dataTextColor || '000000'}
                  onChange={(e) => updateExcel({ dataTextColor: e.target.value.replace('#', '').toUpperCase() })}
                  className={`w-full font-mono uppercase ${inputClass}`}
                />
              </div>
            </div>
          </div>

          <div className="pt-2.5">
            <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
              <input
                type="checkbox"
                checked={excelSettings.showGridLines}
                onChange={(e) => updateExcel({ showGridLines: e.target.checked })}
                className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="text-xs">Отображать сетку листа Excel</span>
            </label>
          </div>
        </div>

        {/* 1.2 Оформление Заголовка Таблицы */}
        <div className={cardClass}>
          <div className={`${subHeaderClass} mb-3`}>
            1.2 Оформление заголовка таблицы
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className={labelClass}>
                Цвет фона:
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={`#${excelSettings.headerBgColor}`}
                  onChange={(e) => updateExcel({ headerBgColor: e.target.value.replace('#', '').toUpperCase() })}
                  className={colorPickerClass}
                />
                <input
                  type="text"
                  value={excelSettings.headerBgColor}
                  onChange={(e) => updateExcel({ headerBgColor: e.target.value.toUpperCase() })}
                  className={`w-full font-mono uppercase ${inputClass}`}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>
                Цвет текста:
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={`#${excelSettings.headerTextColor}`}
                  onChange={(e) => updateExcel({ headerTextColor: e.target.value.replace('#', '').toUpperCase() })}
                  className={colorPickerClass}
                />
                <input
                  type="text"
                  value={excelSettings.headerTextColor}
                  onChange={(e) => updateExcel({ headerTextColor: e.target.value.toUpperCase() })}
                  className={`w-full font-mono uppercase ${inputClass}`}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>
                Границы:
              </label>
              <select
                value={excelSettings.headerBorderStyle || 'thin'}
                onChange={(e) => updateExcel({ headerBorderStyle: e.target.value as any })}
                className={`w-full ${inputClass}`}
              >
                <option value="thin">Тонкая линия</option>
                <option value="medium">Средняя линия</option>
                <option value="dashed">Штриховая</option>
                <option value="dotted">Пунктирная</option>
                <option value="horizontal_only">Только горизонтальные</option>
                <option value="none">Без границ</option>
              </select>
            </div>
          </div>
        </div>

        {/* 1.3 Столбцы категорий */}
        <div className={cardClass}>
          <label className="flex items-center gap-2 font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={excelSettings.enableFirstColumnStyle}
              onChange={(e) => updateExcel({ enableFirstColumnStyle: e.target.checked })}
              className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
            />
            <span className={subHeaderClass}>
              1.3 Столбцы категорий
            </span>
          </label>

          {excelSettings.enableFirstColumnStyle && (
            <div className="flex flex-col gap-3 pt-3 pl-6">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium shrink-0 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                  Количество столбцов:
                </span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={excelSettings.categoryColumnsCount ?? 1}
                  onChange={(e) => updateExcel({ categoryColumnsCount: Math.max(0, Math.min(10, parseInt(e.target.value) || 0)) })}
                  className={`w-20 ${inputClass}`}
                />
                <span className={hintClass}>(0 — отключить выделение)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-1">
                <div>
                  <label className={labelClass}>Цвет фона:</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={`#${excelSettings.firstColumnBgColor}`}
                      onChange={(e) => updateExcel({ firstColumnBgColor: e.target.value.replace('#', '').toUpperCase() })}
                      className={colorPickerClass}
                    />
                    <input
                      type="text"
                      value={excelSettings.firstColumnBgColor}
                      onChange={(e) => updateExcel({ firstColumnBgColor: e.target.value.toUpperCase() })}
                      className={`w-full font-mono uppercase ${inputClass}`}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Цвет текста:</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={`#${excelSettings.firstColumnTextColor}`}
                      onChange={(e) => updateExcel({ firstColumnTextColor: e.target.value.replace('#', '').toUpperCase() })}
                      className={colorPickerClass}
                    />
                    <input
                      type="text"
                      value={excelSettings.firstColumnTextColor}
                      onChange={(e) => updateExcel({ firstColumnTextColor: e.target.value.toUpperCase() })}
                      className={`w-full font-mono uppercase ${inputClass}`}
                    />
                  </div>
                </div>
                <div className="flex items-center pb-2">
                  <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                    <input
                      type="checkbox"
                      checked={excelSettings.firstColumnBold}
                      onChange={(e) => updateExcel({ firstColumnBold: e.target.checked })}
                      className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span className="text-xs">Полужирный шрифт</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Автогруппировка строк по категории */}
          <div className={`${dividerClass} mt-3 pt-3 pl-6 space-y-2.5`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`text-xs shrink-0 ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                Автогруппировка строк по столбцу:
              </span>
              <input
                type="number"
                min={0}
                max={50}
                value={excelSettings.categoryGroupColumn ?? 0}
                onChange={(e) => updateExcel({ categoryGroupColumn: Math.max(0, parseInt(e.target.value) || 0) })}
                className={`w-20 ${inputClass}`}
              />
              <span className={hintClass}>
                (0 — без группировки, 1 — первый столбец данных, 2 — второй и т.д.)
              </span>
            </div>

            {(excelSettings.categoryGroupColumn ?? 0) > 0 && (
              <div className="space-y-2 pt-1">
                <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                  <input
                    type="checkbox"
                    checked={excelSettings.categoryGroupCleanDuplicates ?? false}
                    onChange={(e) => updateExcel({ categoryGroupCleanDuplicates: e.target.checked })}
                    className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <span className="text-xs">
                    Очищать повторяющиеся значения категорий (псевдо-объединение)
                  </span>
                </label>

                <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                  <input
                    type="checkbox"
                    checked={excelSettings.categoryGroupCollapse ?? false}
                    onChange={(e) => updateExcel({ categoryGroupCollapse: e.target.checked })}
                    className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <span className="text-xs">
                    Свернуть группы при открытии файла в Excel
                  </span>
                </label>

                <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                  <input
                    type="checkbox"
                    checked={excelSettings.categoryGroupFormatSubtotals ?? false}
                    onChange={(e) => updateExcel({ categoryGroupFormatSubtotals: e.target.checked })}
                    className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <span className="text-xs">
                    Выделять первую строку категории как подытог
                  </span>
                </label>

                {excelSettings.categoryGroupFormatSubtotals && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-2 pl-6">
                    <div>
                      <label className={labelClass}>Цвет фона подытога:</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={`#${excelSettings.categorySubtotalBgColor || 'E2E8F0'}`}
                          onChange={(e) => updateExcel({ categorySubtotalBgColor: e.target.value.replace('#', '').toUpperCase() })}
                          className={colorPickerClass}
                        />
                        <input
                          type="text"
                          value={excelSettings.categorySubtotalBgColor || 'E2E8F0'}
                          onChange={(e) => updateExcel({ categorySubtotalBgColor: e.target.value.toUpperCase() })}
                          className={`w-full font-mono uppercase ${inputClass}`}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Цвет текста подытога:</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={`#${excelSettings.categorySubtotalTextColor || '0F172A'}`}
                          onChange={(e) => updateExcel({ categorySubtotalTextColor: e.target.value.replace('#', '').toUpperCase() })}
                          className={colorPickerClass}
                        />
                        <input
                          type="text"
                          value={excelSettings.categorySubtotalTextColor || '0F172A'}
                          onChange={(e) => updateExcel({ categorySubtotalTextColor: e.target.value.toUpperCase() })}
                          className={`w-full font-mono uppercase ${inputClass}`}
                        />
                      </div>
                    </div>
                    <div className="flex items-center pb-2">
                      <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                        <input
                          type="checkbox"
                          checked={excelSettings.categorySubtotalBold ?? true}
                          onChange={(e) => updateExcel({ categorySubtotalBold: e.target.checked })}
                          className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
                        />
                        <span className="text-xs">Полужирный шрифт</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 1.4 Чередование строк и столбцов */}
        <div className={cardClass}>
          <div className={`${subHeaderClass} mb-3`}>
            1.4 Чередование строк и столбцов
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                <input
                  type="checkbox"
                  checked={excelSettings.enableRowZebra}
                  onChange={(e) => updateExcel({ enableRowZebra: e.target.checked })}
                  className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-xs">Чередовать цвет строк</span>
              </label>
              {excelSettings.enableRowZebra && (
                <div className="flex items-center gap-2 pl-6">
                  <span className={hintClass}>Цвет строк:</span>
                  <input
                    type="color"
                    value={`#${excelSettings.rowZebraBgColor}`}
                    onChange={(e) => updateExcel({ rowZebraBgColor: e.target.value.replace('#', '').toUpperCase() })}
                    className={colorPickerClass}
                  />
                  <input
                    type="text"
                    value={excelSettings.rowZebraBgColor}
                    onChange={(e) => updateExcel({ rowZebraBgColor: e.target.value.toUpperCase() })}
                    className={`w-24 font-mono uppercase ${inputClass}`}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                <input
                  type="checkbox"
                  checked={excelSettings.enableColumnZebra}
                  onChange={(e) => updateExcel({ enableColumnZebra: e.target.checked })}
                  className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-xs">Чередовать цвет столбцов</span>
              </label>
              {excelSettings.enableColumnZebra && (
                <div className="flex items-center gap-2 pl-6">
                  <span className={hintClass}>Цвет столбцов:</span>
                  <input
                    type="color"
                    value={`#${excelSettings.columnZebraBgColor}`}
                    onChange={(e) => updateExcel({ columnZebraBgColor: e.target.value.replace('#', '').toUpperCase() })}
                    className={colorPickerClass}
                  />
                  <input
                    type="text"
                    value={excelSettings.columnZebraBgColor}
                    onChange={(e) => updateExcel({ columnZebraBgColor: e.target.value.toUpperCase() })}
                    className={`w-24 font-mono uppercase ${inputClass}`}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: ДАННЫЕ И ЯЧЕЙКИ */}
      <div className="space-y-4 pt-2">
        <div className={`flex items-center gap-2 border-b pb-1.5 ${
          theme === 'dark' ? 'border-blue-500/30' : 'border-blue-500/40'
        }`}>
          <Columns className="w-4 h-4 text-blue-500" />
          <h4 className={`font-bold text-xs uppercase tracking-wider ${
            theme === 'dark' ? 'text-blue-400' : 'text-blue-700'
          }`}>
            2. Данные и Ячейки
          </h4>
        </div>

        {/* 2.1 Выравнивание текста и чисел */}
        <div className={cardClass}>
          <div className={`${subHeaderClass} mb-3`}>
            2.1 Выравнивание значений
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Текст:</label>
              <select
                value={excelSettings.textAlignHorizontal}
                onChange={(e) => updateExcel({ textAlignHorizontal: e.target.value as any })}
                className={`w-full ${inputClass}`}
              >
                <option value="left">По левому краю</option>
                <option value="center">По центру</option>
                <option value="right">По правому краю</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Числа:</label>
              <select
                value={excelSettings.numericAlignHorizontal}
                onChange={(e) => updateExcel({ numericAlignHorizontal: e.target.value as any })}
                className={`w-full ${inputClass}`}
              >
                <option value="right">По правому краю</option>
                <option value="center">По центру</option>
                <option value="left">По левому краю</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Даты:</label>
              <select
                value={excelSettings.dateAlignHorizontal}
                onChange={(e) => updateExcel({ dateAlignHorizontal: e.target.value as any })}
                className={`w-full ${inputClass}`}
              >
                <option value="center">По центру</option>
                <option value="left">По левому краю</option>
                <option value="right">По правому краю</option>
              </select>
            </div>
          </div>
        </div>

        {/* 2.2 Ширина столбцов и Перенос текста */}
        <div className={cardClass}>
          <div className={`${subHeaderClass} mb-3`}>
            2.2 Ширина столбцов и перенос текста
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                <input
                  type="checkbox"
                  checked={excelSettings.autoColumnWidth}
                  onChange={(e) => updateExcel({ autoColumnWidth: e.target.checked })}
                  className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-xs">Автоподбор ширины столбцов</span>
              </label>

              {excelSettings.autoColumnWidth ? (
                <div className="pl-6 space-y-1">
                  <label className={labelClass}>
                    Максимальная ширина (символов):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={12}
                      max={250}
                      value={excelSettings.maxColumnWidth || 50}
                      onChange={(e) => updateExcel({ maxColumnWidth: Math.max(10, Math.min(300, Number(e.target.value) || 50)) })}
                      className={`w-24 ${inputClass}`}
                    />
                    <span className={hintClass}>
                      (по умолчанию 50)
                    </span>
                  </div>
                </div>
              ) : (
                <div className="pl-6 space-y-1">
                  <label className={labelClass}>
                    Фиксированная ширина (символов):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={10}
                      max={200}
                      value={excelSettings.fixedColumnWidth || 18}
                      onChange={(e) => updateExcel({ fixedColumnWidth: Math.max(8, Math.min(200, Number(e.target.value) || 18)) })}
                      className={`w-24 ${inputClass}`}
                    />
                    <span className={hintClass}>
                      (по умолчанию 18)
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                <input
                  type="checkbox"
                  checked={excelSettings.wrapText}
                  onChange={(e) => updateExcel({ wrapText: e.target.checked })}
                  className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-xs">Перенос текста по словам</span>
              </label>
              <p className={`pl-6 ${hintClass}`}>
                Автоматический перенос строк в ячейках с длинным текстом.
              </p>
            </div>
          </div>
        </div>

        {/* 2.3 Форматирование Чисел и Дат */}
        <div className={cardClass}>
          <div className={`${subHeaderClass} mb-3`}>
            2.3 Формат чисел и дат
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>
                Формат чисел:
              </label>
              <select
                value={excelSettings.numberFormat}
                onChange={(e) => updateExcel({ numberFormat: e.target.value as any })}
                className={`w-full ${inputClass}`}
              >
                <option value="raw">Исходный (без форматирования)</option>
                <option value="integer">Целые (1 250 000)</option>
                <option value="decimal2">Дробные с 2 знаками (1 250 000.00)</option>
                <option value="custom">Пользовательский формат...</option>
              </select>
            </div>

            {excelSettings.numberFormat === 'custom' && (
              <div>
                <label className={labelClass}>
                  Маска формата:
                </label>
                <input
                  type="text"
                  placeholder="#,##0.00 ₽"
                  value={excelSettings.customNumberFormat}
                  onChange={(e) => updateExcel({ customNumberFormat: e.target.value })}
                  className={`w-full font-mono ${inputClass}`}
                />
              </div>
            )}

            <div>
              <label className={labelClass}>
                Формат дат:
              </label>
              <select
                value={excelSettings.dateFormat}
                onChange={(e) => updateExcel({ dateFormat: e.target.value as any })}
                className={`w-full ${inputClass}`}
              >
                <option value="DD.MM.YYYY">DD.MM.YYYY (31.12.2025)</option>
                <option value="DD.MM.YYYY HH:MM:SS">DD.MM.YYYY HH:MM:SS (31.12.2025 14:30:00)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (2025-12-31)</option>
              </select>
            </div>
          </div>
        </div>

        {/* 2.4 Служебные элементы */}
        <div className={cardClass}>
          <div className={`${subHeaderClass} mb-3`}>
            2.4 Служебные строки и столбцы
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
              <input
                type="checkbox"
                checked={excelSettings.enableRowIndexColumn ?? false}
                onChange={(e) => updateExcel({ enableRowIndexColumn: e.target.checked })}
                className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="font-medium">Столбец нумерации строк (№ п/п)</span>
            </label>

            <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
              <input
                type="checkbox"
                checked={excelSettings.enableColumnIndexRow ?? false}
                onChange={(e) => updateExcel({ enableColumnIndexRow: e.target.checked })}
                className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="font-medium">Строка нумерации столбцов (1, 2, 3...)</span>
            </label>

            <label className={`flex items-center gap-2 cursor-pointer sm:col-span-2 ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
              <input
                type="checkbox"
                checked={excelSettings.showZeroValues ?? true}
                onChange={(e) => updateExcel({ showZeroValues: e.target.checked })}
                className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="font-medium">Отображать нулевые значения (0)</span>
            </label>

            <div className={`sm:col-span-2 ${dividerClass} pt-3 flex flex-wrap items-center gap-3`}>
              <span className={`text-xs shrink-0 ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                Исключить столбец из отчета:
              </span>
              <input
                type="number"
                min={0}
                max={50}
                value={excelSettings.skipColumnIndex ?? 0}
                onChange={(e) => {
                  const val = Math.max(0, parseInt(e.target.value) || 0);
                  updateExcel({ skipColumnIndex: val > 0 ? val : null });
                }}
                className={`w-20 ${inputClass}`}
              />
              <span className={hintClass}>
                (0 — не исключать, 1 — первый столбец, 2 — второй и т.д.)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: ЗАГОЛОВОК ОТЧЕТА И ИТОГИ */}
      <div className="space-y-4 pt-2">
        <div className={`flex items-center gap-2 border-b pb-1.5 ${
          theme === 'dark' ? 'border-blue-500/30' : 'border-blue-500/40'
        }`}>
          <Calculator className="w-4 h-4 text-blue-500" />
          <h4 className={`font-bold text-xs uppercase tracking-wider ${
            theme === 'dark' ? 'text-blue-400' : 'text-blue-700'
          }`}>
            3. Заголовок отчета и Итоги
          </h4>
        </div>

        {/* 3.1 Заголовок отчета */}
        <div className={cardClass}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className={subHeaderClass}>3.1 Заголовок отчета</span>
            <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
              <input
                type="checkbox"
                checked={excelSettings.enableReportTitle}
                onChange={(e) => updateExcel({ enableReportTitle: e.target.checked })}
                className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
              />
              <span className="text-[11px]">Добавить заголовок отчета</span>
            </label>
          </div>

          {excelSettings.enableReportTitle && (
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelClass}>Заголовок:</label>
                  <input
                    type="text"
                    value={excelSettings.reportTitle}
                    onChange={(e) => updateExcel({ reportTitle: e.target.value })}
                    className={`w-full ${inputClass}`}
                    placeholder="ЗАГОЛОВОК"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Подзаголовок:</label>
                  <input
                    type="text"
                    value={excelSettings.reportSubtitle}
                    onChange={(e) => updateExcel({ reportSubtitle: e.target.value })}
                    className={`w-full ${inputClass}`}
                    placeholder="Введите подзаголовок..."
                  />
                </div>
              </div>
              {/* TITLE STYLE */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Размер (pt):</label>
                  <input
                    type="number"
                    value={excelSettings.reportTitleFontSize}
                    onChange={(e) => updateExcel({ reportTitleFontSize: Number(e.target.value) })}
                    min="8" max="48"
                    className={`w-full ${inputClass}`}
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className={labelClass}>Цвет текста:</label>
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="color"
                      value={`#${excelSettings.reportTitleColor}`}
                      onChange={(e) => updateExcel({ reportTitleColor: e.target.value.replace('#', '').toUpperCase() })}
                      className={colorPickerClass}
                    />
                    <input
                      type="text"
                      value={excelSettings.reportTitleColor}
                      onChange={(e) => updateExcel({ reportTitleColor: e.target.value.replace('#', '').toUpperCase() })}
                      className={`w-full font-mono uppercase ${inputClass}`}
                    />
                  </div>
                </div>
                <div className="sm:col-span-3">
                  <label className={labelClass}>Цвет фона:</label>
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="color"
                      value={`#${excelSettings.reportTitleBgColor}`}
                      onChange={(e) => updateExcel({ reportTitleBgColor: e.target.value.replace('#', '').toUpperCase() })}
                      className={colorPickerClass}
                    />
                    <input
                      type="text"
                      value={excelSettings.reportTitleBgColor}
                      onChange={(e) => updateExcel({ reportTitleBgColor: e.target.value.replace('#', '').toUpperCase() })}
                      className={`w-full font-mono uppercase ${inputClass}`}
                    />
                  </div>
                </div>
                <div className="sm:col-span-4 pb-2 flex items-center gap-3">
                  <label className={`flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                    <input
                      type="checkbox"
                      checked={excelSettings.reportTitleBold}
                      onChange={(e) => updateExcel({ reportTitleBold: e.target.checked })}
                      className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 shrink-0"
                    />
                    <span className="text-xs">Полужирный</span>
                  </label>
                  <label className={`flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                    <input
                      type="checkbox"
                      checked={excelSettings.reportTitleItalic}
                      onChange={(e) => updateExcel({ reportTitleItalic: e.target.checked })}
                      className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 shrink-0"
                    />
                    <span className="text-xs">Курсив</span>
                  </label>
                </div>
              </div>

              {/* SUBTITLE STYLE */}
              <div className={`${dividerClass} grid grid-cols-1 sm:grid-cols-12 gap-3 items-end mt-3 pt-3`}>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Размер (pt):</label>
                  <input
                    type="number"
                    value={excelSettings.reportSubtitleFontSize}
                    onChange={(e) => updateExcel({ reportSubtitleFontSize: Number(e.target.value) })}
                    min="6" max="48"
                    className={`w-full ${inputClass}`}
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className={labelClass}>Цвет текста:</label>
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="color"
                      value={`#${excelSettings.reportSubtitleColor}`}
                      onChange={(e) => updateExcel({ reportSubtitleColor: e.target.value.replace('#', '').toUpperCase() })}
                      className={colorPickerClass}
                    />
                    <input
                      type="text"
                      value={excelSettings.reportSubtitleColor}
                      onChange={(e) => updateExcel({ reportSubtitleColor: e.target.value.replace('#', '').toUpperCase() })}
                      className={`w-full font-mono uppercase ${inputClass}`}
                    />
                  </div>
                </div>
                <div className="sm:col-span-3">
                  <label className={labelClass}>Цвет фона:</label>
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="color"
                      value={`#${excelSettings.reportSubtitleBgColor}`}
                      onChange={(e) => updateExcel({ reportSubtitleBgColor: e.target.value.replace('#', '').toUpperCase() })}
                      className={colorPickerClass}
                    />
                    <input
                      type="text"
                      value={excelSettings.reportSubtitleBgColor}
                      onChange={(e) => updateExcel({ reportSubtitleBgColor: e.target.value.replace('#', '').toUpperCase() })}
                      className={`w-full font-mono uppercase ${inputClass}`}
                    />
                  </div>
                </div>
                <div className="sm:col-span-4 pb-2 flex items-center gap-3">
                  <label className={`flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                    <input
                      type="checkbox"
                      checked={excelSettings.reportSubtitleBold}
                      onChange={(e) => updateExcel({ reportSubtitleBold: e.target.checked })}
                      className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 shrink-0"
                    />
                    <span className="text-xs">Полужирный</span>
                  </label>
                  <label className={`flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                    <input
                      type="checkbox"
                      checked={excelSettings.reportSubtitleItalic}
                      onChange={(e) => updateExcel({ reportSubtitleItalic: e.target.checked })}
                      className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 shrink-0"
                    />
                    <span className="text-xs">Курсив</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3.2 Итоговая Строка */}
        <div className={cardClass}>
          <div className="space-y-2">
            <span className={subHeaderClass}>
              3.2 Строка итогов
            </span>
            <div className="flex flex-wrap gap-4 pt-3">
              <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                <input
                  type="radio"
                  name="totalsRowMode"
                  checked={!excelSettings.enableTotalsRow && !excelSettings.formatExistingRowAsTotal}
                  onChange={() => updateExcel({ enableTotalsRow: false, formatExistingRowAsTotal: false })}
                  className="border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-xs">
                  Отключено
                </span>
              </label>

              <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                <input
                  type="radio"
                  name="totalsRowMode"
                  checked={excelSettings.enableTotalsRow}
                  onChange={() => updateExcel({ enableTotalsRow: true, formatExistingRowAsTotal: false })}
                  className="border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-xs">
                  Вычисляемая строка (формула Excel)
                </span>
              </label>

              <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                <input
                  type="radio"
                  name="totalsRowMode"
                  checked={excelSettings.formatExistingRowAsTotal ?? false}
                  onChange={() => updateExcel({ enableTotalsRow: false, formatExistingRowAsTotal: true })}
                  className="border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-xs">
                  Форматировать строку как итог
                </span>
              </label>
            </div>
          </div>

          {(excelSettings.enableTotalsRow || excelSettings.formatExistingRowAsTotal) && (
            <div className="space-y-3 pl-6 pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Положение:</label>
                  <select
                    value={excelSettings.totalsRowPosition}
                    onChange={(e) => updateExcel({ totalsRowPosition: e.target.value as any })}
                    className={`w-full ${inputClass}`}
                  >
                    <option value="bottom">Внизу таблицы (последняя строка)</option>
                    <option value="top">Вверху таблицы (первая строка)</option>
                  </select>
                </div>

                {excelSettings.enableTotalsRow ? (
                  <div>
                    <label className={labelClass}>Функция формулы:</label>
                    <select
                      value={excelSettings.totalsRowFunction}
                      onChange={(e) => updateExcel({ totalsRowFunction: e.target.value as any })}
                      className={`w-full ${inputClass}`}
                    >
                      <option value="SUM">Сумма (SUM)</option>
                      <option value="AVERAGE">Среднее (AVERAGE)</option>
                      <option value="COUNT">Количество (COUNTA)</option>
                    </select>
                  </div>
                ) : (
                  <div className="flex items-center pt-5">
                    <span className={hintClass}>
                      Значения берутся из результата SQL-запроса
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-1">
                <div>
                  <label className={labelClass}>Цвет фона:</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={`#${excelSettings.totalsRowBgColor}`}
                      onChange={(e) => updateExcel({ totalsRowBgColor: e.target.value.replace('#', '').toUpperCase() })}
                      className={colorPickerClass}
                    />
                    <input
                      type="text"
                      value={excelSettings.totalsRowBgColor}
                      onChange={(e) => updateExcel({ totalsRowBgColor: e.target.value.toUpperCase() })}
                      className={`w-full font-mono uppercase ${inputClass}`}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Цвет текста:</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={`#${excelSettings.totalsRowTextColor}`}
                      onChange={(e) => updateExcel({ totalsRowTextColor: e.target.value.replace('#', '').toUpperCase() })}
                      className={colorPickerClass}
                    />
                    <input
                      type="text"
                      value={excelSettings.totalsRowTextColor}
                      onChange={(e) => updateExcel({ totalsRowTextColor: e.target.value.toUpperCase() })}
                      className={`w-full font-mono uppercase ${inputClass}`}
                    />
                  </div>
                </div>
                <div className="flex items-center pb-2">
                  <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                    <input
                      type="checkbox"
                      checked={excelSettings.totalsRowBold}
                      onChange={(e) => updateExcel({ totalsRowBold: e.target.checked })}
                      className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span className="text-xs">Полужирный</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3.3 Итоговый Столбец */}
        <div className={cardClass}>
          <div className="space-y-2">
            <span className={subHeaderClass}>
              3.3 Столбец итогов
            </span>
            <div className="flex flex-wrap gap-4 pt-3">
              <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                <input
                  type="radio"
                  name="totalsColumnMode"
                  checked={!excelSettings.enableTotalsColumn && !excelSettings.formatExistingColumnAsTotal}
                  onChange={() => updateExcel({ enableTotalsColumn: false, formatExistingColumnAsTotal: false })}
                  className="border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-xs">
                  Отключено
                </span>
              </label>

              <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                <input
                  type="radio"
                  name="totalsColumnMode"
                  checked={excelSettings.enableTotalsColumn}
                  onChange={() => updateExcel({ enableTotalsColumn: true, formatExistingColumnAsTotal: false })}
                  className="border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-xs">
                  Вычисляемый столбец (формула Excel)
                </span>
              </label>

              <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                <input
                  type="radio"
                  name="totalsColumnMode"
                  checked={excelSettings.formatExistingColumnAsTotal ?? false}
                  onChange={() => updateExcel({ enableTotalsColumn: false, formatExistingColumnAsTotal: true })}
                  className="border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-xs">
                  Форматировать столбец как итог
                </span>
              </label>
            </div>
          </div>

          {(excelSettings.enableTotalsColumn || excelSettings.formatExistingColumnAsTotal) && (
            <div className="space-y-3 pl-6 pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Положение:</label>
                  <select
                    value={excelSettings.totalsColumnPosition}
                    onChange={(e) => updateExcel({ totalsColumnPosition: e.target.value as any })}
                    className={`w-full ${inputClass}`}
                  >
                    <option value="right">Справа (последний столбец)</option>
                    <option value="left">Слева (после категорий)</option>
                  </select>
                </div>

                {excelSettings.enableTotalsColumn ? (
                  <div>
                    <label className={labelClass}>Функция формулы:</label>
                    <select
                      value={excelSettings.totalsColumnFunction}
                      onChange={(e) => updateExcel({ totalsColumnFunction: e.target.value as any })}
                      className={`w-full ${inputClass}`}
                    >
                      <option value="SUM">Сумма (SUM)</option>
                      <option value="AVERAGE">Среднее (AVERAGE)</option>
                      <option value="COUNT">Количество (COUNTA)</option>
                    </select>
                  </div>
                ) : (
                  <div className="flex items-center pt-5">
                    <span className={hintClass}>
                      Значения берутся из результата SQL-запроса
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-1">
                <div>
                  <label className={labelClass}>Цвет фона:</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={`#${excelSettings.totalsColumnBgColor}`}
                      onChange={(e) => updateExcel({ totalsColumnBgColor: e.target.value.replace('#', '').toUpperCase() })}
                      className={colorPickerClass}
                    />
                    <input
                      type="text"
                      value={excelSettings.totalsColumnBgColor}
                      onChange={(e) => updateExcel({ totalsColumnBgColor: e.target.value.toUpperCase() })}
                      className={`w-full font-mono uppercase ${inputClass}`}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Цвет текста:</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={`#${excelSettings.totalsColumnTextColor}`}
                      onChange={(e) => updateExcel({ totalsColumnTextColor: e.target.value.replace('#', '').toUpperCase() })}
                      className={colorPickerClass}
                    />
                    <input
                      type="text"
                      value={excelSettings.totalsColumnTextColor}
                      onChange={(e) => updateExcel({ totalsColumnTextColor: e.target.value.toUpperCase() })}
                      className={`w-full font-mono uppercase ${inputClass}`}
                    />
                  </div>
                </div>
                <div className="flex items-center pb-2">
                  <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                    <input
                      type="checkbox"
                      checked={excelSettings.totalsColumnBold}
                      onChange={(e) => updateExcel({ totalsColumnBold: e.target.checked })}
                      className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span className="text-xs">Полужирный</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 4: ЛИСТЫ И ПЕЧАТЬ */}
      <div className="space-y-4 pt-2">
        <div className={`flex items-center gap-2 border-b pb-1.5 ${
          theme === 'dark' ? 'border-blue-500/30' : 'border-blue-500/40'
        }`}>
          <Printer className="w-4 h-4 text-blue-500" />
          <h4 className={`font-bold text-xs uppercase tracking-wider ${
            theme === 'dark' ? 'text-blue-400' : 'text-blue-700'
          }`}>
            4. Листы и Печать
          </h4>
        </div>

        {/* 4.1 Файл и Листы */}
        <div className={cardClass}>
          <div className={`${subHeaderClass} mb-3`}>
            4.1 Файл и листы
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>
                Имя файла:
              </label>
              <input
                type="text"
                value={excelSettings.defaultFileName}
                onChange={(e) => updateExcel({ defaultFileName: e.target.value || 'report' })}
                className={`w-full ${inputClass}`}
              />
            </div>

            <div>
              <label className={labelClass}>
                Имя основного листа:
              </label>
              <input
                type="text"
                value={excelSettings.defaultSheetName}
                onChange={(e) => updateExcel({ defaultSheetName: e.target.value || 'Отчет' })}
                className={`w-full ${inputClass}`}
              />
            </div>

            <div>
              <label className={labelClass}>
                Имя листа со справкой/SQL:
              </label>
              <input
                type="text"
                value={excelSettings.sqlSheetName}
                onChange={(e) => updateExcel({ sqlSheetName: e.target.value || 'Метаданные' })}
                disabled={!excelSettings.includeSqlSheet}
                className={`w-full ${inputClass} ${!excelSettings.includeSqlSheet ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
            </div>

            <div>
              <label className={labelClass}>
                Разбить на листы (номер столбца):
              </label>
              <input
                type="number"
                min="1"
                value={excelSettings.splitByColumnIndex || ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  updateExcel({ splitByColumnIndex: isNaN(val) ? null : val });
                }}
                className={`w-full ${inputClass}`}
                placeholder="Например: 1"
              />
            </div>
          </div>

          <div className={`${dividerClass} flex flex-col gap-2 mt-3`}>
            <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
              <input
                type="checkbox"
                checked={excelSettings.includeSqlSheet}
                onChange={(e) => updateExcel({ includeSqlSheet: e.target.checked })}
                className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="font-semibold">Добавлять лист с SQL-запросом и метаданными</span>
            </label>

            {excelSettings.includeSqlSheet && (
              <label className={`flex items-center gap-2 pl-6 cursor-pointer ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                <input
                  type="checkbox"
                  checked={excelSettings.hideSqlSheet}
                  onChange={(e) => updateExcel({ hideSqlSheet: e.target.checked })}
                  className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-xs">Скрыть служебный лист в книге</span>
              </label>
            )}
          </div>

          <div className={`${dividerClass} mt-3`}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={excelSettings.protectSheet}
                onChange={(e) => updateExcel({ protectSheet: e.target.checked })}
                className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="font-bold text-amber-700 dark:text-amber-500">Защитить лист паролем (только чтение)</span>
            </label>

            {excelSettings.protectSheet && (
              <div className="mt-2 pl-6">
                <input
                  type="text"
                  placeholder="Пароль для снятия защиты..."
                  value={excelSettings.sheetPassword || ''}
                  onChange={(e) => updateExcel({ sheetPassword: e.target.value })}
                  className={`w-full max-w-sm ${inputClass}`}
                />
                <p className={`text-[10px] mt-1 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                  Блокирует изменение ячеек, сохраняя фильтрацию и сортировку.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 4.2 Закрепление и Автофильтр */}
        <div className={cardClass}>
          <div className={`${subHeaderClass} mb-3`}>
            4.2 Закрепление областей и масштаб
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
              <input
                type="checkbox"
                checked={excelSettings.freezeHeaderRow}
                onChange={(e) => updateExcel({ freezeHeaderRow: e.target.checked })}
                className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="font-medium">Закрепить заголовок таблицы</span>
            </label>

            <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
              <input
                type="checkbox"
                checked={excelSettings.freezeFirstColumn}
                onChange={(e) => updateExcel({ freezeFirstColumn: e.target.checked })}
                className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="font-medium">Закрепить столбцы категорий</span>
            </label>

            <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
              <input
                type="checkbox"
                checked={excelSettings.enableAutoFilter}
                onChange={(e) => updateExcel({ enableAutoFilter: e.target.checked })}
                className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="font-medium">Автофильтр в заголовках таблицы</span>
            </label>

            <div className="flex items-center gap-2">
              <span className={labelClass}>Масштаб листа (%):</span>
              <input
                type="number"
                min={50}
                max={200}
                value={excelSettings.zoomScale}
                onChange={(e) => updateExcel({ zoomScale: Number(e.target.value) || 100 })}
                className={`w-20 ${inputClass}`}
              />
            </div>
          </div>
        </div>

        {/* 4.3 Параметры Печати */}
        <div className={cardClass}>
          <div className={`${subHeaderClass} mb-3`}>
            4.3 Параметры печати
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Ориентация:</label>
              <select
                value={excelSettings.pageOrientation}
                onChange={(e) => updateExcel({ pageOrientation: e.target.value as any })}
                className={`w-full ${inputClass}`}
              >
                <option value="landscape">Альбомная</option>
                <option value="portrait">Книжная</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Формат бумаги:</label>
              <select
                value={excelSettings.paperSize || 9}
                onChange={(e) => updateExcel({ paperSize: parseInt(e.target.value, 10) })}
                className={`w-full ${inputClass}`}
              >
                <option value={9}>A4</option>
                <option value={8}>A3</option>
                <option value={11}>A5</option>
                <option value={1}>Letter</option>
              </select>
            </div>
          </div>

          <div className={`${dividerClass} space-y-2.5 mt-3`}>
            <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
              <input
                type="checkbox"
                checked={excelSettings.fitToPageWidth}
                onChange={(e) => updateExcel({ fitToPageWidth: e.target.checked })}
                className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="font-normal">Вписать все столбцы на одну страницу по ширине</span>
            </label>

            <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
              <input
                type="checkbox"
                checked={excelSettings.narrowMargins}
                onChange={(e) => updateExcel({ narrowMargins: e.target.checked })}
                className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="font-normal">Узкие поля страницы</span>
            </label>

            <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
              <input
                type="checkbox"
                checked={excelSettings.printHorizontalCentered}
                onChange={(e) => updateExcel({ printHorizontalCentered: e.target.checked })}
                className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="font-normal">Центрировать таблицу по горизонтали</span>
            </label>

            <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
              <input
                type="checkbox"
                checked={excelSettings.printTitlesRow}
                onChange={(e) => updateExcel({ printTitlesRow: e.target.checked })}
                className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="font-normal">Повторять заголовок таблицы на каждом листе</span>
            </label>

            <label className={`flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
              <input
                type="checkbox"
                checked={excelSettings.addPageNumbers}
                onChange={(e) => updateExcel({ addPageNumbers: e.target.checked })}
                className="rounded border-slate-400 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="font-normal">Нумерация страниц (нижний колонтитул)</span>
            </label>

            {excelSettings.addPageNumbers && (
              <div className="flex items-center gap-3 pl-6 mt-1">
                <select
                  value={excelSettings.pageNumberPosition || 'center'}
                  onChange={(e) => updateExcel({ pageNumberPosition: e.target.value as any })}
                  className={`px-2.5 py-1 rounded border text-[11px] ${
                    theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="center">По центру</option>
                  <option value="right">Справа</option>
                </select>
                <select
                  value={excelSettings.pageNumberFormat || 'full'}
                  onChange={(e) => updateExcel({ pageNumberFormat: e.target.value as any })}
                  className={`px-2.5 py-1 rounded border text-[11px] ${
                    theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="full">"Страница 1 из 10"</option>
                  <option value="simple">Только номер (1)</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* 4.4 Подсказка по SQL комментариям */}
        <div className={`p-3.5 text-xs rounded-xl border ${
          theme === 'dark'
            ? 'bg-slate-900/60 border-slate-700/60 text-slate-300'
            : 'bg-blue-50/60 border-blue-200 text-slate-800'
        }`}>
          <strong className={`mb-1 block font-bold ${
            theme === 'dark' ? 'text-blue-400' : 'text-blue-700'
          }`}>
            Параметры через SQL комментарии
          </strong>
          <span>Вы можете переопределять настройки прямо в коде, добавив комментарий в текст SQL:</span>
          
          <div className="relative mt-2 flex items-center">
            <code 
              onClick={handleCopySqlCommentTemplate}
              title="Нажмите, чтобы скопировать в буфер обмена"
              className={`w-full p-2 pr-28 rounded font-mono text-[11px] select-all cursor-pointer transition-colors ${
                theme === 'dark'
                  ? 'bg-black/40 border border-slate-800 text-blue-300 hover:border-slate-700'
                  : 'bg-white border border-blue-200 text-blue-900 shadow-2xs hover:border-blue-300'
              }`}
            >
              {sampleSqlComment}
            </code>
            <button
              type="button"
              onClick={handleCopySqlCommentTemplate}
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border font-medium transition-all ${
                copiedTemplate
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : theme === 'dark'
                    ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-white'
                    : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 shadow-2xs'
              }`}
              title="Скопировать шаблон в буфер обмена"
            >
              {copiedTemplate ? (
                <>
                  <Check className="w-3 h-3 text-white" />
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-slate-400" />
                </>
              )}
            </button>
          </div>

          <span className={`text-[10px] mt-1.5 block ${
            theme === 'dark' ? 'text-slate-400' : 'text-slate-600'
          }`}>
            Доступные функции для @totals: SUM, AVERAGE, COUNT
          </span>
          <span className={`text-[10px] mt-1.5 block ${
            theme === 'dark' ? 'text-slate-400' : 'text-slate-600'
          }`}>
            Для объемных отчетов необходимо явно указывать Limit в запросе
          </span>
          <span className={`text-[10px] mt-1.5 block ${
            theme === 'dark' ? 'text-slate-400' : 'text-slate-600'
          }`}>
            Доступна возможность формирования столбцов с формулами, пример: =SUM(1)
          </span>
        </div>
      </div>
    </div>
  );
};
