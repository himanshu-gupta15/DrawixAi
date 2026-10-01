/**
 * Deterministic NLU for the Q1 agent: classifies what the caller is doing on this turn and
 * extracts slot values. Rules are fast (no network on the critical path) and explainable.
 */
export type TurnAct = "human_request" | "stop" | "callback_request" | "objection" | "question" | "answer";

const HUMAN = /\b(human|real person|actual person|live (agent|person)|representative|speak to (an?|some)one|talk to (an?|some)one|(speak|talk) (to|with) (an? )?(agent|advisor|adviser|executive|manager|person)|connect me|transfer me|customer care)\b/i;
const STOP = /\b(not interested|no interest|don'?t call|do not call|stop calling|remove my number|unsubscribe|leave me alone)\b/i;
const CALLBACK = /\b(call (me )?(back )?later|call me (tomorrow|tonight|in the evening|after|at|on)|busy (now|right now)|not a good time|bad time|in a meeting|driving)\b/i;
const OBJECTION = /\b(too expensive|expensive|costly|can'?t afford|cannot afford|too much money|already (have|got) (a |an )?(insurance|policy|cover)|office (gives|provides)|employer|don'?t need|do not need|young and healthy|waste of money|reject(s|ed)? (most |all )?claims|never pay|don'?t trust|why do you need my|think about it|not sure)\b/i;
const QUESTION_START = /^(what|what's|whats|how|why|when|where|which|who|is|are|does|do|can|could|will|would|should|tell me|explain|i want to know|i'd like to know|any idea)\b/i;

export function classifyTurn(text: string): TurnAct {
  const t = text.trim();
  if (HUMAN.test(t)) return "human_request";
  if (STOP.test(t)) return "stop";
  if (CALLBACK.test(t)) return "callback_request";
  if (OBJECTION.test(t)) return "objection";
  // A question either ends with "?" or starts with a question word; mid-utterance questions
  // ("I'm 34, but is diabetes covered?") are split out by splitQuestion().
  if (/\?\s*$/.test(t) || QUESTION_START.test(t)) return "question";
  return "answer";
}

/** "I'm 34, but is diabetes covered?" -> { answer: "I'm 34", question: "is diabetes covered?" } */
export function splitQuestion(text: string): { answer: string; question: string | null } {
  const m = /^(.*?)[,.;]?\s*(?:but|and|also|by the way|btw)?\s*\b((?:what|how|why|when|where|which|is|are|does|do|can|will|would|should)\b[^?]*\?)\s*$/i.exec(text);
  if (m && m[1].trim().length > 1) return { answer: m[1].trim(), question: m[2].trim() };
  return { answer: text, question: null };
}

// ------------------------------------------------------------------ yes / no
export function yesNo(text: string): boolean | null {
  const t = text.toLowerCase();
  if (/\b(no|nope|nah|not really|none|nothing|never|don'?t|do not|nobody|no one|negative|nahi)\b/.test(t)) return false;
  if (/\b(yes|yeah|yep|yup|sure|ok|okay|of course|go ahead|fine|correct|right|haan|absolutely|please do|sounds good)\b/.test(t)) return true;
  return null;
}

// ------------------------------------------------------------------ numbers
const WORD_NUM: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** Converts spelled-out numbers ("thirty four", "twelve thousand") that ASR sometimes emits. */
export function wordsToDigits(text: string) {
  return text.replace(/\b((?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-](?:one|two|three|four|five|six|seven|eight|nine))?)(\s+(hundred|thousand|lakh))?\b/gi, (_m, num: string, _s, mult?: string) => {
    const n = num.toLowerCase().split(/[\s-]/).reduce((s, w) => s + (WORD_NUM[w] ?? 0), 0);
    const k = mult ? { hundred: 100, thousand: 1000, lakh: 100000 }[mult.toLowerCase() as "hundred"] : 1;
    return String(n * k);
  });
}

export function extractAge(text: string): number | null {
  const t = wordsToDigits(text);
  const m = /\b(\d{1,3})\s*(?:years?|yrs?|y\/o)?(?:\s*old)?\b/i.exec(t);
  if (!m) return null;
  const n = +m[1];
  return n >= 1 && n <= 110 ? n : null;
}

export function extractBudget(text: string): { annual: number; raw: string } | null {
  const t = wordsToDigits(text).replace(/(\d),(?=\d)/g, "$1");
  const m = /(?:₹|rs\.?|inr|rupees)?\s*(\d+(?:\.\d+)?)\s*(k|thousand|lakh|lac)?\s*(?:rupees|rs)?\s*(?:a|per|\/|every)?\s*(month|monthly|mo|year|yearly|annual|annually|yr)?/i.exec(t);
  if (!m) return null;
  let n = +m[1];
  if (/^(k|thousand)$/i.test(m[2] || "")) n *= 1000;
  if (/^(lakh|lac)$/i.test(m[2] || "")) n *= 100000;
  const monthly = /month|mo/i.test(m[3] || "") || (!m[3] && /month/i.test(t));
  if (n < 100) return null; // "2" is not a budget
  return { annual: Math.round(monthly ? n * 12 : n), raw: m[0].trim() };
}

// ------------------------------------------------------------------ entities
export function extractName(text: string): string | null {
  const m = /\b(?:my name is|name'?s|i am|i'm|this is|it'?s|call me)\s+([A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){0,2})/i.exec(text);
  let cand = m ? m[1] : text.replace(/[^A-Za-z\s.'-]/g, "").trim();
  cand = cand.replace(/\b(and|but|from|here|speaking|sir|madam|ji)\b.*$/i, "").replace(/[.'-]+$/, "").trim();
  const words = cand.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 3) return null;
  if (words.some((w) => /^(yes|no|okay|ok|sure|hello|hi|what|why|how|i|am|the|a|is|not)$/i.test(w))) return null;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

export function extractMembers(text: string): string[] | null {
  const t = text.toLowerCase();
  const m = new Set<string>();
  if (/\b(me|myself|self|i |just me|only me|mine|my own)\b/.test(t + " ")) m.add("self");
  if (/\b(wife|husband|spouse|partner)\b/.test(t)) m.add("spouse");
  if (/\b(kids?|children|child|son|daughter|sons|daughters|baby)\b/.test(t)) m.add("children");
  if (/\b(parents?|mother|father|mom|dad|mum|in-laws?)\b/.test(t)) m.add("parents");
  if (/\b(family|everyone|all of us)\b/.test(t)) ["self", "spouse", "children"].forEach((x) => m.add(x));
  if (!m.size) return null;
  if (!m.has("self") && !/\bonly (my )?(parents?|mother|father)\b/.test(t)) m.add("self");
  return [...m];
}

const CITIES = ["mumbai", "delhi", "new delhi", "bengaluru", "bangalore", "hyderabad", "chennai", "kolkata", "pune", "ahmedabad", "jaipur", "lucknow", "surat", "kanpur", "nagpur", "indore", "bhopal", "patna", "noida", "gurgaon", "gurugram", "chandigarh", "kochi", "coimbatore", "vizag", "visakhapatnam", "thane", "nashik", "vadodara", "mysore", "mysuru"];

export function extractCity(text: string): string | null {
  const t = text.toLowerCase();
  const known = CITIES.find((c) => new RegExp(`\\b${c}\\b`).test(t));
  if (known) return known.replace(/\b\w/g, (c) => c.toUpperCase()).replace("Bangalore", "Bengaluru").replace("Gurgaon", "Gurugram");
  const m = /\b(?:in|from|at|live in|based in)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/.exec(text);
  if (m) return m[1];
  const words = text.replace(/[^A-Za-z\s]/g, "").trim().split(/\s+/);
  if (words.length <= 2 && /^[A-Z]/.test(words[0] || "") && !/^(yes|no|i|okay)$/i.test(words[0])) return words.join(" ");
  return null;
}

export function extractConditions(text: string, known: string[], serious: string[]): { none: boolean; conditions: string[] } | null {
  const t = text.toLowerCase();
  const found = [...serious, ...known].filter((c) => new RegExp(`\\b${c}\\b`).test(t));
  if (/\bheart\b/.test(t) && !found.some((f) => /heart|bypass|angioplasty|stent/.test(f))) found.push("heart condition");
  if (found.length) return { none: false, conditions: [...new Set(found)] };
  const yn = yesNo(t);
  if (yn === false) return { none: true, conditions: [] };
  if (yn === true) return { none: false, conditions: ["unspecified"] };
  return null;
}

/** Callback time phrase, e.g. "tomorrow at 6 pm", "Saturday morning". */
export function extractTime(text: string): string | null {
  const m = /\b((?:today|tomorrow|tonight|this evening|this afternoon|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|weekend)(?:\s+(?:morning|afternoon|evening|night))?(?:\s+(?:at|around|after|before)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)?|(?:at|around|after|before)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.|o'clock)?|\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)|(?:in the )?(?:morning|afternoon|evening))\b/i.exec(wordsToDigits(text));
  return m ? m[1].trim() : null;
}
