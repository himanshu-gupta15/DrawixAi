"use client";
/**
 * Browser audio helpers: Web Speech API ASR/TTS and Web Audio microphone capture
 * (AudioWorklet -> 16 kHz PCM16) for server-side Whisper and live streaming.
 */

type SR = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; abort(): void; onresult: ((e: SpeechRecognitionEventLike) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
export interface SpeechRecognitionEventLike { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string; confidence: number } }> }

export function speechRecognitionAvailable() {
  return typeof window !== "undefined" && !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
}

/** Continuous browser ASR; calls onFinal for each finalised utterance. */
export function createRecognizer(lang: string, onFinal: (text: string, confidence: number) => void, onInterim?: (text: string) => void, onError?: (e: string) => void) {
  const Ctor = (window as unknown as { SpeechRecognition?: new () => SR }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;
  if (!Ctor) throw new Error("Web Speech API not available in this browser");
  const r = new Ctor();
  r.lang = lang;
  r.continuous = true;
  r.interimResults = true;
  let active = true;
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) onFinal(res[0].transcript.trim(), res[0].confidence);
      else onInterim?.(res[0].transcript);
    }
  };
  r.onerror = (e) => onError?.(e.error);
  r.onend = () => { if (active) try { r.start(); } catch { /* already started */ } }; // keep listening
  r.start();
  return {
    pause: () => { active = false; r.abort(); },
    resume: () => { active = true; try { r.start(); } catch { /* noop */ } },
    stop: () => { active = false; r.stop(); },
  };
}

export function voicesFor(langPrefixes: string[]) {
  const all = typeof window !== "undefined" ? window.speechSynthesis.getVoices() : [];
  for (const p of langPrefixes) {
    const v = all.find((x) => x.lang.replace("_", "-").toLowerCase().startsWith(p.toLowerCase()));
    if (v) return v;
  }
  return null;
}

/** Speak text with the best available voice for the locale list; resolves when finished. */
export function speak(text: string, langPrefixes: string[]): Promise<{ voice: string | null }> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return resolve({ voice: null });
    const u = new SpeechSynthesisUtterance(text);
    const v = voicesFor(langPrefixes);
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = langPrefixes[0];
    u.rate = 1.0;
    u.onend = () => resolve({ voice: v ? `${v.name} (${v.lang})` : null });
    u.onerror = () => resolve({ voice: v ? `${v.name} (${v.lang})` : null });
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}

function downsampleTo16k(input: Float32Array, rate: number) {
  if (rate === 16000) return input;
  const ratio = rate / 16000, n = Math.floor(input.length / ratio), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * ratio), end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let s = 0; for (let j = start; j < end; j++) s += input[j];
    out[i] = s / Math.max(1, end - start); // box-filter average = cheap anti-aliasing
  }
  return out;
}

export function toInt16(f: Float32Array) {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)));
  return out;
}

/** Microphone capture via AudioWorklet; emits ~100 ms chunks of 16 kHz PCM16. */
export async function startMicCapture(onChunk: (pcm16: Int16Array) => void) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule("/worklets/pcm-capture.js");
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "pcm-capture");
  let buf: number[] = [];
  const chunk = Math.round(ctx.sampleRate / 10);
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    for (const v of e.data) buf.push(v);
    while (buf.length >= chunk) {
      const part = Float32Array.from(buf.slice(0, chunk));
      buf = buf.slice(chunk);
      onChunk(toInt16(downsampleTo16k(part, ctx.sampleRate)));
    }
  };
  src.connect(node);
  return { stop: () => { node.disconnect(); src.disconnect(); stream.getTracks().forEach((t) => t.stop()); void ctx.close(); }, sampleRate: ctx.sampleRate };
}
