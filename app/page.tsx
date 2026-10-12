'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef } from 'react';
import { Sources } from './components/Sources';
import { CORPUS } from '@/lib/config';

const SUGGESTIONS = CORPUS.suggestions;
// A citation label is a short bracketed phrase, e.g. [Sec. 12] or [Maternity Leave, C. Duration]
const CITATION = /(\[[^\[\]\n]{4,120}\])/g;
const IS_CITATION = /^\[[^\[\]\n]{4,120}\]$/;

/** Turn bracketed citation labels in the answer into small pills. */
function AnswerText({ text }: { text: string }) {
  const parts = text.split(CITATION);
  return (
    <>
      {parts.map((part, i) =>
        IS_CITATION.test(part) ? (
          <span
            key={i}
            className="mx-0.5 inline-block rounded border border-blue-200 bg-blue-50 px-1.5 py-px align-baseline text-xs font-medium text-blue-900"
          >
            {part.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export default function Page() {
  const { messages, input, handleInputChange, handleSubmit, status, error, append, setMessages, stop, reload } =
    useChat({ api: '/api/chat' });

  const busy = status === 'submitted' || status === 'streaming';
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, status]);

  const last = messages[messages.length - 1];
  const waitingForText = busy && (!last || last.role === 'user' || !last.content);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-4 sm:px-6">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 py-4">
        <div>
          <h1 className="font-serif text-xl font-bold text-slate-900 sm:text-2xl">{CORPUS.appTitle}</h1>
          <p className="text-sm text-slate-500">{CORPUS.tagline}</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => {
              stop();
              setMessages([]);
            }}
            className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
          >
            New chat
          </button>
        )}
      </header>

      <main className="flex-1 py-6" aria-live="polite">
        {messages.length === 0 ? (
          <section className="mx-auto max-w-xl pt-6 text-center sm:pt-14">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-800 text-xl text-white">
              ₱
            </div>
            <h2 className="font-serif text-2xl font-bold text-slate-900">{CORPUS.emptyTitle}</h2>
            <p className="mt-2 text-slate-600">{CORPUS.emptyBody}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => append({ role: 'user', content: s })}
                  disabled={busy}
                  className="rounded-full border border-slate-300 bg-white px-3.5 py-2 text-left text-sm text-slate-700 shadow-sm hover:border-blue-700 hover:text-blue-900 disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-8 text-xs text-slate-400">{CORPUS.disclaimer}</p>
          </section>
        ) : (
          <ul className="space-y-5">
            {messages.map((m) => (
              <li key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex flex-col items-start'}>
                {m.role === 'user' ? (
                  <span className="max-w-[88%] whitespace-pre-wrap rounded-2xl bg-blue-800 px-4 py-2 text-white">
                    {m.content}
                  </span>
                ) : (
                  <>
                    {m.content && (
                      <div className="max-w-[92%] whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white px-4 py-3 leading-relaxed text-slate-800 sm:max-w-[85%]">
                        <AnswerText text={m.content} />
                      </div>
                    )}
                    <Sources invocations={m.toolInvocations as any} />
                  </>
                )}
              </li>
            ))}

            {waitingForText && !(last?.role === 'assistant' && last.toolInvocations?.length) && (
              <li className="text-sm text-slate-400" role="status">
                Thinking…
              </li>
            )}

            {error && (
              <li className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
                Something went wrong while answering.{' '}
                <button onClick={() => reload()} className="font-medium underline">
                  Try again
                </button>
              </li>
            )}
          </ul>
        )}
        <div ref={endRef} />
      </main>

      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 flex gap-2 border-t border-slate-200 bg-slate-50/95 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur"
      >
        <input
          value={input}
          onChange={handleInputChange}
          maxLength={1000}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base focus:border-blue-700 focus:outline-none"
          placeholder={CORPUS.inputPlaceholder}
          aria-label="Your question"
          disabled={busy}
        />
        {busy ? (
          <button
            type="button"
            onClick={() => stop()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-700 hover:bg-slate-100"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="rounded-lg bg-blue-800 px-4 py-2.5 font-medium text-white hover:bg-blue-900 disabled:opacity-40"
          >
            Send
          </button>
        )}
      </form>
    </div>
  );
}
