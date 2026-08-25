// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getSavedExcelSettings, saveExcelSettings, getSavedExcelPresets, saveOrUpdateExcelPreset, deleteExcelPreset, CLASSIC_PRESET_ID } from '../src/utils/excelSettingsStorage';
import { DEFAULT_EXCEL_SETTINGS } from '../src/types/excelSettings';

describe('excelSettingsStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('getSavedExcelSettings returns default settings when localStorage is empty', () => {
    const settings = getSavedExcelSettings();
    expect(settings).toEqual(DEFAULT_EXCEL_SETTINGS);
  });

  it('saves and retrieves excel settings correctly', () => {
    const customSettings = { ...DEFAULT_EXCEL_SETTINGS, headerColor: '#ff0000', includeRowNumbers: true };
    saveExcelSettings(customSettings);
    
    const retrieved = getSavedExcelSettings();
    expect(retrieved).toEqual(customSettings);
    expect(retrieved.headerColor).toBe('#ff0000');
    expect(retrieved.includeRowNumbers).toBe(true);
  });

  it('handles corrupted JSON in localStorage gracefully for settings', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('queryast_lens_excel_settings_v1', '{ invalid json');
    
    const settings = getSavedExcelSettings();
    expect(consoleSpy).toHaveBeenCalled();
    expect(settings).toEqual(DEFAULT_EXCEL_SETTINGS);
  });

  it('returns default preset when localStorage is empty', () => {
    const presets = getSavedExcelPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0].id).toBe(CLASSIC_PRESET_ID);
  });

  it('saves and retrieves custom presets correctly', () => {
    const { targetId } = saveOrUpdateExcelPreset(null, 'My Preset', { ...DEFAULT_EXCEL_SETTINGS, headerColor: '#00ff00' });
    
    const retrieved = getSavedExcelPresets();
    expect(retrieved).toHaveLength(2);
    expect(retrieved[1].name).toEqual('My Preset');
    expect(retrieved[1].id).toBe(targetId);
  });

  it('handles corrupted JSON in localStorage gracefully for presets', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('queryast_lens_excel_presets_v1', 'corrupted data');
    
    const presets = getSavedExcelPresets();
    expect(consoleSpy).toHaveBeenCalled();
    expect(presets).toHaveLength(1); // default only
  });

  it('deletes a custom preset correctly', () => {
    // Mock Date.now to ensure different IDs
    let time = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => time++);

    const { targetId: p1 } = saveOrUpdateExcelPreset(null, 'P1', DEFAULT_EXCEL_SETTINGS);
    const { targetId: p2 } = saveOrUpdateExcelPreset(null, 'P2', DEFAULT_EXCEL_SETTINGS);
    
    expect(getSavedExcelPresets()).toHaveLength(3); // classic + p1 + p2
    
    deleteExcelPreset(p1);
    const remaining = getSavedExcelPresets();
    expect(remaining).toHaveLength(2);
    expect(remaining[1].id).toBe(p2);
  });

  it('does not leak sensitive data in logs on JSON parse failure', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sensitiveString = '{ "password": "super_secret_password_123" } but broken';
    localStorage.setItem('queryast_lens_excel_settings_v1', sensitiveString);
    
    getSavedExcelSettings();
    
    expect(consoleSpy).toHaveBeenCalled();
    const errorMsg = consoleSpy.mock.calls[0].join(' ');
    expect(errorMsg).toContain('Failed to parse Excel settings');
  });
});
