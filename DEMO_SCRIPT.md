# Demo script (video walkthrough, ~15 minutes)

It covers everything the assessment's video walkthrough must include: system overview and live demo, architecture and design decisions, KB/retrieval and voice-agent flow, multilingual handling, live nudges, error/fallback cases, limitations and production improvements.

## Before recording

```bash
docker compose up -d          # Postgres :5433 + Qdrant :6333
npm run ingest                # build the knowledge base (first run downloads models, ~1 min)
npm run dev                   # http://localhost:3100  (custom server: Next.js + WebSocket)
```

- Use **Chrome** (Web Speech API + speechSynthesis). Allow the microphone when asked.
- Open `/live-insights` once and play one replay so all models are warm.
- Keep `docs/evaluation/RETRIEVAL_EVALUATION.md` and `LATENCY_REPORT.md` open in another tab.

## 1. Overview (1 min) — `/`

- "One Next.js + TypeScript app covering all four questions. Postgres + Prisma for structured data, Qdrant for vectors, local ONNX models for embeddings, reranking and Whisper ASR, and Claude as an optional phrasing layer."
- Point at the metric tiles (held-out retrieval, Q1 calls, Q3 checks, Q4 latency) and the architecture block. Say: *Q1 depends on Q2*.

## 2. Knowledge base (3 min) — `/knowledge-base`

1. Stat tiles: 14 sources, 1 failed (corrupt scanned PDF), 46 boilerplate lines removed, 1 exact + 1 near duplicate, 11 PII redactions, 1 superseded policy version, 1 conflict flagged, 1 invalid date.
2. **Documents** tab: the failed PDF with its "route to OCR" error; claims policy v1.0 `superseded`; the issues list (invalid date 31/02/2026; FAQ says "4 years" vs policy "36 months" → FAQ flagged).
3. **Records** tab, filter status = `flagged`, then `duplicate`; show the PII-redacted record (`[PHONE_REDACTED]`…), the alias on the cashless FAQ, and `revision` / `version`.
4. **Search**: click "What does the Gold plan include?". Show the grounded answer, citation, ranked chunks with rerank/dense/BM25 scores and the per-stage latency.
5. Click **"Is IVF covered?"** → "I don't have verified information…" (not grounded). Click **"Do you sell car insurance?"** → out-of-domain refusal.
6. **Retrieval tests** tab: run them. Then *say honestly*: "this is the dev set I tuned on; the held-out sets are 8/12 and 8/13 correct". Open `RETRIEVAL_EVALUATION.md` to show the held-out tables and failure modes.

## 3. Voice agent (3 min) — `/voice-agent`

1. Speech input "Browser ASR", **Start call**. Asha greets, discloses that she's an AI and that the call is recorded, and asks for consent.
2. Speak the cooperative path: "Yes" → name → "I'm 41" → "me and my parents, my father is 70" → city.
3. Objection: **"I already have insurance from my office, why do I need another one?"** Show the grounded answer, the `kb_objection_002` citation, and the right-hand *Retrieved knowledge* panel.
4. Unsupported: **"Does it cover IVF?"** → explicit "information unavailable", noted for the advisor, script resumes.
5. Conflict: give a budget, then say "actually I'm 45" → the agent asks you to confirm.
6. Either finish ("yes, tomorrow at 6 pm"): show qualification (plan, notes), callback, lead and CRM summary. Or say **"connect me to a real person"**: escalation and the webhook action.
7. Mention the 6 recorded harness calls: play 20 s of `public/recordings/q1/q1_objections.wav` and open its `.md` transcript (ASR text vs script, citations, checks).

## 4. Multilingual bots (3 min) — `/multilingual`

1. **Philippines**, Start call. Click *Confirm (Tagalog)*: the reply switches to Tagalog. Click *Objection (Taglish)*: the empathetic Taglish reply with the grace-period rule. Then *Escalation*: escalation in Tagalog.
2. Point to the detection badges (Tagalog/English word counts, loanwords) and the "Localization (not literal translation)" panel.
3. **Indonesia**: *Confirm (formal)* → formal "Bapak … angsuran … sebesar Rp1.250.000". Then *Regional: Javanese* → regional detection, casual register with "nggih". Then *Escalation*.
4. Optionally speak with the mic (fil-PH / id-ID).
5. Open `docs/evaluation/Q3_LOCALIZATION_REPORT.md`:
   - ASR WER table (ID 0.32 native vs 0.54 accent proxy);
   - Whisper *translating* Indonesian when forced to English;
   - the missing Filipino voice and the measured substitute;
   - native-speaker and compliance gaps.
6. Play 15 s of `public/recordings/q3/ph_call2_tagalog_objection_escalation.wav`. The ASR garbles the caller, the bot asks to repeat *in Tagalog*, then escalates.

## 5. Live insights (3 min) — `/live-insights`

1. Mode **Real-Time Replay / Simulation**, scenario *Health sales – skipped recording disclosure*, **Start**. The audio plays while the transcript streams (agent left, customer right).
2. At ~0:16 the **HIGH** compliance nudge appears ("Disclose the call recording…"). At ~0:28 the risky-promise nudge; at ~0:34 "100%" merges into it (×2) instead of a new alert. At ~0:39 the cross-sell (uninsured parents). The callback request at the end is shown under *Suppressed / deferred*: explain the 10 s spacing rule and that this is the one miss in the benchmark.
3. Show the latency table (ASR ≈ 0.4–0.5 s, signal < 1 ms, delivery ≈ 12 ms in the browser, nudge E2E ≈ 0.5–0.6 s) and the topic-shift timeline.
4. Run *Noisy line – no nudges expected*. The transcript still comes through and **no nudges** fire, despite "frustrating traffic", "sold my second car" and "not worried about the price".
5. Optional: Live microphone mode, speaking as customer: "I lost my job and money is tight" → payment-difficulty nudge.

## 6. Errors, limitations and production plan (2 min)

- Show the fallbacks:
  - no LLM key → extractive answers;
  - reranker failure → dense threshold;
  - corrupt PDF → flagged;
  - wrong-party call → no account details disclosed;
  - ASR garble → re-ask in the caller's language.
- Walk through `LIMITATIONS.md`:
  - synthetic voices, no telephony, no LLM key;
  - held-out retrieval failure modes;
  - CPU Whisper as the 10× bottleneck (≈ 5–8 calls per worker, estimated);
  - noisy-audio mitigations (neural VAD, denoise, ASR confidence gating).
- Production plan: real labelled calls, streaming ASR, multilingual reranker + NLI verifier, Claude phrasing with the existing verifier, CPaaS media streams, compliance controls, observability.

## Commands for a quick evidence refresh (optional, off camera)

```bash
npm test                      # 29 unit/integration tests
npm run eval:retrieval        # dev set
npm run eval:retrieval:heldout
npm run test:calls            # 6 recorded Q1 calls (synthetic voices → Whisper → agent)
npm run test:q3               # held-out Q3 conversations
npm run bench:q4              # needs `npm run dev` running; ~4 min real time
npm run reports               # regenerate Markdown tables from the JSON results
```
