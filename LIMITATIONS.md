# Known limitations and production-improvement plan

Every point here comes from a measurement, a test failure or a constraint of the build environment. Nothing is speculative padding.

## Environment constraints (what could not be tested)

| Item | Status | Impact |
|---|---|---|
| Claude / LLM | No API key available. The Claude path (`lib/ai/llm.ts`, answer verifier, nudge phrasing) is implemented with the official SDK and type-checks, but **never ran against the API**. | All answers in the evaluations are extractive (retrieval-only). The LLM verifier logic is unit-tested on fixed strings. |
| Real phone number / SIP | Not provided. The callable interface is the **web calling page** (`/voice-agent`). | No PSTN audio (8 kHz, codec artefacts) was tested. |
| Human speakers | None available. All recorded test calls use **synthesized voices** (macOS `say`). | ASR accuracy is optimistic compared with real callers, and regional-accent results use a Malay-voice *proxy*. |
| Browser Web Speech ASR (`en-IN`, `fil-PH`, `id-ID`) and browser voices | Wired up and selectable. Drove the pages in headless Chrome with fake media, but **no real speech was recognised by the browser recogniser**. | The browser recogniser's quality is unmeasured. Server Whisper numbers are measured. |
| Filipino TTS voice | Not installed on this machine. | Recorded PH calls use the measured-best substitute (Indonesian voice for Tagalog). See the Q3 report. |

## Q2 – Knowledge base

- **Retrieval accuracy on unseen questions is moderate.** Held-out v2: 8 correct, 1 partially correct, 4 incorrect out of 13. The 16/16 on the development set is optimistic because it was used for tuning. Failure modes:
  - **False refusals:** the right record was #1 but scored below the grounding threshold ("annual health check-up", "feels like a waste" value objection).
  - **Statement-type objections** that don't paraphrase a playbook title ("Let me discuss with my wife and get back to you").
  - **Absent-entity questions** ("Does Gold cover LASIK?"): the plan record looks relevant, but the entity isn't in it, so the system says something true but unhelpful instead of "not confirmed".
- The **synonym table** is hand-written and can mislead ("hair transplant" → organ-transplant expansion). It doesn't scale to a large catalogue.
- Grounding thresholds (rerank ≥ 0, or ≥ −2.5 with dense ≥ 0.85; objection paraphrase ≥ 0.87) were calibrated on ~40 dev queries. Margins are thin (out-of-scope IVF scores −2.73 vs a valid objection at −1.86).
- The reranker (`ms-marco-MiniLM-L-6-v2`) is English-only and adds ~90 ms per query.
- **Ingestion** is a full rebuild on every change (fine for 50 records, not for 50,000). PII detection is regex-based (Indian formats only) and misses names outside known patterns. Fact-conflict checks cover three hard-coded facts. Scanned PDFs are detected and flagged but not OCR'd.
- The corpus is a realistic but **fictional** company dataset I authored; there was no real client data.

## Q1 – Voice agent

- NLU is rule-based (regex and keyword extraction). It handles the tested phrasings and ASR variants (digits vs words, punctuation), but unusual phrasings fall back to a reprompt; after 2 reprompts the slot is marked for the advisor. Names come from ASR text, which mishears them ("Meera" → "Mira").
- City recognition depends on ASR. "Bengaluru" was transcribed as "been gallery", and the agent correctly re-asked.
- The browser call records **only the caller's microphone**; the agent's TTS isn't mixed in. Two-sided recordings exist only for the harness calls.
- No barge-in: the agent pauses recognition while speaking, so the caller can't interrupt TTS.
- Only one PED waiting-period lookup is script-driven; product recommendations come from budget bands, not real pricing APIs.

## Q3 – Localized bots

- Held-out v2 conversation checks: 71/75. Known misses:
  - a sentence-final closing ("…Sudah cukup.");
  - Javanese *wis tak transfer* (already paid) read as a promise;
  - an out-of-scope car-loan interest question answered as an amount question (the cue word "berapa").
- Whisper on synthesized Tagalog: WER 0.41–0.62; regional vocabulary under the accent proxy is up to 1.0 WER (Medan).
- Bot replies are fixed, natively written variants. They are reliable but less flexible than LLM generation.
- **No native-speaker review** of Tagalog, Taglish, Bahasa or regional phrasing.
- **Compliance gaps:**
  - No calling-hours enforcement (Indonesian collections).
  - No explicit consent capture (both markets).
  - The penalty, grace and reinstatement texts are fictional and must match real contracts.

