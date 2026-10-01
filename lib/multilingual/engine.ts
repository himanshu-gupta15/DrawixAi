/**
 * Q3 localized voice-bot engine (Philippines + Indonesia).
 *
 * turn text -> language/register detection (per turn, sticky) -> intent (e5 nearest-neighbour over
 * native example utterances + high-precision cue words) -> context rules -> response chosen from
 * natively written variants (not translated at runtime) -> market formatting -> TTS text.
 * Low-confidence turns get a fallback in the caller's own language/register.
 */
import fs from "node:fs";
import path from "node:path";
import { cosine, embedPassages, embedQuery } from "../embeddings/local";
import { shared } from "../models";
import { addDays, dateEn, dateId, dateTl, idr, php, speechId, speechPh } from "./format";
import { detectId, detectPh, lexicalYesNo, type IdDetection, type PhDetection } from "./lang";

export type Market = "PH" | "ID";

interface Intent { examples: string[]; cues: string[]; responses: Record<string, string>; then: string }
export interface MarketPack {
  market: Market;
  sector: string;
  flow: string;
  botName: string;
  languages: string[];
  defaultVariant: string;
  asr: { browserLocale: string; whisperLanguage: string };
  tts: { browserLocales: string[]; note: string };
  customer: Record<string, string | number>;
  variants: Record<string, Record<string, string>>;
  intents: Record<string, Intent>;
}

export interface MlState {
  market: Market;
  stage: "identity" | "main" | "ended";
  variant: string;
  awaiting: "identity" | "reminder" | "anything_else" | "offer_advisor" | null;
  escalated: boolean;
  outcome?: string;
  turns: number;
  variantHistory: string[];
}

export interface MlTurn {
  reply: string;
  ttsText: string;
  intent: string;
  confidence: number;
  method: "cue" | "embedding" | "context" | "fallback";
  detection: PhDetection | IdDetection;
  variant: string;
  state: MlState;
  ended: boolean;
  latencyMs: number;
}

export const INTENT_THRESHOLD = 0.86;
/** The winning intent must also beat the runner-up by this margin unless a cue word confirms it. */
export const INTENT_MARGIN = 0.015;

const packs = new Map<Market, MarketPack>();
export function loadPack(market: Market): MarketPack {
  if (!packs.has(market)) packs.set(market, JSON.parse(fs.readFileSync(path.join(process.cwd(), `data/markets/${market.toLowerCase()}.json`), "utf8")));
  return packs.get(market)!;
}

/** Example-utterance embeddings, computed once per market. */
function exampleIndex(market: Market) {
  return shared(`ml_examples_${market}`, async () => {
    const pack = loadPack(market);
    const items = Object.entries(pack.intents).flatMap(([intent, it]) => it.examples.map((ex) => ({ intent, ex })));
    const vecs = await embedPassages(items.map((i) => i.ex));
    return items.map((i, k) => ({ ...i, vec: vecs[k] }));
  });
}

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ")} `;

