import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { t } from '../utils/i18n';
import { copyToClipboard } from '../utils/exportUtils';

// Кнопка «Markdown» (предпросмотр Markdown или граф Mermaid) с выбором цвета и копированием HEX. Вынесено из App.tsx.
export const MermaidActionGroup = ({ theme, onVisualize }: { theme: 'dark'|'light', onVisualize: () => void }) => {
  const [color, setColor] = useState('#14b8a6');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    copyToClipboard(color);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex items-stretch text-xs font-semibold rounded-md shadow-md shrink-0 transition-colors ${
        theme === 'dark'
          ? 'bg-teal-600 text-white shadow-teal-900/20'
          : 'bg-teal-500 text-white shadow-teal-700/20'
      }`}>
      <div 
        className={`flex items-center justify-center px-1.5 border-r ${theme === 'dark' ? 'border-teal-700 hover:bg-teal-500' : 'border-teal-600 hover:bg-teal-600'} rounded-l-md transition-colors`}
        title={t("Выбрать цвет")}
      >
        <input 
           type="color" 
           value={color} 
           onChange={(e) => setColor(e.target.value)}
           className="w-4 h-5 p-0 border-0 bg-transparent cursor-pointer"
        />
      </div>
      
      <button
         onClick={handleCopy}
         className={`px-2 border-r flex items-center justify-center transition-colors ${theme === 'dark' ? 'border-teal-700 hover:bg-teal-500' : 'border-teal-600 hover:bg-teal-600'}`}
         title={t("Скопировать HEX")}
      >
         {copied ? <Check className="w-2.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5 opacity-70 hover:opacity-100" />}
      </button>

      <button
        onClick={onVisualize}
        className={`px-3 py-1.5 active:bg-teal-700 transition-colors rounded-r-md ${theme === 'dark' ? 'hover:bg-teal-500' : 'hover:bg-teal-600'}`}
        title={t("Показать Markdown или построить граф Mermaid")}
      >
        <span>Markdown</span>
      </button>
    </div>
  );
};
