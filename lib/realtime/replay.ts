/**
 * Real-time replay of a recorded stereo call (L = agent, R = customer). Audio is pushed in
 * 100 ms frames on a wall-clock schedule (drift-corrected), exactly as a live telephony stream
 * would arrive, so transcription and nudges happen while the "call" is still in progress.
 */
import { readWav, resample } from "../audio/wav";
import type { InsightSession } from "./session";

export const REPLAY_FRAME_MS = 100;

export function startReplay(session: InsightSession, wavPath: string, opts: { onDone?: () => void; speed?: number } = {}) {
  const pcm = readWav(wavPath);
  const agent = resample(pcm.channels[0], pcm.sampleRate, 16000);
  const customer = resample(pcm.channels[1] ?? pcm.channels[0], pcm.sampleRate, 16000);
  const frame = (16000 * REPLAY_FRAME_MS) / 1000;
  const total = Math.ceil(agent.length / frame);
  const speed = opts.speed ?? 1;
  const t0 = performance.now();
  let k = 0;
  let cancelled = false;
  const tick = () => {
    if (cancelled) return;
    const now = performance.now();
    // push every frame whose real-time slot has arrived (catches up after event-loop stalls)
    while (k < total && t0 + (k * REPLAY_FRAME_MS) / speed <= now) {
      session.pushAudio("agent", agent.subarray(k * frame, (k + 1) * frame), now);
      session.pushAudio("customer", customer.subarray(k * frame, (k + 1) * frame), now);
      k++;
    }
    if (k >= total) return opts.onDone?.();
    setTimeout(tick, Math.max(0, t0 + (k * REPLAY_FRAME_MS) / speed - performance.now()));
  };
  tick();
  return { durationMs: Math.round((agent.length / 16000) * 1000), cancel: () => { cancelled = true; } };
}
