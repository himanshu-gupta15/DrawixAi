/**
 * Q1 conversation manager: health-insurance lead qualification.
 *
 *   caller text (from ASR)
 *     -> classify turn (human request / stop / callback / objection / question / answer)
 *     -> questions & objections: Q2 hybrid retrieval -> grounded answer (or "unavailable")
 *     -> answers: slot extraction, validation, conflict detection, reprompts
 *     -> qualification rules -> next step (callback / lead / escalation)
 *
 * The agent is pure apart from retrieval: side effects are returned as `actions` and executed
 * by the call service, which keeps the conversation logic unit-testable.
 */
import { composeAnswer, type GroundedAnswer } from "../rag/answer";
import { outOfDomain, retrieve, type RetrievalResult } from "../rag/retrieve";
import { fill, loadAgentConfig } from "./config";
import { classifyTurn, wordsToDigits, extractAge, extractBudget, extractCity, extractConditions, extractMembers, extractName, extractTime, splitQuestion, yesNo, type TurnAct } from "./nlu";
import { qualify, type Qualification, type Slots } from "./qualification";

export type SlotName = "name" | "age" | "members" | "parent_age" | "city" | "health" | "smoker" | "budget";
type Stage = "consent" | "slot" | "conflict" | "next_step" | "callback_time" | "ended";

export interface AgentState {
  stage: Stage;
  currentSlot?: SlotName;
  slots: Slots;
  retries: Record<string, number>;
  conflict?: { slot: SlotName; old: unknown; new: unknown };
  qualification?: Qualification;
  escalated: boolean;
  escalationReason?: string;
  callbackTime?: string;
  questions: { q: string; grounded: boolean; recordIds: string[]; kind: "question" | "objection" }[];
  unanswered: string[];
  conflictsResolved: string[];
  outcome?: string;
  turnCount: number;
}

export type AgentAction =
  | { type: "escalation"; reason: string }
  | { type: "callback"; time: string }
  | { type: "lead" }
  | { type: "crm_summary" };

export interface TurnResult {
  reply: string;
  state: AgentState;
  act: TurnAct | "conflict_resolution" | "consent" | "next_step" | "callback_time";
  retrieval?: RetrievalResult;
  answer?: GroundedAnswer;
  actions: AgentAction[];
  ended: boolean;
  timings: { nluMs: number; ragMs: number; totalMs: number };
}

export function initialState(): AgentState {
  return { stage: "consent", slots: {}, retries: {}, escalated: false, questions: [], unanswered: [], conflictsResolved: [], turnCount: 0 };
}

export function greeting() {
  return loadAgentConfig().script.greeting;
}

function nextSlot(s: Slots): SlotName | null {
  const order: SlotName[] = ["name", "age", "members", "parent_age", "city", "health", "smoker", "budget"];
  for (const k of order) {
    if (k === "parent_age" && !s.members?.includes("parents")) continue;
    if (s[k] === undefined) return k;
  }
  return null;
}

const describe = (slot: SlotName, v: unknown): string => {
  if (slot === "age") return `you are ${v}`;
  if (slot === "parent_age") return `your parent is ${v}`;
  if (slot === "health") return (v as Slots["health"])!.none ? "no one has a health condition" : `there is ${(v as Slots["health"])!.conditions.join(" and ")}`;
  if (slot === "budget") return `a budget of about ${(v as Slots["budget"])!.raw}`;
  if (slot === "members") return `cover for ${(v as string[]).join(", ")}`;
  return `${slot} ${String(v)}`;
};

