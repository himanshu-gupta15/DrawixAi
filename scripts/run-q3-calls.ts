/**
 * Q3 recorded calls (2 per market): synthesized caller -> Whisper-small (market language) -> localized
 * bot engine (on the ASR text) -> bot reply TTS -> stereo WAV (L = bot, R = caller) + transcript.
 * Bot voices: ID = Damayanti (native id_ID). PH = no Filipino voice installed; Tagalog/Taglish replies
 * use Damayanti (lowest measured WER on Tagalog among installed voices), English replies use Samantha.
 */
import fs from "node:fs";
import { buildStereo, sayToPcm } from "@/lib/audio/tts-say";
import { writeWav } from "@/lib/audio/wav";
import { transcribe, wer } from "@/lib/asr/whisper";
import { greetingFor, initialMlState, loadPack, mlTurn, type Market } from "@/lib/multilingual/engine";

const OUT = "public/recordings/q3";
const botVoice = (market: Market, variant: string) => (market === "ID" ? "Damayanti" : variant === "en" ? "Samantha" : "Damayanti");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const calls = JSON.parse(fs.readFileSync("data/test-cases/q3-calls.json", "utf8")) as { id: string; market: Market; title: string; customerVoice: string; turns: (string | { t: string; alt: string })[] }[];
  const summary = [];
  for (const c of calls) {
    const pack = loadPack(c.market);
    let state = initialMlState(c.market);
    const g = greetingFor(c.market);
    const clips: { channel: 0 | 1; pcm: Float32Array; gapAfterMs: number }[] = [{ channel: 0, pcm: sayToPcm(g.ttsText, botVoice(c.market, g.variant)), gapAfterMs: 500 }];
    const md: string[] = [`# ${c.title}`, "", `Market ${c.market} · ${pack.sector} · caller voice \`${c.customerVoice}\` (synthetic) · ASR Whisper-small (${pack.asr.whisperLanguage}) · bot TTS ${c.market === "ID" ? "Damayanti (id_ID)" : "Damayanti for Tagalog/Taglish, Samantha for English (no fil-PH voice available)"}`, "", `Recording: [${c.id}.wav](./${c.id}.wav) (left = bot, right = caller)`, "", "## Transcript", "", `**Bot (${g.variant}):** ${g.reply}`];
    const wers: number[] = [];
    let last;
    // Like a real caller, repeat once in other words when the bot asks to repeat (fallback).
    const queue: string[] = [];
    let alt: string | null = null;
    for (let i = 0; i < c.turns.length || queue.length; ) {
      let line: string;
      if (queue.length) line = queue.shift()!;
      else { const l = c.turns[i++]; line = typeof l === "string" ? l : l.t; alt = typeof l === "string" ? null : l.alt; }
      const pcm = sayToPcm(line, c.customerVoice);
      const asr = await transcribe(pcm, { model: "Xenova/whisper-small", language: pack.asr.whisperLanguage });
      const w = wer(line, asr.text);
      wers.push(w);
      clips.push({ channel: 1, pcm, gapAfterMs: 500 });
      const r = await mlTurn(state, asr.text);
      state = r.state;
      last = r;
      const d = r.detection as { variant?: string; register?: string; regional?: string | null };
      md.push(`**Caller (ASR):** ${asr.text}  \n  _scripted: "${line}" · WER ${w.toFixed(2)} · ASR ${asr.latencyMs} ms · detected ${d.variant ?? d.register}${d.regional ? ` / ${d.regional}` : ""}_`);
      md.push(`**Bot (${r.variant}):** ${r.reply}  \n  _intent ${r.intent} · conf ${r.confidence} · ${r.method}_`);
      clips.push({ channel: 0, pcm: sayToPcm(r.ttsText, botVoice(c.market, r.variant)), gapAfterMs: 500 });
      if (r.ended) break;
      if (alt && r.method === "fallback") { queue.push(alt); alt = null; }
    }
    const { channels } = buildStereo(clips);
    writeWav(`${OUT}/${c.id}.wav`, { sampleRate: 16000, channels });
    const meanWer = +(wers.reduce((a, b) => a + b, 0) / wers.length).toFixed(3);
    md.push("", "## Result", "", `- Outcome: ${state.outcome ?? "-"} · escalated: ${state.escalated} · ended: ${state.stage === "ended"} · mean caller WER ${meanWer}`, `- Reply variants used: ${[...new Set(state.variantHistory)].join(", ")}`, "");
    fs.writeFileSync(`${OUT}/${c.id}.md`, md.join("\n"));
    summary.push({ id: c.id, market: c.market, title: c.title, outcome: state.outcome, escalated: state.escalated, meanWer, lastIntent: last?.intent, recording: `recordings/q3/${c.id}.wav` });
    console.log(`${c.id.padEnd(45)} outcome=${state.outcome} escalated=${state.escalated} WER=${meanWer}`);
  }
  fs.writeFileSync("docs/evaluation/q3-calls.json", JSON.stringify({ ranAt: new Date().toISOString(), calls: summary }, null, 2));
}
main();