## Q4 – Live insights

**Measured quality.** 6/7 expected nudges, 0 false positives, 7/7 shown before call end, on 4 synthetic calls. The sample is too small to estimate production precision; see `docs/evaluation/Q4_SIGNALS_AND_FALSE_POSITIVES.md`.

- Signals are regex/lexicon rules. They are precise on known phrasings but miss paraphrases and sarcasm, and they're English-only.
- Speaker separation relies on **stereo channels**. Mono audio (the live mic mode) needs the manual speaker toggle; there is no diarisation model.
- No ASR partial hypotheses: the earliest insight comes after an utterance ends or after a 6 s cut.

### At 10× scale

The prototype runs one Whisper worker per process on CPU. ASR measured ≈ 420 ms per utterance of a few seconds (real-time factor ≈ 0.1). From that, I *estimate* (no load test was run) that one CPU worker serves roughly 5–8 concurrent two-channel calls before queueing pushes latency up. The `asrQueue` stage would grow first; it's already measured and reported, so a load test would show the knee directly.

| Bottleneck at 10× | Mitigation |
|---|---|
| CPU Whisper (shared queue) | GPU ASR workers (faster-whisper / Triton) or a managed streaming ASR; one queue per worker with admission control; drop to whisper-tiny under load |
| Single Node process holds every WebSocket and session in memory | Move sessions to stateless workers behind a load balancer with sticky sessions; put events on Redis Streams/Kafka; WebSocket gateway separate from inference |
| In-process nudge state | Keep per-call state keyed by call id in Redis, so a worker restart doesn't lose cooldowns or merges |
| Postgres writes per session | Batch and async writes; metrics to a time-series store |
| LLM phrasing (if enabled) | Only for *new* nudges, 1.5 s budget, template fallback; prompt caching; rate-limit per tenant |

### With noisy audio

- **Measured:** at 6 dB SNR the adaptive (minimum-statistics) VAD segmented the turns correctly and there were no false nudges. Transcripts still lost words ("I'm not" cut short). An earlier VAD version without the adaptive floor merged all speech into 6 s blocks (bug found and fixed during the benchmark).
- Below ~5 dB, or with babble noise (other voices), energy VAD will trigger on noise. A neural VAD (Silero) and noise suppression (RNNoise / DeepFilterNet) belong in front of ASR.
- Whisper hallucinates on noise ("Thank you.", "you", repetition loops). The known strings are filtered, but new ones will appear. Production should gate on ASR confidence or log-probabilities (not exposed by the transformers.js pipeline) and require 2 corroborating utterances for medium/low-priority signals on low-SNR calls.
- Confidence is down-weighted below 14 dB / 8 dB SNR, which deliberately trades recall for precision on bad lines.

## Production-improvement plan (prioritised)

1. **Real data and evaluation.** Collect 200–500 real calls per use case and market, with native-speaker transcripts and labels. Track retrieval precision/recall, refusal rate, ASR WER per segment, and nudge precision from agent feedback buttons.
2. **ASR.** Streaming ASR with partial results and language ID: a managed provider per market (Tagalog/Indonesian models) or GPU faster-whisper. Fine-tune or bias on product terms and regional vocabulary (cicilan, tenor, GCash, Bengaluru…).
3. **Retrieval.** Multilingual reranker; an LLM or NLI "does this passage answer the question" verifier for the grounding decision; learn synonyms from search logs; incremental ingestion with change detection; OCR for scanned PDFs; an ML PII detector (e.g. Presidio with Indian/PH/ID recognisers).
4. **LLM layer.** Enable Claude for answer phrasing and Q3 response generation, constrained by the packs and the existing verifier (citations plus number check). Add prompt caching and per-turn latency budgets.
5. **Telephony.** SIP/PSTN via a CPaaS media stream into the same WebSocket pipeline (8 kHz μ-law → 16 kHz), barge-in, DTMF fallback, two-channel call recording with retention policies.
6. **Compliance.** Consent capture; calling-hour and frequency limits per market; disclosure scripts maintained by compliance; immutable audit logs of every answer with its citations.
7. **Ops.** Containerise (app, Postgres, Qdrant, ASR workers); secrets in a vault; OpenTelemetry traces per turn and per nudge (the stage timings already exist); alert on P95 latency and refusal-rate drift.
