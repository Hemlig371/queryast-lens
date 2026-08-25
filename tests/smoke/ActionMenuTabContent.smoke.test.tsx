// @vitest-environment jsdom
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ActionMenuTabContent } from '../../src/components/ActionMenuTabContent';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ActionMenuTabContent', () => {
  it('renders ActionMenuTabContent and search input', () => {
    render(
      <ActionMenuTabContent 
        theme="light"
        activeEngine="duckdb"
        isDuckDbRunning={true}
        onExecuteSql={vi.fn()}
        onOpenSnippetsManager={vi.fn()}
        onInsertIntoEditor={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText('Поиск')).toBeInTheDocument();
    expect(screen.getByText('Все')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
  });
});
