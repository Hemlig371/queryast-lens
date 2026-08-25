import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSessionTabs } from '../src/utils/sessionStorage';

// Mock localStorage and window
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
    removeItem: (key: string) => {
      delete store[key];
    }
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });
Object.defineProperty(global, 'window', { value: { localStorage: localStorageMock } });

describe('sessionStorage', () => {
  beforeEach(() => {
    // Reset localStorage before each test
    localStorage.clear();
    // Mock console.error to avoid noise in test output
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should return null if there is no data', async () => {
    const tabs = await getSessionTabs();
    expect(tabs).toBeNull();
  });

  it('should return null and not crash if JSON is corrupted', async () => {
    // Write invalid JSON to localStorage
    localStorage.setItem('sql_visualizer_tabs_session', '{ invalid json ');
    
    const tabs = await getSessionTabs();
    expect(tabs).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it('should return null if JSON is not an array', async () => {
    localStorage.setItem('sql_visualizer_tabs_session', JSON.stringify({ not: 'an array' }));
    
    const tabs = await getSessionTabs();
    expect(tabs).toBeNull();
  });

  it('should return parsed tabs if data is valid', async () => {
    const mockTabs = [{ id: 'tab1', title: 'Query 1' }];
    localStorage.setItem('sql_visualizer_tabs_session', JSON.stringify(mockTabs));
    
    const tabs = await getSessionTabs();
    expect(tabs).toEqual(mockTabs);
  });
});
