import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EN_DICT } from '../src/utils/i18n';

// Проверки текста исходников (не логики): страхуют исправления от случайного возврата.
// Пути берутся от корня проекта (bun test запускается из него).

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}

function listSourceFiles(dirRel: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const next = path.posix.join(rel, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(next);
    }
  };
  walk(dirRel);
  return out;
}

describe('source guards', () => {
  // «Корзина» шаблонов не попадает ни в какой экспорт
  describe('snippet trash is never exported', () => {
    it('файл настроек и синхронизации: generateWorkspaceBundleObject фильтрует «Корзину»', () => {
      expect(read('src/components/SettingsModal.tsx')).toMatch(/backupData\['sql_visualizer_snippets'\]\s*=\s*withoutTrash\(snippets\)/);
    });
    it('экспорт JSON и ZIP шаблонов: список проходит через withoutTrash', () => {
      const src = read('src/components/SqlSnippetsManager.tsx');
      expect(src.match(/const listToExport = allSnippets\.length > 0 \? withoutTrash\(allSnippets\) : POPULAR_SNIPPETS;/g)?.length).toBe(2);
    });
  });

  // запись в буфер обмена только через copyToClipboard (иначе нет признака успеха и запасного пути)
  describe('clipboard access', () => {
    it('navigator.clipboard.writeText встречается только в src/utils/exportUtils.ts', () => {
      const found: string[] = [];
      for (const file of listSourceFiles('src')) {
        if (file === 'src/utils/exportUtils.ts') continue;
        read(file)
          .split('\n')
          .forEach((line, idx) => {
            if (/navigator\.clipboard\.writeText/.test(line)) found.push(`${file}:${idx + 1}: ${line.trim()}`);
          });
      }
      expect(found).toEqual([]);
    });
  });

  // двойной перевод t(t(...)) в поиске редактора
  describe('no nested t(t(...))', () => {
    // Идентификатор t не должен быть окончанием другого имени (alert(t(...)) — это обычный вызов)
    const NESTED_T = /(^|[^\w$.])t\(\s*t\(/;
    // Известное исключение (оставлено намеренно)
    const isKnownException = (file: string, line: string) =>
      file.endsWith('src/App.tsx') && line.includes("t(t('Значение'))");

    it('has no nested t(t(...)) calls in src (except the known exception)', () => {
      const found: string[] = [];
      for (const file of listSourceFiles('src')) {
        read(file)
          .split('\n')
          .forEach((line, idx) => {
            if (NESTED_T.test(line) && !isKnownException(file, line)) {
              found.push(`${file}:${idx + 1}: ${line.trim()}`);
            }
          });
      }
      expect(found).toEqual([]);
    });

    it('has no nested t(t(...)) in SqlEditor.tsx', () => {
      expect(NESTED_T.test(read('src/components/SqlEditor.tsx'))).toBe(false);
    });
  });

  // неиспользуемые зависимости удалены и не импортируются
  describe('unused dependencies', () => {
    const pkg = JSON.parse(read('package.json'));
    const allDeps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
      ...(pkg.peerDependencies ?? {}),
      ...(pkg.optionalDependencies ?? {}),
    };

    it('package.json does not list motion and dotenv', () => {
      expect('motion' in allDeps).toBe(false);
      expect('dotenv' in allDeps).toBe(false);
    });

    it('vite is not duplicated in dependencies', () => {
      expect('vite' in (pkg.dependencies ?? {})).toBe(false);
      expect('vite' in (pkg.devDependencies ?? {})).toBe(true);
    });

    it('src, server.ts and vite.config.ts do not import motion or dotenv', () => {
      const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"](?:motion|dotenv)(?:\/[^'"]*)?['"]/;
      const files = [...listSourceFiles('src'), 'server.ts', 'vite.config.ts'];
      const found = files.filter((file) => IMPORT_RE.test(read(file)));
      expect(found).toEqual([]);
    });
  });

  // постоянные анимации и тени узлов графа убраны (transition-all остаётся)
  describe('graph node styles', () => {
    // любой класс shadow-* (xl, 2xl, lg, md, sm, цветовые) и drop-shadow: узлы графа без теней
    const FORBIDDEN = /animate-pulse|drop-shadow|(?<![\w-])shadow-/;

    for (const file of ['src/components/CustomNodes.tsx', 'src/components/MermaidNodes.tsx']) {
      it(`${path.posix.basename(file)} has no animate-pulse, drop-shadow and shadow-* classes`, () => {
        const lines = read(file)
          .split('\n')
          .map((line, idx) => ({ line, no: idx + 1 }))
          .filter(({ line }) => FORBIDDEN.test(line))
          .map(({ line, no }) => `${file}:${no}: ${line.trim().slice(0, 100)}`);
        expect(lines).toEqual([]);
      });

      it(`${path.posix.basename(file)} keeps transition-all`, () => {
        expect(read(file)).toContain('transition-all');
      });
    }
  });

  // в CI lint запускается до сборки
  describe('CI workflow', () => {
    const lines = read('.github/workflows/build.yml').split('\n');
    const indexesOf = (cmd: string) =>
      lines.map((line, idx) => (line.trim() === `run: ${cmd}` ? idx : -1)).filter((idx) => idx >= 0);

    it('build.yml contains an npm run lint step', () => {
      expect(indexesOf('npm run lint').length).toBeGreaterThan(0);
    });

    it('every npm run build is preceded by npm run lint', () => {
      const lint = indexesOf('npm run lint');
      const build = indexesOf('npm run build');
      expect(build.length).toBeGreaterThan(0);
      for (const b of build) {
        // ближайшая предыдущая из команд lint/build должна быть lint
        const previous = [...lint, ...build].filter((i) => i < b).sort((x, y) => y - x)[0];
        expect(lint).toContain(previous);
      }
    });
  });
  // все узлы CustomNodes мемоизируются общим сравнением; выделенный Mermaid-узел масштабируется целиком
  describe('graph nodes (2.2)', () => {
    const src = read('src/components/CustomNodes.tsx');

    it('every memo() node in CustomNodes.tsx has isNodePropsEqual as comparator', () => {
      const memoCount = (src.match(/= memo\(/g) ?? []).length;
      const withComparator = (src.match(/\},\s*isNodePropsEqual\);/g) ?? []).length;
      expect(memoCount).toBeGreaterThan(0);
      expect(withComparator).toBe(memoCount);
    });

    it('ResultNode does not render col.name without a string check', () => {
      expect(src).not.toMatch(/\{col\.name\}/);
    });

    it('MermaidNode applies scale-102 to the whole node when selected', () => {
      expect(read('src/components/MermaidNodes.tsx')).toMatch(/selected \? 'scale-102'/);
    });
  });

  // Информационный страж: подписи узлов графа проходят через t() и есть в EN_DICT
  describe('CustomNodes labels', () => {
    const src = read('src/components/CustomNodes.tsx');
    const keys = [...src.matchAll(/\bt\(\s*(['"])(.*?)\1\s*\)/g)].map((m) => m[2]);

    it('uses t() for node labels', () => {
      expect(keys.length).toBeGreaterThanOrEqual(10);
    });

    it('every t(\'…\') literal in CustomNodes.tsx is present in EN_DICT', () => {
      const missing = keys.filter((k) => !(k in EN_DICT));
      expect(missing).toEqual([]);
    });

    it('former hard-coded English labels are gone from JSX text', () => {
      for (const label of ['Expand Details', 'No columns projected', 'Constant Expressions Only']) {
        expect(src).not.toContain(`>${label}<`);
        expect(src).not.toContain(`'${label}'`);
      }
    });
  });

  // сборка dev-сервера отдельно, в dist/ его нет (иначе он попадает в пакеты Tauri и APK)
  describe('server build (2.13)', () => {
    const pkg = JSON.parse(read('package.json'));

    it('npm run build не собирает server.ts и ничего не пишет в dist/server.cjs', () => {
      expect(pkg.scripts.build).not.toMatch(/esbuild|server\.ts|server\.cjs/);
    });

    it('build:server собирает server.ts вне dist/', () => {
      expect(pkg.scripts['build:server']).toMatch(/esbuild server\.ts/);
      expect(pkg.scripts['build:server']).not.toMatch(/dist\//);
    });

    it('start запускает собранный сервер из того же каталога, что и build:server', () => {
      const out = /--outfile=(\S+)/.exec(pkg.scripts['build:server'])?.[1];
      expect(out).toBeTruthy();
      expect(pkg.scripts.start).toContain(`node ${out}`);
    });
  });

  // dev-сервер
  describe('dev server (2.28)', () => {
    const src = read('server.ts');

    it('нет общего express.json() без исключения для /api/vfs/upload', () => {
      expect(src).not.toMatch(/app\.use\(express\.json\(\)\)/);
      expect(src).toContain('"/api/vfs/upload" ? next()');
    });

    it('SQL запроса ClickHouse не пишется в консоль', () => {
      expect(src).not.toContain('CH QUERY');
    });

    it('PRAGMA и Init SQL выполняются с ожиданием, без пустых колбэков', () => {
      expect(src).not.toMatch(/dbObj\.run\([^\n]*\(\) => \{\}\)/);
      expect(src).toMatch(/await applyDuckDbPragmas\(db, config\)/);
      expect(src).toMatch(/await applyDuckDbPragmas\(db, req\.body\)/);
    });

    it('PRAGMA threads не выполняется для 0 («авто») — сервер и WASM', () => {
      expect(src).not.toMatch(/parseInt\(threads\) >= 0/);
      expect(src).toMatch(/parseInt\(threads\) > 0/);
      const wasm = read('src/lib/duckdbWasm.ts');
      expect(wasm).not.toMatch(/options\.threads >= 0/);
      expect(wasm).toMatch(/options\.threads > 0/);
    });

    it('подготовленный оператор освобождается', () => {
      expect(src).toContain('stmt.finalize()');
    });
  });
});
