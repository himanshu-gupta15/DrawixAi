/* eslint-disable @typescript-eslint/no-explicit-any */
/** Reads the saved evaluation JSON (docs/evaluation). Pages show these measured results, never hand-typed numbers. */
import fs from "node:fs";
import path from "node:path";

export function readReport(file: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "docs/evaluation", file), "utf8"));
  } catch {
    return null;
  }
}

export function loadReports() {
  return {
    ingestion: readReport("ingestion-report.json"),
    retrieval: readReport("retrieval-eval.json"),
    heldoutV1Before: readReport("retrieval-heldout-v1-before-rerank.json"),
    heldoutV1: readReport("retrieval-heldout.json"),
    heldoutV2: readReport("retrieval-heldout-v2.json"),
    calls: readReport("q1-test-calls.json"),
    q3: readReport("q3-tests-heldout-v2.json"),
    q3v1: readReport("q3-tests-heldout-v1.json"),
    q3Asr: readReport("q3-asr.json"),
    q4: readReport("q4-benchmark.json"),
    unit: readReport("unit-tests.json"),
  };
}
