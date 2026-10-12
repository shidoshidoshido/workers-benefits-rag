/**
 * Seed Upstash Vector with section-level chunks of the corpus document.
 *
 *   npm run seed                      # the one .pdf/.txt in data/ (sample.pdf is ignored)
 *   npm run seed -- path/to/file.pdf  # custom file
 *   npm run seed -- --dry-run         # parse + report only (no OpenAI / Upstash calls)
 *   npm run seed -- --no-reset        # keep existing vectors (default: wipe the index first)
 *
 * The index is wiped by default so leftover chunks from the starter's sample
 * "Acme Widget" PDF can't leak into answers. Re-running is safe either way:
 * ids are deterministic (e.g. artIII-s2-p1).
 */
import { config as loadEnv } from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';

// Next.js reads .env.local automatically; this script does not.
loadEnv({ path: path.join(process.cwd(), '.env.local') });
import { Index } from '@upstash/vector';
import { embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';
// pdf-parse uses CommonJS; default-import the parser fn
import pdfParse from 'pdf-parse';
import { chunkSections, parseSections, summarize } from './corpus';
import { parseHandbook } from './parse-handbook';
import { CORPUS } from './config';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const NO_RESET = args.includes('--no-reset');
const fileArg = args.find((a) => !a.startsWith('--'));

async function findDefaultFile(): Promise<string> {
  const dir = path.join(process.cwd(), 'data');
  const files = (await fs.readdir(dir).catch(() => [] as string[])).filter(
    (f) => /\.(pdf|txt)$/i.test(f) && f.toLowerCase() !== 'sample.pdf',
  );
  if (files.length === 1) return path.join(dir, files[0]);
  throw new Error(
    files.length === 0
      ? 'No corpus file found. Put your PDF in data/ (e.g. data/dpa-2012.pdf), or pass a path: npm run seed -- path/to/file.pdf'
      : `Several files in data/ (${files.join(', ')}). Pass the one you want: npm run seed -- data/<file>.pdf`,
  );
}

/** Extract text per page so every chunk can carry a real page number. */
async function readPages(filePath: string): Promise<{ pages: string[]; hasPages: boolean }> {
  const buf = await fs.readFile(filePath);
  if (filePath.toLowerCase().endsWith('.txt')) {
    const text = buf.toString('utf8');
    const pages = text.split('\f');
    return { pages, hasPages: pages.length > 1 };
  }
  const pages: string[] = [];
  await pdfParse(buf, {
    // called once per page, in order
    pagerender: async (pageData: any) => {
      const tc = await pageData.getTextContent({ normalizeWhitespace: true });
      let lastY: number | undefined;
      let text = '';
      for (const item of tc.items) {
        if (lastY === undefined || lastY === item.transform[5]) text += item.str;
        else text += '\n' + item.str;
        lastY = item.transform[5];
      }
      pages.push(text);
      return text;
    },
  });
  return { pages, hasPages: true };
}

async function main() {
  const filePath = fileArg ? path.resolve(fileArg) : await findDefaultFile();
  console.log(`Loading ${filePath}…`);
  const { pages, hasPages } = await readPages(filePath);
  console.log(`  ${pages.length} page(s) read${hasPages ? '' : ' (no page info; page numbers will be omitted)'}`);

  const sections =
    CORPUS.format === 'handbook' ? parseHandbook(pages, CORPUS.handbook) : parseSections(pages, hasPages);
  const chunks = chunkSections(sections);
  console.log('\n' + summarize(sections, chunks) + '\n');

  const secNums = sections.filter((s) => s.section).map((s) => Number(s.section));
  if (secNums.length < 5) {
    console.warn(
      `⚠️  Only ${secNums.length} numbered sections detected. The PDF layout may not match the parser — ` +
        'check the report above before seeding.',
    );
  }

  if (chunks.length === 0) {
    console.error('No chunks produced. Aborting.');
    process.exit(1);
  }

  if (DRY_RUN) {
    const show = (c: (typeof chunks)[number]) =>
      console.log(
        `- [${c.id}] ${c.citation}${c.sectionTitle ? ' — ' + c.sectionTitle : ''} · p.${c.page ?? '?'} · ` +
          `${c.text.length} chars · ${c.text.slice(0, 90)}…`,
      );
    console.log('Dry run — first 4 chunks:');
    chunks.slice(0, 4).forEach(show);
    console.log('\nShortest 3 chunks (very short ones can mean a parse problem):');
    [...chunks].sort((a, b) => a.text.length - b.text.length).slice(0, 3).forEach(show);
    const last = chunks[chunks.length - 1];
    console.log('\nLast chunk (should end with the final section, no signatures or approval block):');
    show(last);
    console.log(`  …${last.text.slice(-160)}`);
    console.log('\nDry run complete. Nothing was embedded or uploaded.');
    return;
  }

  if (!process.env.UPSTASH_VECTOR_REST_URL || !process.env.UPSTASH_VECTOR_REST_TOKEN) {
    console.error('Missing UPSTASH_VECTOR_REST_URL / UPSTASH_VECTOR_REST_TOKEN. Set them in .env.local.');
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY in .env.local.');
    process.exit(1);
  }

  console.log(`Embedding ${chunks.length} chunks…`);
  const { embeddings } = await embedMany({
    model: openai.embedding('text-embedding-3-small'),
    values: chunks.map((c) => c.embedText),
  });

  const index = new Index();
  if (!NO_RESET) {
    console.log('Resetting index (removing any old vectors)…');
    await index.reset();
  }

  const records = chunks.map((c, i) => ({
    id: c.id,
    vector: embeddings[i],
    metadata: {
      text: c.text,
      citation: c.citation,
      unit: c.unit,
      article: c.article,
      articleTitle: c.articleTitle,
      section: c.section,
      sectionTitle: c.sectionTitle,
      page: c.page,
      pageEnd: c.pageEnd,
      part: c.part,
      parts: c.parts,
      source: c.source,
    },
  }));

  console.log(`Upserting ${records.length} chunks to Upstash Vector…`);
  const BATCH = 100;
  for (let i = 0; i < records.length; i += BATCH) {
    await index.upsert(records.slice(i, i + BATCH));
  }
  console.log('✅ Done. Run `npm run dev` and chat at http://localhost:3000');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
