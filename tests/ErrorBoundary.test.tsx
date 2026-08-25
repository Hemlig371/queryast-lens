// @vitest-environment jsdom
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

afterEach(() => {
  cleanup();
});

const ThrowError = () => {
  throw new Error('Test Error Message');
};

describe('ErrorBoundary component', () => {
  it('renders normal children if no error', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Happy Path</div>
      </ErrorBoundary>
    );
    expect(screen.getByTestId('child')).toHaveTextContent('Happy Path');
  });

  it('renders fallback UI when child throws an error', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary title="Custom Crash Title">
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom Crash Title')).toBeInTheDocument();
    expect(screen.getByText('Test Error Message')).toBeInTheDocument();
    
    consoleError.mockRestore();
  });

  it('calls onReset when try again button is clicked', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handleReset = vi.fn();
    const user = userEvent.setup();

    render(
      <ErrorBoundary onReset={handleReset}>
        <ThrowError />
      </ErrorBoundary>
    );

    const btn = screen.getByRole('button', { name: /перезапустить модуль/i });
    await user.click(btn);
    
    expect(handleReset).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
