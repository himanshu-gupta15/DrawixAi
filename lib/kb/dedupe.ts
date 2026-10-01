/**
 * Exact and near-duplicate detection. Exact = same normalised hash. Near = lexical (word-bigram
 * Jaccard) OR semantic (embedding cosine) with a lexical floor so that different plans described
 * with the same template (e.g. Silver vs Gold premium rows) are not merged.
 */
import crypto from "node:crypto";

export const NEAR_DUP_JACCARD = 0.6;
export const NEAR_DUP_COSINE = 0.98;
export const NEAR_DUP_COSINE_JACCARD_FLOOR = 0.3;

export function normalizeForHash(s: string) {
  return s.toLowerCase().replace(/\[[a-z_]+_redacted\]/g, "").replace(/[^a-z0-9₹%]+/g, " ").trim();
}

export function contentHash(s: string) {
  return crypto.createHash("sha256").update(normalizeForHash(s)).digest("hex").slice(0, 16);
}

export function shingles(s: string, n = 2) {
  const w = normalizeForHash(s).split(" ").filter(Boolean);
  const set = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) set.add(w.slice(i, i + n).join(" "));
  if (w.length < n) set.add(w.join(" "));
  return set;
}

export function jaccard(a: Set<string>, b: Set<string>) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

export function isNearDuplicate(jac: number, cos: number) {
  return jac >= NEAR_DUP_JACCARD || (cos >= NEAR_DUP_COSINE && jac >= NEAR_DUP_COSINE_JACCARD_FLOOR);
}
