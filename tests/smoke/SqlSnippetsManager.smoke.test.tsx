// @vitest-environment jsdom
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SqlSnippetsManager } from '../../src/components/SqlSnippetsManager';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SqlSnippetsManager', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <SqlSnippetsManager 
        isOpen={false}
        onClose={vi.fn()}
        onInsertSnippet={vi.fn()}
        theme="light"
        engine="duckdb"
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders snippets manager when isOpen is true', () => {
    render(
      <SqlSnippetsManager 
        isOpen={true}
        onClose={vi.fn()}
        onInsertSnippet={vi.fn()}
        theme="light"
        engine="duckdb"
      />
    );
    expect(screen.getByText('Библиотека шаблонов')).toBeInTheDocument();
    // Default tabs should be present
    expect(screen.getByText('Все')).toBeInTheDocument();
  });
});
