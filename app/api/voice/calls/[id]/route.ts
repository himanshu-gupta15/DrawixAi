import { prisma } from "@/lib/database/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const call = await prisma.callSession.findUnique({ where: { id }, include: { actions: { orderBy: { createdAt: "asc" } } } });
  if (!call) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ call });
}
