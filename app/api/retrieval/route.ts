import { composeAnswer } from "@/lib/rag/answer";
import { retrieve } from "@/lib/rag/retrieve";

export async function POST(req: Request) {
  const { query, k } = (await req.json()) as { query?: string; k?: number };
  if (!query?.trim()) return Response.json({ error: "query is required" }, { status: 400 });
  const retrieval = await retrieve(query.trim(), { k: Math.min(Math.max(k ?? 3, 1), 10) });
  const answer = await composeAnswer(query.trim(), retrieval);
  return Response.json({ retrieval, answer });
}
