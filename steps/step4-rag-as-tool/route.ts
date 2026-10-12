/**
 * Step 4 — RAG as a tool call.
 *
 * Same shape as the final app/api/chat/route.ts but without the system prompt
 * polish so students can compare the diff.
 *
 * To run this snapshot: copy it to app/api/chat/route.ts (the page.tsx from
 * Step 2 still works — sources won't render until you also adopt Step 5's page).
 */
import { openai } from '@ai-sdk/openai';
import { streamText, tool, embed } from 'ai';
import { Index } from '@upstash/vector';
import { z } from 'zod';

const index = new Index();

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages,
    tools: {
      getInformation: tool({
        description:
          'Look up information from the spec to answer the question.',
        parameters: z.object({ query: z.string() }),
        execute: async ({ query }) => {
          const { embedding } = await embed({
            model: openai.embedding('text-embedding-3-small'),
            value: query,
          });
          const hits = await index.query({
            vector: embedding,
            topK: 4,
            includeMetadata: true,
          });
          return hits.map((h) => ({
            text: (h.metadata?.text as string) ?? '',
            page: (h.metadata?.page as number) ?? null,
            score: h.score,
          }));
        },
      }),
    },
    maxSteps: 3,
  });

  return result.toDataStreamResponse();
}
