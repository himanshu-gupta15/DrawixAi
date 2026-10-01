/**
 * PII detection and redaction. Redaction happens before anything is stored or embedded,
 * so raw personal data never reaches Postgres, Qdrant or an LLM prompt.
 */
export interface PiiResult {
  text: string;
  types: string[];
  count: number;
}

// Business contact details are not personal data and must survive redaction.
const ALLOWLIST = [/1800-\d{3}-\d{4}/, /@dravixhealth\.example$/i];

const DETECTORS: { type: string; re: RegExp }[] = [
  { type: "EMAIL", re: /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g },
  { type: "AADHAAR", re: /\b\d{4}\s\d{4}\s\d{4}\b/g },
  { type: "PAN", re: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { type: "POLICY_NUMBER", re: /\bDHS-\d{4}-\d{4,}\b/g },
  // Indian mobile numbers: optional +91, 10 digits starting 6-9, with optional separators.
  { type: "PHONE", re: /(?:\+91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b|(?:\+91[\s-]?)\b[6-9]\d{1,4}(?:[\s-]?\d{2,5}){2,3}\b/g },
  // Person names in attributions ("– Rahul Mehta, Pune") or role mentions ("manager Suresh Nair").
  { type: "PERSON_NAME", re: /(?<=[–—-]\s)[A-Z][a-z]+ [A-Z][a-z]+(?=,)|(?<=\b(?:manager|Mr\.?|Ms\.?|Mrs\.?|Name:)\s)[A-Z][a-z]+ [A-Z][a-z]+/g },
];

export function redactPii(text: string): PiiResult {
  const types = new Set<string>();
  let count = 0;
  let out = text;
  for (const { type, re } of DETECTORS) {
    out = out.replace(re, (m) => {
      if (ALLOWLIST.some((a) => a.test(m))) return m;
      types.add(type);
      count++;
      return `[${type}_REDACTED]`;
    });
  }
  return { text: out, types: [...types], count };
}
