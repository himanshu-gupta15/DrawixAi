/**
 * Q3 ASR measurement per market: synthesized utterances (macOS voices) -> local Whisper
 * (base vs small, forced language vs auto-detect) -> WER + latency. Writes docs/evaluation/q3-asr.json.
 * Caveat (also in the report): synthetic TTS speech is cleaner than real phone audio.
 */
import fs from "node:fs";
import { sayToPcm } from "@/lib/audio/tts-say";
import { transcribe, wer } from "@/lib/asr/whisper";

const MODELS = ["Xenova/whisper-base", "Xenova/whisper-small"];

async function main() {
  const cfg = JSON.parse(fs.readFileSync("data/test-cases/q3-asr.json", "utf8"));
  const rows = [];
  for (const market of ["PH", "ID"] as const) {
    const m = cfg[market];
    for (const voice of Object.keys(m.voices)) {
      for (const u of m.utterances) {
        const pcm = sayToPcm(u.text, voice);
        for (const model of MODELS) {
          // transformers.js Whisper has no auto language-ID (it silently defaults to English), so we
          // compare forcing the market language vs forcing English on the same code-switched audio.
          for (const language of [m.language, "english"]) {
            const r = await transcribe(pcm, { model, language });
            rows.push({ market, category: u.category, voice, model, language, reference: u.text, hypothesis: r.text, wer: +wer(u.text, r.text).toFixed(2), latencyMs: r.latencyMs, audioSec: r.audioSec });
            process.stdout.write(".");
          }
        }
      }
    }
  }
  const agg: Record<string, { n: number; wer: number; ms: number }> = {};
  for (const r of rows) {
    const k = `${r.market} | ${r.voice} | ${r.model.replace("Xenova/", "")} | ${r.language}`;
    agg[k] ??= { n: 0, wer: 0, ms: 0 };
    agg[k].n++; agg[k].wer += r.wer; agg[k].ms += r.latencyMs;
  }
  const summary = Object.entries(agg).map(([k, v]) => ({ config: k, meanWer: +(v.wer / v.n).toFixed(3), meanLatencyMs: Math.round(v.ms / v.n), n: v.n }));
  const byCat: Record<string, { n: number; wer: number }> = {};
  for (const r of rows.filter((r) => r.model.endsWith("small") && r.language !== "english")) {
    const k = `${r.market} | ${r.voice} | ${r.category}`;
    byCat[k] ??= { n: 0, wer: 0 };
    byCat[k].n++; byCat[k].wer += r.wer;
  }
  const categories = Object.entries(byCat).map(([k, v]) => ({ config: k, meanWer: +(v.wer / v.n).toFixed(3) }));
  fs.writeFileSync("docs/evaluation/q3-asr.json", JSON.stringify({ ranAt: new Date().toISOString(), caveat: "Speech is synthesized by macOS voices, not recorded from native speakers; WER on real phone audio will be higher. The Malay voice is only a proxy for a non-Jakarta accent.", voices: { PH: cfg.PH.voices, ID: cfg.ID.voices }, summary, categoriesWhisperSmallForced: categories, rows }, null, 2));
  console.log("\n");
  console.table(summary);
  console.table(categories);
}
main();
