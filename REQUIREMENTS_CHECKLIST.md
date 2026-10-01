# Requirements checklist

Every requirement from the assessment PDF, checked against what actually runs. **COMPLETE** means implemented and exercised by a test, benchmark or recorded run listed in the Test column. **PARTIAL** means implemented with a stated gap. **BLOCKED** means it needs something unavailable in this environment.

Paths are relative to the repo root. Evaluation files are in `docs/evaluation/`.

## Timeline & scope

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Working outcomes for all four questions | COMPLETE | `/voice-agent`, `/knowledge-base`, `/multilingual`, `/live-insights` | headless-Chrome run of every page (`docs/screenshots/`), 0 console errors |
| Q1 uses the Q2 knowledge base | COMPLETE | `lib/voice/agent.ts` → `retrieve()` + `composeAnswer()`; no FAQ/policy text in the script config or prompt | `tests/voice/agent.test.ts` (objection answered with a `kb_objection_*` citation); Q1 recorded calls |
| Recorded calls reused for Q4 where useful | PARTIAL | Q4 uses its own 4 labelled calls (needed ground-truth labels per signal); the pipeline accepts any stereo WAV | `npm run bench:q4` |
| Reliable core over polish | COMPLETE | Deterministic core logic; fallbacks for LLM, reranker and DB-less paths | unit and integration tests 28/28 |

## Question 1 — Knowledge-grounded voice agent

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Choose one use case | COMPLETE | Health-insurance lead qualification | — |
| Configure voice platform, add script and business rules | COMPLETE | `data/business/health-lead-qualification.json` (script, slot prompts, rules); browser voice platform (Web Speech ASR + speechSynthesis) and server Whisper | `/voice-agent` |
| Connect the Q2 KB; don't hardcode FAQs/objections/policies | COMPLETE | Answers are retrieved per question; the PED waiting period at qualification is retrieved too | `grep` the config: no FAQ text; agent tests |
| Conversation flow | COMPLETE | consent → 8 slots → qualification → next step → close (`lib/voice/agent.ts`) | `q1_cooperative` |
| Qualification logic | COMPLETE | `lib/voice/qualification.ts`: age 18–65, parents ≤ 75 (Gold+), underwriting conditions, min budget, plan bands, co-pay, medical check, smoker loading | `q1_underwriting`; unit test for age > 65 |
| Grounded objection handling | COMPLETE | Objections retrieved from the playbook (`kb_objection_*`) with paraphrase matching | `q1_objections` 4/4 |
| Unsupported-question fallback | COMPLETE | "I'm sorry, I don't have verified information… I won't guess" + out-of-domain message; logged as unanswered for the advisor | `q1_out_of_scope` 4/4; integration test |
| Human escalation | COMPLETE | Any stage → escalation action + webhook (`ESCALATION_WEBHOOK_URL`) + CRM summary | `q1_human_escalation` 3/3; unit test |
| Callable number or web calling interface | PARTIAL | **Web calling interface** (mic → ASR → agent → TTS) at `/voice-agent`. No phone number (no telephony provider available). | Headless Chrome with fake mic; the typed path is fully exercised |
| Record ≥ 3 test calls; transcripts and results | COMPLETE | 6 stereo WAVs + transcripts in `public/recordings/q1/`, summary `Q1_TEST_CALLS.md`. Callers are synthesized voices transcribed by real Whisper. | `npm run test:calls`: 6/6 calls, 21/21 checks |
| Coverage: cooperative / objection / incomplete-conflicting / out-of-scope / human request | COMPLETE | One recorded call each, plus an underwriting edge case | see above |
| States when information is unavailable | COMPLETE | Grounding decision in `lib/rag/retrieve.ts` | IVF / car-insurance tests |
| Optional business action | COMPLETE | Lead creation, callback scheduling, mock CRM summary, escalation webhook (`lib/voice/service.ts`, `CrmAction` table) | actions asserted in the recorded calls |

