import fs from "node:fs";
import { loadRetrievalCases, runRetrievalEval } from "@/lib/evaluation/retrieval-eval";
import { prisma } from "@/lib/database/prisma";

async function main() {
  const withLlm = process.argv.includes("--llm"); // phrase answers with the configured LLM (verifier still applies)
  const set = process.argv.slice(2).find((a) => !a.startsWith("--")); // undefined = dev | "heldout" (v1) | "heldout-v2"
  const heldout = !!set;
  const file = set === "heldout-v2" ? "data/test-cases/retrieval-heldout-v2.json" : "data/test-cases/retrieval-heldout.json";
  const report = await runRetrievalEval(heldout ? JSON.parse(fs.readFileSync(file, "utf8")) : loadRetrievalCases(), { allowLlm: withLlm, paceMs: withLlm ? Number(process.env.LLM_PACE_MS ?? 12000) : 0 });
  for (const r of report.results) console.log(`${r.id.padEnd(4)} ${r.verdict.padEnd(18)} ${r.question}\n     -> ${r.retrieved?.recordId ?? "-"} ${r.retrieved?.title ?? ""} | grounded=${r.grounded}\n     answer: ${r.answer}`);
  console.log(report.summary);
  const notes: Record<string, string> = {
    dev: "Development set: also used to tune synonyms and thresholds (see retrieval-calibration.json).",
    heldout: "Held-out v1: first run (before reranker) kept in retrieval-heldout-v1-before-rerank.json; this file is the re-run after adding the cross-encoder reranker (thresholds chosen on dev only).",
    "heldout-v2": "Held-out v2: written before the final changes (reranker + objection paraphrase rule) were finalised; run once; never used for tuning.",
  };
  let out = set === "heldout-v2" ? "docs/evaluation/retrieval-heldout-v2.json" : heldout ? "docs/evaluation/retrieval-heldout.json" : "docs/evaluation/retrieval-eval.json";
  if (withLlm) out = out.replace(".json", "-llm.json"); // extractive results stay in the original files
  fs.writeFileSync(out, JSON.stringify({ ...report, note: notes[set ?? "dev"] + (withLlm ? ` Answers phrased by ${process.env.GROQ_API_KEY ? process.env.GROQ_MODEL || "openai/gpt-oss-120b" : "the configured LLM"} and checked by the grounding verifier.` : "") }, null, 2));
  console.log("wrote", out);
  await prisma.$disconnect();
}
main();
