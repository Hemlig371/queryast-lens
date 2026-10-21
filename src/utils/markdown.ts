
/**
 * Небольшой Markdown -> HTML рендерер без зависимостей (CommonMark/GFM-подмножество).
 *
 * Поддерживается: заголовки (# и setext), абзацы, переносы, **жирный**, *курсив*, ~~зачёркнутый~~,
 * `код`, блоки кода ``` и ~~~, цитаты, списки (вложенные, нумерованные, чекбоксы [ ] / [x]),
 * таблицы GFM с выравниванием, ссылки, картинки, автоссылки, горизонтальная линия, \-экранирование.
 * Не поддерживается: ссылки-сноски [текст][id], сноски, HTML-блоки (HTML экранируется),
 * блоки кода с отступом в 4 пробела, формулы.
 *
 * Безопасность: любой пользовательский текст экранируется; URL проверяются по списку схем;
 * из «сырого» HTML пропускаются только простые теги без атрибутов (br, kbd, sub, sup, b, i, u, mark, s, del, ins, em, strong, code).
 * Результат всё равно нужно пропускать через DOMPurify перед вставкой в DOM.
 */

export interface MarkdownRenderOptions {
  /** HTML для блока ```mermaid (index — порядковый номер блока) */
  renderMermaid?: (code: string, index: number) => string;
  /** HTML (уже подсвеченный и экранированный) для блока кода известного языка */
  highlightCode?: (code: string, lang: string) => string | null;
}

export interface MarkdownRenderResult {
  html: string;
  /** исходники блоков кода по порядку (для кнопок «Копировать») */
  codeBlocks: string[];
  /** исходники mermaid-блоков по порядку (для «Открыть как граф») */
  mermaidBlocks: string[];
}

interface Ctx {
  opts: MarkdownRenderOptions;
  codeBlocks: string[];
  mermaidBlocks: string[];
  slugs: Map<string, number>;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Допустимый URL ссылки/картинки или null. */
export function safeUrl(raw: string, forImage = false): string | null {
  const url = raw.trim().replace(/^<|>$/g, '');
  if (!url) return null;
  if (/[\u0000-\u001f\u007f]/.test(url)) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url);
  if (!scheme) return url; // относительная ссылка или #якорь
  const s = scheme[1].toLowerCase();
  if (s === 'http' || s === 'https') return url;
  if (!forImage && (s === 'mailto' || s === 'tel')) return url;
  if (forImage && s === 'data' && /^data:image\/(png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i.test(url)) return url;
  return null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // некорректная %-последовательность (`#100%`)
  }
}

function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
  return base || 'section';
}

// ---------------------------------------------------------------------------
// Инлайн
// ---------------------------------------------------------------------------

const ALLOWED_INLINE_TAG = /^<(\/?)(br|kbd|sub|sup|b|i|u|mark|s|del|ins|em|strong|code)\s*\/?>/i;
const ESCAPABLE = '\\`*_{}[]()#+-.!|~<>';

function isAlnum(ch: string | undefined): boolean {
  return !!ch && /[\p{L}\p{N}]/u.test(ch);
}
function isSpace(ch: string | undefined): boolean {
  return !ch || /\s/.test(ch);
}

