import fs from "node:fs";
import { runRetrievalEval } from "@/lib/evaluation/retrieval-eval";

export async function GET() {
  const p = "docs/evaluation/retrieval-eval.json";
  return Response.json(fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
}

export async function POST() {
  const report = await runRetrievalEval();
  fs.writeFileSync("docs/evaluation/retrieval-eval.json", JSON.stringify(report, null, 2));
  return Response.json(report);
}
