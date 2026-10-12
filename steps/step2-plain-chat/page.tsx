/**
 * Step 2 — Plain chat first (no RAG).
 *
 * Goal: useChat works against a vanilla streamText handler. Verify
 * streaming BEFORE adding retrieval.
 *
 * To run this snapshot: copy it over app/page.tsx (and copy the matching
 * route.ts over app/api/chat/route.ts), then `npm run dev`.
 */
'use client';

import { useChat } from '@ai-sdk/react';

export default function Page() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/chat',
  });

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-bold mb-4">Doc Chat</h1>
      <ul className="space-y-3 mb-6">
        {messages.map((m) => (
          <li key={m.id} className={m.role === 'user' ? 'text-right' : ''}>
            <span className="inline-block rounded-lg bg-slate-100 px-3 py-2">
              {m.content}
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          className="w-full border rounded p-2"
          placeholder="Ask…"
        />
      </form>
    </main>
  );
}
