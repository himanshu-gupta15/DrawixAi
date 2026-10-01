/**
 * Cleaning & standardisation: whitespace, terminology, currency, dates and headings.
 * Every change is recorded so a record can explain how it differs from the raw source.
 */

// Inconsistent terminology across sources -> one canonical term.
export const TERMINOLOGY: [RegExp, string][] = [
  [/\bpre[\s-]?existing (?:illness|illnesses|disease|diseases|condition|conditions)\b/gi, "pre-existing disease"],
  [/\bmediclaim\b/gi, "health insurance"],
  [/\bcooling period\b/gi, "waiting period"],
  [/\bhospitali[sz]ation\b/gi, "hospitalisation"],
  [/\bpre-?authori[sz]ation\b/gi, "pre-authorisation"],
  [/\bE-?card\b/g, "e-card"],
];

const CURRENCY: [RegExp, string][] = [
  [/\b(?:Rs\.?|INR)\s?(?=\d)/g, "₹"],
  [/₹\s+(?=\d)/g, "₹"],
];

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export function isValidDate(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Normalise a single date string (dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, "1 April 2026") to ISO. */
export function normalizeDate(s: string): { iso?: string; invalid?: boolean } {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s))) [d, mo, y] = [+m[1], +m[2], +m[3]]; // Indian dd/mm/yyyy
  else if ((m = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(s)) && MONTHS.includes(m[2].toLowerCase())) [d, mo, y] = [+m[1], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[3]];
  else return {};
  if (!isValidDate(y, mo, d)) return { invalid: true };
  return { iso: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

const DATE_IN_TEXT = /\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4})\b/g;

export function cleanText(text: string): { text: string; changes: string[]; invalidDates: string[] } {
  const changes: string[] = [];
  const invalidDates: string[] = [];
  let t = text.replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
  for (const [re, rep] of [...TERMINOLOGY, ...CURRENCY]) {
    t = t.replace(re, (match, ...groups) => {
      let out = typeof groups[0] === "string" && rep.includes("$1") ? rep.replace("$1", groups[0]) : rep;
      if (/^[A-Z]/.test(match) && /^[a-z]/.test(out)) out = out.charAt(0).toUpperCase() + out.slice(1); // keep sentence case
      if (match !== out) changes.push(`"${match}" -> "${out}"`);
      return out;
    });
  }
  t = t.replace(DATE_IN_TEXT, (d) => {
    const r = normalizeDate(d);
    if (r.invalid) {
      invalidDates.push(d);
      return `${d} [invalid date in source]`;
    }
    if (r.iso && r.iso !== d) changes.push(`date "${d}" -> "${r.iso}"`);
    return r.iso ?? d;
  });
  return { text: t, changes: [...new Set(changes)], invalidDates };
}

/** "WAITING PERIODS" -> "Waiting periods"; strips trailing punctuation. */
export function standardizeHeading(h: string) {
  let s = h.replace(/\s+/g, " ").trim().replace(/[:\s]+$/, "");
  if (s.length > 3 && s === s.toUpperCase()) s = s.charAt(0) + s.slice(1).toLowerCase();
  return s;
}
