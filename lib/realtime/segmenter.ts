/**
 * Streaming speech segmenter (energy VAD with an adaptive noise floor), one per audio channel.
 * Emits an utterance when speech is followed by END_SILENCE_MS of silence, or every MAX_SEGMENT_MS
 * during long speech so transcription keeps streaming instead of waiting for the speaker to stop.
 */
import { rms } from "../audio/wav";

export const FRAME_MS = 20;
export const END_SILENCE_MS = 500;
export const MIN_SPEECH_MS = 300;
export const MAX_SEGMENT_MS = 6000;

export interface Segment {
  channel: string;
  startMs: number; // call-relative time of first speech frame
  endMs: number;
  audio: Float32Array;
  snrDb: number;
  receivedAt: number; // wall-clock (performance.now) when the segment's last audio frame arrived
  forced: boolean; // cut at MAX_SEGMENT_MS rather than at a pause
}

export class Segmenter {
  private noiseFloor = 0.003;
  private recentEnergy: number[] = []; // last 2 s of frame energies (minimum-statistics noise floor)
  private speech: Float32Array[] = [];
  private speechFrames = 0;
  private silenceFrames = 0;
  private startMs = 0;
  private speechEnergy = 0;
  private callMs = 0;
  private pending = new Float32Array(0);
  private lastReceivedAt = 0;

  constructor(private channel: string, private onSegment: (s: Segment) => void, private sampleRate = 16000) {}

  /** Push any amount of audio; it is cut into 20 ms frames internally. */
  push(samples: Float32Array, receivedAt = performance.now()) {
    this.lastReceivedAt = receivedAt;
    const buf = new Float32Array(this.pending.length + samples.length);
    buf.set(this.pending);
    buf.set(samples, this.pending.length);
    const frameLen = (this.sampleRate * FRAME_MS) / 1000;
    let i = 0;
    for (; i + frameLen <= buf.length; i += frameLen) this.frame(buf.subarray(i, i + frameLen));
    this.pending = buf.slice(i);
  }

  private frame(f: Float32Array) {
    const e = rms(f);
    // Noise floor = 10th percentile of recent frame energy. Unlike "update only on silence", this
    // adapts even when continuous background noise is (initially) above the speech threshold.
    this.recentEnergy.push(e);
    if (this.recentEnergy.length > 100) this.recentEnergy.shift();
    if (this.recentEnergy.length >= 10) {
      const sorted = [...this.recentEnergy].sort((a, b) => a - b);
      this.noiseFloor = 0.9 * this.noiseFloor + 0.1 * Math.max(0.001, sorted[Math.floor(sorted.length * 0.1)]);
    }
    const threshold = Math.max(0.01, this.noiseFloor * 3.2);
    const isSpeech = e > threshold;
    if (isSpeech) {
      if (!this.speech.length) this.startMs = this.callMs;
      this.speech.push(f.slice());
      this.speechFrames++;
      this.silenceFrames = 0;
      this.speechEnergy += e;
    } else if (this.speech.length) {
      this.speech.push(f.slice());
      this.silenceFrames++;
    }
    this.callMs += FRAME_MS;
    const durMs = this.speech.length * FRAME_MS;
    if (this.speech.length && this.silenceFrames * FRAME_MS >= END_SILENCE_MS) this.flush(false);
    else if (durMs >= MAX_SEGMENT_MS) this.flush(true);
  }

  flush(forced = false) {
    if (!this.speech.length) return;
    const speechMs = this.speechFrames * FRAME_MS;
    const frames = forced ? this.speech : this.speech.slice(0, this.speech.length - this.silenceFrames + 5); // keep 100 ms tail
    const audio = new Float32Array(frames.reduce((n, f) => n + f.length, 0));
    let o = 0;
    for (const f of frames) { audio.set(f, o); o += f.length; }
    const meanSpeech = this.speechEnergy / Math.max(1, this.speechFrames);
    const snrDb = 20 * Math.log10(meanSpeech / Math.max(1e-4, this.noiseFloor));
    const seg: Segment = { channel: this.channel, startMs: this.startMs, endMs: this.startMs + frames.length * FRAME_MS, audio, snrDb: Math.round(snrDb * 10) / 10, receivedAt: this.lastReceivedAt, forced };
    this.speech = []; this.speechFrames = 0; this.silenceFrames = 0; this.speechEnergy = 0;
    if (speechMs >= MIN_SPEECH_MS) this.onSegment(seg);
  }
}
