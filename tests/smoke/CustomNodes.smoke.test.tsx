// @vitest-environment jsdom
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { TableNode } from '../../src/components/CustomNodes';

// Mock Handle to avoid "No node id found" error
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    Handle: (props: any) => <div data-testid="mock-handle" {...props} />
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CustomNodes', () => {
  it('renders TableNode with title and columns', () => {
    const data = {
      title: 'users',
      columns: [
        { name: 'id', type: 'integer' },
        { name: 'name', type: 'text' }
      ]
    };
    
    render(<TableNode data={data} />);
    
    expect(screen.getByText('users')).toBeInTheDocument();
    expect(screen.getByText('id')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
  });
});
