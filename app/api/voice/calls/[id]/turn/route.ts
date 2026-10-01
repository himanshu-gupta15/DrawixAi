import { callTurn } from "@/lib/voice/service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { text, asr } = (await req.json()) as { text?: string; asr?: Record<string, unknown> };
  if (typeof text !== "string") return Response.json({ error: "text is required" }, { status: 400 });
  try {
    return Response.json(await callTurn(id, text.slice(0, 1000), asr ?? {}));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
