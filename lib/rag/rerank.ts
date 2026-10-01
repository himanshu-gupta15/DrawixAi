/**
 * Cross-encoder reranker (ms-marco-MiniLM-L-6-v2, local ONNX). Scores each (question, chunk) pair
 * jointly, giving a far better-calibrated relevance signal than embedding cosine — used both to
 * re-order candidates and to decide whether the KB actually answers the question.
 */
import { AutoModelForSequenceClassification, AutoTokenizer, type PreTrainedModel, type PreTrainedTokenizer } from "@huggingface/transformers";
import { shared } from "../models";

export const RERANK_MODEL = process.env.RERANK_MODEL || "Xenova/ms-marco-MiniLM-L-6-v2";

const load = () =>
  shared<{ tok: PreTrainedTokenizer; model: PreTrainedModel }>(`rerank_${RERANK_MODEL}`, async () => ({
    tok: await AutoTokenizer.from_pretrained(RERANK_MODEL),
    model: await AutoModelForSequenceClassification.from_pretrained(RERANK_MODEL, { dtype: "q8" } as never),
  }));

/** Returns one relevance logit per passage (higher = more relevant; ~ >0 relevant, < -5 unrelated). */
export async function rerankScores(query: string, passages: string[]): Promise<number[]> {
  if (!passages.length) return [];
  const { tok, model } = await load();
  const inputs = tok(new Array(passages.length).fill(query), { text_pair: passages, padding: true, truncation: true, max_length: 256 });
  const { logits } = (await model(inputs)) as { logits: { data: Float32Array } };
  return Array.from(logits.data);
}
