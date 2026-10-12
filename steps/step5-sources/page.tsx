/**
 * Step 5 — Show sources under each assistant message.
 *
 * Adds the <details> sources block to the Step 2 page. Same shape as the
 * final app/page.tsx, minus the chrome polish.
 *
 * To run this snapshot: copy it to app/page.tsx.
 */
'use client';

import { useChat } from '@ai-sdk/react';

type Source = { text?: string; page?: number; score?: number };

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

            {m.role === 'assistant' &&
              m.toolInvocations?.map(
                (inv) =>
                  inv.state === 'result' &&
                  inv.toolName === 'getInformation' && (
                    <details
                      key={inv.toolCallId}
                      className="mt-2 text-sm text-slate-600"
                    >
                      <summary>
                        Sources ({(inv.result as Source[]).length})
                      </summary>
                      <ul className="mt-2 space-y-2">
                        {(inv.result as Source[]).map((src, i) => (
                          <li
                            key={i}
                            className="border-l-2 border-cyan-500 pl-3"
                          >
                            <span className="text-xs text-slate-400">
                              page {src.page ?? '?'} · score{' '}
                              {typeof src.score === 'number'
                                ? src.score.toFixed(2)
                                : '—'}
                            </span>
                            <p>{src.text}</p>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ),
              )}
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
