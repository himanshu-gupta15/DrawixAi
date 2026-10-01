# Dravix AI – AI Engineer Assessment

A single **Next.js 16 + TypeScript** application that implements all four questions of the assessment:

| | Question | Page | Status |
|---|---|---|---|
| Q2 | Production-ready knowledge base from mixed, messy business content | `/knowledge-base` | working; held-out retrieval 8/13 correct (+1 partial) |
| Q1 | Knowledge-grounded voice agent (health-insurance lead qualification) that uses the Q2 KB | `/voice-agent` | working; 6/6 recorded test calls pass |
| Q3 | Localized voice bots: Philippines (English/Tagalog/Taglish bancassurance) and Indonesia (formal/casual/regional multifinance) | `/multilingual` | working; held-out 71/75 checks |
| Q4 | Live insights and nudges from call audio, while the call is running | `/live-insights` | working; 6/7 nudges, 0 false positives, P50 0.50 s end-to-end |

Everything runs **locally without API keys**: embeddings, the reranker and Whisper ASR are local ONNX models. Claude (Anthropic SDK) is an optional phrasing layer behind a grounding verifier. **No LLM key was available while building this, so every number below was measured without the LLM** (see [Honesty notes](#honesty-notes)).

---

## Business problem

- **Q1/Q2.** A health insurer's tele-sales team needs a voice agent that qualifies leads against underwriting rules and answers product, policy and objection questions **only from approved content**, citing it. When the answer isn't there it says so, instead of improvising a coverage promise, which is a mis-selling and claims-dispute risk. The content arrives as a messy mix: website pages with navigation and cookie banners, a PDF brochure, two versions of a claims policy that disagree, a CSV rate card with a duplicate row, a lead form with inconsistent field names, and customer testimonials containing phone numbers and PAN/Aadhaar numbers.
- **Q3.** The same kind of automation for the Philippines and Indonesia fails if it just translates English. Customers code-switch (Taglish; Indonesian with English finance loanwords), expect market-specific politeness, and call from outside Jakarta with regional vocabulary.
- **Q4.** Human agents miss disclosures, cross-sell moments and rising frustration in real time. Post-call analytics is too late, and noisy dashboards get ignored, so nudges must arrive within about a second and be rare and relevant.

## Architecture

Full detail with diagrams: **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

```
Q2  Sources ─▶ extract (HTML/PDF/MD/CSV/form/URL) ─▶ supersede versions ─▶ clean & standardise ─▶ PII redact ─▶ chunk
            ─▶ taxonomy ─▶ embed (e5) ─▶ dedupe + conflict check ─▶ Postgres (records/metadata) + Qdrant (vectors)
    Query ─▶ synonyms/intent/out-of-domain ─▶ Qdrant + BM25 ─▶ RRF ─▶ cross-encoder rerank ─▶ grounded? ─▶ answer + citation
                                                                                                   │
Q1  Mic ─▶ ASR (Web Speech en-IN | Whisper) ─▶ dialog manager (script + rules) ─┬─▶ Q2 retrieval ─┘ (every question/objection)
                                                                                └─▶ lead · callback · CRM summary · escalation webhook ─▶ TTS
Q3  Mic ─▶ ASR (fil-PH | id-ID) ─▶ language/register/regional detection ─▶ intent (e5 kNN + cues + context) ─▶ native variant ─▶ ₱/Rp/date/TTS formatting
Q4  Audio (live mic | real-time replay, 100 ms frames) ─▶ per-speaker VAD ─▶ Whisper ─▶ signals ─▶ nudge engine ─▶ WebSocket ─▶ dashboard ─▶ ack (latency)
```

`server.ts` runs Next.js and the `/ws/insights` WebSocket in **one Node process**. Next.js route handlers can't hold persistent sockets, and this keeps the whole system in one TypeScript codebase.

## Tech stack

| Layer | Choice |
|---|---|
| App | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 |
| Backend | Next.js route handlers (`app/api/*`) + custom server (`server.ts`) with `ws` |
| Structured data | PostgreSQL 16 + Prisma 6 |
| Vectors | Qdrant 1.12 (`@qdrant/js-client-rest`) |
| Embeddings | `Xenova/multilingual-e5-small` (transformers.js, local) |
| Reranker | `Xenova/ms-marco-MiniLM-L-6-v2` cross-encoder (local) |
| ASR | Browser Web Speech API (`en-IN`, `fil-PH`, `id-ID`) for live demos; Whisper base/small (transformers.js, local) on the server |
| TTS | Browser `speechSynthesis`; macOS `say` voices only to generate test-call audio |
| LLM (optional) | Claude via `@anthropic-ai/sdk` (`claude-opus-5-5` default, low effort, server-side refusal fallback) |
| Parsing | cheerio (HTML), unpdf (PDF), pdf-lib (generate the sample brochure) |
| Audio capture | Web Audio `AudioWorklet` → 16 kHz PCM16 |
| Tests | `node:test` via tsx; headless Chrome check of the UI |

## Setup

Prerequisites: **Node 22+** (tested on 24), **Docker**, ~1 GB disk for models. On first use, models (~500 MB) download from Hugging Face into `./.models`; no key is needed. Chrome is recommended for the voice pages. macOS is only needed to *regenerate* test audio (`say`); the generated WAVs are committed.

```bash
npm install
cp .env.example .env          # defaults work with docker compose
docker compose up -d          # Postgres on :5433, Qdrant on :6333
npx prisma db push            # create tables
npm run ingest                # build the knowledge base → Postgres + Qdrant
npm run dev                   # http://localhost:3100  (Next.js + WebSocket)
```

> Use `npm run dev`, not `next dev`: the WebSocket for Q4 lives in `server.ts`.
> Production: `npm run build && npm start`.

### Environment variables (`.env.example`)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (compose: `postgresql://dravix:dravix@localhost:5433/dravix`) |
| `VECTOR_DATABASE_URL` | yes | Qdrant URL (`http://localhost:6333`) |
| `LLM_API_KEY` | no | Anthropic API key. Enables Claude phrasing of KB answers (checked by the citation/number verifier) and of Q4 nudges. Without it: extractive answers and template nudges. |
| `LLM_MODEL` | no | default `claude-opus-5-5` |
| `ESCALATION_WEBHOOK_URL` | no | POST target for human-escalation events (otherwise stored in the `CrmAction` table) |
| `EMBEDDING_MODEL`, `ASR_MODEL` | no | override the local models |
| `PORT` | no | default 3100 |

`ASR_API_KEY`, `TTS_API_KEY` and `EMBEDDING_API_KEY` are **not** used: ASR, TTS and embeddings are local or browser-based. `RAG_*` thresholds and `RERANK_MODEL` can be overridden for experiments.

### Database and vector DB

- `prisma/schema.prisma` defines these tables: `SourceDocument`, `KbRecord`, `IngestionRun`, `RetrievalLog`, `CallSession`, `CrmAction`, `InsightSession`.
- Qdrant collection `kb_records` holds 384-d cosine vectors, with `status`/`category` payload indexes. Retrieval filters on `status = active`, so duplicate, superseded and flagged records are never answered from.
- `npm run ingest` rebuilds both stores and writes `docs/evaluation/ingestion-report.json`. You can also add a document or URL in the UI: **Knowledge Base → Documents → Add**.

## Running each question

**Q2 – Knowledge base** (`/knowledge-base`)

- Stat tiles show the ingestion results.
- **Search** gives grounded answers with ranked chunks and citations.
- **Records** shows each record's status, PII flags, version and aliases.
- **Documents** has the upload/URL form and the ingestion issues (failed PDF, invalid date, conflicts).
- **Retrieval tests** shows per-query verdicts.
- CLI: `npm run eval:retrieval` (dev) and `npm run eval:retrieval:heldout` (held-out v2).

**Q1 – Voice agent** (`/voice-agent`)

- *Start call*, allow the mic, and talk ("Browser ASR"). Alternatives: *Server Whisper* push-to-talk, or *Type only*.
- The right-hand panels show qualification state, escalation and business actions, and the retrieved knowledge with sources.
- Recorded test calls: `npm run test:calls`. These are synthetic caller voices → Whisper → agent, written to `public/recordings/q1/*.wav|.md`.

**Q3 – Multilingual bots** (`/multilingual`)

- Choose 🇵🇭 or 🇮🇩 and *Start call*. Speak (`fil-PH` / `id-ID`) or use the quick-test utterances. Each turn shows the detected language/register/regional markers, the intent, and the reply variant.
- CLI: `npm run test:q3` (held-out conversations), `npm run test:q3:asr` (Whisper WER per market), `npm run calls:q3` (2 recorded calls per market → `public/recordings/q3/`).

**Q4 – Live insights** (`/live-insights`)

- **Real-Time Replay / Simulation**: pick a labelled call and press *Start*. Audio plays while the server streams it in 100 ms frames; transcripts, topic shifts, nudges, suppressed alerts and per-stage latency update live.
- **Live microphone**: stream your mic, with a speaker toggle.
- Benchmark: `npm run bench:q4` (server must be running) → `docs/evaluation/q4-benchmark.json`.
- Regenerate the scenario audio: `npm run audio:q4` (macOS).

## Testing

```bash
npm test          # 29 node:test unit + integration tests (needs docker + ingest)
npm run typecheck && npm run lint
```

| Suite | Covers |
|---|---|
| `tests/retrieval/kb-pipeline.test.ts` | PII redaction, cleaning/dates/invalid dates, chunking, dedupe, HTML/PDF extraction (incl. corrupt PDF), taxonomy, fact conflicts |
| `tests/retrieval/retrieval.integration.test.ts` | grounded answer cites current policy (not superseded/flagged), out-of-scope refusal, LLM verifier |
| `tests/voice/agent.test.ts` | NLU extraction, escalation, conflict clarification, KB-grounded objection, unavailable fallback, age > 65 |
| `tests/multilingual/engine.test.ts` | PH/ID language and register detection, regional markers, ₱/Rp/date/TTS formatting, in-language escalation, wrong-party privacy |
| `tests/realtime/nudges.test.ts` | thresholds, merge/cooldown/cap, deferral, expiry/resolution, negation/hallucination guards, VAD under noise, topic tracking |

## Evaluation results (measured)

All JSON is in `docs/evaluation/`. The Markdown tables are generated from it by `npm run reports`.

| Area | Result | Detail |
|---|---|---|
| Q2 ingestion | 14 sources → 52 records, 47 active; 1 failed (corrupt PDF), 46 boilerplate lines removed, 1 exact + 1 near duplicate, 11 PII redactions, 1 superseded version, 1 conflict and 1 invalid date flagged | `ingestion-report.json` |
| Q2 retrieval, **held-out v2** (clean) | **8 correct · 1 partial · 4 incorrect** of 13 | [RETRIEVAL_EVALUATION.md](./docs/evaluation/RETRIEVAL_EVALUATION.md) |
| Q2 retrieval, held-out v1 | 6/1/5 before the reranker → 8/1/3 after (thresholds set on dev only) | same |
| Q2 retrieval, dev set (tuned on) | 16/16 | same |
| Q1 recorded calls | **6/6 calls, 21/21 checks**; mean caller ASR WER 0.25 | [Q1_TEST_CALLS.md](./docs/evaluation/Q1_TEST_CALLS.md) |
| Q3 conversations, **held-out v2** | **71/75 checks** (first run of held-out v1: 83/98) | [Q3_RESULTS.md](./docs/evaluation/Q3_RESULTS.md) |
| Q3 ASR (whisper-small, market language, synthetic voices) | ID 0.32 WER (native voice), 0.54 (accent proxy); PH 0.41 | [Q3_LOCALIZATION_REPORT.md](./docs/evaluation/Q3_LOCALIZATION_REPORT.md) |
| Q4 nudges | **6/7 expected, 0 false positives, 7/7 shown before call end** | [Q4_SIGNALS_AND_FALSE_POSITIVES.md](./docs/evaluation/Q4_SIGNALS_AND_FALSE_POSITIVES.md) |
| Unit / integration tests | 29/29 | `unit-tests.json` |

### Latency (measured; details in [LATENCY_REPORT.md](./LATENCY_REPORT.md))

| Q4 stage | P50 | P95 |
|---|---|---|
| ASR (Whisper-base, CPU) | 424 ms | 536 ms |
| Signal extraction | 0.1 ms | 1.2 ms |
| LLM | not run (no key) | — |
| Delivery (headless / Chrome render) | 0.3 / 12.2 ms | 0.5 / 16.7 ms |
| **Audio received → nudge displayed** | **499.4 ms** | **560.7 ms** |
| + VAD endpointing wait | +500 ms | +500 ms |

Q2 retrieval: warm P50 100 ms (≈ 92 ms of it is the reranker). Q1 non-retrieval turns: < 1 ms.

## Known limitations

See **[LIMITATIONS.md](./LIMITATIONS.md)**. Main points:

- No LLM key, telephony or human speakers were available. Callers are synthetic voices, and the browser ASR wasn't tested with real speech.
- Held-out retrieval is moderate (refusal threshold too strict for some valid questions; absent entities like "LASIK").
- No Filipino TTS voice; Indonesian regional accent tested only through a proxy voice.
- CPU Whisper is the 10× scaling bottleneck.
- Rule-based NLU and signals are precise but miss paraphrases.
- No native-speaker or compliance review.

## Production improvements

Prioritised plan in [LIMITATIONS.md](./LIMITATIONS.md#production-improvement-plan-prioritised):

1. Labelled real calls per market.
2. Streaming ASR with language ID.
3. Multilingual reranker + NLI/LLM answerability check.
4. Claude phrasing behind the existing verifier.
5. CPaaS telephony media streams.
6. Consent and calling-hour controls.
7. Horizontal ASR workers and observability.

## Repository map

```
app/                 pages (overview, voice-agent, knowledge-base, multilingual, live-insights, evaluation, settings) + api/*
components/          nav + UI primitives
lib/kb/              extraction, cleaning, PII, chunking, taxonomy, dedupe, conflicts, ingestion
lib/rag/             BM25, hybrid retrieval, reranker, grounded answers
lib/voice/           Q1 NLU, dialog manager, qualification rules, call service/actions
lib/multilingual/    Q3 language detection, formatting, engine
lib/realtime/        Q4 segmenter, signals, nudges, session, replay
lib/asr, lib/audio   Whisper wrapper + WER, WAV utils, macOS TTS for test audio
lib/client/          browser ASR/TTS/mic helpers
data/raw/            Q2 source corpus (fictional company) + manifest
data/business/       Q1 script and business rules
data/markets/        Q3 market packs + localization examples
data/test-cases/     all evaluation inputs (dev and held-out sets, scenarios)
public/recordings/   Q1 and Q3 recorded calls (wav + transcript md)
public/audio/q4/     Q4 replay calls
docs/evaluation/     measured results (JSON + generated Markdown); docs/screenshots/
scripts/             ingest, evaluations, test calls, benchmark, report rendering
server.ts            custom server (Next.js + WebSocket)
```

## Honesty notes

- **LLM:** the Claude integration is implemented but **never ran** (no key). Every answer in the evaluations is extractive. The verifier is unit-tested on fixed strings.
- **Voices:** all "recorded calls" use synthesized speakers (macOS `say`) transcribed by real Whisper. They test the pipeline end to end, not human speech. The Indonesian "regional accent" is a Malay-voice **proxy**.
- **Tuning vs held-out:** dev sets were used to tune synonyms, cues and thresholds, and their scores are optimistic. Held-out sets were written before the final changes and are reported as-is, including the first-run results before fixes.
- **Data:** the company (Dravix Health / Dravix Life / Dravix Finance), documents and customers are fictional. The "PII" is synthetic (`example.com`).
# DrawixAi
