/**
 * Q4 live-insight session: audio frames -> per-channel segmenter -> Whisper ASR -> signal
 * extraction -> nudge engine -> (optional Claude phrasing) -> event to the dashboard.
 * Every stage is timestamped with performance.now() in this process; the dashboard acks each
 * event so delivery (server -> browser render) is measured too.
 */
import crypto from "node:crypto";
import { prisma } from "../database/prisma";
import { transcribe } from "../asr/whisper";
import { complete, llmEnabled } from "../ai/llm";
import { Segmenter, type Segment } from "./segmenter";
import { SignalExtractor, topicOf, type Signal, type Utterance } from "./signals";
import { NudgeEngine, type Nudge, type NudgeEvent } from "./nudges";
import { summarize } from "./stats";

export type Speaker = "agent" | "customer";

export interface StageTimings { endpointMs: number; asrQueueMs: number; asrMs: number; signalMs: number; llmMs: number | null; genMs: number; serverMs: number; deliveryMs?: number; e2eMs?: number }

export type InsightEvent =
  | { type: "transcript"; id: string; speaker: Speaker; text: string; startMs: number; endMs: number; snrDb: number; forced: boolean; timings: StageTimings }
  | { type: "signal"; signals: Signal[] }
  | { type: "topic"; from: string | null; to: string; speaker: Speaker; callMs: number }
  | { type: "nudge"; event: NudgeEvent["kind"] | "rephrased"; nudge: Nudge; detail?: string; eventId: string; timings?: StageTimings }
  | { type: "suppressed"; signal: Signal; reason: string; callMs: number }
  | { type: "progress"; callMs: number }
  | { type: "metrics"; metrics: ReturnType<InsightSession["metrics"]> }
  | { type: "ended"; summary: Awaited<ReturnType<InsightSession["stop"]>> };

export class InsightSession {
  readonly id = `ins_${crypto.randomBytes(4).toString("hex")}`;
  private segmenters: Record<Speaker, Segmenter>;
  private extractor = new SignalExtractor();
  private engine = new NudgeEngine();
  private queue: Promise<void> = Promise.resolve();
  private samples: Record<Speaker, number> = { agent: 0, customer: 0 };
  private transcript: { speaker: Speaker; text: string; startMs: number; endMs: number; snrDb: number }[] = [];
  private suppressed: { signal: Signal; reason: string }[] = [];
  private sentAt = new Map<string, { sent: number; audio: number; kind: "transcript" | "nudge" | "phrased" }>();
  private lat = { endpoint: [] as number[], asr: [] as number[], asrQueue: [] as number[], signal: [] as number[], llm: [] as number[], gen: [] as number[], server: [] as number[], transcriptE2e: [] as number[], nudgeE2e: [] as number[], phrasedE2e: [] as number[], delivery: [] as number[] };
  private lastExpiryCheck = 0;
  private topic: string | null = null;
  private topics: { to: string; callMs: number }[] = [];
  private stopped = false;
  readonly startedAt = Date.now();

  constructor(readonly mode: "replay" | "mic", readonly scenario: string | null, private emit: (e: InsightEvent) => void, private asrModel?: string) {
    this.segmenters = {
      agent: new Segmenter("agent", (s) => this.enqueue(s)),
      customer: new Segmenter("customer", (s) => this.enqueue(s)),
    };
  }

  get callMs() { return Math.max(this.samples.agent, this.samples.customer) / 16; }

  pushAudio(speaker: Speaker, pcm16k: Float32Array, receivedAt = performance.now()) {
    if (this.stopped) return;
    this.samples[speaker] += pcm16k.length;
    this.segmenters[speaker].push(pcm16k, receivedAt);
    if (this.callMs - this.lastExpiryCheck >= 1000) {
      this.lastExpiryCheck = this.callMs;
      for (const ev of this.engine.tick(this.callMs)) this.emitNudge(ev, undefined, performance.now());
      this.emit({ type: "progress", callMs: Math.round(this.callMs) });
    }
  }

  /** Mic mode has one channel: audio from the other speaker channel keeps time aligned. */
  advanceSilence(speaker: Speaker, samples: number) { this.samples[speaker] += samples; }

  private enqueue(seg: Segment) {
    this.queue = this.queue.then(() => this.process(seg)).catch((e) => console.error("[insights] segment failed", e));
  }

  private async process(seg: Segment) {
    const speaker = seg.channel as Speaker;
    const asrStart = performance.now();
    const asr = await transcribe(seg.audio, { language: "english", model: this.asrModel });
    const asrEnd = performance.now();
    const text = asr.text.trim();
    if (!text) return;
    const u: Utterance = { speaker, text, startMs: seg.startMs, endMs: seg.endMs, snrDb: seg.snrDb };
    this.transcript.push(u);
    const signals = this.extractor.extract(u);
    const sigEnd = performance.now();
    const events = this.engine.process(signals, seg.endMs);
    const created = events.filter((e): e is Extract<NudgeEvent, { kind: "created" }> => e.kind === "created");
    const genEnd = performance.now();
    const base: StageTimings = {
      endpointMs: seg.forced ? 0 : 500, asrQueueMs: Math.round(asrStart - seg.receivedAt), asrMs: Math.round(asrEnd - asrStart),
      signalMs: round(sigEnd - asrEnd), llmMs: null, genMs: round(genEnd - sigEnd), serverMs: Math.round(genEnd - seg.receivedAt),
    };
    this.lat.endpoint.push(base.endpointMs); this.lat.asr.push(base.asrMs); this.lat.asrQueue.push(base.asrQueueMs); this.lat.signal.push(base.signalMs); this.lat.gen.push(base.genMs); this.lat.server.push(base.serverMs);

    const tid = `t${this.transcript.length}`;
    this.track(tid, "transcript", seg.receivedAt);
    this.emit({ type: "transcript", id: tid, speaker, text, startMs: seg.startMs, endMs: seg.endMs, snrDb: seg.snrDb, forced: seg.forced, timings: base });
    if (signals.length) this.emit({ type: "signal", signals });
    const t = topicOf(text);
    if (t && t !== this.topic) {
      this.emit({ type: "topic", from: this.topic, to: t, speaker, callMs: seg.endMs });
      this.topics.push({ to: t, callMs: seg.endMs });
      this.topic = t;
    }
    for (const ev of events) this.emitNudge(ev, base, seg.receivedAt);
    // LLM phrasing runs AFTER the template nudge is on screen and never blocks the audio queue.
    for (const e of created) void this.rephrase(e.nudge, seg.receivedAt);
  }

