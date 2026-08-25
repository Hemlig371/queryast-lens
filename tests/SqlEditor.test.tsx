// @vitest-environment jsdom
import React from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SqlEditor } from '../src/components/SqlEditor';

// Mock ResizeObserver for JSDOM
beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  // Mock document.execCommand to emulate real browser textarea manipulation in JSDOM
  document.execCommand = vi.fn((commandId: string, showUI?: boolean, value?: string) => {
    if (commandId === 'insertText' && document.activeElement instanceof HTMLTextAreaElement) {
      const el = document.activeElement;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      const val = el.value;
      const insert = value || '';
      const nextVal = val.slice(0, start) + insert + val.slice(end);
      
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(el, nextVal);
      } else {
        el.value = nextVal;
      }
      
      const nextPos = start + insert.length;
      el.setSelectionRange(nextPos, nextPos);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    return false;
  });
});

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('SqlEditor - User Interaction & Behavioral Tests', () => {
  it('renders correctly with initial SQL content and placeholder', () => {
    const mockOnChange = vi.fn();
    render(
      <SqlEditor
        value="SELECT id, name FROM users;"
        onChange={mockOnChange}
        theme="dark"
        placeholder="Enter SQL..."
      />
    );

    const textarea = screen.getByPlaceholderText('Enter SQL...') as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe('SELECT id, name FROM users;');
  });

  describe('Search and Replace (Ctrl+F, Ctrl+H)', () => {
    it('opens search bar on Ctrl+F, finds matches, and navigates them', async () => {
      const user = userEvent.setup();
      const mockOnChange = vi.fn();
      render(
        <SqlEditor
          value={'SELECT id FROM users\nWHERE users.active = 1;'}
          onChange={mockOnChange}
          theme="dark"
        />
      );

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      await user.click(textarea);
      textarea.focus();

      // Press Ctrl+F while editor has focus
      fireEvent.keyDown(window, { key: 'f', code: 'KeyF', ctrlKey: true });

      const searchInput = screen.getByPlaceholderText('Поиск (Ctrl+F)...') as HTMLInputElement;
      expect(searchInput).toBeInTheDocument();

      // Type "users" into search
      await user.type(searchInput, 'users');

      // Should show match count (1/2 because "users" appears twice)
      expect(screen.getByText('1/2')).toBeInTheDocument();

      // Click Next match button
      const nextBtn = screen.getByTitle('Следующее совпадение (Enter)');
      await user.click(nextBtn);
      expect(screen.getByText('2/2')).toBeInTheDocument();

      // Click Prev match button
      const prevBtn = screen.getByTitle('Предыдущее совпадение (Shift+Enter)');
      await user.click(prevBtn);
      expect(screen.getByText('1/2')).toBeInTheDocument();

      // Close search with Escape key inside search input
      fireEvent.keyDown(searchInput, { key: 'Escape' });
      expect(screen.queryByPlaceholderText('Поиск (Ctrl+F)...')).not.toBeInTheDocument();
    });

    it('opens replace bar on Ctrl+H and executes replace current / replace all', async () => {
      const user = userEvent.setup();
      let currentVal = 'SELECT client_id FROM clients JOIN clients_meta ON 1=1;';
      const mockOnChange = vi.fn((val) => {
        currentVal = val;
      });

      render(
        <SqlEditor
          value={currentVal}
          onChange={mockOnChange}
          theme="dark"
        />
      );

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      await user.click(textarea);
      textarea.focus();

      // Open Replace with Ctrl+H
      fireEvent.keyDown(window, { key: 'h', code: 'KeyH', ctrlKey: true });

      const searchInput = screen.getByPlaceholderText('Поиск (Ctrl+F)...');
      const replaceInput = screen.getByPlaceholderText('Заменить на...');
      expect(searchInput).toBeInTheDocument();
      expect(replaceInput).toBeInTheDocument();

      // Set search and replace values
      fireEvent.change(searchInput, { target: { value: 'clients' } });
      fireEvent.change(replaceInput, { target: { value: 'accounts' } });

      // Click "Заменить всё"
      const replaceAllBtn = screen.getByTitle('Заменить все совпадения');
      await user.click(replaceAllBtn);

      expect(mockOnChange).toHaveBeenCalled();
      // Verify replacement occurred
      expect(mockOnChange).toHaveBeenCalledWith(
        'SELECT client_id FROM accounts JOIN accounts_meta ON 1=1;'
      );
    });
  });

  describe('Tab Key Handling (Indentation & Dedentation)', () => {
    it('inserts 2 spaces on Tab press without losing focus', async () => {
      const user = userEvent.setup();
      let val = 'SELECT 1;';
      const mockOnChange = vi.fn((newVal) => {
        val = newVal;
      });

      render(
        <SqlEditor
          value={val}
          onChange={mockOnChange}
          theme="dark"
        />
      );

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      await user.click(textarea);
      textarea.focus();
      textarea.setSelectionRange(0, 0);

      // Press Tab key
      fireEvent.keyDown(textarea, { key: 'Tab', code: 'Tab' });

      expect(document.execCommand).toHaveBeenCalledWith('insertText', false, '  ');
      expect(mockOnChange).toHaveBeenCalled();
    });
  });

  describe('Autocomplete Functionality', () => {
    it('shows autocomplete popup on Ctrl+Space and applies suggestion on Enter', async () => {
      const user = userEvent.setup();
      let val = 'SEL';
      const mockOnChange = vi.fn((newVal) => {
        val = newVal;
      });

      render(
        <SqlEditor
          value={val}
          onChange={mockOnChange}
          theme="dark"
        />
      );

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      await user.click(textarea);
      textarea.focus();
      textarea.setSelectionRange(3, 3);

      // Trigger autocomplete with Ctrl+Space
      fireEvent.keyDown(textarea, { key: ' ', code: 'Space', ctrlKey: true });

      // Autocomplete list should show SQL keywords matching 'SEL'
      const buttons = screen.getAllByRole('button');
      const selectAllFromButton = buttons.find(b => b.textContent?.includes('SELECT * FROM'));
      expect(selectAllFromButton).toBeDefined();

      // Press Enter to select the top suggestion (SELECT * FROM)
      fireEvent.keyDown(textarea, { key: 'Enter' });

      expect(document.execCommand).toHaveBeenCalledWith('insertText', false, 'SELECT * FROM ');
      expect(mockOnChange).toHaveBeenCalled();
    });

    it('allows clicking an item in the autocomplete popup to insert it', async () => {
      const user = userEvent.setup();
      let val = 'SEL';
      const mockOnChange = vi.fn((newVal) => {
        val = newVal;
      });

      render(
        <SqlEditor
          value={val}
          onChange={mockOnChange}
          theme="dark"
        />
      );

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      await user.click(textarea);
      textarea.focus();
      textarea.setSelectionRange(3, 3);

      // Trigger autocomplete
      fireEvent.keyDown(textarea, { key: ' ', code: 'Space', ctrlKey: true });

      // Find and click the template suggestion
      const buttons = screen.getAllByRole('button');
      const selectButton = buttons.find(b => b.textContent?.includes('SELECT * FROM'));
      expect(selectButton).toBeDefined();

      if (selectButton) {
        fireEvent.mouseDown(selectButton);
        expect(document.execCommand).toHaveBeenCalledWith('insertText', false, 'SELECT * FROM ');
      }
    });
  });

  describe('Case Transformations (Ctrl+Shift+U / Ctrl+Shift+L)', () => {
    it('transforms selected text to UPPERCASE on Ctrl+Shift+U', async () => {
      const user = userEvent.setup();
      let val = 'select name from users;';
      const mockOnChange = vi.fn((newVal) => {
        val = newVal;
      });

      render(
        <SqlEditor
          value={val}
          onChange={mockOnChange}
          theme="dark"
        />
      );

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      await user.click(textarea);
      textarea.focus();
      // Select the whole text
      textarea.setSelectionRange(0, val.length);

      // Press Ctrl+Shift+U on textarea
      fireEvent.keyDown(textarea, { key: 'U', code: 'KeyU', ctrlKey: true, shiftKey: true });

      expect(document.execCommand).toHaveBeenCalledWith('insertText', false, 'SELECT NAME FROM USERS;');
      expect(mockOnChange).toHaveBeenCalled();
    });

    it('transforms selected text to lowercase on Ctrl+Shift+L', async () => {
      const user = userEvent.setup();
      let val = 'SELECT NAME FROM USERS;';
      const mockOnChange = vi.fn((newVal) => {
        val = newVal;
      });

      render(
        <SqlEditor
          value={val}
          onChange={mockOnChange}
          theme="dark"
        />
      );

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      await user.click(textarea);
      textarea.focus();
      // Select the whole text
      textarea.setSelectionRange(0, val.length);

      // Press Ctrl+Shift+L on textarea
      fireEvent.keyDown(textarea, { key: 'L', code: 'KeyL', ctrlKey: true, shiftKey: true });

      expect(document.execCommand).toHaveBeenCalledWith('insertText', false, 'select name from users;');
      expect(mockOnChange).toHaveBeenCalled();
    });
  });
});