export async function classifyIntent(market: Market, text: string) {
  const pack = loadPack(market);
  const t = norm(text);
  const cueHits = Object.entries(pack.intents).filter(([, it]) => it.cues.some((c) => t.includes(` ${c.toLowerCase()} `) || (c.includes(" ") && t.includes(c.toLowerCase()))));
  const idx = await exampleIndex(market);
  const q = await embedQuery(text);
  const best = new Map<string, number>();
  for (const e of idx) best.set(e.intent, Math.max(best.get(e.intent) ?? 0, cosine(q, e.vec)));
  const ranked = [...best].sort((a, b) => b[1] - a[1]);
  // Safety-critical intents (escalation, dispute) win on an explicit cue regardless of similarity.
  const critical = cueHits.find(([i]) => i === "escalation" || i === "dispute");
  if (critical) return { intent: critical[0], confidence: round(Math.max(best.get(critical[0]) ?? 0, 0.9)), method: "cue" as const, ranked };
  let [intent, score] = ranked[0];
  const topConfident = score >= INTENT_THRESHOLD && score - (ranked[1]?.[1] ?? 0) >= INTENT_MARGIN;
  if (cueHits.some(([i]) => i === intent)) score += 0.03;
  // A single specific cue breaks the tie only when the embedding winner is itself unsure.
  else if (!topConfident && cueHits.length === 1 && (best.get(cueHits[0][0]) ?? 0) >= INTENT_THRESHOLD - 0.06) [intent, score] = [cueHits[0][0], Math.max(INTENT_THRESHOLD + 0.005, (best.get(cueHits[0][0]) ?? 0) + 0.03)];
  const cue = cueHits.some(([i]) => i === intent);
  const runnerUp = ranked.find(([i]) => i !== intent)?.[1] ?? 0;
  const ambiguous = !cue && score - runnerUp < INTENT_MARGIN;
  return { intent, confidence: round(ambiguous ? Math.min(score, INTENT_THRESHOLD - 0.001) : score), method: (cue ? "cue" : "embedding") as "cue" | "embedding", ranked, ambiguous };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function vars(pack: MarketPack, variant: string, regional: string | null): Record<string, string> {
  const c = pack.customer;
  if (pack.market === "PH") {
    const graceEnd = addDays(String(c.dueDate), Number(c.graceDays));
    return { amount: php(Number(c.premium)), date_en: dateEn(String(c.dueDate)), date_tl: dateTl(String(c.dueDate)), grace: String(c.graceDays), grace_end_en: dateEn(graceEnd), grace_end_tl: dateTl(graceEnd), rider: String(c.rider) };
  }
  const inst = Number(c.installment);
  return {
    amount: idr(inst), date: dateId(String(c.dueDate)), date_short: String(+String(c.dueDate).slice(8, 10)), no: String(c.installmentNo), tenor: String(c.tenorMonths),
    remaining: String(Number(c.tenorMonths) - Number(c.installmentNo)), penalty_pct: `${String(c.penaltyPctPerDay).replace(".", ",")}%`, penalty_amount: idr((inst * Number(c.penaltyPctPerDay)) / 100),
    // Light mirroring for Javanese speakers ("nggih") in the casual register only.
    jv: regional === "javanese" && variant === "casual" ? " nggih" : "",
  };
}

const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

export function initialMlState(market: Market): MlState {
  return { market, stage: "identity", variant: loadPack(market).defaultVariant, awaiting: "identity", escalated: false, turns: 0, variantHistory: [] };
}

export function greetingFor(market: Market, variant?: string) {
  const pack = loadPack(market);
  const v = variant ?? pack.defaultVariant;
  const text = fill(pack.variants.greeting[v], vars(pack, v, null));
  return { reply: text, ttsText: market === "ID" ? speechId(text) : speechPh(text), variant: v };
}

export async function mlTurn(prev: MlState, rawText: string): Promise<MlTurn> {
  const t0 = performance.now();
  const state: MlState = structuredClone(prev);
  const pack = loadPack(state.market);
  state.turns++;
  const text = rawText.trim();

  // 1) language / register: switch only on confident evidence so one ambiguous word doesn't flip it
  const detection = state.market === "PH" ? detectPh(text) : detectId(text);
  const detected = state.market === "PH" ? (detection as PhDetection).variant : (detection as IdDetection).register;
  if (detection.confident) state.variant = detected;
  state.variantHistory.push(state.variant);
  const regional = state.market === "ID" ? (detection as IdDetection).regional : null;
  const v = vars(pack, state.variant, regional);
  const say = (key: string) => fill(pack.variants[key][state.variant], v);

  // 2) intent
  const cls = text ? await classifyIntent(state.market, text) : { intent: "none", confidence: 0, method: "fallback" as const, ranked: [] };
  let intent = cls.intent;
  let method: MlTurn["method"] = cls.method;
  const confident = cls.confidence >= INTENT_THRESHOLD;

  const finish = (reply: string, ended = false): MlTurn => {
    if (ended) state.stage = "ended";
    return { reply, ttsText: state.market === "ID" ? speechId(reply) : speechPh(reply), intent, confidence: cls.confidence, method, detection, variant: state.variant, state, ended, latencyMs: Math.round(performance.now() - t0) };
  };

  if (state.stage === "ended") return finish(say("closing"), true);

  // 3) context-dependent yes/no — resolved by what the bot last asked. Lexical first (short
  //    confirmations like "Betul." or "Wala na po" are unreliable for embeddings), classifier second.
  const lex = lexicalYesNo(state.market, text);
  // "Opo, gusto ko pong makausap ang advisor" starts with yes but means escalation: a longer utterance
  // with a confident non-yes/no intent keeps that intent; context yes/no is for short replies.
  const strongOther = confident && !["affirm", "deny"].includes(intent) && (method === "cue" || text.split(/\s+/).length > 4);
  const yes = !strongOther && (lex === true || (lex === null && intent === "affirm" && confident));
  const no = !strongOther && (lex === false || (lex === null && intent === "deny" && confident));
  if (yes && (state.awaiting === "identity" || state.awaiting === "offer_advisor")) intent = "affirm";
  if (no && state.awaiting !== "reminder") intent = "deny";
  if (state.awaiting === "identity") {
    if (intent === "escalation" && confident) {
      state.escalated = true; state.outcome = "escalated";
      return finish(fill(pack.intents.escalation.responses[state.variant], v), true);
    }
    if (no) { state.outcome = "wrong_party"; method = "context"; return finish(say("wrong_person"), true); }
    // Identity is confirmed by an explicit yes; anything else is re-asked (no policy details disclosed).
    if (!yes) { method = "fallback"; return finish(`${say("fallback")} ${fill(pack.variants.greeting[state.variant].split(/(?<=[.?!])\s+/).slice(-1)[0], v)}`); }
    state.stage = "main"; state.awaiting = "reminder"; method = "context"; intent = "identity_confirmed";
    return finish(say("reminder"));
  }
  if (state.awaiting === "reminder" && yes) { intent = "will_pay"; method = "context"; }
  if (state.awaiting === "offer_advisor" && yes) { intent = "escalation"; method = "context"; }
  if ((state.awaiting === "anything_else" || state.awaiting === "offer_advisor") && no) {
    method = "context"; state.outcome = state.outcome ?? "reminded";
    return finish(say("closing"), true);
  }

  // 4) unknown / low confidence -> fallback in the caller's language & register
  const it = pack.intents[intent];
  if ((!confident && method !== "context") || !it || !Object.keys(it.responses).length) {
    method = "fallback";
    const strong = cls.confidence >= INTENT_THRESHOLD - 0.04; // close but unsure -> ask to repeat
    return finish(strong || text.split(/\s+/).length <= 3 ? say("fallback") : say("out_of_scope"));
  }

  let reply = fill(it.responses[state.variant], v);
  if (it.then === "escalated") { state.escalated = true; state.outcome = "escalated"; return finish(reply, true); }
  if (it.then === "end") { state.outcome = intent; return finish(reply, true); }
  if (it.then === "anything_else") { reply += ` ${say("anything_else")}`; state.awaiting = "anything_else"; }
  if (it.then === "offer_advisor") state.awaiting = "offer_advisor";
  if (intent === "will_pay" || intent === "already_paid") state.outcome = intent;
  return finish(reply);
}
