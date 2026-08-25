// @vitest-environment jsdom
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import App from '../../src/App';
import 'fake-indexeddb/auto';

// Mock ResizeObserver for React Flow
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock some things that might fail in JSDOM
vi.mock('../../src/lib/duckdbWasm', () => ({
  initDuckDb: vi.fn(),
  executeDuckDbQuery: vi.fn()
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('App Component', () => {
  it('renders without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeInTheDocument();
  });
});
