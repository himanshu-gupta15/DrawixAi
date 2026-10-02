import { prisma } from "@/lib/database/prisma";
import { qdrant, COLLECTION } from "@/lib/vector/qdrant";
import { llmEnabled, llmProvider, LLM_MODEL } from "@/lib/ai/llm";
import { EMBEDDING_MODEL } from "@/lib/embeddings/local";
import { DEFAULT_ASR_MODEL } from "@/lib/asr/whisper";

export async function GET() {
  const status: Record<string, unknown> = {};
  try {
    status.postgres = { ok: true, records: await prisma.kbRecord.count(), calls: await prisma.callSession.count() };
  } catch (e) {
    status.postgres = { ok: false, error: (e as Error).message };
  }
  try {
    const info = await qdrant.getCollection(COLLECTION);
    status.qdrant = { ok: true, points: info.points_count };
  } catch (e) {
    status.qdrant = { ok: false, error: (e as Error).message };
  }
  status.llm = { configured: llmEnabled(), provider: llmProvider(), model: LLM_MODEL, mode: llmEnabled() ? `${llmProvider() === "groq" ? "Groq" : "Claude"} phrasing + grounding verifier` : "extractive (retrieval-only) answers" };
  status.embeddings = { provider: "local transformers.js (ONNX)", model: EMBEDDING_MODEL };
  status.asr = { server: `local Whisper (${DEFAULT_ASR_MODEL})`, browser: "Web Speech API (Chrome/Edge/Safari)" };
  status.tts = { browser: "Web Speech speechSynthesis", tests: "macOS `say` voices for recorded test calls" };
  status.escalationWebhook = !!process.env.ESCALATION_WEBHOOK_URL;
  return Response.json(status);
}
