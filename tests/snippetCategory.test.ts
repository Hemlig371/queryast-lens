import { describe, it, expect } from 'vitest';
import { normalizeCategoryInput } from '../src/utils/snippetCategory';

const existing = ['Запросы', 'Схемы'];

describe('normalizeCategoryInput (G-05)', () => {
  it('Queries → «Запросы»', () => {
    expect(normalizeCategoryInput('Queries', existing)).toEqual({ category: 'Запросы', blocked: false });
  });
  it('Reports без изменений', () => {
    expect(normalizeCategoryInput('Reports', existing)).toEqual({ category: 'Reports', blocked: false });
  });
  it.each(['Trash', 'Favorites', 'Jobs', 'Корзина', 'Избранное', 'trash'])('%s блокируется', (n) => {
    expect(normalizeCategoryInput(n, existing).blocked).toBe(true);
  });
  it('пользовательская Queries не подменяется', () => {
    expect(normalizeCategoryInput('Queries', [...existing, 'Queries'])).toEqual({ category: 'Queries', blocked: false });
  });
  it('пусто → «Общие»', () => {
    expect(normalizeCategoryInput('  ', existing).category).toBe('Общие');
  });
  it('прежняя служебная категория редактируемого шаблона не блокируется', () => {
    expect(normalizeCategoryInput('Jobs', existing, 'Jobs').blocked).toBe(false);
  });
});