## Question 2 — Production-ready knowledge base

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Inputs: web pages, product/marketing, policy/qualification rules, forms, tables, PDFs, duplicates, inconsistent terms, PII | COMPLETE | `data/raw/` (6 HTML pages, brochure PDF, corrupt PDF, 2 policy versions, eligibility rules, objection playbook, CSV table, form JSON) + URL ingestion | `npm run ingest` → `ingestion-report.json` |
| Explain website extraction and document parsing | COMPLETE | `ARCHITECTURE.md` §Q2; `lib/kb/extract.ts` | unit tests (HTML, PDF) |
| Remove nav, headers, footers, repeated sections, irrelevant content | COMPLETE | Boilerplate selectors; PDF repeated-line detection (46 lines removed) | unit tests |
| Handle extraction failures, flag source errors | COMPLETE | Corrupt PDF → `failed` with an OCR hint; invalid date 31/02/2026 flagged; 48-vs-36-month conflict flagged | ingestion report issues |
| Remove duplicates / near-duplicates | COMPLETE | 1 exact + 1 near duplicate (Jaccard + cosine); duplicate CSV row removed; aliases kept | unit test + report |
| Standardise headings, dates, terminology, categories, form fields | COMPLETE | `lib/kb/clean.ts`, `taxonomy.ts`, `canonicalField()` | unit tests |
| Identify and protect PII | COMPLETE | Redaction before storage/embedding; `contains_pii`, `pii_types` (11 redactions in 2 records) | unit test |
| Schema and sample records | COMPLETE | `prisma/schema.prisma`, `ARCHITECTURE.md`, `docs/evaluation/sample-records.json` | — |
| Chunking strategy and metadata | COMPLETE | Section/FAQ chunks, 110-word windows with overlap; metadata (topic, authority, revision, flags, aliases) | unit test |
| Taxonomy and source tracking | COMPLETE | category / topic / product_line; `source` + `source_ref` (file#anchor or #page) | — |
| Versioning | COMPLETE | Document families and versions (claims v1 superseded by v2), record revision and content hash, ingestion runs with an added/changed/unchanged diff | ingestion report |
| Embedding/indexing, retrieval/ranking, citations | COMPLETE | e5 → Qdrant; BM25; RRF; cross-encoder rerank; grounding rule; record-level citations | retrieval evaluations |
| ≥ 5 retrieval queries with question, record, source, relevance explanation, verdict | COMPLETE | 41 graded queries over 4 sets in `RETRIEVAL_EVALUATION.md`; **held-out v2: 8 correct / 1 partial / 4 incorrect** (dev set 16/16, tuned on) | `npm run eval:retrieval [heldout-v2]` |
| Connect the KB to the Q1 bot or a retrieval interface | COMPLETE | Both: `/voice-agent` and `/knowledge-base` (search, records, documents/upload, tests) | UI run |
| Demonstrate product, policy, qualification, FAQ, objection answers | COMPLETE | All five types in every evaluation set and as quick queries in the UI | — |

## Question 3 — Native-language voice bots

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| PH: life insurance / bancassurance, English + Tagalog + Taglish | COMPLETE | `data/markets/ph.json`: premium reminder, lapse, beneficiary, rider, bank referral; three native variants | Q3 tests |
| PH terms (premium, policy, beneficiary, rider, lapse, coverage, bank referral) | COMPLETE | Used naturally in the variants (see the localization report) | — |
| ID: multifinance; formal + colloquial; finance loanwords; ≥ 1 regional accent | PARTIAL | `data/markets/id.json`: formal/casual, loanwords, Javanese/Sundanese/Medan lexicon. The **accent** is tested only with a Malay-voice proxy, not real regional speakers. | Q3 tests; ASR tests |
| ID terms (cicilan, tenor, denda, DP, jatuh tempo, angsuran, pembiayaan) | COMPLETE | Used in responses and intents | — |
| Language-specific ASR configured and tested per market; report provider/model, languages, code-switching, quality, errors, regional accent | PARTIAL | Whisper-small/base per market (tagalog / indonesian) measured on synthesized speech (`Q3_RESULTS.md`, `Q3_LOCALIZATION_REPORT.md`). Browser `fil-PH` / `id-ID` recognisers are wired up but not tested with real speech. | `npx tsx scripts/test-q3-asr.ts` |
| Localized scripts, FAQs, objections, rules, politeness, dates, amounts, payment explanations | COMPLETE | Market packs + `lib/multilingual/format.ts` (₱ / Rp, dates, TTS number words) | unit tests |
| ≥ 3 localization examples per market | COMPLETE | 4 per market (`data/markets/localization-examples.json`, shown in the UI) | — |
| Native TTS; document compromises | PARTIAL | ID: native `id-ID` voice. PH: **no Filipino voice available**; measured best substitute used; documented | Q3 report §7 |
| Fallback/escalation stays in the customer's language and register | COMPLETE | Variant-specific fallback and escalation texts; the test asserts no English reply to non-English callers | Q3 tests |
| Coverage: cooperative, sector objection, mixed English/finance terms, colloquial, human escalation, Indonesian regional accent | COMPLETE (accent: proxy) | Held-out v2 71/75 checks; 2 recorded calls per market | `npx tsx scripts/test-q3.ts v2` |
| Two recorded calls per market, transcripts, configurations, terminology, code-switching, accent observations, comparison, native-speaker/compliance gaps | COMPLETE | `public/recordings/q3/` + `Q3_LOCALIZATION_REPORT.md` | `npx tsx scripts/run-q3-calls.ts` |

## Question 4 — Live insights and nudges

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Analysis while the call is happening (not post-upload) | COMPLETE | 100 ms frames on a wall-clock schedule; transcripts and nudges arrive mid-call (all nudges before call end) | benchmark `nudgesBeforeCallEnd 7/7` |
| Streaming input: live audio or real-time replay | COMPLETE | Real-time replay (labelled in the UI) + live mic (AudioWorklet → WebSocket) | UI run; benchmark |
| Streaming transcription, agent/customer separation, per-chunk ASR latency | COMPLETE | Per-channel VAD + Whisper; stereo = speaker separation; ASR ms on every transcript line | benchmark |
| Signals: intent/topic shifts, compliance/risk, sentiment/frustration, buying signals, missed opportunities, callback needs | COMPLETE | Topic shifts (per-utterance topic, shown as a timeline), compliance, risky statements, frustration trend, buying signal, churn, cross-sell, payment difficulty, callback | `tests/realtime` |
| Short actionable nudges via dashboard / WebSocket | COMPLETE | `/live-insights` over `/ws/insights` | screenshots |
| End-to-end latency audio → ASR → signal → nudge → display, P50/P95 and components (ASR, signal, LLM, delivery) | COMPLETE (LLM stage: not run, no key) | `LATENCY_REPORT.md`: nudge E2E P50 499.4 ms / P95 560.7 ms; ASR 424/536; delivery 0.3/0.5 (12/17 in Chrome) | `npm run bench:q4` |
| Nudge control: thresholds, duplicate suppression, cooldowns, grouping, priorities, expiry, repetition | COMPLETE | `lib/realtime/nudges.ts` (all seven + deferral and resolution) | `tests/realtime/nudges.test.ts` |
| Approximate false-positive analysis | COMPLETE | `Q4_SIGNALS_AND_FALSE_POSITIVES.md` | benchmark |
| Coverage: missed cross-sell, skipped disclosure or risky statement, rising frustration, noisy/ambiguous with no unnecessary nudges | COMPLETE | 4 labelled scenarios: 6/7 TP, 0 FP | benchmark |
| Deliverables: setup, streaming method, signal design, nudge logic, latency report, FP controls, ≥ 1 compliance and ≥ 1 missed-opportunity example | COMPLETE | README, ARCHITECTURE, LATENCY_REPORT, Q4 report | — |
| Recorded live demo | PARTIAL | Screenshots from a real Chrome run (`docs/screenshots/q4_*`); **video to be recorded by the candidate** (see `DEMO_SCRIPT.md`) | — |
| Limitations at 10× scale and with noisy audio | COMPLETE | `LIMITATIONS.md` §Q4 | — |

## Final submission package

| Requirement | Status | Evidence |
|---|---|---|
| Repository with README and env template | COMPLETE | `README.md`, `.env.example` (git repository initialised locally; **not pushed to GitHub**, pending the candidate) |
| Architecture diagram, setup, sample inputs, test results | COMPLETE | `ARCHITECTURE.md` (Mermaid), `data/`, `docs/evaluation/` |
| Recorded calls, transcripts, audio samples | COMPLETE | `public/recordings/q1`, `public/recordings/q3`, `public/audio/q4` |
| Video walkthrough | BLOCKED | Must be recorded by the candidate; script in `DEMO_SCRIPT.md` |
| Known limitations and production-improvement plan | COMPLETE | `LIMITATIONS.md` |
| No credentials, keys, secrets or customer data committed | COMPLETE | `.env*` git-ignored except `.env.example`; data is fictional; PII samples are synthetic `example.com` values and are redacted in the KB |
| LLM via TypeScript SDK | PARTIAL | `@anthropic-ai/sdk` integration implemented; **not exercised (no API key)** |
