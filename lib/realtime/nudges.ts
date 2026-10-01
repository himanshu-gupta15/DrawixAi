/**
 * Nudge engine: turns signals into a small number of useful, actionable nudges.
 * Controls: per-type confidence threshold, topic grouping + duplicate merge, cooldown,
 * per-call cap (repetition), global rate limit for low/medium priority, expiry (TTL),
 * and resolution when the agent acts on the nudge (e.g. gives the disclosure).
 */
import type { Signal, SignalType } from "./signals";

export type Priority = "high" | "medium" | "low";

interface Rule { priority: Priority; minConfidence: number; cooldownMs: number; ttlMs: number; maxPerCall: number; text: (s: Signal) => string }

export const NUDGE_RULES: Record<SignalType, Rule> = {
  compliance_disclosure: { priority: "high", minConfidence: 0.8, cooldownMs: 60000, ttlMs: 120000, maxPerCall: 1, text: () => "Disclose the call recording before discussing price or payment." },
  compliance_risky_statement: { priority: "high", minConfidence: 0.8, cooldownMs: 30000, ttlMs: 60000, maxPerCall: 2, text: (s) => `Correct the promise ${s.evidence.split(" — ")[0]}: claims can't be guaranteed; they follow policy terms.` },
  payment_difficulty: { priority: "high", minConfidence: 0.7, cooldownMs: 60000, ttlMs: 90000, maxPerCall: 1, text: () => "Customer reports payment difficulty: offer the approved EMI / grace-period option or a callback with a specialist." },
  frustration: { priority: "high", minConfidence: 0.7, cooldownMs: 45000, ttlMs: 45000, maxPerCall: 2, text: () => "Rising frustration: acknowledge the concern and summarise what you'll do before continuing." },
  cross_sell: { priority: "medium", minConfidence: 0.75, cooldownMs: 90000, ttlMs: 90000, maxPerCall: 1, text: (s) => (s.topic.endsWith("vehicle") ? "Customer has another vehicle: suggest the multi-vehicle discount." : "Family members are uninsured: suggest adding them on a family floater.") },
  churn_risk: { priority: "medium", minConfidence: 0.75, cooldownMs: 60000, ttlMs: 60000, maxPerCall: 1, text: () => "Cancellation intent: ask for the reason before offering retention options." },
  buying_signal: { priority: "medium", minConfidence: 0.75, cooldownMs: 60000, ttlMs: 45000, maxPerCall: 1, text: () => "Buying signal: confirm the plan and move to the next step now." },
  callback_need: { priority: "low", minConfidence: 0.75, cooldownMs: 60000, ttlMs: 60000, maxPerCall: 1, text: () => "Customer wants to talk later: confirm a specific callback time." },
};

/** Low/medium nudges are rate-limited so the agent is never flooded; high priority always passes. */
export const GLOBAL_MIN_GAP_MS = 10000;

export interface Nudge {
  id: string;
  type: SignalType;
  group: string;
  priority: Priority;
  text: string;
  confidence: number;
  evidence: string[];
  createdCallMs: number;
  expiresCallMs: number;
  count: number;
  status: "active" | "resolved" | "expired";
}

export type NudgeEvent =
  | { kind: "created"; nudge: Nudge }
  | { kind: "merged"; nudge: Nudge }
  | { kind: "resolved"; nudge: Nudge; by: string }
  | { kind: "expired"; nudge: Nudge }
  | { kind: "suppressed"; signal: Signal; reason: string }
  | { kind: "deferred"; signal: Signal; reason: string };

export class NudgeEngine {
  private nudges: Nudge[] = [];
  private lastCreatedAt = new Map<string, number>(); // group -> callMs
  private perType = new Map<SignalType, number>();
  private lastLowMedAt = -Infinity;
  private seq = 0;
  private deferred: Signal[] = []; // rate-limited signals waiting for the global gap to pass

  get all() { return this.nudges; }

  process(signals: Signal[], callMs: number): NudgeEvent[] {
    const events: NudgeEvent[] = [...this.expire(callMs)];
    // Release deferred (rate-limited) signals first if the gap has passed and they are still fresh.
    const ready = this.deferred.filter((d) => callMs - this.lastLowMedAt >= GLOBAL_MIN_GAP_MS && callMs - d.callMs < NUDGE_RULES[d.type].ttlMs);
    this.deferred = this.deferred.filter((d) => !ready.includes(d) && callMs - d.callMs < NUDGE_RULES[d.type].ttlMs);
    for (const s of [...ready.slice(0, 1), ...signals]) {
      // Resolution signals (agent gave disclosure / made the offer) close matching nudges.
      if (s.resolves) {
        for (const g of s.resolves) for (const n of this.nudges.filter((x) => x.group === g && x.status === "active")) {
          n.status = "resolved";
          events.push({ kind: "resolved", nudge: n, by: s.evidence });
        }
        continue;
      }
      const rule = NUDGE_RULES[s.type];
      if (s.confidence < rule.minConfidence) { events.push({ kind: "suppressed", signal: s, reason: `confidence ${s.confidence} < ${rule.minConfidence}` }); continue; }
      const active = this.nudges.find((n) => n.group === s.topic && n.status === "active");
      if (active) {
        active.count++;
        active.confidence = Math.max(active.confidence, s.confidence);
        active.evidence = [...active.evidence.slice(-2), s.evidence];
        events.push({ kind: "merged", nudge: active });
        continue;
      }
      const last = this.lastCreatedAt.get(s.topic);
      if (last !== undefined && callMs - last < rule.cooldownMs) { events.push({ kind: "suppressed", signal: s, reason: `cooldown (${Math.round((rule.cooldownMs - (callMs - last)) / 1000)} s left)` }); continue; }
      if ((this.perType.get(s.type) ?? 0) >= rule.maxPerCall) { events.push({ kind: "suppressed", signal: s, reason: `max ${rule.maxPerCall} per call reached` }); continue; }
      if (rule.priority !== "high" && callMs - this.lastLowMedAt < GLOBAL_MIN_GAP_MS) {
        if (!this.deferred.some((d) => d.topic === s.topic)) this.deferred.push(s);
        events.push({ kind: "deferred", signal: s, reason: `deferred: non-urgent nudges are spaced ${GLOBAL_MIN_GAP_MS / 1000} s apart` });
        continue;
      }
      const n: Nudge = { id: `n${++this.seq}`, type: s.type, group: s.topic, priority: rule.priority, text: rule.text(s), confidence: s.confidence, evidence: [s.evidence], createdCallMs: callMs, expiresCallMs: callMs + rule.ttlMs, count: 1, status: "active" };
      this.nudges.push(n);
      this.lastCreatedAt.set(s.topic, callMs);
      this.perType.set(s.type, (this.perType.get(s.type) ?? 0) + 1);
      if (rule.priority !== "high") this.lastLowMedAt = callMs;
      events.push({ kind: "created", nudge: n });
    }
    return events;
  }

  /** Called on the audio clock (every second) so deferred nudges surface even during silence. */
  tick(callMs: number): NudgeEvent[] {
    return this.deferred.length ? this.process([], callMs) : this.expire(callMs);
  }

  expire(callMs: number): NudgeEvent[] {
    const ev: NudgeEvent[] = [];
    for (const n of this.nudges) if (n.status === "active" && callMs >= n.expiresCallMs) { n.status = "expired"; ev.push({ kind: "expired", nudge: n }); }
    return ev;
  }
}
