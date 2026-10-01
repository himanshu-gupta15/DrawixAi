/**
 * Local speech recognition with Whisper (transformers.js / ONNX, CPU). No API key needed.
 * Model choice: whisper-base (~0.6 s for 5 s audio on Apple M4) for live paths;
 * whisper-small is more accurate for Tagalog/Indonesian and is used in the Q3 ASR tests.
 */
import { pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import { shared } from "../models";

export const DEFAULT_ASR_MODEL = process.env.ASR_MODEL || "Xenova/whisper-base";

const asr = (model: string) =>
  shared<AutomaticSpeechRecognitionPipeline>(`asr_${model}`, async () =>
    (await pipeline("automatic-speech-recognition", model, { dtype: "q8" } as never)) as AutomaticSpeechRecognitionPipeline,
  );

// Serialise inference per model: ONNX sessions are not re-entrant and concurrent calls only add latency.
const queues = new Map<string, Promise<unknown>>();

export interface AsrResult { text: string; latencyMs: number; model: string; audioSec: number; queuedMs: number }

export async function transcribe(audio16k: Float32Array, opts: { language?: string; model?: string } = {}): Promise<AsrResult> {
  const model = opts.model ?? DEFAULT_ASR_MODEL;
  const enq = performance.now();
  const prev = queues.get(model) ?? Promise.resolve();
  const run = prev.then(async () => {
    const started = performance.now();
    const p = await asr(model);
    const out = (await p(audio16k, { language: opts.language, task: "transcribe", chunk_length_s: 30 } as never)) as { text: string };
    return { text: out.text.trim(), latencyMs: Math.round(performance.now() - started), model, audioSec: +(audio16k.length / 16000).toFixed(2), queuedMs: Math.round(started - enq) };
  });
  queues.set(model, run.catch(() => {}));
  return run;
}

export const warmupAsr = (model = DEFAULT_ASR_MODEL) => asr(model).then(() => true);

/** Word error rate (Levenshtein over normalised words) — used to report ASR quality honestly. */
export function wer(reference: string, hypothesis: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean);
  const r = norm(reference), h = norm(hypothesis);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return r.length ? d[r.length][h.length] / r.length : 0;
}
