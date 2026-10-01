import { int16ToFloat32 } from "@/lib/audio/wav";
import { transcribe } from "@/lib/asr/whisper";

/** Server-side Whisper ASR. Body: raw 16 kHz mono PCM16 little-endian (sent by the browser's Web Audio capture). */
export async function POST(req: Request) {
  const u = new URL(req.url);
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length < 3200) return Response.json({ text: "", latencyMs: 0, note: "audio too short" });
  if (buf.length > 16000 * 2 * 30) return Response.json({ error: "max 30 s per utterance" }, { status: 400 });
  const language = u.searchParams.get("lang") || "english";
  const model = u.searchParams.get("model") || undefined;
  return Response.json(await transcribe(int16ToFloat32(buf), { language, model }));
}