function extractSlot(slot: SlotName, text: string, cfg = loadAgentConfig()): unknown {
  switch (slot) {
    case "name": return extractName(text);
    case "age": case "parent_age": return extractAge(text);
    case "members": return extractMembers(text);
    case "city": return extractCity(text);
    case "health": return extractConditions(text, cfg.rules.acceptedConditions, cfg.rules.underwritingConditions);
    case "smoker": { const yn = yesNo(text); return yn === null ? (/\b(smoke|smoker|tobacco|cigarette)/i.test(text) && !/\bno(t|n)?\b/i.test(text) ? true : null) : yn; }
    case "budget": return extractBudget(text);
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export async function handleTurn(prev: AgentState, rawText: string): Promise<TurnResult> {
  const t0 = performance.now();
  const cfg = loadAgentConfig();
  const S = cfg.script;
  const state: AgentState = structuredClone(prev);
  state.turnCount++;
  const text = rawText.trim();
  const actions: AgentAction[] = [];
  let ragMs = 0;
  let retrieval: RetrievalResult | undefined;
  let answer: GroundedAnswer | undefined;
  const name = () => state.slots.name?.split(" ")[0] ?? "";
  const askSlot = (slot: SlotName) => fill(S.slots[slot].ask, { name: name() });
  const done = (reply: string, act: TurnResult["act"], ended = false): TurnResult => {
    if (ended) state.stage = "ended";
    const total = performance.now() - t0;
    return { reply, state, act, retrieval, answer, actions, ended, timings: { nluMs: Math.round((total - ragMs) * 10) / 10, ragMs: Math.round(ragMs * 10) / 10, totalMs: Math.round(total * 10) / 10 } };
  };
  const escalate = (reason: string) => {
    state.escalated = true;
    state.escalationReason = reason;
    state.outcome = "escalated_to_human";
    state.qualification = qualify(state.slots, cfg);
    actions.push({ type: "escalation", reason }, { type: "crm_summary" });
    return done(S.escalation, "human_request", true);
  };
  /** Grounded answer for a question/objection; falls back explicitly when the KB has nothing. */
  const answerQuestion = async (q: string, kind: "question" | "objection") => {
    const r0 = performance.now();
    retrieval = await retrieve(q);
    answer = await composeAnswer(q, retrieval);
    ragMs += performance.now() - r0;
    state.questions.push({ q, grounded: answer.grounded, recordIds: answer.citations.map((c) => c.recordId), kind });
    if (answer.grounded) return kind === "objection" ? `I understand. ${answer.text}` : answer.text;
    state.unanswered.push(q);
    const ood = outOfDomain(q);
    return `${ood ? fill(S.out_of_domain, { topic: ood }) : answer.text} ${S.unavailable_followup}`;
  };

  if (state.stage === "ended") return done("The call has ended.", "answer", true);
  if (!text) return done(state.stage === "slot" && state.currentSlot ? S.slots[state.currentSlot].reprompt : S.consent_retry, "answer");

  const act = classifyTurn(text);

  // ---- global intents, valid at any stage
  if (act === "human_request") return escalate("customer asked for a human advisor");
  if (act === "stop") {
    state.outcome = "not_interested";
    actions.push({ type: "crm_summary" });
    return done(S.not_interested, "stop", true);
  }
  if (act === "callback_request" && state.stage !== "callback_time") {
    const time = extractTime(text);
    if (time) {
      state.callbackTime = time;
      state.outcome = "callback_scheduled";
      actions.push({ type: "callback", time }, { type: "lead" }, { type: "crm_summary" });
      return done(fill(S.callback_confirmed, { time }), "callback_request", true);
    }
    state.stage = "callback_time";
    return done(S.ask_callback_time, "callback_request");
  }

  // ---- stage handlers
  if (state.stage === "consent") {
    if (act === "question" || act === "objection") {
      const a = await answerQuestion(text, act);
      return done(`${a} ${S.consent_retry}`, act);
    }
    const yn = yesNo(text);
    if (yn === true) {
      state.stage = "slot";
      state.currentSlot = "name";
      const n = extractName(text.replace(/^(yes|yeah|sure|ok|okay)[,.!]?\s*/i, ""));
      if (n && /name|i am|i'm|this is/i.test(text)) {
        state.slots.name = n;
        state.currentSlot = "age";
        return done(askSlot("age"), "consent");
      }
      return done(S.slots.name.ask, "consent");
    }
    if (yn === false) {
      state.stage = "callback_time";
      return done(S.ask_callback_time, "consent");
    }
    return done(S.consent_retry, "consent");
  }

  if (state.stage === "callback_time") {
    const time = extractTime(text);
    if (!time) {
      state.retries.callback = (state.retries.callback ?? 0) + 1;
      if (state.retries.callback > cfg.rules.maxRepromptsPerSlot) {
        state.callbackTime = "at a convenient time (advisor to confirm)";
      } else return done("Could you give me a day and time, for example 'tomorrow at 6 pm'?", "callback_time");
    } else state.callbackTime = time;
    state.outcome = state.outcome ?? "callback_scheduled";
    state.qualification = qualify(state.slots, cfg);
    actions.push({ type: "callback", time: state.callbackTime! }, { type: "lead" }, { type: "crm_summary" });
    const closing = state.slots.name ? fill(S.closing, { name: name(), time: state.callbackTime }) : fill(S.callback_confirmed, { time: state.callbackTime });
    return done(closing, "callback_time", true);
  }

  if (state.stage === "next_step") {
    if (act === "question" || act === "objection") {
      const a = await answerQuestion(text, act);
      return done(`${a} ${S.ask_next_step}`, act);
    }
    const time = extractTime(text);
    const yn = yesNo(text);
    if (time || yn === true) {
      if (!time) {
        state.stage = "callback_time";
        return done("Great. What day and time suits you for the call?", "next_step");
      }
      state.callbackTime = time;
      state.outcome = state.qualification?.status ?? "qualified";
      actions.push({ type: "callback", time }, { type: "lead" }, { type: "crm_summary" });
      return done(fill(S.closing, { name: name(), time }), "next_step", true);
    }
    if (yn === false) {
      state.outcome = state.qualification?.status ?? "qualified";
      actions.push({ type: "lead" }, { type: "crm_summary" });
      return done(fill(S.closing_no_callback, { name: name() }), "next_step", true);
    }
    return done(S.ask_next_step, "next_step");
  }

  if (state.stage === "conflict" && state.conflict) {
    const c = state.conflict;
    const v = extractSlot(c.slot, text);
    let chosen: unknown;
    if (v !== null && v !== undefined && (same(v, c.old) || same(v, c.new))) chosen = v;
    else if (/\b(first|earlier|before|previous|old)\b/i.test(text)) chosen = c.old;
    else if (/\b(second|now|latest|latter|new|just said|last)\b/i.test(text)) chosen = c.new;
    else if (v !== null && v !== undefined) chosen = v;
    if (chosen === undefined) {
      state.retries[`conflict_${c.slot}`] = (state.retries[`conflict_${c.slot}`] ?? 0) + 1;
      if (state.retries[`conflict_${c.slot}`] <= 1) return done(fill(S.conflict, { old: describe(c.slot, c.old), new: describe(c.slot, c.new) }), "conflict_resolution");
      chosen = c.new; // keep the latest value but flag it for the advisor
      state.conflictsResolved.push(`${c.slot}: unresolved, kept latest value (advisor to verify)`);
    } else state.conflictsResolved.push(`${c.slot}: confirmed ${JSON.stringify(chosen)}`);
    (state.slots as Record<string, unknown>)[c.slot] = chosen;
    state.conflict = undefined;
    state.stage = "slot";
    const next = nextSlot(state.slots);
    if (!next) return finishQualification();
    state.currentSlot = next;
    return done(`Thank you for confirming. ${askSlot(next)}`, "conflict_resolution");
  }

  // ---- stage === "slot"
  const slot = state.currentSlot!;
  const { answer: answerPart, question } = splitQuestion(text);
  let prefix = "";
  let slotText = answerPart;
  if (act === "question" || act === "objection" || question) {
    // Retrieve with the whole utterance: the clause before a question is context
    // ("My father has diabetes. Is that covered?", "I already have cover from my office, why buy another?").
    prefix = await answerQuestion(text, act === "objection" ? "objection" : "question");
    if (!question) slotText = ""; // the whole utterance was a question
  }

  // Opportunistic extraction of other slots + conflict detection against earlier answers.
  if (slotText) {
    const checks: SlotName[] = ["age", "health", "city"];
    for (const other of checks) {
      if (other === slot) continue;
      const existing = state.slots[other];
      if (existing === undefined) continue;
      const v = other === "health" ? extractConditions(slotText, cfg.rules.acceptedConditions, cfg.rules.underwritingConditions) : other === "age" && /\b(i am|i'm|my age)\b/i.test(slotText) ? extractAge(slotText) : null;
      const isNewInfo = other === "health" ? !!v && !(v as Slots["health"])!.none && (existing as Slots["health"])!.none : v !== null && !same(v, existing);
      if (v && isNewInfo) {
        state.conflict = { slot: other, old: existing, new: v };
        state.stage = "conflict";
        return done(`${prefix ? prefix + " " : ""}${fill(S.conflict, { old: describe(other, existing), new: describe(other, v) })}`, "answer");
      }
    }
  }

  const value = slotText ? extractSlot(slot, slotText) : null;
  if (value === null || value === undefined) {
    if (prefix) return done(`${prefix} ${S.resume}${askSlot(slot).replace(/^(Great, thank you\.|Thanks \w*\.)\s*/, "")}`, act);
    state.retries[slot] = (state.retries[slot] ?? 0) + 1;
    if (state.retries[slot] > cfg.rules.maxRepromptsPerSlot) {
      if (slot === "age") return escalate("could not capture proposer age after repeated attempts");
      (state.slots as Record<string, unknown>)[slot] = slot === "health" ? { none: false, conditions: ["unknown"] } : slot === "smoker" ? false : slot === "members" ? ["self"] : "unknown";
      state.conflictsResolved.push(`${slot}: not captured (advisor to confirm)`);
      const next = nextSlot(state.slots);
      if (!next) return finishQualification(S.give_up_slot);
      state.currentSlot = next;
      return done(`${S.give_up_slot} ${askSlot(next)}`, "answer");
    }
    return done(S.slots[slot].reprompt, "answer");
  }

  // Validation that ends the qualification early (business rules).
  if (slot === "age") {
    const a = value as number;
    if (a < cfg.rules.proposerAge.min) {
      state.slots.age = a;
      state.outcome = "not_eligible";
      state.qualification = qualify(state.slots, cfg);
      actions.push({ type: "crm_summary" });
      return done(`Thank you. The policyholder needs to be at least ${cfg.rules.proposerAge.min}, so a parent or guardian would need to buy the policy. Thank you for your time.`, "answer", true);
    }
    if (a > cfg.rules.proposerAge.max) {
      state.slots.age = a;
      state.qualification = qualify(state.slots, cfg);
      state.stage = "callback_time";
      state.outcome = "not_eligible_referred";
      return done(`Thank you. New policies through this process are available up to age ${cfg.rules.proposerAge.max}, but a licensed advisor can explain senior-citizen options. When would be a good time for them to call you?`, "answer");
    }
  }
  (state.slots as Record<string, unknown>)[slot] = value;
  // A single answer can fill the next slot too ("me and my parents, my father is 70").
  if (slot === "members" && (value as string[]).includes("parents")) {
    const pa = /\b(father|mother|dad|mom|parent)\w*\b[^.]*?\b(\d{2})\b/i.exec(wordsToDigits(slotText));
    if (pa) state.slots.parent_age = +pa[2];
  }
  const next = nextSlot(state.slots);
  if (!next) return finishQualification(prefix);
  state.currentSlot = next;
  const ack = slot === "health" && !(value as Slots["health"])!.none ? "Thank you for sharing that; declaring it protects your future claims. " : "";
  return done(`${prefix ? prefix + " " : ""}${ack}${askSlot(next)}`, prefix ? act : "answer");

  async function finishQualification(lead = ""): Promise<TurnResult> {
    const q = qualify(state.slots, cfg);
    state.qualification = q;
    state.stage = "next_step";
    let msg = "";
    const budget = state.slots.budget ? `₹${state.slots.budget.annual.toLocaleString("en-IN")} a year` : "";
    if (q.status === "qualified") msg = `Thanks ${name()}. Based on what you've told me, you're eligible, and the ${q.recommendedPlan} plan fits a budget of about ${budget}.`;
    else if (q.status === "needs_underwriting") msg = `Thanks ${name()}. Because of the ${q.reasons[0].split(": ")[1]} history, an underwriter has to review the application, so I can't confirm approval on this call, but an advisor can take it forward.`;
    else if (q.status === "below_budget") msg = `Thanks ${name()}. Our plans start at about ₹${cfg.rules.minAnnualBudget.toLocaleString("en-IN")} a year, which is above the budget you mentioned, but monthly payment may help.`;
    else msg = `Thanks ${name()}. I have most of your details; an advisor will confirm the rest.`;
    // Declared PED: the waiting period comes from the knowledge base, not from the script.
    if (state.slots.health && !state.slots.health.none && q.status !== "needs_underwriting") {
      const r0 = performance.now();
      retrieval = await retrieve("waiting period for declared pre-existing disease");
      answer = await composeAnswer("What is the waiting period for declared pre-existing diseases?", retrieval);
      ragMs += performance.now() - r0;
      if (answer.grounded) msg += ` Please note: ${answer.text}`;
    }
    if (q.notes.some((n) => n.includes("medical check-up"))) msg += " A free medical check-up at home will be needed.";
    return done(`${lead ? lead + " " : ""}${msg} ${S.ask_next_step}`.replace(/\s+/g, " ").trim(), "answer");
  }
}
