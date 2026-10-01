import { prisma } from "@/lib/database/prisma";
import { runIngestion } from "@/lib/kb/ingest";

export async function GET() {
  const run = await prisma.ingestionRun.findFirst({ orderBy: { startedAt: "desc" } });
  return Response.json({ run });
}

export async function POST() {
  return Response.json(await runIngestion());
}
