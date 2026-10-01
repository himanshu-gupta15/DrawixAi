/**
 * Hybrid retrieval (Q2 -> used by the Q1 voice agent):
 *   query processing (terminology + synonym expansion, intent hint)
 *   -> dense search (e5 embedding, Qdrant, active records only)
 *   -> BM25 keyword search
 *   -> reciprocal-rank fusion + category boost
 *   -> grounding decision (is the best record actually about the question?)
 *   -> top-k records with citations
 */
import { prisma } from "../database/prisma";
import { cosine, embedQueries, embedQuery } from "../embeddings/local";
import { cleanText } from "../kb/clean";
import { searchVectors } from "../vector/qdrant";
import { Bm25 } from "./bm25";
import { rerankScores } from "./rerank";

export interface RetrievedRecord {
  recordId: string;
  title: string;
  content: string;
  category: string;
  productLine: string;
  source: string;
  sourceRef: string;
  version: string;
  denseScore: number;
  bm25Score: number;
  fusedScore: number;
  rerankScore: number | null;
}

export interface RetrievalResult {
  query: string;
  processedQuery: string;
  intentHint: string | null;
  grounded: boolean;
  confidence: number;
  reason: string;
  results: RetrievedRecord[];
  latencyMs: { embed: number; vector: number; bm25: number; rerank: number; total: number };
}

// Grounding thresholds, calibrated on the dev + calibration sets only (never on held-out queries).
// Primary: cross-encoder logit. Fallback (reranker unavailable): dense cosine + lexical overlap.
export const RERANK_GROUNDED_MIN = Number(process.env.RAG_RERANK_MIN ?? 0); // confident on its own
export const RERANK_SOFT_MIN = Number(process.env.RAG_RERANK_SOFT_MIN ?? -2.5); // needs dense support
export const RERANK_QUERY = process.env.RAG_RERANK_QUERY ?? "expanded"; // "expanded" | "original"
export const DENSE_GROUNDED_MIN = Number(process.env.RAG_DENSE_MIN ?? 0.85);
export const DENSE_STRONG = Number(process.env.RAG_DENSE_STRONG ?? 0.88);
const RERANK_CANDIDATES = 12;
/** Objections are statements, not questions: match them as paraphrases of the playbook title. */
export const OBJECTION_PARAPHRASE_MIN = Number(process.env.RAG_OBJECTION_MIN ?? 0.87);

