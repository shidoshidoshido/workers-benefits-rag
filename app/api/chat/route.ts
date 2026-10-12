/**
 * Chat route — RAG as a tool call over the configured corpus (see lib/config.ts).
 *
 * The model decides when to call the search tool (SEARCH_TOOL). The tool embeds the
 * query, runs a vector search in Upstash, and returns passages WITH metadata
 * (citation, article, section, page, score). The client renders those as the
 * sources panel; the model is told to answer only from them and to cite them.
 *
 * All secrets (OPENAI_API_KEY, UPSTASH_*) are read here on the server only.
 * Nothing is prefixed NEXT_PUBLIC_, so nothing reaches the browser bundle.
 */
import { openai } from '@ai-sdk/openai';
import { streamText, tool, embed } from 'ai';
import { Index } from '@upstash/vector';
import { z } from 'zod';
import { CORPUS, SEARCH_TOOL } from '@/lib/config';

export const maxDuration = 30;

// Tunables (override with env vars in Vercel without redeploying code changes)
const TOP_K = Number(process.env.TOP_K ?? 5);
// Drop weak matches so off-topic questions come back empty → "not found".
const MIN_SCORE = Number(process.env.MIN_SCORE ?? 0.2);
const MAX_MESSAGES = 20; // only the most recent turns are sent to the model
const MAX_INPUT_CHARS = 1000; // per user message

const SYSTEM_PROMPT = `You are the ${CORPUS.appTitle}. You answer questions about the ${CORPUS.name} using ONLY the text retrieved by the ${SEARCH_TOOL} tool.

Rules:
1. For any question about the document (${CORPUS.topics}, etc.), call ${SEARCH_TOOL} FIRST, even if you think you already know the answer. For multi-part or comparison questions, call it more than once with different queries.
2. Answer only from the returned passages. Do not use outside knowledge, court decisions, other laws, or news.
3. Cite every claim using the passage's "citation" label in square brackets, for example [${CORPUS.citationExample}]. Several citations are fine. Never invent a citation that was not returned.
4. If the passages do not answer the question, or the question is not about this document, say plainly that you could not find it in the ${CORPUS.name} and suggest how the user could rephrase. Never guess.
5. Be concise and use plain language. You may quote short phrases. This is not legal advice.
6. You may reply to greetings or "what can you do?" without searching.${CORPUS.extraRules.map((r, i) => `\n${7 + i}. ${r}`).join('')}`;

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY || !process.env.UPSTASH_VECTOR_REST_URL || !process.env.UPSTASH_VECTOR_REST_TOKEN) {
    // Log which are missing (names only) — never echo values.
    console.error('Missing env vars:', ['OPENAI_API_KEY', 'UPSTASH_VECTOR_REST_URL', 'UPSTASH_VECTOR_REST_TOKEN'].filter((k) => !process.env[k]));
    return Response.json({ error: 'Server is not configured.' }, { status: 500 });
  }

  let body: { messages?: any[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: 'No messages.' }, { status: 400 });
  }

  // Cheap abuse protection for a public, key-backed endpoint.
  const messages = body.messages.slice(-MAX_MESSAGES).map((m) =>
    m.role === 'user' && typeof m.content === 'string'
      ? { ...m, content: m.content.slice(0, MAX_INPUT_CHARS) }
      : m,
  );

  const index = new Index(); // reads UPSTASH_VECTOR_REST_URL / _TOKEN from env

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: SYSTEM_PROMPT,
    messages,
    maxSteps: 4,
    maxTokens: 700,
    temperature: 0.2,
    tools: {
      [SEARCH_TOOL]: tool({
        description:
          `Search the full text of the ${CORPUS.name}. ` +
          `Use this for ANY question about the document: ${CORPUS.topics}. ` +
          'Returns the most relevant passages with their section and page. ' +
          'Write the query as a short, specific phrase or sub-question.',
        parameters: z.object({
          query: z
            .string()
            .describe('A specific topic, term, or sub-question, e.g. "consent of the data subject"'),
        }),
        execute: async ({ query }) => {
          const { embedding } = await embed({
            model: openai.embedding('text-embedding-3-small'),
            value: query,
          });
          const hits = await index.query({
            vector: embedding,
            topK: TOP_K,
            includeMetadata: true,
          });
          return hits
            .filter((h) => h.score >= MIN_SCORE)
            .map((h) => {
              const m = (h.metadata ?? {}) as Record<string, unknown>;
              return {
                id: String(h.id),
                text: (m.text as string) ?? '',
                citation: (m.citation as string) ?? 'Unknown',
                unit: (m.unit as string | null) ?? null,
                article: (m.article as string | null) ?? null,
                articleTitle: (m.articleTitle as string | null) ?? null,
                section: (m.section as string | null) ?? null,
                sectionTitle: (m.sectionTitle as string | null) ?? null,
                page: (m.page as number | null) ?? null,
                score: h.score,
              };
            });
        },
      }),
    },
    onError: ({ error }) => console.error('streamText error:', error),
  });

  return result.toDataStreamResponse({
    // Don't leak provider/internal error details to the browser.
    getErrorMessage: () => 'Something went wrong while answering. Please try again.',
  });
}
