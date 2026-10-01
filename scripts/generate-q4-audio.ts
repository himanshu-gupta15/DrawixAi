/** Generates the Q4 stereo test calls (L = agent, R = customer) from data/test-cases/q4-scenarios.json. */
import fs from "node:fs";
import { addNoise, buildStereo, sayToPcm } from "@/lib/audio/tts-say";
import { writeWav } from "@/lib/audio/wav";

const scenarios = JSON.parse(fs.readFileSync("data/test-cases/q4-scenarios.json", "utf8"));
for (const sc of scenarios) {
  const clips = sc.lines.map((l: { s: string; t: string }) => ({ channel: (l.s === "agent" ? 0 : 1) as 0 | 1, pcm: sayToPcm(l.t, sc.voices[l.s]), gapAfterMs: 700 }));
  const { channels, timeline } = buildStereo(clips);
  if (sc.noise) addNoise(channels, sc.noise.snrDb);
  writeWav(`public/audio/q4/${sc.id}.wav`, { sampleRate: 16000, channels });
  const lines = sc.lines.map((l: { s: string; t: string; label?: string }, i: number) => ({ ...l, ...timeline[i] }));
  fs.writeFileSync(`data/audio/q4/${sc.id}.timeline.json`, JSON.stringify({ id: sc.id, durationMs: Math.round((channels[0].length / 16000) * 1000), lines }, null, 2));
  console.log(`${sc.id}: ${(channels[0].length / 16000).toFixed(1)} s`);
}
