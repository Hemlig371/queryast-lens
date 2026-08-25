// @vitest-environment jsdom
import React from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { VersionHistoryModal } from '../src/components/VersionHistoryModal';
import * as versionHistoryUtils from '../src/utils/versionHistory';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mockVersions = [
  {
    id: '1',
    timestamp: 2000,
    formattedTime: '01.01.2023, 11:00:00',
    sql: 'SELECT * FROM users;',
    label: 'Ручной снимок',
    isAutoSave: false,
    charCount: 20,
    lineCount: 1
  },
  {
    id: '2',
    timestamp: 1000,
    formattedTime: '01.01.2023, 10:00:00',
    sql: 'SELECT id FROM posts;',
    label: 'Второй снимок',
    isAutoSave: false,
    charCount: 21,
    lineCount: 1
  }
];

describe('VersionHistoryModal', () => {
  it('renders nothing if not open', () => {
    const { container } = render(
      <VersionHistoryModal isOpen={false} onClose={() => {}} currentSql="" theme="light" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders list of versions and displays selected sql', async () => {
    vi.spyOn(versionHistoryUtils, 'getVersions').mockResolvedValue(mockVersions);

    render(
      <VersionHistoryModal isOpen={true} onClose={() => {}} currentSql="" theme="light" />
    );

    expect(await screen.findByText('История версий кода')).toBeInTheDocument();
    
    // Check labels in the list
    expect(await screen.findByText('Ручной снимок')).toBeInTheDocument();
    expect(await screen.findByText('Второй снимок')).toBeInTheDocument();

    // The first item is selected by default, so its SQL is visible in the right pane
    expect(await screen.findByText('SELECT * FROM users;')).toBeInTheDocument();
  });

  it('calls deleteVersion when delete button is clicked', async () => {
    vi.spyOn(versionHistoryUtils, 'getVersions').mockResolvedValue(mockVersions);
    const deleteSpy = vi.spyOn(versionHistoryUtils, 'deleteVersion').mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <VersionHistoryModal isOpen={true} onClose={() => {}} currentSql="" theme="light" />
    );

    const deleteBtns = await screen.findAllByTitle('Удалить запись');
    expect(deleteBtns.length).toBe(2);

    await user.click(deleteBtns[0]);
    expect(deleteSpy).toHaveBeenCalled();
  });
});
