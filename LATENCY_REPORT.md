# Latency report

All numbers are **measured** by the running implementation; nothing is estimated. Raw data:

- `docs/evaluation/q4-benchmark.json`: Q4, 4 scenarios, real-time replay through the WebSocket server, headless client acknowledgements.
- `docs/screenshots/q4_live_end.png`: the same pipeline driven from the real dashboard in Chrome.
- `docs/evaluation/retrieval-*.json`: Q2 retrieval.
- `public/recordings/q1/*.md`: Q1 per-turn agent and ASR timings.

**Environment:** Apple M4 laptop (16 GB). All models run on CPU through onnxruntime-node (transformers.js): Whisper-base q8 (Q4/Q1 ASR), Whisper-small q8 (Q3 tests), multilingual-e5-small q8 (embeddings), ms-marco-MiniLM-L-6-v2 q8 (reranker). Postgres 16 and Qdrant 1.12 run in Docker on the same machine. **No LLM key was available**, so the LLM stage did not run (n = 0). It is reported as such, not estimated.

## Q4 – Live insights pipeline

### Definitions

| Timestamp / stage | Definition |
|---|---|
| **Audio received** | `performance.now()` when the server received the **last audio frame of the utterance**. Frames arrive every 100 ms, at real-time pace in replay. |
| Endpointing | Silence the VAD waits for before closing an utterance: a constant **500 ms** (0 when a long utterance is cut at 6 s). This happens *before* "audio received" for the final frame, so it's listed separately and added for a speech-end → nudge figure. |
| ASR queue | Wait for the shared Whisper worker (serialised). |
| ASR | Whisper-base inference on the utterance. |
| Signal extraction | Rule detectors + call context. |
| LLM | Optional Claude rephrasing of new nudges (1.5 s budget). **Not run: no key.** |
| Nudge generation | Nudge engine (thresholds, grouping, cooldowns, templates). |
| Server pipeline | Audio received → event sent on the WebSocket. |
| Delivery | Event sent → client acknowledgement received. The dashboard acks inside `requestAnimationFrame` after rendering, so this is a round trip including render. |
| **End-to-end** | Audio received → client ack (transcript shown / nudge shown). |

### Results: benchmark (4 scenarios, 49 utterances, 7 nudges, headless WebSocket client)

| Stage | n | P50 (ms) | P95 (ms) | max (ms) |
|---|---|---|---|---|
| Endpointing (VAD wait, before "audio received") | 49 | 500 | 500 | 500 |
| ASR queue | 49 | 1 | 1 | 2 |
| ASR (Whisper-base) | 49 | 424 | 536 | 570 |
| Signal extraction | 49 | 0.1 | 1.2 | 1.3 |
| LLM | 0 | — | — | — |
| Nudge generation | 49 | 0 | 0 | 0.1 |
| Server pipeline (audio → sent) | 49 | 425 | 537 | 571 |
| Delivery (sent → ack) | 56 | 0.3 | 0.5 | 2.7 |
| **E2E audio → transcript shown** | 49 | **425.5** | **537.7** | 574 |
| **E2E audio → nudge shown** | 7 | **499.4** | **560.7** | 560.7 |

From the end of speech, add the 500 ms endpointing wait: **≈ 1.0 s P50 / 1.06 s P95 from the customer stopping talking to the nudge on screen.**

### Results: real dashboard in Chrome (motor cross-sell scenario, 13 utterances)

| Stage | P50 (ms) | P95 (ms) |
|---|---|---|
| ASR | 492 | 586 |
| Delivery (sent → React render → ack) | 12.2 | 16.7 |
| E2E audio → transcript shown | 507.2 | 595.5 |
| E2E audio → nudge shown (n = 2) | 592.4 | 595.5 |

Rendering in a real browser adds ≈ 12 ms over the headless client. ASR was ≈ 70 ms slower here because Chrome was running on the same CPU. (The Chrome run used the build before the final benchmark; detection logic was identical.)

### Per scenario (benchmark)

| Scenario | ASR P50 / P95 | Server P50 / P95 | Nudge E2E P50 / P95 | Nudges |
|---|---|---|---|---|
| Motor renewal – cross-sell | 468 / 570 | 470 / 571 | 475 / 561 | cross_sell @ 34.4 s, buying_signal @ 47.3 s (call 58.5 s) |
| Health sales – compliance | 416 / 528 | 418 / 529 | 527 / 529 | disclosure @ 16.2 s, risky promise @ 27.9 s, cross_sell @ 39.6 s (call 47.6 s) |
| Collections – frustration | 451 / 521 | 452 / 522 | 464 / 499 | frustration @ 29.6 s, payment_difficulty @ 50.5 s (call 58.1 s) |
| Noisy / ambiguous | 407 / 536 | 408 / 537 | — | none (correct) |

**All 7 nudges were displayed before their call ended.** Time from the end of the labelled trigger line to display: P50 −0.55 s, P95 0.95 s. Negative values are real. Long utterances are cut at 6 s and transcribed while the customer is still speaking, so the cross-sell nudge appeared ~1 s before the customer finished the sentence. The frustration nudge fired 10 s before the labelled peak line, at the earlier "I told you already… why do you keep calling me every day?", which is a correct early detection.

### Where the time goes and how to cut it

- **ASR is ~99 % of the server pipeline.** Options: streaming ASR with partial hypotheses (e.g. a cloud streaming ASR, or whisper.cpp with a streaming policy on a GPU) to get ~200–300 ms partials; whisper-tiny for a ~2× speed-up at an accuracy cost; GPU inference.
- **Endpointing (500 ms)** trades latency for fewer split sentences. A 300 ms endpoint would save ~200 ms but splits utterances at commas.
- Signal extraction, the nudge engine and WebSocket delivery are negligible (< 3 ms combined, P95).
- With an LLM enabled, nudge phrasing would add one Claude round trip for *new* nudges only; it is bounded at 1.5 s, and the template text is used if it times out. Detection never waits on the LLM.

## Q2 retrieval (used by Q1 on every question)

| Configuration | Warm P50 | Warm P95 | Cold start |
|---|---|---|---|
| Hybrid + cross-encoder rerank (final) | 100.5 ms | 111.8 ms | 490 ms (first query loads the models) |
| Hybrid without reranker (earlier version) | 8.1 ms | 13.1 ms | 346 ms |

Measured median breakdown over 8 warm queries: e5 embedding 4.7 ms, Qdrant 3.8 ms, BM25 0.1 ms, cross-encoder rerank of 12 candidates 91.7 ms (total 100.1 ms). The reranker costs ~90 ms but raised held-out accuracy (see `docs/evaluation/RETRIEVAL_EVALUATION.md`), a trade worth making for a voice turn budget of ~1 s.

## Q1 voice agent turn latency (from the recorded test calls)

| Turn type | Agent processing |
|---|---|
| Slot answer (no retrieval) | < 1 ms |
| Question / objection (retrieval + extractive answer) | ≈ 100–140 ms warm; the first question in a process ≈ 450 ms while models load |
| Caller ASR (Whisper-base, test harness) | ≈ 270–430 ms per utterance |

In the browser demo, ASR runs in the browser (Web Speech API) and TTS is browser `speechSynthesis`, so server-side work per turn is just the agent processing above.
