import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { redactPii } from "@/lib/kb/pii";
import { cleanText, normalizeDate } from "@/lib/kb/clean";
import { chunkSection, splitSentences } from "@/lib/kb/chunk";
import { isNearDuplicate, jaccard, shingles, contentHash } from "@/lib/kb/dedupe";
import { extractSource, canonicalField } from "@/lib/kb/extract";
import { classifyCategory, detectProductLine } from "@/lib/kb/taxonomy";
import { detectConflicts } from "@/lib/kb/facts";
import type { ChunkDraft } from "@/lib/kb/types";

test("PII: emails, phones, Aadhaar, PAN, policy numbers and names are redacted; business contacts kept", () => {
  const r = redactPii("– Rahul Mehta, Pune, rahul.mehta@example.com, +91-99887-66554, PAN ABCPI1234K, Aadhaar 4321 5678 9012, Policy No. DHS-2025-004512. Call 1800-200-3344 or care@dravixhealth.example");
  for (const t of ["EMAIL", "PHONE", "PAN", "AADHAAR", "POLICY_NUMBER", "PERSON_NAME"]) assert.ok(r.types.includes(t), t);
  assert.ok(!r.text.includes("rahul.mehta@example.com") && !r.text.includes("ABCPI1234K"));
  assert.ok(r.text.includes("1800-200-3344") && r.text.includes("care@dravixhealth.example"));
});

test("cleaning: terminology, currency and dates are standardised; invalid dates flagged", () => {
  const r = cleanText("Pre existing illness covered after a 2-year cooling period. Premium Rs. 6,200 from 01-04-2026, updated 31/02/2026.");
  assert.match(r.text, /Pre-existing disease/);
  assert.match(r.text, /waiting period/);
  assert.match(r.text, /₹6,200/);
  assert.match(r.text, /2026-04-01/);
  assert.deepEqual(r.invalidDates, ["31/02/2026"]);
  assert.equal(normalizeDate("1 April 2026").iso, "2026-04-01");
});

test("chunking keeps decimals intact and splits long sections with overlap", () => {
  assert.equal(splitSentences("Ratio is 96.4% this year. Next sentence.").length, 2);
  const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} talks about cover and benefits in detail.`).join(" ");
  const parts = chunkSection(long);
  assert.ok(parts.length > 1);
  const lastOfFirst = splitSentences(parts[0]).at(-1)!;
  assert.ok(parts[1].startsWith(lastOfFirst), "one-sentence overlap");
});

test("dedupe: exact hash ignores formatting; near-duplicate needs lexical or semantic+lexical evidence", () => {
  assert.equal(contentHash("Hello,  World!"), contentHash("hello world"));
  const a = shingles("Show your e-card at the insurance desk of any network hospital. We confirm cashless approval, usually within 1 hour.");
  const b = shingles("Show your e-card at the insurance desk of any network hospital. We confirm the cashless approval, typically within 1 hour.");
  assert.ok(isNearDuplicate(jaccard(a, b), 0.9));
  assert.ok(!isNearDuplicate(0.45, 0.96), "same template, different plan must not merge");
});

test("HTML extraction removes nav, footer, cookie banner and promos", async () => {
  const doc = await extractSource({ id: "t", path: "website/home.html", type: "html", family: "x", version: "1", authority: 1, source: "t", defaultCategory: "company" }, fs.readFileSync("data/raw/website/home.html"));
  const all = doc.sections.map((s) => s.text).join(" ");
  assert.ok(!/Login|Accept all|smartwatch|All rights reserved/.test(all));
  assert.ok(doc.removedLines > 0);
});

test("PDF extraction strips repeated header/footer and page numbers; corrupt PDF fails cleanly", async () => {
  const spec = { id: "b", path: "docs/product-brochure-2026.pdf", type: "pdf" as const, family: "b", version: "1", authority: 2, source: "b", defaultCategory: "product" };
  const doc = await extractSource(spec, fs.readFileSync("data/raw/docs/product-brochure-2026.pdf"));
  const all = doc.sections.map((s) => s.text).join(" ");
  assert.ok(!/Product Brochure 2026|Confidential|Page \d of/.test(all));
  await assert.rejects(extractSource({ ...spec, path: "docs/scanned-proposal-form.pdf" }, fs.readFileSync("data/raw/docs/scanned-proposal-form.pdf")), /PDF parsing failed|no extractable text/);
});

test("form labels map to canonical fields; taxonomy and product line", () => {
  assert.equal(canonicalField("Mobile No."), "phone");
  assert.equal(canonicalField("PED (Y/N)"), "has_pre_existing_disease");
  assert.equal(classifyCategory("company", "Gold Plan", "sum insured room maternity"), "product");
  assert.equal(detectProductLine("The Gold plan offers"), "gold");
});

test("fact conflicts: lower-authority source disagreeing with policy is flagged", () => {
  const base = { sourceId: "s", title: "t", category: "policy", topic: "x", productLine: "all", source: "", sourceRef: "", version: "1", containsPii: false, piiTypes: [], status: "active" as const, contentHash: "", normalizations: [], flags: [], aliases: [] };
  const drafts: ChunkDraft[] = [
    { ...base, key: "policy", authority: 3, source: "policy v2", content: "Pre-existing disease: covered after 36 months of continuous coverage." },
    { ...base, key: "faq", authority: 1, source: "faq", content: "Pre-existing disease (PED) declared is covered after a waiting period of 4 years." },
  ];
  const c = detectConflicts(drafts);
  assert.equal(c.length, 1);
  assert.equal(c[0].flagged.recordKey, "faq");
  assert.equal(c[0].flagged.value, 48);
});
