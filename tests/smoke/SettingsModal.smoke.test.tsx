// @vitest-environment jsdom
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SettingsModal } from '../../src/components/SettingsModal';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SettingsModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <SettingsModal 
        isOpen={false}
        onClose={vi.fn()}
        theme="light"
        uiVisibility={{}}
        onUiVisibilityChange={vi.fn()}
        clickhouseConfig={{}}
        onClickhouseConfigChange={vi.fn()}
        engine="duckdb"
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders settings when isOpen is true', () => {
    render(
      <SettingsModal 
        isOpen={true}
        onClose={vi.fn()}
        theme="light"
        uiVisibility={{}}
        onUiVisibilityChange={vi.fn()}
        clickhouseConfig={{}}
        onClickhouseConfigChange={vi.fn()}
        engine="duckdb"
      />
    );
    expect(screen.getByText('Элементы UI')).toBeInTheDocument();
  });
});
