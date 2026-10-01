/** Minimal PCM WAV utilities (16-bit). Used for test-call recordings and real-time replay. */
import fs from "node:fs";

export interface Pcm {
  sampleRate: number;
  channels: Float32Array[]; // one Float32Array per channel, values in [-1, 1]
}

export function readWav(path: string): Pcm {
  return decodeWav(fs.readFileSync(path));
}

export function decodeWav(b: Buffer): Pcm {
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV file");
  let off = 12, sampleRate = 16000, numCh = 1, bits = 16;
  while (off + 8 <= b.length) {
    const id = b.toString("ascii", off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === "fmt ") {
      numCh = b.readUInt16LE(off + 10);
      sampleRate = b.readUInt32LE(off + 12);
      bits = b.readUInt16LE(off + 22);
    } else if (id === "data") {
      if (bits !== 16) throw new Error(`unsupported bit depth ${bits}`);
      const frames = Math.floor(Math.min(size, b.length - off - 8) / (2 * numCh));
      const channels = Array.from({ length: numCh }, () => new Float32Array(frames));
      for (let i = 0; i < frames; i++) for (let c = 0; c < numCh; c++) channels[c][i] = b.readInt16LE(off + 8 + (i * numCh + c) * 2) / 32768;
      return { sampleRate, channels };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}

export function encodeWav(pcm: Pcm): Buffer {
  const numCh = pcm.channels.length, frames = pcm.channels[0].length;
  const b = Buffer.alloc(44 + frames * numCh * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + frames * numCh * 2, 4); b.write("WAVE", 8);
  b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(numCh, 22);
  b.writeUInt32LE(pcm.sampleRate, 24); b.writeUInt32LE(pcm.sampleRate * numCh * 2, 28); b.writeUInt16LE(numCh * 2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(frames * numCh * 2, 40);
  for (let i = 0; i < frames; i++) for (let c = 0; c < numCh; c++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm.channels[c][i] * 32767))), 44 + (i * numCh + c) * 2);
  return b;
}

export function writeWav(path: string, pcm: Pcm) {
  fs.writeFileSync(path, encodeWav(pcm));
}

/** Linear-interpolation resampler (adequate for speech -> 16 kHz ASR input). */
export function resample(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x;
  const n = Math.round((x.length * to) / from);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const pos = (i * from) / to, i0 = Math.floor(pos), f = pos - i0;
    out[i] = (x[i0] ?? 0) * (1 - f) + (x[i0 + 1] ?? x[i0] ?? 0) * f;
  }
  return out;
}

export const toMono = (p: Pcm) => (p.channels.length === 1 ? p.channels[0] : p.channels[0].map((v, i) => p.channels.reduce((s, c) => s + c[i], 0) / p.channels.length));

export function rms(x: Float32Array) {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / (x.length || 1));
}

export function int16ToFloat32(buf: Buffer): Float32Array {
  const out = new Float32Array(Math.floor(buf.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(i * 2) / 32768;
  return out;
}
