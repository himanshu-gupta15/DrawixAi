import { test } from "node:test";
import assert from "node:assert/strict";
import { NudgeEngine, GLOBAL_MIN_GAP_MS } from "@/lib/realtime/nudges";
import { SignalExtractor, topicOf, type Signal } from "@/lib/realtime/signals";
import { Segmenter, type Segment } from "@/lib/realtime/segmenter";

const sig = (type: Signal["type"], callMs: number, confidence = 0.9, topic = "general"): Signal => ({ type, topic: `${type}:${topic}`, confidence, evidence: "x", speaker: "customer", callMs });

test("confidence threshold suppresses weak signals", () => {
  const e = new NudgeEngine();
  const ev = e.process([sig("frustration", 1000, 0.5)], 1000);
  assert.equal(ev[0].kind, "suppressed");
});

test("duplicates merge into the active nudge instead of re-alerting; cooldown and per-call cap apply", () => {
  const e = new NudgeEngine();
  assert.equal(e.process([sig("payment_difficulty", 1000)], 1000)[0].kind, "created");
  assert.equal(e.process([sig("payment_difficulty", 5000)], 5000)[0].kind, "merged");
  e.expire(200000);
  const later = e.process([sig("payment_difficulty", 200000)], 200000);
  assert.equal(later.at(-1)!.kind, "suppressed"); // maxPerCall = 1
});

test("non-urgent nudges are spaced out (deferred, then released); high priority is never rate limited", () => {
  const e = new NudgeEngine();
  e.process([sig("cross_sell", 1000, 0.9, "vehicle")], 1000);
  const ev = e.process([sig("callback_need", 3000)], 3000);
  assert.equal(ev[0].kind, "deferred");
  assert.equal(e.process([sig("frustration", 3500)], 3500).at(-1)!.kind, "created");
  const released = e.tick(1000 + GLOBAL_MIN_GAP_MS + 1);
  assert.ok(released.some((x) => x.kind === "created" && x.nudge.type === "callback_need"));
});

test("nudges expire, and agent actions resolve them", () => {
  const e = new NudgeEngine();
  e.process([{ ...sig("compliance_disclosure", 1000), speaker: "agent", topic: "compliance_disclosure:recording" }], 1000);
  const r = e.process([{ ...sig("compliance_disclosure", 5000, 1), topic: "compliance_disclosure:recording", resolves: ["compliance_disclosure:recording"] }], 5000);
  assert.equal(r[0].kind, "resolved");
  e.process([sig("buying_signal", 10000)], 10000);
  assert.ok(e.expire(10000 + 46000).some((x) => x.kind === "expired"));
});

test("signal guards: negation, past tense, external frustration and ASR hallucinations do not fire", () => {
  const x = new SignalExtractor();
  const u = (text: string, speaker: "agent" | "customer" = "customer", snrDb = 30) => x.extract({ speaker, text, startMs: 0, endMs: 1000, snrDb });
  assert.deepEqual(u("I sold my second car last year"), []);
  assert.deepEqual(u("the traffic here is really frustrating today"), []);
  assert.deepEqual(u("I'm not worried about the price, no problem"), []);
  assert.deepEqual(u("Thank you."), []);
  assert.equal(u("my wife also has a car")[0].type, "cross_sell");
  assert.equal(u("I lost my job last month")[0].type, "payment_difficulty");
  assert.ok(u("claims are always approved, guaranteed", "agent").some((s) => s.type === "compliance_risky_statement"));
});

test("segmenter: speech bursts separated by silence become separate segments, even with steady background noise", () => {
  const segs: Segment[] = [];
  const s = new Segmenter("customer", (g) => segs.push(g));
  const sr = 16000;
  const noise = (n: number) => Float32Array.from({ length: n }, () => (Math.random() - 0.5) * 0.04);
  const tone = (ms: number) => { const n = (sr * ms) / 1000; const a = noise(n); for (let i = 0; i < n; i++) a[i] += 0.3 * Math.sin((2 * Math.PI * 220 * i) / sr); return a; };
  s.push(noise(sr)); // 1 s noise only
  s.push(tone(1200)); s.push(noise(sr * 0.8));
  s.push(tone(900)); s.push(noise(sr * 0.8));
  assert.equal(segs.length, 2);
  assert.ok(segs.every((g) => !g.forced));
});

test("topic tracking classifies utterances for topic-shift display", () => {
  assert.equal(topicOf("Your renewal premium is 11,400 rupees"), "pricing & premium");
  assert.equal(topicOf("How do I file a cashless claim at the hospital?"), "claims");
  assert.equal(topicOf("hello there"), null);
});
