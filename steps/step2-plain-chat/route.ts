/**
 * Step 2 — Plain chat route handler. No RAG yet.
 *
 * To run this snapshot: copy it to app/api/chat/route.ts.
 * Test with `npm run dev` and ask anything; tokens should stream back.
 * Once streaming works, move to Step 4.
 */
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages,
  });
  return result.toDataStreamResponse();
}
