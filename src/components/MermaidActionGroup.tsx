import React from 'react';
import { t } from '../utils/i18n';

// Кнопка «Markdown» (предпросмотр Markdown или граф Mermaid). Вынесено из App.tsx.
// Выбор цвета и копирование HEX убраны: те же селекторы есть в пресетах Excel.
export const MermaidActionGroup = ({ theme, onVisualize }: { theme: 'dark'|'light', onVisualize: () => void }) => {
  return (
    <button
      onClick={onVisualize}
      className={`px-3 py-1.5 text-xs font-semibold text-white rounded-md shadow-md shrink-0 transition-colors active:bg-teal-700 ${
        theme === 'dark'
          ? 'bg-teal-600 hover:bg-teal-500 shadow-teal-900/20'
          : 'bg-teal-500 hover:bg-teal-600 shadow-teal-700/20'
      }`}
      title={t("Показать Markdown или построить граф Mermaid")}
    >
      <span>Markdown</span>
    </button>
  );
};
