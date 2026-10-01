/** Rebuilds the knowledge base from data/raw (+ uploads) into Postgres + Qdrant. */
import fs from "node:fs";
import { runIngestion } from "@/lib/kb/ingest";
import { prisma } from "@/lib/database/prisma";

async function main() {
  const report = await runIngestion({ log: (s) => console.log("  " + s) });
  console.log("\nStats:", report.stats);
  console.log("\nIssues:");
  for (const i of report.issues) console.log(` [${i.severity}] ${i.sourceId} ${i.type}: ${i.message}`);
  fs.mkdirSync("docs/evaluation", { recursive: true });
  fs.writeFileSync("docs/evaluation/ingestion-report.json", JSON.stringify(report, null, 2));
  console.log(`\nDone in ${report.durationMs} ms -> docs/evaluation/ingestion-report.json`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
