/**
 * Parser for guide/handbook-style PDFs that are organised as:
 *
 *     <page number>                      ← printed page number, first line of every page
 *     8                                  ← chapter number (must follow the previous chapter's)
 *     MATERNITY LEAVE                    ← chapter title, ALL CAPS
 *     (Republic Act No. 11210)           ← optional legal-basis line
 *     A. Definition                      ← lettered subsections, in order A, B, C…
 *     …body text, numbered/lettered lists, footnotes…
 *
 * Built for the DOLE-BWC "Workers' Statutory Monetary Benefits" handbook (2024).
 * Output is the same `Section` shape the statute parser produces, so chunking,
 * seeding and the UI work unchanged. Pure functions, no I/O.
 *
 * Guards against false positives: a chapter number is only accepted if it is
 * exactly previous+1, and a subsection letter only if it is the next letter.
 */
import type { Section } from './corpus';

export type HandbookOptions = {
  /** Unnumbered chapters, matched as an exact standalone line (case-insensitive) */
  unnumberedChapters?: string[];
  /** Printed page numbers to drop entirely (e.g. a table whose columns extract scrambled) */
  skipPrintedPages?: number[];
  /** Drop subsections whose title matches any of these */
  excludeSectionTitles?: RegExp[];
  /** Stop parsing at the first line equal to one of these (case-insensitive); everything after is dropped */
  stopAtHeadings?: string[];
  /** Chapters (by title) whose text before the first "A." subsection should be dropped */
  dropChapterIntro?: string[];
};

