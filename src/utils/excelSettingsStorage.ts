import { ExcelSettings, DEFAULT_EXCEL_SETTINGS, ExcelPreset } from '../types/excelSettings';

const EXCEL_SETTINGS_STORAGE_KEY = 'queryast_lens_excel_settings_v1';
const EXCEL_PRESETS_STORAGE_KEY = 'queryast_lens_excel_presets_v1';

export const CLASSIC_PRESET_ID = 'preset_classic';

export const CLASSIC_PRESET: ExcelPreset = {
  id: CLASSIC_PRESET_ID,
  name: 'По умолчанию',
  isBuiltIn: true,
  settings: { ...DEFAULT_EXCEL_SETTINGS }
};

export function getSavedExcelSettings(): ExcelSettings {
  try {
    const raw = localStorage.getItem(EXCEL_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_EXCEL_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.error('Failed to parse Excel settings from localStorage', e);
  }
  return { ...DEFAULT_EXCEL_SETTINGS };
}

export function saveExcelSettings(settings: ExcelSettings): void {
  try {
    localStorage.setItem(EXCEL_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save Excel settings to localStorage', e);
  }
}

export function resetExcelSettings(): ExcelSettings {
  try {
    localStorage.removeItem(EXCEL_SETTINGS_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to reset Excel settings in localStorage', e);
  }
  return { ...DEFAULT_EXCEL_SETTINGS };
}

export function getSavedExcelPresets(): ExcelPreset[] {
  const list: ExcelPreset[] = [{ ...CLASSIC_PRESET }];
  try {
    const raw = localStorage.getItem(EXCEL_PRESETS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((p) => {
          if (p && p.id && p.name && p.id !== CLASSIC_PRESET_ID) {
            list.push({
              id: p.id,
              name: p.name,
              isBuiltIn: false,
              settings: { ...DEFAULT_EXCEL_SETTINGS, ...p.settings }
            });
          }
        });
      }
    }
  } catch (e) {
    console.error('Failed to load Excel presets from localStorage', e);
  }
  return list;
}

export function saveUserExcelPresets(presets: ExcelPreset[]): void {
  try {
    const userOnly = presets.filter(p => !p.isBuiltIn && p.id !== CLASSIC_PRESET_ID);
    localStorage.setItem(EXCEL_PRESETS_STORAGE_KEY, JSON.stringify(userOnly));
  } catch (e) {
    console.error('Failed to save Excel presets to localStorage', e);
  }
}

export function saveOrUpdateExcelPreset(
  id: string | null,
  name: string,
  settings: ExcelSettings
): { presets: ExcelPreset[]; targetId: string } {
  const currentPresets = getSavedExcelPresets();
  const trimmedName = name.trim() || 'Пользовательский';

  // If updating existing user preset
  if (id && id !== CLASSIC_PRESET_ID) {
    const existingIdx = currentPresets.findIndex(p => p.id === id);
    if (existingIdx !== -1) {
      currentPresets[existingIdx] = {
        id,
        name: trimmedName,
        isBuiltIn: false,
        settings: { ...settings }
      };
      saveUserExcelPresets(currentPresets);
      return { presets: currentPresets, targetId: id };
    }
  }

  // Otherwise create a new user preset
  const newId = `preset_${Date.now()}`;
  const newPreset: ExcelPreset = {
    id: newId,
    name: trimmedName,
    isBuiltIn: false,
    settings: { ...settings }
  };
  const updatedPresets = [...currentPresets, newPreset];
  saveUserExcelPresets(updatedPresets);
  return { presets: updatedPresets, targetId: newId };
}

export function deleteExcelPreset(id: string): ExcelPreset[] {
  if (!id || id === CLASSIC_PRESET_ID) {
    return getSavedExcelPresets();
  }
  const currentPresets = getSavedExcelPresets();
  const updated = currentPresets.filter(p => p.id !== id);
  saveUserExcelPresets(updated);
  return updated;
}
