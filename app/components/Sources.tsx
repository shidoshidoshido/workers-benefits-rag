'use client';

import { SEARCH_TOOL } from '@/lib/config';

/**
 * Sources panel for one assistant message.
 *
 * Reads the results of every search tool call in the message,
 * dedupes passages, and renders (1) a row of citation pills that is always
 * visible and (2) an expandable list of the full retrieved passages with
 * article, section, page and relevance score.
 */

export type Passage = {
  id: string;
  text: string;
  citation: string;
  unit: string | null;
  article: string | null;
  articleTitle: string | null;
  section: string | null;
  sectionTitle: string | null;
  page: number | null;
  score: number;
};

type Invocation = {
  toolCallId: string;
  toolName: string;
  state: 'partial-call' | 'call' | 'result';
  result?: unknown;
};

export function collectPassages(invocations: Invocation[] | undefined): {
  passages: Passage[];
  searching: boolean;
  searched: boolean;
} {
  const seen = new Map<string, Passage>();
  let searching = false;
  let searched = false;
  for (const inv of invocations ?? []) {
    if (inv.toolName !== SEARCH_TOOL) continue;
    if (inv.state !== 'result') {
      searching = true;
      continue;
    }
    searched = true;
    for (const p of (inv.result as Passage[]) ?? []) {
      const prev = seen.get(p.id);
      if (!prev || p.score > prev.score) seen.set(p.id, p);
    }
  }
  const passages = [...seen.values()].sort((a, b) => b.score - a.score);
  return { passages, searching, searched };
}

export function Sources({ invocations }: { invocations: Invocation[] | undefined }) {
  const { passages, searching, searched } = collectPassages(invocations);

  if (searching && passages.length === 0) {
    return (
      <p className="mt-2 flex items-center gap-2 text-sm text-slate-500" role="status">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-700" />
        Searching the document…
      </p>
    );
  }
  if (!searched) return null;

  if (passages.length === 0) {
    return (
      <p className="mt-2 text-sm text-slate-500">
        No matching passages were found in the document for this question.
      </p>
    );
  }

  return (
    <div className="mt-2 w-full max-w-[92%] sm:max-w-[85%]">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Sources</span>
        {passages.map((p) => (
          <span
            key={p.id}
            className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-900"
          >
            {p.citation}
          </span>
        ))}
      </div>

      <details className="group mt-2 rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer select-none px-3 py-2 text-sm text-slate-600 hover:text-slate-900">
          View {passages.length} retrieved passage{passages.length === 1 ? '' : 's'}
        </summary>
        <ul className="space-y-3 border-t border-slate-100 p-3">
          {passages.map((p) => (
            <li key={p.id} className="border-l-2 border-blue-700 pl-3">
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-800">{p.citation}</span>
                {p.sectionTitle && !p.citation.includes(p.sectionTitle) && (
                  <span className="font-medium text-slate-700">{p.sectionTitle}</span>
                )}
                {p.articleTitle && p.unit && p.article && p.article !== 'PREAMBLE' && !p.citation.includes(p.articleTitle) && (
                  <span>
                    {p.unit} {p.article}: {p.articleTitle}
                  </span>
                )}
                {p.page != null && <span>p. {p.page}</span>}
                <span className="ml-auto tabular-nums" title="Cosine similarity to the search query">
                  relevance {p.score.toFixed(2)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{p.text}</p>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
