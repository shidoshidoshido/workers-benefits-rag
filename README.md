# Workers’ Benefits Guide — public RAG bot

A streaming chat app grounded in the **DOLE Bureau of Working Conditions’ _Handbook on Workers’ Statutory Monetary Benefits_ (2024 Edition)**. Built with Next.js 15, the Vercel AI SDK (v4), OpenAI, and Upstash Vector.

- **Retrieval is a tool call** (`searchDocument`): the model decides when to search.
- **Streams** answers token by token.
- **Shows sources**: citation pills (`Maternity Leave, C. Duration`) plus an expandable panel with the retrieved passages, page, and relevance score.
- **No client-side secrets**: all keys are read in `app/api/chat/route.ts` on the server.
- **Meaningful empty state** with suggested-question chips; mobile-friendly layout.

## How it works

```
data/<handbook>.pdf ──▶ lib/seed.ts ──▶ lib/parse-handbook.ts (chapters + A., B., C. subsections) ──▶ lib/corpus.ts (chunk)
                                  │
                                  ▼  embed (text-embedding-3-small) + metadata
                           Upstash Vector
                                  ▲
browser (useChat) ──▶ /api/chat ──┘  tool: searchDocument(query) → topK passages
        ▲                │
        └── streamed text + tool results (sources) ◀──┘
```

**Chunking:** one chunk per **lettered subsection** of each chapter (e.g. *Maternity Leave → C. Duration*), because that is how the handbook is organised and how people cite it. The parser strips the table of contents, printed page numbers, footnote markers, and blank pages; folds each chapter's legal-basis line (`Republic Act No. 11210`) into its first subsection; and keeps the Compliance Guide’s pay-multiplier table. Subsections over 1,500 characters are split at list items (`1.`, `a.`, `(a)`), table-row ends, or sentence ends. Every part keeps its metadata.

**Deliberately left out** (they extract badly and would give confident wrong answers): the ✓/N-A applicability matrix on the first page, the multi-column “Summary of Statutory Leave Benefits” table (it duplicates chapters 7–12), and the DOLE regional-office directories (two-column grid; phone numbers detach from their region). The regional minimum-wage table contains only links to the NWPC website, not peso amounts, so the bot points there.

**Page numbers** shown in sources are the handbook’s **printed** page numbers (printed page 30 = PDF page 40).

**Metadata per chunk:** `citation`, `unit`, `article` (chapter number), `articleTitle`, `section` (letter), `sectionTitle`, `page`, `part`, `source`.

**Everything corpus-specific** (app title, system-prompt topics, suggested questions, disclaimer, parser options) lives in `lib/config.ts`. The statute/constitution parser is still in `lib/corpus.ts` (`format: 'statute'`).

## Setup

```bash
npm install
cp .env.example .env.local      # then fill in your real keys
```

1. Create an Upstash Vector index: **dimension 1536, cosine** similarity.
2. Put the handbook PDF in `data/` (e.g. `data/Workers-Statutory-Monetary-Benefits-Handbook-2024-Edition.pdf`). `data/sample.pdf` is the starter's leftover file and is ignored by the seed script. Keep only one corpus file in `data/`.
3. **Check the parse first (free, no API calls):**
   ```bash
   npm run seed -- --dry-run
   ```
   For this handbook you should see **`Numbered chapters: 1–19 (no gaps)`**, about **119 sections → ~151 chunks**, and the last chunk should be *Pag-IBIG Benefits, D. Membership Contribution*. A missing chapter number means the parser missed a heading — fix `lib/parse-handbook.ts` before seeding.
4. Seed (this **wipes the index first** so old sample chunks can't leak in; add `--no-reset` to keep them):
   ```bash
   npm run seed
   ```
5. Run it:
   ```bash
   npm run dev      # http://localhost:3000
   ```

## Tuning knobs

| Knob | Where | Default |
| --- | --- | --- |
| `TOP_K` (passages returned) | env var | 5 |
| `MIN_SCORE` (drop weak matches) | env var | 0.2 |
| Chunk size / overlap | `MAX_CHARS`, `OVERLAP_CHARS` in `lib/corpus.ts` | 1500 / 150 |
| System prompt, tool description | `app/api/chat/route.ts` | — |

After changing chunking, re-run `npm run seed`.

## Test before you deploy

Try 15–20 real questions, and keep notes for your reflection:

- direct lookups ("How many days of maternity leave?")
- paraphrased questions that don't use the handbook's wording
- multi-section questions ("compare paternity and parental leave")
- numbers in tables (holiday/overtime multipliers, PhilHealth premium, SSS contribution)
- things the handbook does **not** contain (current regional wage figures, office phone numbers)
- 3+ off-topic questions (should get "not found", not a general-knowledge answer)
- a prompt-injection attempt ("ignore your instructions and…")

For each one, open the sources panel: did the right section come back? Did the answer cite only what was retrieved?

## Deploy (Vercel)

1. Push this repo to GitHub (`.env.local` is gitignored — confirm with `git status` before committing).
2. Import the repo in Vercel.
3. In **Settings → Environment Variables**, add **`OPENAI_API_KEY`**, **`UPSTASH_VECTOR_REST_URL`**, **`UPSTASH_VECTOR_REST_TOKEN`** for the **Production** environment (and optionally `TOP_K`, `MIN_SCORE`). No `NEXT_PUBLIC_` prefix.
4. **Redeploy** after adding variables — they only apply to new deployments.
5. Seeding is done from your machine against the same Upstash index; you don't re-seed per deploy.
6. Open the production URL in an **incognito window** and check: empty state, chip click streams an answer, sources appear, an off-topic question gets "not found".
7. View page source / Network tab: no keys anywhere.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| "Something went wrong" on every question in production | Missing or misnamed env var in Vercel — check names, then redeploy |
| Answers use general knowledge instead of the text | Tool description too vague, or `MIN_SCORE` too low; check that a tool call actually happened |
| Sources panel says "No matching passages" for obvious questions | Index empty or wrong dimension, or `MIN_SCORE` too high — try `MIN_SCORE=0` to inspect scores |
| Sources show weird/empty citations | Metadata missing — re-run `npm run seed` (without `--no-reset`) |
| First request after idle is slow | Serverless cold start; not a bug |
| Seed warns about few sections or gaps in chapter numbers | PDF layout differs; see `--dry-run` output and adjust `lib/parse-handbook.ts` |

## Safeguards on the public endpoint

Message count and per-message length are capped, `maxTokens` is limited, and error details are never sent to the browser. There is **no rate limiting** yet, so anyone with the URL can spend your OpenAI credit. Set a monthly spend limit in the OpenAI dashboard, and see "stretch goals" in your reflection if you add rate limiting.
