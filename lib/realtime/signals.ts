/**
 * Live signal extraction over the streaming transcript. Rule patterns give precise, explainable
 * detections; confidence is reduced for low-SNR audio and suspected ASR hallucinations, and
 * negation / external-target guards stop benign phrases ("no problem", "traffic was frustrating")
 * from firing. Call context (disclosure given, offer mentioned, sentiment trend) is tracked so
 * signals like "missing disclosure" and "rising frustration" are about the call, not one sentence.
 */
export type SignalType = "compliance_disclosure" | "compliance_risky_statement" | "cross_sell" | "frustration" | "payment_difficulty" | "callback_need" | "buying_signal" | "churn_risk";

export interface Signal {
  type: SignalType;
  topic: string; // grouping key inside a type, e.g. cross_sell:vehicle
  confidence: number;
  evidence: string;
  speaker: "agent" | "customer";
  callMs: number;
  resolves?: string[]; // group keys this utterance resolves (e.g. disclosure given)
}

export interface Utterance { speaker: "agent" | "customer"; text: string; startMs: number; endMs: number; snrDb: number }

const has = (re: RegExp, t: string) => re.test(t);
const NEGATED = (t: string, idx: number) => /\b(no|not|never|don'?t|doesn'?t|didn'?t|isn'?t|wasn'?t|no longer|sold)\b[^.!?]{0,25}$/i.test(t.slice(0, idx));

// Whisper sometimes "hears" these in noise/silence.
const HALLUCINATIONS = /^(thank you\.?|thanks for watching!?|you|bye\.?|\[.*\]|\(.*\)|\.+|okay\.?)$/i;

/** Coarse call topics, tracked per utterance so the dashboard can show topic shifts (informational, never a nudge). */
const TOPICS: [string, RegExp][] = [
  ["identity & consent", /\b(speaking with|am i speaking|this call is recorded|good time)\b/i],
  ["payment & dues", /\b(instal?ment|emi|due|pending|pay(ment)?|penalty|overdue|link|upi)\b/i],
  ["pricing & premium", /\b(premium|price|cost|rupees|discount|no claim bonus)\b/i],
  ["claims", /\b(claims?|cashless|reimburse\w*|hospital)\b/i],
  ["coverage & family", /\b(cover(age|ed)?|insurance for|parents|wife|husband|family|second car|another car)\b/i],
  ["renewal", /\b(renew(al)?|expir\w+)\b/i],
  ["cancellation", /\b(cancel\w*|switch\w*|close my)\b/i],
];

export function topicOf(text: string) {
  return TOPICS.find(([, re]) => re.test(text))?.[0] ?? null;
}

export class SignalExtractor {
  private disclosureGiven = false;
  private offers = new Set<string>();
  private customerScores: number[] = [];
  private lastCustomerTexts: string[] = [];
  private agentTalkedPriceAt: number | null = null;

  /** Audio/ASR quality multiplier for confidence (noisy audio -> less trust). */
  static quality(u: Utterance) {
    if (HALLUCINATIONS.test(u.text.trim())) return 0;
    if (u.text.split(/\s+/).length < 3) return 0.75;
    if (u.snrDb < 8) return 0.7;
    if (u.snrDb < 14) return 0.85;
    return 1;
  }

  extract(u: Utterance): Signal[] {
    const q = SignalExtractor.quality(u);
    if (q === 0) return [];
    const t = u.text;
    const out: Signal[] = [];
    const add = (type: SignalType, topic: string, conf: number, evidence: string, resolves?: string[]) =>
      out.push({ type, topic: `${type}:${topic}`, confidence: Math.round(conf * q * 100) / 100, evidence, speaker: u.speaker, callMs: u.endMs, resolves });

    if (u.speaker === "agent") {
      if (has(/\b(record(ed|ing)?|monitored)\b/i, t)) {
        this.disclosureGiven = true;
        out.push({ type: "compliance_disclosure", topic: "compliance_disclosure:recording", confidence: 1, evidence: t, speaker: "agent", callMs: u.endMs, resolves: ["compliance_disclosure:recording"] });
      }
      if (has(/\b(multi[- ]?(vehicle|car|policy)|second (car|vehicle) discount|add (her|his|the other|your wife'?s|your husband'?s) (car|vehicle|bike))\b/i, t)) {
        this.offers.add("vehicle");
        out.push({ type: "cross_sell", topic: "cross_sell:vehicle", confidence: 1, evidence: t, speaker: "agent", callMs: u.endMs, resolves: ["cross_sell:vehicle"] });
      }
      if (has(/\b(family floater|add (your )?(parents|family|wife|husband|children))\b/i, t)) {
        this.offers.add("family");
        out.push({ type: "cross_sell", topic: "cross_sell:family", confidence: 1, evidence: t, speaker: "agent", callMs: u.endMs, resolves: ["cross_sell:family"] });
      }
      if (has(/\b(premium|price|cost|pay(ment)?|rupees|₹|\d{3,})\b/i, t) && this.agentTalkedPriceAt === null) this.agentTalkedPriceAt = u.endMs;
      // Required disclosure missing once the agent moves into pricing/payment, or 40 s into the call.
      if (!this.disclosureGiven && (this.agentTalkedPriceAt !== null || u.endMs > 40000)) add("compliance_disclosure", "recording", 0.9, "Agent has not stated that the call is recorded" + (this.agentTalkedPriceAt !== null ? " and is already discussing price/payment." : "."));
      const risky = /\b(guarantee[ds]?|100 ?(%|percent)|always (get )?approved|definitely (be )?approved|no questions asked|risk[- ]free|never (be )?rejected|nothing to worry|no medical (test|check)s? (at all|ever))\b/i.exec(t);
      // All guarantee-type promises share one topic, so repeats merge into the same nudge.
      if (risky && !NEGATED(t, risky.index)) add("compliance_risky_statement", "guarantee", 0.92, `"${risky[0].toLowerCase()}" — ${t}`);
      return out;
    }

    // ---------------- customer
    const vehicle = /\b(second|another|other|two|2|both|my (wife|husband|son|daughter|brother|father)'?s?|also (have|got|own)) (car|cars|vehicle|vehicles|bike|scooter|suv)\b|\b(wife|husband|son|daughter) (also )?(drives|has a car|has a bike|bought a (car|bike))\b/i.exec(t);
    if (vehicle && !NEGATED(t, vehicle.index) && !/\b(sold|used to|last year i had)\b/i.test(t) && !this.offers.has("vehicle")) add("cross_sell", "vehicle", 0.85, t);
    const family = /\b(my (parents|mother|father|wife|husband|kids|children)) (are|is|have|has|don'?t have|aren'?t) (not )?(covered|insured|no insurance|any insurance)/i.exec(t) ?? /\b(parents|mother|father) (also )?(have|has) no (health )?insurance\b/i.exec(t);
    if (family && !this.offers.has("family")) add("cross_sell", "family", 0.8, t);

    const pay = /\b(can'?t afford|cannot afford|lost my job|laid off|salary (is )?(delayed|late|not (yet )?credited)|money is tight|can'?t pay|unable to pay|struggling to pay|short (of money|this month)|no money|financial (problem|difficult)|medical bills)\b/i.exec(t);
    if (pay && !NEGATED(t, pay.index)) add("payment_difficulty", "general", 0.88, t);

    const cb = /\b(call (me )?back|call me later|call later|busy (right )?now|in a meeting|driving right now|not a good time|talk later|tomorrow (morning|evening))\b/i.exec(t);
    if (cb && !NEGATED(t, cb.index)) add("callback_need", "general", 0.82, t);

    const buy = /\b(how do i (sign up|buy|proceed|pay)|what('?s| is) the next step|send me the (form|link|quote|details)|sounds good|i'?m interested|let'?s do it|go ahead with)\b/i.exec(t);
    if (buy && !NEGATED(t, buy.index)) add("buying_signal", "general", 0.8, t);

    const churn = /\b(cancel (my|the) (policy|plan|loan)|switch(ing)? to another|close (my|the) (account|loan)|don'?t want to renew)\b/i.exec(t);
    if (churn && !NEGATED(t, churn.index)) add("churn_risk", "general", 0.85, t);

    // Frustration: lexicon score with negation + external-target guard, tracked as a trend.
    let score = 0;
    const lex: [RegExp, number][] = [
      [/\b(frustrat\w*|annoy\w*|irritat\w*|fed up|sick of|tired of)\b/i, 0.5], [/\b(ridiculous|unacceptable|useless|pathetic|terrible|worst|nonsense|waste of (my )?time)\b/i, 0.6],
      [/\b(already told you|told you (this )?(already|before)|(second|third|fourth|how many) times?|again and again|keep asking|repeat(ing)? myself)\b/i, 0.55],
      [/\b(angry|upset|not happy|unhappy|complain\w*|escalate|manager|supervisor)\b/i, 0.45], [/!/, 0.1], [/\b(why (do|are|is) (i|you)|what is wrong with)\b/i, 0.2],
    ];
    for (const [re, w] of lex) { const m = re.exec(t); if (m && !NEGATED(t, m.index)) score += w; }
    if (/\b(traffic|weather|the match|my boss|the game|commute)\b/i.test(t) && !/\byou\b|\bthis call\b|\byour\b/i.test(t)) score *= 0.3; // frustration aimed elsewhere
    if (/\b(no problem|no worries|it'?s fine|that'?s fine|all good|not a problem)\b/i.test(t)) score *= 0.3;
    const repeat = this.lastCustomerTexts.some((p) => jaccard(p, t) > 0.6);
    if (repeat) score += 0.3;
    this.customerScores.push(Math.min(1, score));
    this.lastCustomerTexts = [...this.lastCustomerTexts.slice(-3), t];
    const recent = this.customerScores.slice(-3);
    const rising = recent.length >= 2 && recent[recent.length - 1] >= 0.45 && recent[recent.length - 1] >= recent[0];
    const sustained = recent.filter((s) => s >= 0.4).length >= 2;
    if (rising || (sustained && score >= 0.4)) add("frustration", "general", Math.min(0.95, 0.55 + score * 0.4 + (sustained ? 0.1 : 0)), t);
    return out;
  }
}

function jaccard(a: string, b: string) {
  const A = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 2)), B = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  let i = 0; for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i || 1);
}
