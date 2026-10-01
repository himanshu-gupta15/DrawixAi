import { mlCallTurn } from "@/lib/multilingual/service";

export async function POST(req: Request) {
  const { callId, text } = (await req.json()) as { callId?: string; text?: string };
  if (!callId || typeof text !== "string") return Response.json({ error: "callId and text are required" }, { status: 400 });
  try {
    return Response.json(await mlCallTurn(callId, text.slice(0, 500)));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
