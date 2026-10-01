import crypto from "node:crypto";
import { prisma } from "../database/prisma";
import { greetingFor, initialMlState, mlTurn, type Market, type MlState } from "./engine";

export async function startMlCall(market: Market, channel: "web" | "simulated" = "web") {
  const id = `ml_${market.toLowerCase()}_${crypto.randomBytes(4).toString("hex")}`;
  const state = initialMlState(market);
  const g = greetingFor(market);
  await prisma.callSession.create({
    data: { id, channel, useCase: market === "PH" ? "ph_life_premium_reminder" : "id_installment_reminder", market, status: "active", state: state as never, transcript: [{ role: "agent", text: g.reply, at: new Date().toISOString() }] as never },
  });
  return { callId: id, ...g, state };
}

export async function mlCallTurn(callId: string, text: string) {
  const call = await prisma.callSession.findUniqueOrThrow({ where: { id: callId } });
  const res = await mlTurn(call.state as unknown as MlState, text);
  const transcript = call.transcript as unknown as Record<string, unknown>[];
  const at = new Date().toISOString();
  transcript.push({ role: "customer", text, at, meta: { detection: res.detection } });
  transcript.push({ role: "agent", text: res.reply, at, meta: { intent: res.intent, confidence: res.confidence, method: res.method, variant: res.variant } });
  await prisma.callSession.update({
    where: { id: callId },
    data: { state: res.state as never, transcript: transcript as never, status: res.ended ? (res.state.escalated ? "escalated" : "completed") : "active", outcome: res.state.outcome ?? null },
  });
  if (res.state.escalated && res.ended) {
    await prisma.crmAction.create({ data: { callId, type: "escalation", payload: { market: res.state.market, language: res.variant, reason: res.intent, lastUtterance: text } } });
  }
  return res;
}
