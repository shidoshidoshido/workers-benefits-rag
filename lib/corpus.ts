/**
 * Corpus parsing + chunking for statutes and constitutions.
 *
 * Handles two shapes of Philippine legal text:
 *   - Constitution style:  ARTICLE III … "Section 2. …"        → "Art. III, Sec. 2"
 *   - Republic Act style:  CHAPTER IV … "SEC. 16. Rights of the Data Subject. – …" → "Sec. 16"
 *
 * Pure functions only (no network, no env) so they can be tested offline and
 * re-used by `lib/seed.ts`.
 *
 * Strategy: chunk by SECTION, the natural unit of citation. Only sections
 * longer than MAX_CHARS are split further — preferably at "(a)", "(b)" …
 * sub-paragraph boundaries, otherwise at sentence ends with a small overlap.
 * Every part keeps the section's metadata.
 */
import { CORPUS } from './config';

export const SOURCE_NAME = CORPUS.name;

/** Sections longer than this get split into parts. */
export const MAX_CHARS = 1500;
export const OVERLAP_CHARS = 150;

export type Unit = 'Article' | 'Chapter';

export type Section = {
  unit: Unit;
  /** Roman numeral of the Article/Chapter, or "PREAMBLE" for text before the first one */
  article: string;
  articleTitle: string;
  /** "1", "2", … or null when the Article/Chapter has no numbered sections */
  section: string | null;
  /** run-in heading, e.g. "Declaration of Policy" (statutes only) */
  sectionTitle: string | null;
  text: string;
  /** page where the section starts (null when the source has no page info) */
  page: number | null;
  pageEnd: number | null;
  /** parsers for other layouts (handbooks) can set the label/heading directly */
  citation?: string;
  heading?: string;
};

export type Chunk = {
  id: string;
  /** Short human label used for citations, e.g. "Sec. 12" or "Art. III, Sec. 2" */
  citation: string;
  /** Text that gets embedded (heading + body, so headings help retrieval) */
  embedText: string;
  /** Raw passage text shown to the user and given to the model */
  text: string;
  unit: Unit;
  article: string;
  articleTitle: string;
  section: string | null;
  sectionTitle: string | null;
  page: number | null;
  pageEnd: number | null;
  part: number;
  parts: number;
  source: string;
};

// ---------------------------------------------------------------- parsing

const ROMAN = '[IVXLC]+';
// "ARTICLE III", "CHAPTER I", optionally followed by a title on the same line
const UNIT_UPPER = new RegExp(`^(ARTICLE|CHAPTER)\\s+(${ROMAN})\\b\\s*[-–—:.]?\\s*(.*)$`);
// "Article III" / "Chapter I" alone on a line (title-case PDFs) — must be the whole line
const UNIT_ALONE = new RegExp(`^(Article|Chapter)\\s+(${ROMAN})\\s*$`);
// "Section 1." / "SEC. 2." / "SECTION 3 -" — number must be followed by . or a dash
const SECTION = /^SEC(?:TION)?\.?\s+(\d+)\s*[.\-–—:]\s*(.*)$/i;
// "Declaration of Policy. – It is the policy…"  → title + rest
const RUN_IN_TITLE = /^(.{2,100}?)\.\s*(?:[–—]|\s-\s)\s*(.*)$/;
const PREAMBLE = /^PREAMBLE\s*$/i;
// Where a statute's text ends and the signatures/approval block begins
const END_OF_TEXT = /^(Approved\s*[,:]|\(Sgd\.?\)|This Act which is a consolidation)/i;
// page furniture we never want in the text
const PAGE_NOISE = [/^\s*\d{1,3}\s*$/, /^\s*page\s+\d+(\s+of\s+\d+)?\s*$/i];

function isNoise(line: string): boolean {
  return PAGE_NOISE.some((re) => re.test(line));
}

function isHeadingLike(t: string): boolean {
  return SECTION.test(t) || UNIT_UPPER.test(t) || UNIT_ALONE.test(t);
}

