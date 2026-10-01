import { prisma } from "@/lib/database/prisma";
import { startCall } from "@/lib/voice/service";

export async function GET() {
  const calls = await prisma.callSession.findMany({ where: { market: "IN" }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, channel: true, status: true, outcome: true, createdAt: true } });
  return Response.json({ calls });
}

export async function POST() {
  return Response.json(await startCall("web"));
}