/** Индекс закрывающего `closer`, который ведёт себя как закрытие эмфазы, либо -1. */
function findEmphasisClose(s: string, from: number, delim: string): number {
  const underscore = delim[0] === '_';
  for (let j = from; j < s.length; j++) {
    const ch = s[j];
    if (ch === '\\') { j++; continue; }
    if (ch === '`') {
      // пропускаем код-спан
      const run = /^`+/.exec(s.substring(j))![0];
      const end = s.indexOf(run, j + run.length);
      if (end !== -1) j = end + run.length - 1;
      continue;
    }
    if (s.startsWith(delim, j) && !isSpace(s[j - 1])) {
      // не принимать часть более длинной серии (**) за закрытие одиночного *
      if (delim.length === 1 && s[j + 1] === delim) { j++; continue; }
      // серия длиннее закрывающей (`**a *b***`): закрываем последними символами серии
      if (delim.length === 2) {
        let run = 0;
        while (s[j + run] === delim[0]) run++;
        if (run > 2) j += run - 2;
      }
      if (underscore && isAlnum(s[j + delim.length])) continue;
      return j;
    }
  }
  return -1;
}

/** Парные скобки для [text](url): возвращает индекс закрывающей скобки. */
function findClosingBracket(s: string, open: number, o: string, c: string): number {
  let depth = 0;
  for (let j = open; j < s.length; j++) {
    const ch = s[j];
    if (ch === '\\') { j++; continue; }
    if (ch === o) depth++;
    else if (ch === c) {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

function renderLinkTarget(dest: string): { url: string; title?: string } {
  const m = /^\s*(<[^>]*>|[^\s]+)(?:\s+"([^"]*)")?\s*$/.exec(dest);
  if (!m) return { url: dest.trim() };
  return { url: m[1], title: m[2] };
}

export function renderInline(text: string, ctx?: Ctx): string {
  const s = text;
  let out = '';
  let i = 0;
  let plain = '';

  const flush = () => {
    if (plain) {
      out += autolinkBare(plain);
      plain = '';
    }
  };

  while (i < s.length) {
    const ch = s[i];

    // \-экранирование
    if (ch === '\\' && i + 1 < s.length && ESCAPABLE.includes(s[i + 1])) {
      plain += s[i + 1];
      i += 2;
      continue;
    }
    // перенос строки внутри абзаца
    if (ch === '\n') {
      const hard = / {2,}$/.test(plain) || plain.endsWith('\\');
      if (hard) {
        plain = plain.replace(/( {2,}|\\)$/, '');
        flush();
        out += '<br>\n';
      } else {
        plain = plain.replace(/ +$/, '');
        plain += '\n';
      }
      i++;
      while (s[i] === ' ') i++;
      continue;
    }

    // код-спан
    if (ch === '`') {
      const run = /^`+/.exec(s.substring(i))![0];
      const end = s.indexOf(run, i + run.length);
      if (end !== -1) {
        flush();
        let code = s.substring(i + run.length, end).replace(/\n/g, ' ');
        if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
        out += `<code>${escapeHtml(code)}</code>`;
        i = end + run.length;
        continue;
      }
      plain += run;
      i += run.length;
      continue;
    }

    // картинка и ссылка
    if ((ch === '!' && s[i + 1] === '[') || ch === '[') {
      const isImage = ch === '!';
      const open = isImage ? i + 1 : i;
      const close = findClosingBracket(s, open, '[', ']');
      if (close !== -1 && s[close + 1] === '(') {
        const parenEnd = findClosingBracket(s, close + 1, '(', ')');
        if (parenEnd !== -1) {
          const label = s.substring(open + 1, close);
          const { url, title } = renderLinkTarget(s.substring(close + 2, parenEnd));
          const safe = safeUrl(url, isImage);
          flush();
          if (isImage) {
            if (safe) {
              out += `<img src="${escapeHtml(safe)}" alt="${escapeHtml(label)}"${title ? ` title="${escapeHtml(title)}"` : ''} loading="lazy">`;
            } else {
              out += escapeHtml(label);
            }
          } else if (safe) {
            const inner = renderInline(label, ctx);
            if (safe.startsWith('#')) {
              out += `<a href="#md-${escapeHtml(slugify(safeDecode(safe.slice(1))))}"${title ? ` title="${escapeHtml(title)}"` : ''}>${inner}</a>`;
            } else {
              out += `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer"${title ? ` title="${escapeHtml(title)}"` : ''}>${inner}</a>`;
            }
          } else {
            out += renderInline(label, ctx);
          }
          i = parenEnd + 1;
          continue;
        }
      }
      plain += ch;
      i++;
      continue;
    }

    // <автоссылка> и простые теги
    if (ch === '<') {
      const auto = /^<((?:https?:\/\/|mailto:)[^\s<>]+|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>/i.exec(s.substring(i));
      if (auto) {
        flush();
        const target = /^(https?:|mailto:)/i.test(auto[1]) ? auto[1] : `mailto:${auto[1]}`;
        out += `<a href="${escapeHtml(target)}" target="_blank" rel="noopener noreferrer">${escapeHtml(auto[1])}</a>`;
        i += auto[0].length;
        continue;
      }
      const tag = ALLOWED_INLINE_TAG.exec(s.substring(i));
      if (tag) {
        flush();
        const name = tag[2].toLowerCase();
        out += name === 'br' ? '<br>' : `<${tag[1]}${name}>`;
        i += tag[0].length;
        continue;
      }
      plain += ch;
      i++;
      continue;
    }

    // эмфаза
    if (ch === '*' || ch === '_' || ch === '~') {
      const run = /^[*_~]+/.exec(s.substring(i))![0];
      const tryDelims: Array<[string, string]> = [];
      if (ch === '~') {
        if (run.length >= 2) tryDelims.push(['~~', 'del']);
      } else if (run.length >= 3) {
        tryDelims.push([ch.repeat(3), 'em+strong']);
        tryDelims.push([ch.repeat(2), 'strong']);
        tryDelims.push([ch, 'em']);
      } else if (run.length === 2) {
        tryDelims.push([ch.repeat(2), 'strong']);
        tryDelims.push([ch, 'em']);
      } else {
        tryDelims.push([ch, 'em']);
      }
      let done = false;
      for (const [delim, kind] of tryDelims) {
        if (isSpace(s[i + delim.length])) continue; // открывающая серия не может быть перед пробелом
        if (ch === '_' && isAlnum(s[i - 1])) continue; // snake_case не курсив
        const close = findEmphasisClose(s, i + delim.length, delim);
        if (close === -1 || close === i + delim.length) continue;
        flush();
        const inner = renderInline(s.substring(i + delim.length, close), ctx);
        out += kind === 'em+strong' ? `<em><strong>${inner}</strong></em>` : `<${kind}>${inner}</${kind}>`;
        i = close + delim.length;
        done = true;
        break;
      }
      if (done) continue;
      plain += run;
      i += run.length;
      continue;
    }

    plain += ch;
    i++;
  }
  flush();
  return out;
}

