import { describe, it, expect } from 'vitest';
import { safePixelRatio } from '../src/utils/canvasLimits';

describe('safePixelRatio', () => {
  it('малые изображения: желаемый коэффициент', () => {
    expect(safePixelRatio(800, 600, 2)).toBe(2);
  });
  it('длинная сторона ограничивается 16000 px', () => {
    const r = safePixelRatio(900, 20000, 2);
    expect(r * 20000 <= 16000 + 1e-6).toBe(true);
  });
  it('площадь ограничивается', () => {
    const r = safePixelRatio(10000, 10000, 2);
    expect(r * r * 1e8 <= 1.2e8 + 1).toBe(true);
  });
  it('никогда не больше желаемого', () => {
    expect(safePixelRatio(10, 10, 1)).toBe(1);
  });
});
