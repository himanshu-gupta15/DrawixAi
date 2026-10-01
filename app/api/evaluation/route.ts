import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "docs/evaluation");
const read = (f: string) => (fs.existsSync(path.join(DIR, f)) ? JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) : null);

/** Saved evidence produced by the test/benchmark scripts (never generated on request). */
export async function GET() {
  return Response.json({
    ingestion: read("ingestion-report.json"),
    retrieval: read("retrieval-eval.json"),
    retrievalHeldout: read("retrieval-heldout.json"),
    voiceCalls: read("q1-test-calls.json"),
    multilingual: read("q3-tests.json"),
    multilingualAsr: read("q3-asr.json"),
    insights: read("q4-benchmark.json"),
    unitTests: read("unit-tests.json"),
  });
}
