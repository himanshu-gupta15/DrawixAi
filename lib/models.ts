import { env } from "@huggingface/transformers";
import path from "node:path";

// Local ONNX models (transformers.js) are cached in ./.models (or /tmp/.models on Vercel).
env.cacheDir = process.env.VERCEL ? path.join("/tmp", ".models") : path.join(process.cwd(), ".models");

/** Memoise a heavy async resource on globalThis so every module graph in the process shares it. */
export function shared<T>(key: string, create: () => Promise<T>): Promise<T> {
  const g = globalThis as unknown as Record<string, Promise<T> | undefined>;
  const k = `__dravix_${key}`;
  if (!g[k]) {
    g[k] = create().catch((e) => {
      g[k] = undefined;
      throw e;
    });
  }
  return g[k]!;
}
