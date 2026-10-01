import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { shared } from "../models";

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "Xenova/multilingual-e5-small";
export const EMBEDDING_DIM = 384;

const extractor = () =>
  shared<FeatureExtractionPipeline>(`emb_${EMBEDDING_MODEL}`, async () =>
    (await pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "q8" })) as FeatureExtractionPipeline,
  );

async function embed(texts: string[]): Promise<number[][]> {
  const ex = await extractor();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 16) {
    const t = await ex(texts.slice(i, i + 16), { pooling: "mean", normalize: true });
    out.push(...(t.tolist() as number[][]));
  }
  return out;
}

// e5 models are trained with asymmetric "query:" / "passage:" prefixes.
export const embedPassages = (texts: string[]) => embed(texts.map((t) => `passage: ${t}`));
export const embedQuery = async (q: string) => (await embed([`query: ${q}`]))[0];
export const embedQueries = (qs: string[]) => embed(qs.map((q) => `query: ${q}`));

export function cosine(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // vectors are L2-normalised
}
