# Q4 – Signal design, nudge logic and false-positive analysis

Source data: `q4-benchmark.json` (real-time replay of 4 labelled calls through the running WebSocket server), and the `tests/realtime/*.test.ts` unit tests. Scenario scripts and labels: `data/test-cases/q4-scenarios.json`. Audio: `public/audio/q4/*.wav` (stereo, L = agent, R = customer, generated with macOS voices; the noisy call has low-passed noise plus hum added at 6 dB SNR).

## Signals (`lib/realtime/signals.ts`)

| Signal | Speaker | Detection | Context / guards | Priority |
|---|---|---|---|---|
| `compliance_disclosure` | agent | Agent hasn't said "recorded/recording/monitored" **and** has started talking price/payment, or 40 s have passed | Resolved automatically when the agent says the disclosure | high |
| `compliance_risky_statement` | agent | "guaranteed", "always approved", "100 %", "no questions asked", "risk-free", "never rejected"… | Negation check; all guarantee-type promises share one topic, so repeats merge | high |
| `cross_sell` | customer | Second vehicle (wife's/husband's/second car, two cars…) or uninsured family (parents have no insurance…) | Not fired if the agent already made the offer; negation and past-ownership guards ("I **sold** my second car") | medium |
| `payment_difficulty` | customer | lost my job, can't afford, money is tight, salary delayed, medical bills… | Negation guard | high |
| `frustration` | customer | Lexicon score (annoyed / ridiculous / third time / already told you / complain / !) + repetition of earlier complaints | Down-weighted ×0.3 when aimed elsewhere (traffic, weather, boss) or softened ("no problem", "it's fine"); fires on a **rising or sustained** trend over the last 3 customer turns, not on one word | high |
| `callback_need` | customer | call me back / busy now / in a meeting / driving | Negation guard | low |
| `buying_signal` | customer | how do I pay/sign up, next step, send me the form, sounds good | Negation guard | medium |
| `churn_risk` | customer | cancel my policy, switching to another, don't want to renew | Negation guard | medium |

**Audio-quality controls.** Confidence is multiplied by 0.7 when the utterance SNR is < 8 dB and 0.85 below 14 dB, and by 0.75 for utterances under 3 words. Known Whisper noise hallucinations ("Thank you.", "you", "Thanks for watching!") produce no signals.

## Nudge controls (`lib/realtime/nudges.ts`)

| Control | Setting |
|---|---|
| Confidence threshold | per type, 0.7–0.8 |
| Topic grouping / duplicate suppression | one active nudge per `type:topic`; repeats increment `count` (shown as "×n merged") instead of re-alerting |
| Cooldown | per group, 30–90 s after a nudge |
| Repetition cap | max 1–2 nudges per type per call |
| Rate limit | non-urgent (medium/low) nudges ≥ 10 s apart; extra ones are **deferred**, not dropped, and released when the gap passes if still within their TTL; high-priority nudges are never delayed |
| Expiry | per type, 45–120 s TTL |
| Resolution | an agent action closes the nudge (disclosure given, multi-vehicle/family offer made) |

## Results on the labelled calls

| Scenario | Expected | Created | Merged repeats | Suppressed / deferred | Result |
|---|---|---|---|---|---|
| Motor renewal – missed cross-sell | cross_sell | cross_sell, buying_signal (acceptable) | 1 | 0 | ✅ missed-opportunity example |
| Health sales – skipped disclosure + risky promise | disclosure, risky statement, cross_sell, callback | disclosure, risky statement, cross_sell | 5 | 1 (callback deferred) | ✅ compliance example ×2; ❌ callback missed |
| Collections – rising frustration + payment difficulty | frustration, payment_difficulty | frustration, payment_difficulty | 1 | 0 | ✅ |
| Noisy line, ambiguous phrases | none | none | 0 | 0 | ✅ no unnecessary nudges |

**Totals: 6/7 expected nudges, 0 false positives, 7/7 displayed before the call ended.**

### Compliance example (health sales call)

- 0:09–0:16 – Agent: "For a family of four with five lakh cover, the Gold plan premium is around 18,000…" (no recording disclosure yet).
- 0:16 – **HIGH** nudge: *"Disclose the call recording before discussing price or payment."* (0.5 s after the utterance's audio arrived).
- 0:27 – Agent: "with us claims are always approved, it is guaranteed. No questions asked." → **HIGH** nudge: *"Correct the promise "always approved": claims can't be guaranteed; they follow policy terms."*
- 0:34 – Agent: "Yes sir, 100% you have nothing to worry about." → merged into the same nudge (×2) instead of a new alert.

### Missed-opportunity example (motor renewal call)

- 0:27–0:33 – Customer: "my wife also has a car, a Hyundai i20, and her insurance is with another company." → **MEDIUM** nudge at 0:34: *"Customer has another vehicle: suggest the multi-vehicle discount."* The agent never offered it, so the nudge stayed active (it would have resolved if the agent had said "multi-vehicle").

## Approximate false-positive analysis

- **On the labelled calls:** 0 false positives across 49 transcribed utterances (4 calls, 205 s of audio). With 7 nudges in total that is a precision of 1.0 on this set and a recall of 6/7 = 0.86. **The sample is far too small to claim a production false-positive rate.** It shows the guards work on the cases they were designed for.
- **Designed traps in the noisy call, all correctly silent:**
  - "no problem at all" (softener);
  - "the traffic here is really frustrating today" (external target → score 0.15 < 0.45);
  - "I'm not worried about the price" (negation);
  - "I sold my second car last year" (past ownership);
  - a Whisper hallucination ("you") on a noise-only segment.

  The same guards are covered by `tests/realtime/nudges.test.ts`.
- **How much noise the controls absorbed:** 7 merged repeats, 1 deferred nudge, 0 duplicate alerts. Without grouping, the health call alone would have shown 6 compliance alerts (the disclosure gap recurs on every agent price turn), not 2.
- **Expected false-positive sources in production** (not measured here; these are what I'd monitor):
  1. ASR errors that create trigger words (e.g. "second car" misheard).
  2. Sarcasm ("great, just great").
  3. Cross-sell phrases about vehicles the customer no longer owns, phrased in ways the past-tense guard misses.
  4. Disclosures given in words the regex doesn't know ("this conversation may be monitored for training"). This one is partly covered by "monitored".
  5. Frustration lexicon on code-switched speech.
- **How to measure it properly:** label 200–500 real calls with nudge-worthy moments, and report precision/recall per signal type and alerts per call-minute. Agent feedback ("useful / not useful") on each nudge in the dashboard would give an ongoing precision estimate.

## Miss analysis

The `callback_need` nudge ("Please call me back tomorrow evening") was **deferred** by the 10 s non-urgent spacing rule, because a cross-sell nudge had fired 7 s earlier. The call ended 1.2 s later, before the deferral expired. This is a deliberate trade-off (no bursts of non-urgent alerts), but end-of-call intents are exactly when the agent needs them. Possible fixes: raise `callback_need` to medium priority with its own lane, or release deferred nudges immediately when the customer's last turn looks like a closing.

## Limitations at 10× scale and with noisy audio

See [LIMITATIONS.md](../../LIMITATIONS.md#q4--live-insights).
