/**
 * Product / policy taxonomy.
 *   category     = primary knowledge type used for routing: product | pricing | eligibility | policy |
 *                  claims | faq | objection | process | partnership | company
 *   topic        = finer subject (waiting_period, claims, tax, payment, benefits, ...)
 *   product_line = silver | gold | platinum | all
 * Topics are scored by keyword hits; hits in the heading count 3x.
 */
export const CATEGORIES = ["product", "pricing", "eligibility", "policy", "claims", "faq", "objection", "process", "partnership", "company"] as const;

const TOPIC_KEYWORDS: Record<string, RegExp[]> = {
  product: [/\bplans?\b/i, /sum insured/i, /room/i, /maternity/i, /restore/i, /ayush/i, /\bopd\b/i, /ambulance/i, /benefits? included/i, /day-care/i],
  pricing: [/premium (?:starts|rates?)/i, /per year/i, /per month/i, /instalments?/i, /\bemis?\b/i, /expensive/i, /price/i],
  eligibility: [/eligib/i, /entry age/i, /who can buy/i, /underwriter/i, /medical check/i, /qualif/i, /proposer/i, /family floater/i, /medical test/i],
  waiting_period: [/waiting period/i, /covered after \d+ months/i, /day one/i],
  claims: [/\bclaims?\b/i, /cashless/i, /reimbursement/i, /pre-authorisation/i, /network hospital/i, /intimat/i],
  tax: [/section 80d/i, /\btax\b/i],
  payment: [/grace period/i, /auto-debit/i, /miss(?:ed)? (?:a )?payment/i, /pay the premium/i],
  exclusions: [/exclusions?/i, /not covered/i],
  portability: [/portab/i, /\bport\b/i, /employer/i],
  free_look: [/free-look/i],
  partnership: [/partners?\b/i, /intermediar/i],
  contact: [/contact/i, /toll-free/i, /grievance/i, /ombudsman/i],
  company: [/why choose/i, /customers? (?:say|stories|rated)/i, /settlement ratio/i, /every family/i],
  process: [/quote/i, /proposal form/i, /next steps/i, /step \d/i],
  objection: [/objection/i, /acknowledge/i],
};

export function classifyTopic(heading: string, text = "") {
  let best = "general", bestScore = 0;
  for (const [topic, kws] of Object.entries(TOPIC_KEYWORDS)) {
    const score = kws.reduce((s, re) => s + (re.test(heading) ? 3 : 0) + (re.test(text) ? 1 : 0), 0);
    if (score > bestScore) [best, bestScore] = [topic, score];
  }
  return best;
}

const TOPIC_TO_CATEGORY: Record<string, string> = {
  product: "product", pricing: "pricing", eligibility: "eligibility", waiting_period: "policy", exclusions: "policy",
  free_look: "policy", portability: "policy", payment: "policy", claims: "claims", tax: "pricing",
  partnership: "partnership", contact: "company", company: "company", process: "process", objection: "objection",
};

/** Sources with a strong type (FAQ page, objection playbook, eligibility rules, tables, forms) keep their category. */
const FIXED_CATEGORIES = new Set(["faq", "objection", "eligibility", "partnership", "pricing", "process"]);

export function classifyCategory(defaultCategory: string, heading: string, text: string) {
  if (FIXED_CATEGORIES.has(defaultCategory)) return defaultCategory;
  return TOPIC_TO_CATEGORY[classifyTopic(heading, text)] ?? defaultCategory;
}

export function detectProductLine(text: string) {
  const plans = ["silver", "gold", "platinum"].filter((p) => new RegExp(`\\b${p}\\b`, "i").test(text));
  return plans.length === 1 ? plans[0] : "all";
}