// Superscript footnote markers extract as stray lines: "e", "aa", "fff"
const FOOTNOTE_MARK = /^([a-z])\1{0,3}$/;
// Table-of-contents lines: "COVERAGE ............ 6"
const DOT_LEADER = /\.{5,}/;
const SUBSECTION = /^([A-Z])\.\s+(\S.*)$/;
const LIST_START = /^(\d{1,2}\.|[a-z]\.|•|\()/;

const ACRONYMS = new Set(['VAWC', 'SSS', 'ECC', 'BWC', 'DOLE', 'NCR', 'PHP', 'SIL', 'RA', 'OT', 'II', 'III', 'IV']);
const WORD_FIX: Record<string, string> = { 'PAG-IBIG': 'Pag-IBIG', PHILHEALTH: 'PhilHealth' };
const SMALL = new Set(['of', 'and', 'the', 'on', 'for', 'in', 'to', 'a', 'by', 'or', 'with', 'under']);

function isAllCaps(line: string): boolean {
  const letters = line.replace(/[^A-Za-z]/g, '');
  return letters.length >= 3 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.9;
}

export function prettyTitle(raw: string): string {
  const words = raw.trim().replace(/\s+/g, ' ').split(' ');
  return words
    .map((w, i) => {
      const bare = w.replace(/[()’',.]/g, '');
      if (WORD_FIX[bare.toUpperCase()]) return w.replace(bare, WORD_FIX[bare.toUpperCase()]);
      if (/^\(.*\)$/.test(w)) return w; // e.g. "(VAWC)" stays as written
      if (ACRONYMS.has(bare.toUpperCase())) return w.toUpperCase();
      const lower = w.toLowerCase();
      if (i > 0 && SMALL.has(lower)) return lower;
      return lower
        .split('-')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join('-');
    })
    .join(' ');
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function tidy(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+([,.;:)])/g, '$1')
    .trim();
}

type Line = { text: string; page: number };
type Cur = {
  chapter: number | null;
  chapterKey: string;
  chapterTitle: string;
  letter: string | null;
  title: string | null;
  parts: string[];
  page: number;
  pageEnd: number;
};

export function parseHandbook(pages: string[], opts: HandbookOptions = {}): Section[] {
  const unnumbered = new Set((opts.unnumberedChapters ?? []).map((s) => s.toLowerCase()));
  const skipPages = new Set(opts.skipPrintedPages ?? []);
  const stops = new Set((opts.stopAtHeadings ?? []).map((t) => t.toLowerCase()));

  // 1. Flatten pages → lines tagged with the PRINTED page number.
  const lines: Line[] = [];
  let stopped = false;
  for (const p of pages) {
    const raw = p
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    // Pages with no printed number (cover, blank, ruled note pages, back cover) are not content.
    if (raw.length === 0 || !/^\d{1,3}$/.test(raw[0])) continue;
    const printed = Number(raw[0]);
    if (skipPages.has(printed)) continue;
    for (const text of raw.slice(1)) {
      if (stops.has(text.toLowerCase())) {
        stopped = true;
        break;
      }
      if (FOOTNOTE_MARK.test(text) || DOT_LEADER.test(text)) continue;
      lines.push({ text, page: printed });
    }
    if (stopped) break;
  }

  // 2. Walk the lines.
  const out: (Section & { _chapter: string })[] = [];
  let started = false;
  let chapterNo = 0;
  let cur: Cur | null = null;

  const flush = () => {
    if (cur) {
      const text = tidy(cur.parts.join(' '));
      if (text.length > 0) {
        const hasLetter = cur.letter !== null;
        out.push({
          _chapter: cur.chapterKey,
          unit: 'Chapter',
          article: cur.chapter !== null ? String(cur.chapter) : cur.chapterKey,
          articleTitle: cur.chapterTitle,
          section: cur.letter,
          sectionTitle: cur.title,
          text,
          page: cur.page,
          pageEnd: cur.pageEnd,
          citation: hasLetter ? `${cur.chapterTitle}, ${cur.letter}. ${cur.title}` : cur.chapterTitle,
          heading:
            (cur.chapter !== null ? `${cur.chapterTitle} (Chapter ${cur.chapter})` : cur.chapterTitle) +
            (hasLetter ? ` — ${cur.letter}. ${cur.title}` : ''),
        });
      }
    }
    cur = null;
  };

  const startChapter = (num: number | null, title: string, page: number) => {
    flush();
    started = true;
    const pretty = prettyTitle(title);
    cur = {
      chapter: num,
      chapterKey: num !== null ? String(num) : slug(pretty),
      chapterTitle: pretty,
      letter: null,
      title: null,
      parts: [],
      page,
      pageEnd: page,
    };
  };
  let expected = 'A';

  for (let i = 0; i < lines.length; i++) {
    const { text, page } = lines[i];
    const next = lines[i + 1]?.text;

    // numbered chapter: "8" + ALL-CAPS title (+ wrapped caps lines)
    if (/^\d{1,2}$/.test(text) && Number(text) === chapterNo + 1 && next && isAllCaps(next)) {
      let title = next;
      i += 1;
      while (lines[i + 1] && isAllCaps(lines[i + 1].text) && !SUBSECTION.test(lines[i + 1].text) && title.length < 90) {
        title += ' ' + lines[i + 1].text;
        i += 1;
      }
      chapterNo = Number(text);
      startChapter(chapterNo, title, page);
      expected = 'A';
      continue;
    }

    // unnumbered chapter (exact standalone heading line)
    if (unnumbered.has(text.toLowerCase())) {
      startChapter(null, text, page);
      expected = 'A';
      continue;
    }

    if (!started || !cur) continue; // front matter before the first chapter

    // lettered subsection in sequence
    const sm = text.match(SUBSECTION);
    if (sm && sm[1] === expected) {
      let title = sm[2];
      // long headings wrap: absorb a short, unpunctuated continuation line
      if (title.length >= 60 && next && next.length < 70 && !/[.:;]$/.test(next) && !LIST_START.test(next)) {
        title += ' ' + next;
        i += 1;
      }
      const prev: Cur = cur;
      flush();
      cur = {
        chapter: prev.chapter,
        chapterKey: prev.chapterKey,
        chapterTitle: prev.chapterTitle,
        letter: sm[1],
        title: tidy(title),
        parts: [],
        page,
        pageEnd: page,
      };
      expected = String.fromCharCode(sm[1].charCodeAt(0) + 1);
      continue;
    }

    (cur as Cur).parts.push(text);
    (cur as Cur).pageEnd = page;
  }
  flush();

  // 3. Fold short legal-basis lines "(Article 95)" into the chapter's first subsection.
  const merged: (Section & { _chapter: string })[] = [];
  for (let i = 0; i < out.length; i++) {
    const s = out[i];
    const nxt = out[i + 1];
    if (s.section === null && nxt && nxt._chapter === s._chapter && nxt.section === 'A' && s.text.length < 120 && s.text.startsWith('(')) {
      nxt.text = `Legal basis: ${s.text.replace(/^\(|\)$/g, '')}. ${nxt.text}`;
      nxt.page = s.page;
      continue;
    }
    if (s.section === null && s.articleTitle) s.sectionTitle = null;
    merged.push(s);
  }

  // 4. Drop excluded subsections and unwanted chapter intros.
  const excl = opts.excludeSectionTitles ?? [];
  const dropIntro = new Set((opts.dropChapterIntro ?? []).map((t) => t.toLowerCase()));
  return merged
    .filter((s) => !(s.sectionTitle && excl.some((re) => re.test(s.sectionTitle!))))
    .filter((s) => !(s.section === null && dropIntro.has(s.articleTitle.toLowerCase())))
    .map(({ _chapter, ...rest }) => rest as Section);
}