const SYNONYMS: [RegExp, string][] = [
  [/\b(ped|existing (illness|disease|condition)s?|sugar|diabetes|diabetic|bp|blood pressure|hypertension|thyroid|asthma)\b/i, "pre-existing disease waiting period"],
  [/\b(cost|price|pricing|how much|expensive|costly|cheap|afford|budget)\b/i, "premium per year per month"],
  [/\b(monthly|instal?ments?|emi)\b/i, "monthly instalment EMI"],
  [/\b(hospital list|which hospitals?|network)\b/i, "network hospitals cashless"],
  [/\b(cancel|return the policy|refund)\b/i, "free-look period cancel refund"],
  [/\b(company|office|corporate|employer|group) (insurance|cover|policy)\b/i, "employer group cover"],
  [/\b(mother|father|mom|dad|parents?|in-laws?|wife|husband|spouse|kids?|children|son|daughter|family)\b/i, "family members floater parents spouse children entry age"],
  [/\b(abroad|overseas|outside india|international|foreign|usa|uk|dubai)\b/i, "treatment outside India global emergency hospitalisation"],
  [/\b(bypass|stent|angioplasty|heart (attack|surgery|operation)|cancer|chemo\w*|tumou?r|dialysis|kidney failure|transplant)\b/i, "underwriter review heart surgery cancer kidney transplant"],
  [/\b(old|senior|age limit|maximum age|too old|eligible|eligibility)\b/i, "entry age eligibility"],
  [/\b(reject|rejected|denied|don'?t pay)\b/i, "claim rejected settlement ratio"],
  [/\b(pregnan\w*|delivery|maternity|baby)\b/i, "maternity cover"],
  [/\b(tax|80d)\b/i, "tax deduction section 80D"],
];

/**
 * Adjacent financial domains the KB deliberately does not cover. Embeddings rate "car insurance"
 * close to "health insurance", so these are refused explicitly rather than by score alone.
 */
export const OUT_OF_DOMAIN: [RegExp, string][] = [
  [/\b(car|motor|vehicle|bike|two[- ]wheeler|auto) (insurance|policy|cover)\b/i, "motor insurance"],
  [/\b(life insurance|term (plan|insurance)|endowment|ulip)\b/i, "life insurance"],
  [/\b(home|personal|business|gold|car) loans?\b|\bloan\b/i, "loans"],
  [/\b(mutual funds?|stocks?|shares?|share price|crypto|invest(ment)?s?)\b/i, "investments"],
  [/\b(travel|pet|home|fire) insurance\b|\bpet\b/i, "other insurance lines"],
  [/\b(credit card|debit card|bank account)\b/i, "banking"],
];

export function outOfDomain(q: string) {
  return OUT_OF_DOMAIN.find(([re]) => re.test(q))?.[1] ?? null;
}

/** Light intent hint used to boost the matching category (objections are phrased very differently from FAQs). */
export function intentHint(q: string): string | null {
  if (/(too expensive|can'?t afford|already have|don'?t need|not interested|think about it|reject(ed)? claims?|why do you need|young and healthy|waste of money)/i.test(q)) return "objection";
  if (/(eligible|eligibility|qualify|age limit|can i buy|can my (mother|father|parents))/i.test(q)) return "eligibility";
  if (/(premium|price|cost|how much|rates?)\b/i.test(q)) return "pricing";
  return null;
}

export function processQuery(q: string) {
  let processed = cleanText(q).text;
  const expansions = SYNONYMS.filter(([re]) => re.test(q)).map(([, add]) => add);
  if (expansions.length) processed += " " + expansions.join(" ");
  return processed;
}

type IndexCache = { version: string; checkedAt: number; bm25: Bm25; records: Map<string, Omit<RetrievedRecord, "denseScore" | "bm25Score" | "fusedScore" | "rerankScore">>; objectionVecs: Map<string, number[]> };
const g = globalThis as unknown as { __kbIndex?: IndexCache };

/** BM25 + record lookup cache, rebuilt whenever a new ingestion run is detected (checked every 3s). */
async function getIndex(): Promise<IndexCache> {
  const now = Date.now();
  const cached = g.__kbIndex;
  if (cached && now - cached.checkedAt < 3000) return cached;
  const run = await prisma.ingestionRun.findFirst({ orderBy: { startedAt: "desc" }, select: { id: true } });
  const version = run?.id ?? "none";
  if (g.__kbIndex && g.__kbIndex.version === version) {
    g.__kbIndex.checkedAt = now;
    return g.__kbIndex;
  }
  const rows = await prisma.kbRecord.findMany({ where: { status: "active" } });
  const objections = rows.filter((r) => r.category === "objection");
  // symmetric e5 encoding ("query:" on both sides) for statement-to-statement similarity
  const objVecs = await embedQueries(objections.map((r) => r.title.replace(/^Objection – /, "").replace(/"/g, "")));
  g.__kbIndex = {
    objectionVecs: new Map(objections.map((r, i) => [r.recordId, objVecs[i]])),
    version,
    checkedAt: now,
    bm25: new Bm25(rows.map((r) => ({ id: r.recordId, text: `${r.title} ${r.title} ${aliasesOf(r.metadata).join(" ")} ${r.content}` }))),
    records: new Map(rows.map((r) => [r.recordId, { recordId: r.recordId, title: r.title, content: r.content, category: r.category, productLine: r.productLine, source: r.source, sourceRef: r.sourceRef, version: r.version }])),
  };
  return g.__kbIndex!;
}

/** IDF lookup from the live BM25 index (used to pick the most informative answer sentences). */
export async function termIdf() {
  const index = await getIndex();
  return (t: string) => index.bm25.idf(t);
}

export async function retrieve(query: string, opts: { k?: number; category?: string; log?: boolean } = {}): Promise<RetrievalResult> {
  const k = opts.k ?? 3;
  const t0 = performance.now();
  const index = await getIndex();
  const processed = processQuery(query);
  const hint = opts.category ?? intentHint(query);

  const t1 = performance.now();
  const [qv, qOrig] = await Promise.all([embedQuery(processed), index.objectionVecs.size ? embedQueries([query]).then((v) => v[0]) : Promise.resolve(null)]);
  const t2 = performance.now();
  const dense = await searchVectors(qv, 20);
  const t3 = performance.now();
  const sparse = index.bm25.search(processed, 20);
  const t4 = performance.now();

  // Reciprocal-rank fusion (k=60) with dense weighted higher; +boost for the hinted category.
  const fused = new Map<string, { dense: number; bm25: number; score: number }>();
  dense.forEach((d, rank) => fused.set(d.recordId, { dense: d.score, bm25: 0, score: 1.0 / (60 + rank) }));
  sparse.forEach((s, rank) => {
    const cur = fused.get(s.recordId) ?? { dense: 0, bm25: 0, score: 0 };
    cur.bm25 = s.score;
    cur.score += 0.6 / (60 + rank);
    fused.set(s.recordId, cur);
  });
  const candidates: RetrievedRecord[] = [...fused]
    .filter(([id]) => index.records.has(id))
    .map(([id, f]) => {
      const rec = index.records.get(id)!;
      const boost = hint && rec.category === hint ? 0.004 : 0;
      return { ...rec, denseScore: round(f.dense), bm25Score: round(f.bm25), fusedScore: round(f.score + boost, 5), rerankScore: null as number | null };
    })
    .sort((a, b) => b.fusedScore - a.fusedScore)
    .slice(0, RERANK_CANDIDATES);

  // Cross-encoder rerank of the fused candidates (original question, not the expanded one).
  let reranked = true;
  try {
    // The expanded query carries domain synonyms (bypass -> heart surgery) the reranker doesn't know.
    const scores = await rerankScores(RERANK_QUERY === "original" ? query : processed, candidates.map((c) => `${c.title}. ${c.content}`));
    candidates.forEach((c, i) => (c.rerankScore = round(scores[i], 2)));
    candidates.sort((a, b) => b.rerankScore! - a.rerankScore! || b.fusedScore - a.fusedScore);
  } catch {
    reranked = false; // degrade gracefully to fusion order + dense threshold
  }
  const t5 = performance.now();
  const results = candidates.slice(0, k);

  // Grounding decision: the best record must actually answer the question, otherwise the agent
  // says the information is unavailable instead of guessing.
  const top = results[0];
  const topDense = top?.denseScore ?? 0;
  const ood = outOfDomain(query);
  const paraphrase = top && qOrig && index.objectionVecs.has(top.recordId) ? round(cosine(qOrig, index.objectionVecs.get(top.recordId)!)) : null;
  const objectionMatch = paraphrase !== null && paraphrase >= OBJECTION_PARAPHRASE_MIN;
  const grounded = !ood && !!top && (objectionMatch || reranked
    ? top.rerankScore! >= RERANK_GROUNDED_MIN || (top.rerankScore! >= RERANK_SOFT_MIN && topDense >= DENSE_GROUNDED_MIN)
    : topDense >= DENSE_STRONG || (topDense >= DENSE_GROUNDED_MIN && top.bm25Score > 1.0));
  const reason = ood
    ? `out-of-domain topic: ${ood}`
    : !top
    ? "no records"
    : `${grounded ? "grounded" : "below grounding threshold"}: ${paraphrase !== null ? `objection paraphrase=${paraphrase} (min ${OBJECTION_PARAPHRASE_MIN}), ` : ""}${reranked ? `rerank=${top.rerankScore} (≥${RERANK_GROUNDED_MIN}, or ≥${RERANK_SOFT_MIN} with dense ≥${DENSE_GROUNDED_MIN}), ` : "reranker unavailable, "}dense=${topDense.toFixed(3)}, bm25=${top.bm25Score.toFixed(2)}`;
  const total = performance.now() - t0;
  const out: RetrievalResult = {
    query,
    processedQuery: processed,
    intentHint: hint,
    grounded,
    confidence: round(top?.rerankScore != null ? 1 / (1 + Math.exp(-top.rerankScore)) : Math.min(1, Math.max(0, (topDense - 0.78) / (0.92 - 0.78)))),
    reason,
    results,
    latencyMs: { embed: round(t2 - t1, 1), vector: round(t3 - t2, 1), bm25: round(t4 - t3, 1), rerank: round(t5 - t4, 1), total: round(total, 1) },
  };
  if (opts.log !== false) {
    prisma.retrievalLog
      .create({ data: { query, grounded, latencyMs: Math.round(total), results: results.map((r) => ({ recordId: r.recordId, fused: r.fusedScore, dense: r.denseScore, rerank: r.rerankScore })) } })
      .catch(() => {});
  }
  return out;
}

const aliasesOf = (m: unknown) => ((m as { aliases?: string[] } | null)?.aliases ?? []);

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

export function citationOf(r: Pick<RetrievedRecord, "recordId" | "title" | "source" | "sourceRef" | "version">) {
  return `[${r.recordId}] ${r.title} — ${r.source} (v${r.version}, ${r.sourceRef})`;
}