function looksLikeTitle(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 90 || isHeadingLike(t)) return false;
  // all caps, or Title Case without sentence punctuation
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length === 0) return false;
  const upperRatio = letters.replace(/[^A-Z]/g, '').length / letters.length;
  return upperRatio > 0.8 || !/[.;,]$/.test(t);
}

function isAllCaps(line: string): boolean {
  const letters = line.replace(/[^A-Za-z]/g, '');
  return letters.length > 0 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.9;
}

function titleCase(s: string): string {
  const small = new Set(['of', 'and', 'the', 'on', 'for', 'in', 'to', 'a']);
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function normalizeTitle(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ');
  const letters = t.replace(/[^A-Za-z]/g, '');
  const upper = letters.length > 0 && letters === letters.toUpperCase();
  return upper ? titleCase(t) : t;
}

/** Split "Title. – body" into its parts; title must be short and sentence-free. */
function splitRunInTitle(s: string): { title: string; rest: string } | null {
  const m = s.match(RUN_IN_TITLE);
  if (!m) return null;
  const title = m[1].trim();
  if (title.split(/\s+/).length > 16 || /[.;:]/.test(title)) return null;
  return { title, rest: m[2].trim() };
}

type Current = {
  section: string | null;
  sectionTitle: string | null;
  parts: string[];
  page: number | null;
  pageEnd: number | null;
  /** true once the section's run-in title was found (or we gave up looking) */
  titleDone: boolean;
  linesSeen: number;
};

/**
 * Parse page texts into sections. `pages[i]` is the text of page i+1.
 * Pass `hasPages=false` for plain-text sources with no real page breaks.
 */
export function parseSections(pages: string[], hasPages = true): Section[] {
  type Line = { text: string; page: number | null };
  const lines: Line[] = [];
  pages.forEach((p, i) => {
    for (const raw of p.split(/\r?\n/)) {
      const text = raw.replace(/\s+/g, ' ').trim();
      if (!text || isNoise(text)) continue;
      lines.push({ text, page: hasPages ? i + 1 : null });
    }
  });

  const sections: Section[] = [];
  let unit: Unit = 'Article';
  let article = 'PREAMBLE';
  let articleTitle = 'Preamble';
  const state: { cur: Current | null } = { cur: null };
  let pendingTitle = false; // the next line may be the Article/Chapter title
  let rawTitle = ''; // title text so far (may continue on following ALL-CAPS lines)
  let titleOpen = 0; // continuation lines still allowed after the title's first line
  let seenUnit = false;
  let ended = false;

  const flush = () => {
    const c = state.cur;
    if (c && c.parts.length > 0) {
      const text = c.parts.join(' ').replace(/\s+/g, ' ').trim();
      if (text.length > 0) {
        sections.push({
          unit,
          article,
          articleTitle,
          section: c.section,
          sectionTitle: c.sectionTitle,
          text,
          page: c.page,
          pageEnd: c.pageEnd,
        });
      }
    }
    state.cur = null;
  };

  const open = (section: string | null, page: number | null): Current => {
    state.cur = {
      section,
      sectionTitle: null,
      parts: [],
      page,
      pageEnd: page,
      titleDone: section === null,
      linesSeen: 0,
    };
    return state.cur;
  };

  open(null, lines[0]?.page ?? null);

  for (const { text, page } of lines) {
    if (ended) break;

    // Signature / approval block at the end of a statute
    if (seenUnit && END_OF_TEXT.test(text)) {
      flush();
      ended = true;
      continue;
    }

    // Article / Chapter heading
    const au = text.match(UNIT_UPPER);
    const aa = text.match(UNIT_ALONE);
    if (au || aa) {
      flush();
      const m = (au ?? aa)!;
      unit = m[1].toUpperCase() === 'CHAPTER' ? 'Chapter' : 'Article';
      article = m[2];
      rawTitle = au && au[3] ? au[3].trim() : '';
      articleTitle = rawTitle ? normalizeTitle(rawTitle) : '';
      pendingTitle = !articleTitle;
      titleOpen = articleTitle ? 2 : 0;
      seenUnit = true;
      open(null, page);
      continue;
    }

    if (PREAMBLE.test(text) && sections.length === 0 && (state.cur?.parts.length ?? 0) === 0) {
      continue; // bare "PREAMBLE" heading line
    }

    // Title on the line right after "ARTICLE X" / "CHAPTER X"
    if (pendingTitle) {
      pendingTitle = false;
      if (looksLikeTitle(text)) {
        rawTitle = text;
        articleTitle = normalizeTitle(rawTitle);
        titleOpen = 2;
        continue;
      }
    }

    // Long titles wrap: "SECURITY OF SENSITIVE PERSONAL" / "INFORMATION IN GOVERNMENT"
    if (titleOpen > 0) {
      if (isAllCaps(text) && !isHeadingLike(text) && text.length <= 90 && isAllCaps(rawTitle)) {
        rawTitle = `${rawTitle} ${text}`;
        articleTitle = normalizeTitle(rawTitle);
        titleOpen -= 1;
        continue;
      }
      titleOpen = 0;
    }

    // Section heading
    const sm = text.match(SECTION);
    if (sm) {
      flush();
      const cur = open(sm[1], page);
      const split = splitRunInTitle(sm[2]);
      if (split) {
        cur.sectionTitle = normalizeTitle(split.title);
        cur.titleDone = true;
        if (split.rest) cur.parts.push(split.rest);
      } else if (sm[2]) {
        cur.parts.push(sm[2]);
        cur.linesSeen = 1;
      }
      continue;
    }

    // body text
    const cur = state.cur ?? open(null, page);
    cur.parts.push(text);
    cur.pageEnd = page;

    // A long heading can wrap before its ". –": retry on the first lines joined.
    if (!cur.titleDone) {
      cur.linesSeen += 1;
      const split = splitRunInTitle(cur.parts.join(' '));
      if (split) {
        cur.sectionTitle = normalizeTitle(split.title);
        cur.parts = split.rest ? [split.rest] : [];
        cur.titleDone = true;
      } else if (cur.linesSeen >= 3) {
        cur.titleDone = true; // no run-in title in this section
      }
    }
  }
  flush();

  return sections;
}

// --------------------------------------------------------------- chunking

export function citationFor(unit: Unit, article: string, section: string | null): string {
  if (article === 'PREAMBLE') return 'Preamble';
  if (unit === 'Chapter') return section ? `Sec. ${section}` : `Chapter ${article}`;
  return section ? `Art. ${article}, Sec. ${section}` : `Art. ${article}`;
}

/**
 * Split long text into parts of ~max chars. Prefers to break just before a
 * sub-item ("(a)", "1.", "a.", bullet; no overlap needed); otherwise breaks at a
 * sentence end and overlaps the next part by `overlap` chars.
 */
export function splitLong(text: string, max = MAX_CHARS, overlap = OVERLAP_CHARS): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(text.length, i + max);
    let clean = false;
    if (end < text.length) {
      const markerStart = i + Math.floor(max * 0.5);
      // sub-item starts: "(a) ", "1. Xxx", "a. Xxx" (capital letter after the marker)
      const markers = [
        ...text.slice(markerStart, end).matchAll(/\s(?=(?:\([a-z]{1,2}\)\s|\d{1,2}\.\s+[A-Z]|[a-z]\.\s+[A-Z]|•\s))/g),
      ];
      const marker = markers[markers.length - 1];
      if (marker && marker.index !== undefined) {
        end = markerStart + marker.index;
        clean = true;
      } else {
        const sentStart = i + Math.floor(max * 0.6);
        const win = text.slice(sentStart, end);
        const last = (re: RegExp) => {
          const ms = [...win.matchAll(re)];
          const m = ms[ms.length - 1];
          return m && m.index !== undefined ? sentStart + m.index : -1;
        };
        // 1) sentence end, 2) end of a table row like "… or 130%", 3) any word boundary
        let cut = last(/[.;:!?]\s/g);
        if (cut >= 0) cut += 1;
        else if ((cut = last(/%\s/g)) >= 0) {
          cut += 1;
          clean = true; // table-row boundary: next part starts at the next row, no overlap
        }
        else if ((cut = last(/\s/g)) < 0) cut = end;
        end = cut;
      }
    }
    const piece = text.slice(i, end).trim();
    if (piece) out.push(piece);
    if (end >= text.length) break;
    if (clean) {
      i = end;
    } else {
      i = Math.max(end - overlap, i + 1);
      // start the next part at a word boundary, not mid-word
      const sp = text.indexOf(' ', i);
      if (sp !== -1 && sp < end) i = sp + 1;
    }
  }
  return out;
}

