/**
 * Q1 recorded test calls. Each scripted caller line is synthesised (macOS `say`), transcribed by the
 * local Whisper model, and the *ASR output* (with its errors) is sent to the real agent/service.
 * Agent replies are synthesised too, and both sides are written to a stereo WAV
 * (L = agent, R = customer) with a Markdown transcript and automatic checks.
 */
import fs from "node:fs";
import { buildStereo, sayToPcm } from "@/lib/audio/tts-say";
import { writeWav } from "@/lib/audio/wav";
import { transcribe, wer } from "@/lib/asr/whisper";
import { callTurn, startCall } from "@/lib/voice/service";
import { prisma } from "@/lib/database/prisma";
import type { AgentState } from "@/lib/voice/agent";
import { loadAgentConfig } from "@/lib/voice/config";

type Check = { name: string; type: string; value?: unknown; slot?: string; count?: number };
type Line = string | { t: string; alt: string };
type Scenario = { id: string; title: string; voice: string; turns: Line[]; checks: Check[] };
const AGENT_VOICE = "Tara";
const OUT = "public/recordings/q1";
const ttsText = (s: string) => s.replace(/₹/g, "rupees ").replace(/(\d),(\d)/g, "$1$2");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync("docs/evaluation", { recursive: true });
  const scenarios: Scenario[] = JSON.parse(fs.readFileSync("data/test-cases/q1-calls.json", "utf8"));
  const only = process.argv[2];
  const calls = [];
  for (const sc of scenarios.filter((s) => !only || s.id === only)) {
    const start = await startCall("simulated");
    const clips: { channel: 0 | 1; pcm: Float32Array; gapAfterMs: number }[] = [{ channel: 0, pcm: sayToPcm(ttsText(start.reply), AGENT_VOICE), gapAfterMs: 500 }];
    const log: { role: string; text: string; scripted?: string; wer?: number; asrMs?: number; meta?: Record<string, unknown> }[] = [{ role: "agent", text: start.reply }];
    let state: AgentState | null = null;
    const actions: string[] = [];
    const answers: { grounded?: boolean; category?: string; citations: string[] }[] = [];
    // A real caller repeats themselves when asked again: if the agent re-prompts after a line that
    // has an alternative phrasing (e.g. ASR misheard "Bengaluru"), the caller says the alternative once.
    const reprompts = Object.values(loadAgentConfig().script.slots).map((x) => x.reprompt);
    const queue: string[] = [];
    let lastAlt: string | null = null;
    for (let i = 0; i < sc.turns.length || queue.length; ) {
      let line: string;
      if (queue.length) line = queue.shift()!;
      else { const l = sc.turns[i++]; line = typeof l === "string" ? l : l.t; lastAlt = typeof l === "string" ? null : l.alt; }
      const pcm = sayToPcm(line, sc.voice);
      const asr = await transcribe(pcm, { language: "english" });
      clips.push({ channel: 1, pcm, gapAfterMs: 500 });
      const w = wer(line, asr.text);
      log.push({ role: "customer", text: asr.text, scripted: line, wer: +w.toFixed(2), asrMs: asr.latencyMs });
      const res = await callTurn(start.callId, asr.text, { asr: "whisper-base", latencyMs: asr.latencyMs });
      state = res.state;
      actions.push(...res.executed.map((e) => e.type));
      if (res.answer) answers.push({ grounded: res.answer.grounded, category: res.retrieval?.results[0]?.category, citations: res.answer.citations.map((c) => c.recordId) });
      log.push({ role: "agent", text: res.reply, meta: { act: res.act, grounded: res.answer?.grounded, mode: res.answer?.mode, citations: res.answer?.citations.map((c) => `${c.recordId} (${c.source})`), retrieval: res.retrieval ? { grounded: res.retrieval.grounded, reason: res.retrieval.reason } : undefined, agentMs: res.timings.totalMs } });
      clips.push({ channel: 0, pcm: sayToPcm(ttsText(res.reply), AGENT_VOICE), gapAfterMs: 500 });
      if (res.ended) break;
      if (lastAlt && reprompts.some((r) => res.reply.includes(r))) { queue.push(lastAlt); lastAlt = null; }
    }
    const s = state!;
    const agentText = log.filter((l) => l.role === "agent").map((l) => l.text).join(" \n ");
    const checks = sc.checks.map((c) => {
      let pass = false;
      if (c.type === "qualification") pass = s.qualification?.status === c.value;
      if (c.type === "action") pass = actions.includes(String(c.value));
      if (c.type === "escalated") pass = s.escalated;
      if (c.type === "agent_said") pass = agentText.includes(String(c.value));
      if (c.type === "slot") pass = (s.slots as Record<string, unknown>)[c.slot!] === c.value;
      if (c.type === "unanswered_min") pass = s.unanswered.length >= Number(c.value);
      if (c.type === "grounded_category") pass = answers.filter((a) => a.grounded && a.category === c.value).length >= (c.count ?? 1);
      if (c.type === "all_answers_grounded") pass = answers.every((a) => a.grounded);
      return { name: c.name, pass };
    });
    const { channels } = buildStereo(clips);
    writeWav(`${OUT}/${sc.id}.wav`, { sampleRate: 16000, channels });
    const customerTurns = log.filter((l) => l.role === "customer");
    const meanWer = +(customerTurns.reduce((a, l) => a + (l.wer ?? 0), 0) / customerTurns.length).toFixed(3);
    const md = [
      `# ${sc.title} (${sc.id})`, "",
      `Call id: \`${start.callId}\` · Customer voice: macOS \`say\` ${sc.voice} (synthetic) · Agent voice: ${AGENT_VOICE} · ASR: Whisper-base (local) · Mean customer WER: ${meanWer}`, "",
      `Recording: [${sc.id}.wav](./${sc.id}.wav) (stereo: left = agent, right = customer)`, "",
      "## Transcript", "",
      ...log.map((l) => l.role === "agent"
        ? `**Agent:** ${l.text}${l.meta ? `  \n  _${[l.meta.act, l.meta.grounded === true ? `grounded (${l.meta.mode})` : l.meta.grounded === false ? "not grounded → fallback" : "", (l.meta.citations as string[] | undefined)?.join(", "), l.meta.agentMs !== undefined ? `${l.meta.agentMs} ms` : ""].filter(Boolean).join(" · ")}_` : ""}`
        : `**Customer (ASR):** ${l.text}  \n  _scripted: "${l.scripted}" · WER ${l.wer} · ASR ${l.asrMs} ms_`),
      "", "## Result", "",
      `- Outcome: **${s.outcome ?? "in progress"}** · qualification: **${s.qualification?.status ?? "-"}** · plan: ${s.qualification?.recommendedPlan ?? "-"} · escalated: ${s.escalated}`,
      `- Slots: \`${JSON.stringify(s.slots)}\``,
      `- Actions executed: ${actions.join(", ") || "none"}`,
      `- Unanswered (handed to advisor): ${s.unanswered.join(" | ") || "none"}`,
      "", "## Checks", "", ...checks.map((c) => `- ${c.pass ? "✅" : "❌"} ${c.name}`), "",
    ].join("\n");
    fs.writeFileSync(`${OUT}/${sc.id}.md`, md);
    calls.push({ id: sc.id, title: sc.title, callId: start.callId, outcome: s.outcome, qualification: s.qualification?.status, escalated: s.escalated, actions, checks, meanWer, recording: `recordings/q1/${sc.id}.wav`, turns: log.length });
    console.log(`${sc.id.padEnd(28)} outcome=${s.outcome} checks=${checks.filter((c) => c.pass).length}/${checks.length} WER=${meanWer}`);
    checks.filter((c) => !c.pass).forEach((c) => console.log(`   FAIL: ${c.name}`));
  }
  const all = calls.flatMap((c) => c.checks);
  const summary = { total: calls.length, passed: calls.filter((c) => c.checks.every((k) => k.pass)).length, checksPassed: all.filter((c) => c.pass).length, checksTotal: all.length, meanWer: +(calls.reduce((a, c) => a + c.meanWer, 0) / calls.length).toFixed(3) };
  if (!only) fs.writeFileSync("docs/evaluation/q1-test-calls.json", JSON.stringify({ ranAt: new Date().toISOString(), method: "Synthetic caller voices (macOS say) -> local Whisper-base ASR -> agent service -> synthetic agent voice; stereo recordings in public/recordings/q1", summary, calls }, null, 2));
  console.log(summary);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
