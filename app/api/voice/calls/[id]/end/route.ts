import { endCall } from "@/lib/voice/service";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return Response.json(await endCall(id));
}
