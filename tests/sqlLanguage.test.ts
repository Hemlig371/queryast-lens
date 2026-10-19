import { describe, it, expect } from 'vitest';
import { sqlLanguage } from '../src/editor/sqlLanguage';

/** Токены подсветки: разбор через настоящий парсер StreamLanguage, без DOM. Только узлы lens*. */
const tokens = (text: string): { name: string; text: string }[] => {
  const tree = sqlLanguage.parser.parse(text);
  const out: { name: string; text: string }[] = [];
  tree.iterate({
    enter: (node) => {
      if (node.name.startsWith('lens')) out.push({ name: node.name, text: text.slice(node.from, node.to) });
    },
  });
  return out;
};

const named = (text: string, name: string) => tokens(text).filter(t => t.name === name).map(t => t.text);

describe('sqlLanguage: строки', () => {
  it('одинарные кавычки с удвоением по-прежнему одна строка', () => {
    expect(named("select 'a''b' from t", 'lensString')).toEqual(["'a''b'"]);
  });
  it("CM-03: 'it\\'s' — одна строка (обратная косая черта экранирует кавычку)", () => {
    expect(named("select 'it\\'s' from t", 'lensString')).toEqual(["'it\\'s'"]);
  });
  it("CM-03: 'a\\\\' — экранированная косая черта, строка закрывается", () => {
    const toks = tokens("select 'a\\\\', 1");
    expect(toks.filter(t => t.name === 'lensString').map(t => t.text)).toEqual(["'a\\\\'"]);
    expect(toks.filter(t => t.name === 'lensNumber').map(t => t.text)).toEqual(['1']);
  });
  it('косая черта перед другим символом — обычный символ строки', () => {
    expect(named("select 'C:\\data\\file' from t", 'lensString')).toEqual(["'C:\\data\\file'"]);
  });
  it('CM-03: $$ … $$ — одна строка, в том числе многострочная', () => {
    expect(named("select $$ it's 'x' $$ from t", 'lensString')).toEqual(["$$ it's 'x' $$"]);
    // токены потокового парсера не пересекают границу строки: многострочная строка — по узлу на строку
    expect(named('do $$\nselect 1\n$$ ;', 'lensString')).toEqual(['$$', 'select 1', '$$']);
    expect(named('do $$\nselect 1\n$$ ;', 'lensKeyword')).toEqual(['do']);
  });
  it('после закрытия $$ подсветка продолжается как обычно', () => {
    const toks = tokens('select $$a$$ from t');
    expect(toks.map(t => t.name)).toEqual(['lensKeyword', 'lensString', 'lensKeyword']);
  });
  it('"x" остаётся идентификатором (как в DuckDB/PostgreSQL)', () => {
    expect(tokens('select "x" from t').filter(t => t.name === 'lensIdent').map(t => t.text)).toEqual(['"x"']);
    expect(named('select "x" from t', 'lensString')).toEqual([]);
  });
  it('идентификатор в обратных кавычках', () => {
    expect(named('select `x y` from t', 'lensIdent')).toEqual(['`x y`']);
  });
});

describe('sqlLanguage: числа', () => {
  for (const num of ['42', '3.14', '1e5', '1E5', '2.5e-3', '.5', '0xFF', '0Xab12']) {
    it(`CM-03: ${num} — число`, () => {
      expect(named(`select ${num} from t`, 'lensNumber')).toEqual([num]);
    });
  }
  it('слово, начинающееся с цифры, числом не считается', () => {
    expect(named('select 1abc from t', 'lensNumber')).toEqual([]);
    expect(named('select 0xZZ from t', 'lensNumber')).toEqual([]);
  });
  it('число в запятой и скобках', () => {
    expect(named('f(1, 2.5)', 'lensNumber')).toEqual(['1', '2.5']);
  });
});

describe('sqlLanguage: прочее не изменилось', () => {
  it('комментарии', () => {
    expect(named('select 1 -- note', 'lensComment')).toEqual(['-- note']);
    expect(named('select /* a\n b */ 1', 'lensComment')).toEqual(['/* a', ' b */']);
  });
  it('ключевые слова, функции, движок', () => {
    expect(tokens('select count(x) from t settings a=1').map(t => t.name)).toEqual([
      'lensKeyword', 'lensFn', 'lensKeyword', 'lensEngine', 'lensNumber',
    ]);
  });
  it('переменные {{$…}} токена не создают (цвет задаёт декоратор)', () => {
    expect(tokens('select {{$name=a b}} from t').map(t => t.name)).toEqual(['lensKeyword', 'lensKeyword']);
  });
});
