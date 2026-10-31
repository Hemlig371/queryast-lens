import { describe, it, expect } from 'vitest';
import { nextTabName } from '../src/utils/tabNames';

describe('nextTabName', () => {
  it('нет вкладок — «Вкладка 1»', () => {
    expect(nextTabName([], 'Вкладка')).toBe('Вкладка 1');
  });
  it('подряд 1..3 — следующая 4', () => {
    expect(nextTabName(['Вкладка 1', 'Вкладка 2', 'Вкладка 3'], 'Вкладка')).toBe('Вкладка 4');
  });
  it('дыра: закрыли «Вкладка 2» — новая снова «Вкладка 2» (раньше было 3)', () => {
    expect(nextTabName(['Вкладка 1', 'Вкладка 3'], 'Вкладка')).toBe('Вкладка 2');
  });
  it('закрыли первую — новая «Вкладка 1»', () => {
    expect(nextTabName(['Вкладка 2', 'Вкладка 3'], 'Вкладка')).toBe('Вкладка 1');
  });
  it('переименованные вкладки и чужие названия номер не занимают', () => {
    expect(nextTabName(['Отчёт', 'Вкладка 1 копия', 'Вкладка', 'Вкладка 1x'], 'Вкладка')).toBe('Вкладка 1');
  });
  it('порядок вкладок не важен', () => {
    expect(nextTabName(['Вкладка 3', 'Вкладка 1'], 'Вкладка')).toBe('Вкладка 2');
  });
  it('английский язык: «Tab N», русские вкладки тоже занимают номера', () => {
    expect(nextTabName(['Tab 1', 'Вкладка 2'], 'Tab', 'Вкладка')).toBe('Tab 3');
  });
  it('метасимволы в слове не ломают разбор', () => {
    expect(nextTabName(['a+b 1'], 'a+b')).toBe('a+b 2');
  });
});

describe('J-11: displayTabTitle', () => {
  it('«Вкладка N» выводится на текущем языке, остальные названия без изменений', async () => {
    const { displayTabTitle } = await import('../src/utils/tabNames');
    const tr = (s: string) => (s === 'Вкладка' ? 'Tab' : s);
    expect(displayTabTitle('Вкладка 3', tr)).toBe('Tab 3');
    expect(displayTabTitle('Вкладка', tr)).toBe('Вкладка');
    expect(displayTabTitle('Вкладка 3 копия', tr)).toBe('Вкладка 3 копия');
    expect(displayTabTitle('report.sql', tr)).toBe('report.sql');
  });
});
