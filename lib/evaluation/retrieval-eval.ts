/** Q2 retrieval evaluation: question -> retrieved record -> source -> relevance explanation -> verdict. */
import fs from "node:fs";
import path from "node:path";
import { composeAnswer } from "../rag/answer";
import { tokenize } from "../rag/bm25";
import { retrieve } from "../rag/retrieve";

export interface RetrievalCase { id: string; type: string; question: string; expected: string[]; acceptable: string[]; rationale: string }

export function loadRetrievalCases(): RetrievalCase[] {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/test-cases/retrieval-eval.json"), "utf8"));
}

export interface RetrievalEvalRow {
  id: string; type: string; question: string; grounded: boolean;
  retrieved: { recordId: string; title: string; content: string; category: string } | null;
  otherResults: string[]; sourceReference: string | null; relevanceExplanation: string; answer: string;
  verdict: "correct" | "partially correct" | "incorrect"; latencyMs: number;
  answerVerdict?: "correct" | "partially correct" | "incorrect"; answerMode?: string; llmLatencyMs?: number; verifier?: string; llmError?: string;
}

export async function runRetrievalEval(cases = loadRetrievalCases(), opts: { allowLlm?: boolean; paceMs?: number } = {}) {
  // warm-up (model load) is measured separately so per-query latency reflects steady state
  const w0 = performance.now();
  await retrieve("warm up query", { log: false });
  const coldStartMs = Math.round(performance.now() - w0);
  const results: RetrievalEvalRow[] = [];
  for (const c of cases) {
    const r = await retrieve(c.question, { log: false });
    const answer = await composeAnswer(c.question, r, { allowLlm: !!opts.allowLlm });
    // Stay under the provider's tokens-per-minute limit so latency reflects the model, not throttling.
    if (opts.paceMs && answer.llmLatencyMs !== undefined) await new Promise((res) => setTimeout(res, opts.paceMs));
    const titles = r.results.map((x) => x.title);
    const top = r.results[0];
    let verdict: "correct" | "partially correct" | "incorrect";
    if (c.type === "out_of_scope") verdict = r.grounded ? "incorrect" : "correct";
    else if (!r.grounded) verdict = "incorrect";
    else if (c.expected.includes(top.title)) verdict = "correct";
    else if (c.acceptable.includes(top.title) || titles.some((t) => c.expected.includes(t))) verdict = "partially correct";
    else verdict = "incorrect";
    // End-to-end verdict: what the caller actually hears. The LLM may refuse even when retrieval was
    // (wrongly) grounded, e.g. "hair transplant" matching "organ transplant".
    let answerVerdict: typeof verdict = verdict;
    if (opts.allowLlm) {
      if (c.type === "out_of_scope") answerVerdict = answer.grounded ? "incorrect" : "correct";
      else if (!answer.grounded) answerVerdict = "incorrect";
    }
    const shared = top ? [...new Set(tokenize(r.processedQuery))].filter((t) => tokenize(`${top.title} ${top.content}`).includes(t)) : [];
    results.push({
      id: c.id,
      type: c.type,
      question: c.question,
      grounded: r.grounded,
      retrieved: top ? { recordId: top.recordId, title: top.title, content: top.content, category: top.category } : null,
      otherResults: r.results.slice(1).map((x) => `${x.recordId} ${x.title}`),
      sourceReference: top ? `${top.source} (v${top.version}) — ${top.sourceRef}` : null,
      relevanceExplanation:
        c.type === "out_of_scope"
          ? `${r.grounded ? "Retrieval wrongly marked grounded" : `Correctly refused: ${r.reason}`}. ${c.rationale}`
          : `${c.rationale} Retrieved: dense=${top?.denseScore}, bm25=${top?.bm25Score}, shared terms [${shared.slice(0, 6).join(", ")}]${r.intentHint ? `, intent hint '${r.intentHint}'` : ""}.`,
      answer: answer.text,
      verdict,
      latencyMs: r.latencyMs.total,
      answerVerdict: opts.allowLlm ? answerVerdict : undefined,
      answerMode: answer.mode, llmLatencyMs: answer.llmLatencyMs, verifier: answer.verifier, llmError: answer.llmError,
    });
  }
  const count = (v: string) => results.filter((x) => x.verdict === v).length;
  const lat = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const llmLat = results.map((r) => r.llmLatencyMs).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
  const pct = (v: number[], p: number) => (v.length ? v[Math.min(v.length - 1, Math.ceil((p / 100) * v.length) - 1)] : null);
  const llm = opts.allowLlm ? {
    calls: llmLat.length,
    verifierPassed: results.filter((r) => r.verifier === "passed").length,
    verifierRejected: results.filter((r) => r.verifier?.startsWith("LLM answer rejected")).length,
    modelSaidUnavailable: results.filter((r) => r.verifier === "model reported unavailable").length,
    errors: results.filter((r) => r.llmError).length,
    p50LatencyMs: pct(llmLat, 50), p95LatencyMs: pct(llmLat, 95),
    endToEnd: { correct: results.filter((r) => r.answerVerdict === "correct").length, partiallyCorrect: results.filter((r) => r.answerVerdict === "partially correct").length, incorrect: results.filter((r) => r.answerVerdict === "incorrect").length },
    paceMs: opts.paceMs ?? 0,
  } : undefined;
  return {
    ranAt: new Date().toISOString(),
    summary: { total: results.length, correct: count("correct"), partiallyCorrect: count("partially correct"), incorrect: count("incorrect"), p50LatencyMs: lat[Math.floor(lat.length * 0.5)], p95LatencyMs: lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))], coldStartMs, llm },
    results,
  };
}