  /**
   * Optional LLM rewording of a sales/empathy nudge (Groq gpt-oss-20b or Claude), swapped in when ready.
   * Compliance nudges keep their approved fixed wording; regulated text is never paraphrased.
   */
  private async rephrase(nudge: Nudge, audioAt: number) {
    if (!llmEnabled() || nudge.type.startsWith("compliance")) return;
    const l0 = performance.now();
    try {
      const r = await Promise.race([
        complete({ system: "Rewrite the coaching nudge for a call-centre agent in at most 14 words. Keep it actionable. Do not add facts, products, prices or promises.", user: `Nudge: ${nudge.text}\nCustomer said: ${nudge.evidence[0]}`, maxTokens: 300, purpose: "nudge" }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("llm timeout")), 2500)),
      ]);
      this.lat.llm.push(performance.now() - l0);
      nudge.text = r.text.split("\n")[0].replace(/^["“]|["”]$/g, "");
      const eventId = `${nudge.id}:rephrased`;
      this.track(eventId, "phrased", audioAt);
      this.emit({ type: "nudge", event: "rephrased", nudge: { ...nudge }, detail: r.model, eventId });
    } catch {
      this.lat.llm.push(performance.now() - l0); // timeout/error: template text stays
    }
  }

  private emitNudge(ev: NudgeEvent, timings?: StageTimings, audioAt?: number) {
    if (ev.kind === "suppressed" || ev.kind === "deferred") {
      this.suppressed.push({ signal: ev.signal, reason: ev.reason });
      this.emit({ type: "suppressed", signal: ev.signal, reason: ev.reason, callMs: Math.round(this.callMs) });
      return;
    }
    const eventId = `${ev.nudge.id}:${ev.kind}`;
    if (ev.kind === "created" && audioAt !== undefined) this.track(eventId, "nudge", audioAt);
    this.emit({ type: "nudge", event: ev.kind, nudge: { ...ev.nudge }, detail: ev.kind === "resolved" ? ev.by : undefined, eventId, timings: ev.kind === "created" ? timings : undefined });
  }

  private track(id: string, kind: "transcript" | "nudge" | "phrased", audioAt: number) {
    this.sentAt.set(id, { sent: performance.now(), audio: audioAt, kind });
  }

  /** Dashboard acknowledgement after rendering: closes the end-to-end latency measurement. */
  ack(id: string) {
    const s = this.sentAt.get(id);
    if (!s) return;
    const now = performance.now();
    this.sentAt.delete(id);
    this.lat.delivery.push(now - s.sent);
    if (s.kind === "phrased") { this.lat.phrasedE2e.push(now - s.audio); return; }
    (s.kind === "nudge" ? this.lat.nudgeE2e : this.lat.transcriptE2e).push(now - s.audio);
  }

  metrics() {
    const n = this.engine.all;
    return {
      callMs: Math.round(this.callMs),
      nudges: { created: n.length, active: n.filter((x) => x.status === "active").length, resolved: n.filter((x) => x.status === "resolved").length, expired: n.filter((x) => x.status === "expired").length, merged: n.reduce((s, x) => s + x.count - 1, 0), suppressed: this.suppressed.length },
      latencyMs: {
        endpointing: summarize(this.lat.endpoint), asrQueue: summarize(this.lat.asrQueue), asr: summarize(this.lat.asr), signalExtraction: summarize(this.lat.signal), llm: summarize(this.lat.llm),
        nudgeGeneration: summarize(this.lat.gen), serverPipeline: summarize(this.lat.server), delivery: summarize(this.lat.delivery),
        endToEndTranscript: summarize(this.lat.transcriptE2e), endToEndNudge: summarize(this.lat.nudgeE2e), endToEndPhrasedNudge: summarize(this.lat.phrasedE2e),
      },
      llmEnabled: llmEnabled(),
    };
  }

  async stop() {
    if (!this.stopped) {
      this.stopped = true;
      this.segmenters.agent.flush();
      this.segmenters.customer.flush();
    }
    await this.queue;
    await new Promise((r) => setTimeout(r, llmEnabled() ? 2800 : 300)); // in-flight LLM phrasing + final acks
    const samples = Object.fromEntries(Object.entries(this.lat).map(([k, v]) => [k, v.map((x) => Math.round(x * 10) / 10)]));
    const summary = { id: this.id, mode: this.mode, scenario: this.scenario, metrics: this.metrics(), transcript: this.transcript, nudges: this.engine.all, suppressed: this.suppressed, topics: this.topics, samples };
    await prisma.insightSession.create({ data: { id: this.id, mode: this.mode, scenario: this.scenario, startedAt: new Date(this.startedAt), endedAt: new Date(), summary: summary as never } }).catch(() => {});
    return summary;
  }
}

const round = (n: number) => Math.round(n * 10) / 10;