export function chunkSections(sections: Section[]): Chunk[] {
  const chunks: Chunk[] = [];
  for (const s of sections) {
    const citation = s.citation ?? citationFor(s.unit, s.article, s.section);
    const pieces = splitLong(s.text);
    let heading = citation;
    if (s.heading) {
      heading = s.heading;
    } else {
      if (s.sectionTitle) heading += `, ${s.sectionTitle}`;
      if (s.article !== 'PREAMBLE' && s.articleTitle) {
        heading += ` (${s.unit} ${s.article}: ${s.articleTitle})`;
      }
    }
    const prefix = s.unit === 'Chapter' ? 'ch' : 'art';
    pieces.forEach((piece, idx) => {
      const idBase =
        s.article === 'PREAMBLE' ? 'preamble' : `${prefix}${s.article}-${s.section ? `s${s.section}` : 'all'}`;
      chunks.push({
        id: `${idBase}-p${idx + 1}`,
        citation,
        embedText: `${SOURCE_NAME} — ${heading}\n${piece}`,
        text: piece,
        unit: s.unit,
        article: s.article,
        articleTitle: s.articleTitle,
        section: s.section,
        sectionTitle: s.sectionTitle,
        page: s.page,
        pageEnd: s.pageEnd,
        part: idx + 1,
        parts: pieces.length,
        source: SOURCE_NAME,
      });
    });
  }
  return chunks;
}

