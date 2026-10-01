import { prisma } from "@/lib/database/prisma";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const where: Record<string, unknown> = {};
  if (u.searchParams.get("category")) where.category = u.searchParams.get("category");
  if (u.searchParams.get("status")) where.status = u.searchParams.get("status");
  const q = u.searchParams.get("q");
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }];
  const records = await prisma.kbRecord.findMany({ where, orderBy: { recordId: "asc" } });
  return Response.json({ records });
}
