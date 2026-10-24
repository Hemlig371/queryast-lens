import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_QUICK_ACTIONS, getQuickActionTemplates } from '../src/utils/quickActionTemplates';
import { DEFAULT_AUTOCOMPLETE_TEMPLATES, getCustomAutocompleteTemplates } from '../src/editor/templates';

const QUICK_KEY = 'sql_quick_action_templates';
const AUTOCOMPLETE_KEY = 'sql_custom_autocomplete_templates';

function makeFakeStorage(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      data.set(k, String(v));
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    clear: () => data.clear(),
  };
}

describe('template storage (quick actions and autocomplete)', () => {
  let originalDescriptor: PropertyDescriptor | undefined;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  const setStorage = (initial: Record<string, string> = {}) => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: makeFakeStorage(initial),
      configurable: true,
      writable: true,
    });
  };

  beforeEach(() => {
    originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
    } else {
      delete (globalThis as any).localStorage;
    }
  });

  describe('getQuickActionTemplates', () => {
    it('returns defaults when the key is absent', () => {
      setStorage();
      expect(getQuickActionTemplates()).toEqual(DEFAULT_QUICK_ACTIONS);
    });

    it('returns defaults when the JSON is broken', () => {
      setStorage({ [QUICK_KEY]: '{not json' });
      expect(getQuickActionTemplates()).toEqual(DEFAULT_QUICK_ACTIONS);
    });

    it('returns defaults when the JSON is not an array', () => {
      setStorage({ [QUICK_KEY]: '{"id":"x"}' });
      expect(getQuickActionTemplates()).toEqual(DEFAULT_QUICK_ACTIONS);
    });

    it('returns the saved list when it is not empty', () => {
      const saved = [{ id: 'u1', name: 'Мой шаблон', template: 'SELECT * FROM {table} LIMIT 5;' }];
      setStorage({ [QUICK_KEY]: JSON.stringify(saved) });
      expect(getQuickActionTemplates()).toEqual(saved);
    });

    // Новое поведение: сохранённый пустой список остаётся пустым
    it('returns an empty list when an empty array is saved', () => {
      setStorage({ [QUICK_KEY]: '[]' });
      expect(getQuickActionTemplates()).toEqual([]);
    });
  });

  describe('getCustomAutocompleteTemplates', () => {
    it('returns defaults when the key is absent', () => {
      setStorage();
      expect(getCustomAutocompleteTemplates()).toEqual(DEFAULT_AUTOCOMPLETE_TEMPLATES);
    });

    it('returns defaults when the JSON is broken', () => {
      setStorage({ [AUTOCOMPLETE_KEY]: '[{"keyword":' });
      expect(getCustomAutocompleteTemplates()).toEqual(DEFAULT_AUTOCOMPLETE_TEMPLATES);
    });

    it('returns defaults when the JSON is not an array', () => {
      setStorage({ [AUTOCOMPLETE_KEY]: '"text"' });
      expect(getCustomAutocompleteTemplates()).toEqual(DEFAULT_AUTOCOMPLETE_TEMPLATES);
    });

    it('returns the saved list when it is not empty', () => {
      const saved = [
        { id: 'c1', keyword: 'SEL', insertion: 'SELECT ', description: 'short' },
        { id: 'c2', keyword: 'WH', insertion: 'WHERE ' },
      ];
      setStorage({ [AUTOCOMPLETE_KEY]: JSON.stringify(saved) });
      expect(getCustomAutocompleteTemplates()).toEqual(saved);
    });

    it('drops entries without a string keyword', () => {
      const saved = [{ id: 'c1', keyword: 'SEL' }, { id: 'c2' }, null, { id: 'c3', keyword: 5 }];
      setStorage({ [AUTOCOMPLETE_KEY]: JSON.stringify(saved) });
      expect(getCustomAutocompleteTemplates()).toEqual([{ id: 'c1', keyword: 'SEL' }]);
    });

    // Новое поведение: сохранённый пустой список остаётся пустым
    it('returns an empty list when an empty array is saved', () => {
      setStorage({ [AUTOCOMPLETE_KEY]: '[]' });
      expect(getCustomAutocompleteTemplates()).toEqual([]);
    });
  });
});
