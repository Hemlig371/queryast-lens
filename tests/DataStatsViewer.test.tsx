// @vitest-environment jsdom
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { DataStatsViewer } from '../src/components/DataStatsViewer';

// Mock Recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="recharts-container">{children}</div>,
  BarChart: () => <div data-testid="bar-chart" />,
  Bar: () => <div />,
  LineChart: () => <div data-testid="line-chart" />,
  Line: () => <div />,
  PieChart: () => <div data-testid="pie-chart" />,
  Pie: () => <div />,
  Cell: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  CartesianGrid: () => <div />,
}));

afterEach(() => {
  cleanup();
});

const mockData = [
  { id: 1, name: 'Alice', score: 95 },
  { id: 2, name: 'Bob', score: 80 }
];

describe('DataStatsViewer', () => {
  it('renders charts by default if numeric data is present', () => {
    // With numeric data, it defaults to bar chart
    render(
      <DataStatsViewer 
        data={mockData} 
        theme="light" 
        initialChartType="bar"
      />
    );
    // Because of our mock, we should see the recharts container
    expect(screen.getByTestId('recharts-container')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });
});
