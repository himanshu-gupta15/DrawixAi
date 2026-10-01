/** Prints dense/BM25 score distributions for in-scope vs out-of-scope queries to set grounding thresholds. */
import fs from "node:fs";
import { retrieve } from "@/lib/rag/retrieve";
import { prisma } from "@/lib/database/prisma";

async function main() {
  const cases = JSON.parse(fs.readFileSync("data/test-cases/retrieval-calibration.json", "utf8"));
  const rows: Record<string, unknown>[] = [];
  for (const c of cases.in_scope) {
    const r = await retrieve(c.q, { log: false });
    const top = r.results[0];
    const hit = new RegExp(`^(${c.expect.split("|").map((s: string) => s.replace(/[.*+?^${}()[\]\\]/g, "\\$&")).join("|")})$`).test(top?.title ?? "");
    rows.push({ set: "in", q: c.q, top: top?.title, hit, dense: top?.denseScore, rerank: top?.rerankScore, grounded: r.grounded });
  }
  for (const q of cases.out_of_scope) {
    const r = await retrieve(q, { log: false });
    const top = r.results[0];
    rows.push({ set: "out", q, top: top?.title, dense: top?.denseScore, rerank: top?.rerankScore, grounded: r.grounded });
  }
  const dev = JSON.parse(fs.readFileSync("data/test-cases/retrieval-eval.json", "utf8"));
  for (const c of dev) {
    const r = await retrieve(c.question, { log: false });
    rows.push({ set: c.type === "out_of_scope" ? "dev-out" : "dev-in", q: c.question, top: r.results[0]?.title, hit: c.expected.includes(r.results[0]?.title), dense: r.results[0]?.denseScore, rerank: r.results[0]?.rerankScore, grounded: r.grounded });
  }
  if (process.env.QUIET !== "1") console.table(rows.map((r) => ({ ...r, q: String(r.q).slice(0, 45), top: String(r.top).slice(0, 35) })));
  const inn = rows.filter((r) => String(r.set).endsWith("in")), out = rows.filter((r) => String(r.set).endsWith("out"));
  const summary = { inScope: inn.length, top1Hit: inn.filter((r) => r.hit).length, hitAndGrounded: inn.filter((r) => r.hit && r.grounded).length, falseRefusals: inn.filter((r) => !r.grounded).length, outOfScope: out.length, wronglyGrounded: out.filter((r) => r.grounded).length };
  console.log(JSON.stringify(summary));
  if (process.env.SAVE !== "0") fs.writeFileSync("docs/evaluation/retrieval-calibration.json", JSON.stringify({ summary, rows }, null, 2));
  await prisma.$disconnect();
}
main();