/**
 * Голые http(s):// ссылки в обычном (ещё не экранированном) тексте; возвращает готовый HTML.
 * Ссылка кончается на пробеле, `<`, `>` или кавычке; хвостовая пунктуация и «лишняя» `)` в ссылку не входят,
 * а скобки внутри ссылки (`/wiki/A_(b)`) остаются.
 */
function autolinkBare(text: string): string {
  let out = '';
  let last = 0;
  const re = /\bhttps?:\/\/[^\s<>"]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let url = m[0];
    for (;;) {
      const tail = url[url.length - 1];
      if (/[.,;:!?'\]*]/.test(tail)) { url = url.slice(0, -1); continue; }
      if (tail === ')' && (url.match(/\)/g) || []).length > (url.match(/\(/g) || []).length) { url = url.slice(0, -1); continue; }
      break;
    }
    if (!/^https?:\/\/[^/?#]+/i.test(url)) continue; // «http://» без адреса — не ссылка
    out += escapeHtml(text.slice(last, m.index));
    out += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
    last = m.index + url.length;
    re.lastIndex = last;
  }
  return out + escapeHtml(text.slice(last));
}

// ---------------------------------------------------------------------------
// Блоки
// ---------------------------------------------------------------------------

const RE_FENCE = /^( {0,3})(`{3,}|~{3,})\s*([^`]*?)\s*$/;
const RE_HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/;
const RE_HR = /^ {0,3}([-*_])(?: *\1){2,} *$/;
const RE_QUOTE = /^ {0,3}>/;
const RE_LIST = /^( {0,3})([-*+]|\d{1,9}[.)])( +|$)(.*)$/;
const RE_TABLE_DELIM = /^ *\|? *:?-{1,}:? *(?:\| *:?-{1,}:? *)*\|? *$/;

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) { cells.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function startsBlock(line: string, nextLine?: string): boolean {
  if (RE_FENCE.test(line) || RE_HEADING.test(line) || RE_HR.test(line) || RE_QUOTE.test(line)) return true;
  const m = RE_LIST.exec(line);
  if (m && m[4].trim() !== '') return true;
  if (line.includes('|') && nextLine !== undefined && RE_TABLE_DELIM.test(nextLine) && nextLine.includes('-')) {
    return line.includes('|') && nextLine.includes('|');
  }
  return false;
}

function renderCodeBlock(code: string, info: string, ctx: Ctx): string {
  const lang = (info.split(/\s+/)[0] || '').toLowerCase();
  if (lang === 'mermaid') {
    const index = ctx.mermaidBlocks.length;
    ctx.mermaidBlocks.push(code);
    if (ctx.opts.renderMermaid) return ctx.opts.renderMermaid(code, index);
  }
  const index = ctx.codeBlocks.length;
  ctx.codeBlocks.push(code);
  const highlighted = ctx.opts.highlightCode ? ctx.opts.highlightCode(code, lang) : null;
  const body = highlighted ?? escapeHtml(code);
  const langAttr = lang ? ` data-lang="${escapeHtml(lang.replace(/[^\w+#-]/g, ''))}"` : '';
  return (
    `<div class="md-code"${langAttr}>` +
    (lang ? `<div class="md-code-bar"><span>${escapeHtml(lang.replace(/[^\w+#-]/g, ''))}</span></div>` : '') +
    `<pre><code>${body}</code></pre></div>`
  );
}

function renderList(lines: string[], start: number, ctx: Ctx): { html: string; next: number } {
  const first = RE_LIST.exec(lines[start])!;
  const ordered = /\d/.test(first[2]);
  const marker = ordered ? first[2].slice(-1) : first[2];
  const startNum = ordered ? parseInt(first[2], 10) : 1;

  const items: Array<{ lines: string[] }> = [];
  let i = start;
  let loose = false;

  while (i < lines.length) {
    const m = RE_LIST.exec(lines[i]);
    if (!m) break;
    const isOrdered = /\d/.test(m[2]);
    if (isOrdered !== ordered || (ordered ? m[2].slice(-1) !== marker : m[2] !== marker)) break;
    if (RE_HR.test(lines[i])) break;

    const contentIndent = m[1].length + m[2].length + Math.min(Math.max(m[3].length, 1), 4);
    const itemLines: string[] = [m[4]];
    i++;
    let pendingBlank = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { pendingBlank++; i++; continue; }
      const indent = /^ */.exec(line)![0].length;
      if (indent >= contentIndent) {
        for (let b = 0; b < pendingBlank; b++) itemLines.push('');
        pendingBlank = 0;
        itemLines.push(line.slice(contentIndent));
        i++;
        continue;
      }
      // «ленивое» продолжение абзаца
      if (pendingBlank === 0 && !startsBlock(line, lines[i + 1]) && !RE_LIST.test(line)) {
        itemLines.push(line.trim());
        i++;
        continue;
      }
      break;
    }
    // пустая строка между пунктами делает весь список «рыхлым» (абзацы в <p>);
    // но только если дальше идёт пункт ЭТОГО ЖЕ списка, а не другой список (другой маркер или тип)
    if (pendingBlank > 0 && i < lines.length) {
      const nm = RE_LIST.exec(lines[i]);
      if (nm && /\d/.test(nm[2]) === ordered && (ordered ? nm[2].slice(-1) === marker : nm[2] === marker)) loose = true;
    }
    items.push({ lines: itemLines });
  }

  const tag = ordered ? 'ol' : 'ul';
  const startAttr = ordered && startNum !== 1 ? ` start="${startNum}"` : '';
  let html = `<${tag}${startAttr}>`;
  for (const item of items) {
    let content = item.lines.slice();
    let checkbox = '';
    const task = /^\[([ xX])\]\s+/.exec(content[0] || '');
    if (task) {
      checkbox = `<span class="md-task" aria-hidden="true">${task[1] === ' ' ? '☐' : '☑'}</span> `;
      content[0] = content[0].slice(task[0].length);
    }
    // несколько абзацев внутри одного пункта тоже требуют <p>
    const inner = renderBlocks(content, ctx, !loose && !item.lines.includes(''));
    html += `<li${task ? ' class="md-task-item"' : ''}>${checkbox}${inner}</li>`;
  }
  html += `</${tag}>`;
  return { html, next: i };
}

export function renderBlocks(lines: string[], ctx: Ctx, tight = false): string {
  let html = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // fenced code
    const fence = RE_FENCE.exec(line);
    if (fence) {
      const fenceChar = fence[2][0];
      const fenceLen = fence[2].length;
      const indent = fence[1].length;
      const body: string[] = [];
      i++;
      const closeRe = new RegExp(`^ {0,3}\\${fenceChar}{${fenceLen},}\\s*$`);
      while (i < lines.length && !closeRe.test(lines[i])) {
        body.push(indent ? lines[i].replace(new RegExp(`^ {0,${indent}}`), '') : lines[i]);
        i++;
      }
      i++; // закрывающая ограда (или конец текста)
      html += renderCodeBlock(body.join('\n'), fence[3], ctx);
      continue;
    }

    // heading
    const h = RE_HEADING.exec(line);
    if (h) {
      const level = h[1].length;
      const text = (h[2] || '').trim();
      const base = slugify(text);
      const n = ctx.slugs.get(base) || 0;
      ctx.slugs.set(base, n + 1);
      const id = n === 0 ? base : `${base}-${n}`;
      html += `<h${level} id="md-${escapeHtml(id)}">${renderInline(text, ctx)}</h${level}>`;
      i++;
      continue;
    }

    // hr
    if (RE_HR.test(line)) {
      html += '<hr>';
      i++;
      continue;
    }

    // blockquote
    if (RE_QUOTE.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim() && (RE_QUOTE.test(lines[i]) || (quote.length > 0 && !startsBlock(lines[i], lines[i + 1])))) {
        quote.push(lines[i].replace(/^ {0,3}> ?/, ''));
        i++;
      }
      html += `<blockquote>${renderBlocks(quote, ctx)}</blockquote>`;
      continue;
    }

    // table
    if (line.includes('|') && i + 1 < lines.length && RE_TABLE_DELIM.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const header = splitTableRow(line);
      const delim = splitTableRow(lines[i + 1]);
      if (header.length === delim.length && (line.includes('|') && (lines[i + 1].includes('|') || header.length === 1))) {
        const aligns = delim.map(d => (d.startsWith(':') && d.endsWith(':') ? 'center' : d.endsWith(':') ? 'right' : d.startsWith(':') ? 'left' : ''));
        const cell = (tag: string, text: string, idx: number) =>
          `<${tag}${aligns[idx] ? ` style="text-align:${aligns[idx]}"` : ''}>${renderInline(text, ctx)}</${tag}>`;
        let table = '<div class="md-table-wrap"><table><thead><tr>' + header.map((c, k) => cell('th', c, k)).join('') + '</tr></thead>';
        i += 2;
        const rows: string[] = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
          const cells = splitTableRow(lines[i]);
          rows.push('<tr>' + header.map((_, k) => cell('td', cells[k] ?? '', k)).join('') + '</tr>');
          i++;
        }
        table += rows.length ? `<tbody>${rows.join('')}</tbody>` : '';
        html += table + '</table></div>';
        continue;
      }
    }

    // list
    const lm = RE_LIST.exec(line);
    if (lm && !RE_HR.test(line)) {
      const res = renderList(lines, i, ctx);
      html += res.html;
      i = res.next;
      continue;
    }

    // paragraph (+ setext heading)
    const para: string[] = [line];
    i++;
    let setext = 0;
    while (i < lines.length && lines[i].trim()) {
      const next = lines[i];
      if (/^ {0,3}=+ *$/.test(next)) { setext = 1; i++; break; }
      if (/^ {0,3}-+ *$/.test(next)) { setext = 2; i++; break; }
      if (startsBlock(next, lines[i + 1])) break;
      para.push(next);
      i++;
    }
    const text = para.map(l => l.replace(/^\s+/, '')).join('\n').trim();
    if (setext) {
      const base = slugify(text);
      const n = ctx.slugs.get(base) || 0;
      ctx.slugs.set(base, n + 1);
      const id = n === 0 ? base : `${base}-${n}`;
      html += `<h${setext} id="md-${escapeHtml(id)}">${renderInline(text, ctx)}</h${setext}>`;
    } else {
      html += tight ? `${renderInline(text, ctx)}` : `<p>${renderInline(text, ctx)}</p>`;
    }
  }
  return html;
}

export function renderMarkdown(source: string, opts: MarkdownRenderOptions = {}): MarkdownRenderResult {
  let text = (source || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
  // YAML front matter в начале документа не показываем
  text = text.replace(/^\s*---\n[\s\S]*?\n---[ \t]*(?:\n|$)/, '');
  const ctx: Ctx = { opts, codeBlocks: [], mermaidBlocks: [], slugs: new Map() };
  const html = renderBlocks(text.split('\n'), ctx);
  return { html, codeBlocks: ctx.codeBlocks, mermaidBlocks: ctx.mermaidBlocks };
}
