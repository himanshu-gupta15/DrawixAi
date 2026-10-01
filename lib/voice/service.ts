/**
 * Call service: persists Q1 call sessions and executes the agent's business actions
 * (lead creation, callback scheduling, escalation webhook, mock CRM summary).
 */
import crypto from "node:crypto";
import { prisma } from "../database/prisma";
import { greeting, handleTurn, initialState, type AgentAction, type AgentState, type TurnResult } from "./agent";
import { qualify } from "./qualification";
import { loadAgentConfig } from "./config";

export interface TranscriptEntry {
  role: "agent" | "customer";
  text: string;
  at: string;
  meta?: Record<string, unknown>;
}

export async function startCall(channel: "web" | "simulated" = "web") {
  const id = `call_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${crypto.randomBytes(3).toString("hex")}`;
  const text = greeting();
  const transcript: TranscriptEntry[] = [{ role: "agent", text, at: new Date().toISOString() }];
  await prisma.callSession.create({ data: { id, channel, useCase: loadAgentConfig().useCase, status: "active", state: initialState() as never, transcript: transcript as never } });
  return { callId: id, reply: text, state: initialState() };
}

export function buildCrmSummary(state: AgentState) {
  const s = state.slots;
  const q = state.qualification ?? qualify(s, loadAgentConfig());
  return {
    customer: { name: s.name ?? null, age: s.age ?? null, city: s.city ?? null, members: s.members ?? [], eldestParentAge: s.parent_age ?? null },
    health: { conditions: s.health?.conditions ?? [], declaredNone: s.health?.none ?? null, smoker: s.smoker ?? null },
    budgetAnnualInr: s.budget?.annual ?? null,
    qualification: { status: q.status, recommendedPlan: q.recommendedPlan, leadScore: q.leadScore, reasons: q.reasons, notes: q.notes, missing: q.missing },
    outcome: state.outcome ?? "in_progress",
    callbackTime: state.callbackTime ?? null,
    escalated: state.escalated,
    escalationReason: state.escalationReason ?? null,
    questionsAsked: state.questions,
    unansweredQuestions: state.unanswered,
    dataQualityNotes: state.conflictsResolved,
    summaryText: [
      `${s.name ?? "Unknown caller"}${s.age ? `, ${s.age}` : ""}${s.city ? `, ${s.city}` : ""}.`,
      s.members?.length ? `Wants cover for ${s.members.join(", ")}${s.parent_age ? ` (eldest parent ${s.parent_age})` : ""}.` : "",
      s.health ? (s.health.none ? "No declared conditions." : `Declared: ${s.health.conditions.join(", ")}.`) : "",
      s.budget ? `Budget ≈ ₹${s.budget.annual.toLocaleString("en-IN")}/yr.` : "",
      `Status: ${q.status}${q.recommendedPlan ? `, suggested ${q.recommendedPlan}` : ""}.`,
      state.unanswered.length ? `Follow up on: ${state.unanswered.join(" | ")}.` : "",
      state.escalated ? `ESCALATED: ${state.escalationReason}.` : "",
    ].filter(Boolean).join(" "),
  };
}

async function executeActions(callId: string, state: AgentState, actions: AgentAction[]) {
  const executed: { type: string; delivered: boolean; detail?: string }[] = [];
  for (const a of actions) {
    if (a.type === "escalation") {
      const payload = { callId, reason: a.reason, summary: buildCrmSummary(state), requestedAt: new Date().toISOString() };
      let delivered = false, detail = "logged (no ESCALATION_WEBHOOK_URL configured)";
      if (process.env.ESCALATION_WEBHOOK_URL) {
        try {
          const res = await fetch(process.env.ESCALATION_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000) });
          delivered = res.ok;
          detail = `webhook HTTP ${res.status}`;
        } catch (e) {
          detail = `webhook failed: ${(e as Error).message}`;
        }
      }
      await prisma.crmAction.create({ data: { callId, type: "escalation", payload: payload as never, delivered } });
      executed.push({ type: "escalation", delivered, detail });
    } else if (a.type === "callback") {
      await prisma.crmAction.create({ data: { callId, type: "callback", payload: { time: a.time, name: state.slots.name ?? null }, delivered: true } });
      executed.push({ type: "callback", delivered: true, detail: a.time });
    } else if (a.type === "lead") {
      const sum = buildCrmSummary(state);
      await prisma.crmAction.create({ data: { callId, type: "lead", payload: { ...sum.customer, status: sum.qualification.status, plan: sum.qualification.recommendedPlan, score: sum.qualification.leadScore } as never, delivered: true } });
      executed.push({ type: "lead", delivered: true });
    } else if (a.type === "crm_summary") {
      await prisma.crmAction.create({ data: { callId, type: "crm_summary", payload: buildCrmSummary(state) as never, delivered: true } });
      executed.push({ type: "crm_summary", delivered: true });
    }
  }
  return executed;
}

export async function callTurn(callId: string, text: string, meta: Record<string, unknown> = {}): Promise<TurnResult & { executed: Awaited<ReturnType<typeof executeActions>> }> {
  const call = await prisma.callSession.findUniqueOrThrow({ where: { id: callId } });
  const result = await handleTurn(call.state as unknown as AgentState, text);
  const transcript = call.transcript as unknown as TranscriptEntry[];
  const now = new Date().toISOString();
  transcript.push({ role: "customer", text, at: now, meta });
  transcript.push({
    role: "agent", text: result.reply, at: now,
    meta: { act: result.act, grounded: result.answer?.grounded, answerMode: result.answer?.mode, citations: result.answer?.citations.map((c) => c.recordId), timings: result.timings },
  });
  const executed = await executeActions(callId, result.state, result.actions);
  await prisma.callSession.update({
    where: { id: callId },
    data: { state: result.state as never, transcript: transcript as never, status: result.ended ? (result.state.escalated ? "escalated" : "completed") : "active", outcome: result.state.outcome ?? null },
  });
  return { ...result, executed };
}

/** Caller hung up: close the session and still write a CRM summary so nothing is lost. */
export async function endCall(callId: string) {
  const call = await prisma.callSession.findUniqueOrThrow({ where: { id: callId } });
  const state = call.state as unknown as AgentState;
  if (call.status !== "active") return { alreadyEnded: true };
  state.outcome = state.outcome ?? "hung_up_incomplete";
  state.stage = "ended";
  await executeActions(callId, state, [{ type: "crm_summary" }]);
  await prisma.callSession.update({ where: { id: callId }, data: { status: "completed", state: state as never, outcome: state.outcome } });
  return { alreadyEnded: false, summary: buildCrmSummary(state) };
}
