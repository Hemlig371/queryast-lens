import './setupIndexedDB';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSessionTabs } from '../src/utils/sessionStorage';

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
