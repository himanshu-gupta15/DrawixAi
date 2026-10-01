/**
 * Offline TTS for generating test-call audio with macOS `say` (used only by test/evidence
 * scripts, never on the live path). Output: 16 kHz mono float PCM.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readWav } from "./wav";

export function sayToPcm(text: string, voice: string, rate?: number): Float32Array {
  const tmp = path.join(os.tmpdir(), `say_${process.pid}_${Math.random().toString(36).slice(2)}.wav`);
  const args = ["-v", voice, "--data-format=LEI16@16000", "-o", tmp];
  if (rate) args.push("-r", String(rate));
  // `say` occasionally stalls on macOS; bound it and retry once.
  for (let attempt = 0; ; attempt++) {
    try { execFileSync("say", [...args, text], { timeout: 30000 }); break; }
    catch (e) { if (attempt >= 1) throw e; }
  }
  const pcm = readWav(tmp).channels[0];
  fs.unlinkSync(tmp);
  return pcm;
}

export function sayAvailable() {
  try { execFileSync("say", ["-v", "?"], { stdio: "ignore" }); return true; } catch { return false; }
}

/** Places mono clips on a stereo timeline: channel 0 = agent, channel 1 = customer. */
export function buildStereo(clips: { channel: 0 | 1; pcm: Float32Array; gapAfterMs: number }[], sampleRate = 16000) {
  const timeline: { channel: number; startMs: number; endMs: number }[] = [];
  let t = Math.round(0.4 * sampleRate);
  for (const c of clips) {
    timeline.push({ channel: c.channel, startMs: Math.round((t / sampleRate) * 1000), endMs: Math.round(((t + c.pcm.length) / sampleRate) * 1000) });
    t += c.pcm.length + Math.round((c.gapAfterMs / 1000) * sampleRate);
  }
  const len = t + Math.round(0.6 * sampleRate);
  const ch = [new Float32Array(len), new Float32Array(len)];
  let pos = Math.round(0.4 * sampleRate);
  clips.forEach((c) => { ch[c.channel].set(c.pcm, pos); pos += c.pcm.length + Math.round((c.gapAfterMs / 1000) * sampleRate); });
  return { channels: ch, timeline };
}

/** Adds coloured noise to reach a target SNR relative to the speech level. */
export function addNoise(channels: Float32Array[], snrDb: number, seed = 7) {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  const speechRms = Math.sqrt(channels.flatMap((c) => Array.from(c.filter((v) => Math.abs(v) > 0.02))).reduce((a, v) => a + v * v, 0) / Math.max(1, channels.reduce((n, c) => n + c.filter((v) => Math.abs(v) > 0.02).length, 0)));
  const noiseRms = speechRms / 10 ** (snrDb / 20);
  for (const c of channels) {
    let lp = 0;
    for (let i = 0; i < c.length; i++) {
      lp = 0.85 * lp + 0.15 * rand(); // low-passed (traffic-like) noise
      const hum = 0.3 * Math.sin((2 * Math.PI * 100 * i) / 16000);
      c[i] = Math.max(-1, Math.min(1, c[i] + noiseRms * 2.2 * (lp + hum * 0.3)));
    }
  }
}
