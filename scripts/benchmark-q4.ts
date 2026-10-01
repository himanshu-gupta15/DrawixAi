/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Q4 benchmark: replays every scenario through the running server's WebSocket at real-time speed,
 * acknowledges events like the dashboard does, then scores nudges against the labelled scenarios
 * (true/false positives, misses, time from trigger to nudge, nudge-before-call-end) and writes
 * docs/evaluation/q4-benchmark.json. Requires `npm run dev` (or start) to be running.
 */
import fs from "node:fs";
import WebSocket from "ws";

const PORT = process.env.PORT || "3100";
const only = process.argv[2];
type Ev = Record<string, any>;

function runScenario(id: string): Promise<{ events: Ev[]; summary: Ev; startedAt: number }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws/insights`);
    const events: Ev[] = [];
    let startedAt = 0;
    ws.on("open", () => { startedAt = Date.now(); ws.send(JSON.stringify({ type: "start", mode: "replay", scenario: id })); });
    ws.on("message", (raw) => {
      const e = JSON.parse(raw.toString());
      e._wallMs = Date.now() - startedAt;
      events.push(e);
      if (e.type === "transcript") ws.send(JSON.stringify({ type: "ack", id: e.id }));
      if (e.type === "nudge" && e.event === "created") ws.send(JSON.stringify({ type: "ack", id: e.eventId }));
      if (e.type === "error") reject(new Error(e.message));
      if (e.type === "ended") { ws.close(); resolve({ events, summary: e.summary, startedAt }); }
    });
    ws.on("error", reject);
  });
}

async function main() {
  const scenarios = JSON.parse(fs.readFileSync("data/test-cases/q4-scenarios.json", "utf8")).filter((s: Ev) => !only || s.id === only);
  const results: Ev[] = [];
  for (const sc of scenarios) {
    const timeline = JSON.parse(fs.readFileSync(`data/audio/q4/${sc.id}.timeline.json`, "utf8"));
    process.stdout.write(`> ${sc.id} (${(timeline.durationMs / 1000).toFixed(0)} s real-time)... `);
    const { events, summary } = await runScenario(sc.id);
    const created = events.filter((e) => e.type === "nudge" && e.event === "created");
    const types = created.map((e) => e.nudge.type);
    const tp = sc.expected.filter((t: string) => types.includes(t));
    const fn = sc.expected.filter((t: string) => !types.includes(t));
    const fp = types.filter((t: string) => !sc.expected.includes(t) && !sc.acceptable.includes(t));
    const forbidden = types.filter((t: string) => sc.mustNotFire.includes(t));
    const nudges = created.map((e) => {
      const label = timeline.lines.find((l: Ev) => l.label === e.nudge.type);
      return {
        type: e.nudge.type, priority: e.nudge.priority, text: e.nudge.text, confidence: e.nudge.confidence, evidence: e.nudge.evidence[0],
        callMsAtNudge: e.nudge.createdCallMs, wallMsDisplayed: e._wallMs, triggerLineEndMs: label?.endMs ?? null,
        secondsAfterTriggerSpeechEnd: label ? +((e._wallMs - label.endMs) / 1000).toFixed(2) : null,
        beforeCallEnd: e._wallMs < timeline.durationMs, timings: e.timings,
      };
    });
    const r = { id: sc.id, title: sc.title, durationMs: timeline.durationMs, expected: sc.expected, created: types, truePositives: tp, missed: fn, falsePositives: fp, forbiddenFired: forbidden, merged: summary.metrics.nudges.merged, suppressed: summary.suppressed.map((s: Ev) => `${s.signal.type}: ${s.reason}`), resolved: events.filter((e) => e.type === "nudge" && e.event === "resolved").map((e) => e.nudge.type), nudges, metrics: summary.metrics, transcript: summary.transcript, samples: summary.samples };
    results.push(r);
    console.log(`nudges=[${types.join(", ")}] TP=${tp.length}/${sc.expected.length} FP=${fp.length} suppressed=${summary.suppressed.length}`);
  }
  // pooled latency samples across scenarios come from each session's summary; recompute pooled percentiles from per-event timings
  const pool = (f: (n: Ev) => number | null | undefined) => results.flatMap((r) => r.nudges.map(f)).filter((v): v is number => typeof v === "number");
  const pct = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : null; };
  const pooled = (key: string) => results.flatMap((r) => (r.samples?.[key] ?? []) as number[]);
  const stat = (v: number[]) => ({ n: v.length, p50: pct(v, 50), p95: pct(v, 95), max: v.length ? Math.max(...v) : null });
  const out = {
    ranAt: new Date().toISOString(),
    asrModel: process.env.ASR_MODEL || "Xenova/whisper-base",
    hardware: "Apple M4 (CPU inference via onnxruntime-node)",
    scenarios: results,
    totals: {
      expected: results.reduce((n, r) => n + r.expected.length, 0),
      truePositives: results.reduce((n, r) => n + r.truePositives.length, 0),
      falsePositives: results.reduce((n, r) => n + r.falsePositives.length, 0),
      missed: results.reduce((n, r) => n + r.missed.length, 0),
      nudgesBeforeCallEnd: `${results.flatMap((r) => r.nudges).filter((n) => n.beforeCallEnd).length}/${results.flatMap((r) => r.nudges).length}`,
      secondsAfterTriggerSpeechEnd: { p50: pct(pool((n) => n.secondsAfterTriggerSpeechEnd), 50), p95: pct(pool((n) => n.secondsAfterTriggerSpeechEnd), 95) },
    },
    pooledLatency: {
      endpointing: stat(pooled("endpoint")), asrQueue: stat(pooled("asrQueue")), asr: stat(pooled("asr")), signalExtraction: stat(pooled("signal")), llm: stat(pooled("llm")),
      nudgeGeneration: stat(pooled("gen")), serverPipeline: stat(pooled("server")), delivery: stat(pooled("delivery")), endToEndTranscript: stat(pooled("transcriptE2e")), endToEndNudge: stat(pooled("nudgeE2e")),
    },
    perScenarioLatency: results.map((r) => ({ id: r.id, ...r.metrics.latencyMs })),
  };
  fs.mkdirSync("docs/evaluation", { recursive: true });
  fs.writeFileSync(only ? `docs/evaluation/q4-benchmark-${only}.json` : "docs/evaluation/q4-benchmark.json", JSON.stringify(out, null, 2));
  console.log("\nTotals:", out.totals);
}
main().catch((e) => { console.error(e); process.exit(1); });
