// Integration: needs Postgres + Qdrant running and `npm run ingest` done.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { retrieve } from "@/lib/rag/retrieve";
import { composeAnswer, verifyLlmAnswer } from "@/lib/rag/answer";
import { prisma } from "@/lib/database/prisma";

after(() => prisma.$disconnect());

test("in-scope question is grounded and cited from the current policy (not superseded/flagged records)", async () => {
  const r = await retrieve("What is the waiting period for pre-existing diseases?", { log: false });
  assert.ok(r.grounded);
  const a = await composeAnswer("What is the waiting period for pre-existing diseases?", r, { allowLlm: false });
  assert.match(a.text, /36 months/);
  assert.ok(!/48|4 years/.test(a.text));
  assert.ok(a.citations[0].recordId.startsWith("kb_"));
});

test("out-of-domain and unknown questions are refused instead of guessed", async () => {
  for (const q of ["Do you sell car insurance?", "Is IVF treatment covered?"]) {
    const r = await retrieve(q, { log: false });
    const a = await composeAnswer(q, r, { allowLlm: false });
    assert.equal(a.grounded, false, q);
    assert.match(a.text, /don't have verified information/);
  }
});

test("LLM verifier rejects unknown citations and invented numbers", () => {
  const recs = [{ recordId: "kb_faq_001", title: "Grace", content: "Grace period is 30 days.", category: "faq", productLine: "all", source: "", sourceRef: "", version: "1", denseScore: 0.9, bm25Score: 5, fusedScore: 0.01, rerankScore: 5 }];
  assert.equal(verifyLlmAnswer("You have 30 days.", ["kb_faq_001"], recs), null);
  assert.match(verifyLlmAnswer("You have 45 days.", ["kb_faq_001"], recs)!, /numbers not in sources/);
  assert.match(verifyLlmAnswer("You have 30 days.", ["kb_faq_999"], recs)!, /unknown records/);
});
