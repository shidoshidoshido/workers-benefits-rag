# Reflection — Workers’ Benefits Guide (one page, ~400–500 words)

> Write this AFTER you have tested the deployed bot. Replace every bracketed prompt with
> something you actually observed. Delete this note and keep it to one page.
> Export to PDF for submission.

**Name:** [your name]  **Deployed URL:** [url]  **Repo:** [url]

## 1. Corpus choice
Why the DOLE-BWC 2024 Workers’ Statutory Monetary Benefits Handbook? [Public, practical, structured by chapter and
subsection, answers are checkable.] What does it **not** cover (current regional wage figures, office contacts,
later wage orders)? Where did users' questions go beyond the corpus?

## 2. Chunking and metadata
I chunked by [lettered subsection within each chapter] because [that is how the handbook is organised and cited].
Chunk size / overlap: [1500 / 150]. What went wrong first? [e.g. footnote markers in the text, the table of contents
being indexed, a heading the parser missed, tables extracting scrambled.] What I excluded on purpose and why: [matrix, directories].
What I changed and what difference it made: [evidence — a question that failed before and passes now].
Metadata I stored and how it shows up in the UI: [citation, article, page…].

## 3. Retrieval settings (topK, score cutoff)
I tried topK = [3 / 5 / 8]. Observations: [too few missed multi-section answers; too many added noise].
My MIN_SCORE choice and why: [what scores did you see for relevant vs. off-topic questions?]

## 4. Prompt and tool description
An example where the bot answered from general knowledge or didn't call the tool: [question].
What I changed in the tool description / system prompt: [change] → result: [outcome].

## 5. Trade-offs I made
- Model/embedding choice (cost vs. quality): [gpt-4o-mini, text-embedding-3-small — why]
- Latency vs. accuracy (extra tool calls, maxSteps): [ ]
- Simplicity (no reranking, no hybrid search, no rate limiting): [ ]

## 6. What failed in testing / known limits
[2–3 concrete failures you saw, with the question that triggered each.]

## 7. What I would do next
[Hybrid (keyword + vector) search for exact section lookups; an eval set with expected
citations; rate limiting; …]

## Stretch goals completed (max two)
[e.g. suggested-prompt chips, mobile-friendly layout]

## Demo questions
1. [question — expected to cite …]
2. [ ]
3. [ ]
4. [off-topic question — expected "not found"]
