import { QdrantClient } from "@qdrant/js-client-rest";
import crypto from "node:crypto";
import { EMBEDDING_DIM } from "../embeddings/local";

export const COLLECTION = "kb_records";
const g = globalThis as unknown as { __qdrant?: QdrantClient };
export const qdrant =
  g.__qdrant ??
  (g.__qdrant = new QdrantClient({
    url: process.env.VECTOR_DATABASE_URL || "http://localhost:6333",
    apiKey: process.env.VECTOR_DATABASE_API_KEY || process.env.QDRANT_API_KEY,
    checkCompatibility: false,
  }));

/** Qdrant point ids must be UUIDs or integers; derive a stable UUID from the record id. */
export function pointId(recordId: string) {
  const h = crypto.createHash("md5").update(recordId).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export async function recreateCollection() {
  const { collections } = await qdrant.getCollections();
  if (collections.some((c) => c.name === COLLECTION)) await qdrant.deleteCollection(COLLECTION);
  await qdrant.createCollection(COLLECTION, { vectors: { size: EMBEDDING_DIM, distance: "Cosine" } });
  await qdrant.createPayloadIndex(COLLECTION, { field_name: "status", field_schema: "keyword" });
  await qdrant.createPayloadIndex(COLLECTION, { field_name: "category", field_schema: "keyword" });
}

export type VectorPayload = { record_id: string; category: string; status: string; product_line: string; version: string; title: string };

export async function upsertPoints(points: { recordId: string; vector: number[]; payload: VectorPayload }[]) {
  for (let i = 0; i < points.length; i += 64) {
    await qdrant.upsert(COLLECTION, {
      wait: true,
      points: points.slice(i, i + 64).map((p) => ({ id: pointId(p.recordId), vector: p.vector, payload: p.payload })),
    });
  }
}

export async function searchVectors(vector: number[], limit = 20, category?: string) {
  const must: { key: string; match: { value: string } }[] = [{ key: "status", match: { value: "active" } }];
  if (category) must.push({ key: "category", match: { value: category } });
  const res = await qdrant.query(COLLECTION, { query: vector, limit, filter: { must }, with_payload: true });
  return res.points.map((r) => ({ recordId: (r.payload as VectorPayload).record_id, score: r.score }));
}