/** Quick human-readable report so the parse can be sanity-checked before seeding. */
export function summarize(sections: Section[], chunks: Chunk[]): string {
  const byUnit = new Map<string, number>();
  for (const s of sections) {
    const k = s.article === 'PREAMBLE' ? 'Preamble' : `${s.unit} ${s.article}`;
    byUnit.set(k, (byUnit.get(k) ?? 0) + 1);
  }
  const secNums = sections.filter((s) => s.section && /^\d+$/.test(s.section)).map((s) => Number(s.section));
  const lens = chunks.map((c) => c.text.length).sort((a, b) => a - b);
  const median = lens[Math.floor(lens.length / 2)] ?? 0;
  // Sections should run 1..N without gaps in a statute; gaps hint at a parse miss.
  const missing: number[] = [];
  if (secNums.length > 0) {
    const have = new Set(secNums);
    for (let n = 1; n <= Math.max(...secNums); n++) if (!have.has(n)) missing.push(n);
  }
  const chapNums = [
    ...new Set(sections.filter((s) => s.unit === 'Chapter' && /^\d+$/.test(s.article)).map((s) => Number(s.article))),
  ].sort((a, b) => a - b);
  const chapMissing: number[] = [];
  for (let n = 1; n <= (chapNums[chapNums.length - 1] ?? 0); n++) if (!chapNums.includes(n)) chapMissing.push(n);
  return [
    `Units found (incl. preamble): ${byUnit.size}`,
    `Sections/segments: ${sections.length}  →  chunks: ${chunks.length}`,
    `Titled sections: ${sections.filter((s) => s.sectionTitle).length}`,
    `Chunk length (chars): min ${lens[0] ?? 0}, median ${median}, max ${lens[lens.length - 1] ?? 0}`,
    `Per unit: ${[...byUnit.entries()].map(([k, n]) => `${k}: ${n}`).join(' | ')}`,
    chapNums.length > 0
      ? `Numbered chapters: ${chapNums[0]}–${chapNums[chapNums.length - 1]}` +
        (chapMissing.length ? `  ⚠️ missing: ${chapMissing.join(', ')}` : '  (no gaps)')
      : '',
    secNums.length > 0
      ? `Section numbers: ${Math.min(...secNums)}–${Math.max(...secNums)}` +
        (missing.length ? `  ⚠️ missing: ${missing.join(', ')}` : '  (no gaps)')
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}
