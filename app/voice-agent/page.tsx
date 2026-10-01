"use client";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Empty, Notice, PageHeader, Row, Segmented, inputClass } from "@/components/ui";
import { createRecognizer, speak, speechRecognitionAvailable, startMicCapture } from "@/lib/client/audio";

type Citation = { recordId: string; title: string; source: string; sourceRef: string; version: string };
type Retrieved = { recordId: string; title: string; content: string; category: string; source: string; sourceRef: string; denseScore: number; bm25Score: number; fusedScore: number; rerankScore: number | null };
type Turn = { role: "agent" | "customer"; text: string; meta?: { act?: string; grounded?: boolean; mode?: string; citations?: Citation[]; asr?: string; ms?: number } };
type AgentState = {
  stage: string; currentSlot?: string; slots: Record<string, unknown>; escalated: boolean; escalationReason?: string; callbackTime?: string; outcome?: string;
  qualification?: { status: string; recommendedPlan: string | null; leadScore: string; reasons: string[]; notes: string[]; missing: string[] };
  unanswered: string[]; conflictsResolved: string[];
};
type Executed = { type: string; delivered: boolean; detail?: string };
type Mode = "browser" | "whisper" | "text";

const SLOT_LABELS: [string, string][] = [["name", "Name"], ["age", "Age · 18–65"], ["members", "Members"], ["parent_age", "Eldest parent · ≤ 75"], ["city", "City"], ["health", "Pre-existing"], ["smoker", "Smoker"], ["budget", "Budget"]];
const fmt = (k: string, v: unknown) => {
  if (v === undefined) return <span className="text-t3">Not captured</span>;
  if (k === "health") { const h = v as { none: boolean; conditions: string[] }; return h.none ? "None declared" : h.conditions.join(", "); }
  if (k === "budget") return `₹${(v as { annual: number }).annual.toLocaleString("en-IN")} / yr`;
  if (k === "smoker") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
};
const QUAL_TONE: Record<string, string> = { qualified: "green", needs_underwriting: "amber", not_eligible: "red", below_budget: "red", incomplete: "gray" };
const ACTION_LABEL: Record<string, string> = { callback: "Callback", lead: "Lead created", crm_summary: "CRM summary", escalation: "Human escalation" };
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function VoiceAgentPage() {
  const [callId, setCallId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [state, setState] = useState<AgentState | null>(null);
  const [retrieved, setRetrieved] = useState<{ query: string; grounded: boolean; reason: string; results: Retrieved[]; latency: number } | null>(null);
  const [actions, setActions] = useState<Executed[]>([]);
  const [ended, setEnded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("browser");
  const [interim, setInterim] = useState("");
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recUrl, setRecUrl] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const rec = useRef<ReturnType<typeof createRecognizer> | null>(null);
  const ptt = useRef<{ stop: () => void; chunks: Int16Array[] } | null>(null);
  const mediaRec = useRef<MediaRecorder | null>(null);
  const callRef = useRef<string | null>(null);
  const endedRef = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [turns, interim]);
  useEffect(() => () => { rec.current?.stop(); mediaRec.current?.stop(); }, []);
  useEffect(() => {
    if (!startedAt || ended) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt, ended]);

  const live = !!callId && !ended;

  async function agentSays(reply: string) {
    rec.current?.pause(); // don't let the bot hear itself
    const r = await speak(reply.replace(/₹/g, "rupees "), ["en-IN", "en-GB", "en-US", "en"]);
    setVoice(r.voice);
    if (!endedRef.current) rec.current?.resume();
  }

  async function start() {
    setError(null); setTurns([]); setActions([]); setRetrieved(null); setEnded(false); endedRef.current = false; setRecUrl(null);
    const res = await fetch("/api/voice/calls", { method: "POST" }).then((r) => r.json());
    setCallId(res.callId); callRef.current = res.callId; setState(res.state);
    setStartedAt(Date.now()); setNow(Date.now());
    setTurns([{ role: "agent", text: res.reply }]);
    if (mode !== "text") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new MediaRecorder(stream);
        const parts: Blob[] = [];
        mr.ondataavailable = (e) => parts.push(e.data);
        mr.onstop = () => { setRecUrl(URL.createObjectURL(new Blob(parts, { type: mr.mimeType }))); stream.getTracks().forEach((t) => t.stop()); };
        mr.start(); mediaRec.current = mr; setRecording(true);
      } catch { setError("Microphone permission denied — you can still type the caller's replies."); setMode("text"); }
    }
    if (mode === "browser" && !speechRecognitionAvailable()) { setMode("whisper"); setError("This browser has no Web Speech API — switched to server Whisper push-to-talk."); }
    else if (mode === "browser") {
      rec.current = createRecognizer("en-IN", (t, conf) => t && send(t, { asr: `Web Speech${conf ? ` · conf ${conf.toFixed(2)}` : ""}` }), setInterim, (e) => e !== "no-speech" && e !== "aborted" && setError(`Speech recognition: ${e}`));
    }
    await agentSays(res.reply);
  }

  async function send(utterance: string, meta: { asr?: string; ms?: number } = {}) {
    const id = callRef.current;
    if (!id || endedRef.current || !utterance.trim()) return;
    setInterim(""); setBusy(true);
    setTurns((t) => [...t, { role: "customer", text: utterance, meta }]);
    const t0 = performance.now();
    const res = await fetch(`/api/voice/calls/${id}/turn`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: utterance, asr: meta }) }).then((r) => r.json());
    setBusy(false);
    if (res.error) return setError(res.error);
    setTurns((t) => [...t, { role: "agent", text: res.reply, meta: { act: res.act, grounded: res.answer?.grounded, mode: res.answer?.mode, citations: res.answer?.citations, ms: Math.round(performance.now() - t0) } }]);
    setState(res.state);
    if (res.retrieval) setRetrieved({ query: res.retrieval.query, grounded: res.retrieval.grounded, reason: res.retrieval.reason, results: res.retrieval.results, latency: res.retrieval.latencyMs.total });
    if (res.executed?.length) setActions((a) => [...a, ...res.executed]);
    if (res.ended) { endedRef.current = true; setEnded(true); rec.current?.stop(); stopRecording(); }
    await agentSays(res.reply);
  }

  function stopRecording() { if (mediaRec.current?.state === "recording") mediaRec.current.stop(); setRecording(false); }

  async function hangUp() {
    if (!callId) return;
    endedRef.current = true; setEnded(true); rec.current?.stop(); window.speechSynthesis.cancel(); stopRecording();
    await fetch(`/api/voice/calls/${callId}/end`, { method: "POST" });
    setActions((a) => [...a, { type: "crm_summary", delivered: true, detail: "written on hang-up" }]);
  }

  async function pttDown() {
    const chunks: Int16Array[] = [];
    const cap = await startMicCapture((c) => chunks.push(c));
    ptt.current = { stop: cap.stop, chunks };
  }
  async function pttUp() {
    const p = ptt.current; if (!p) return;
    ptt.current = null; p.stop();
    const total = p.chunks.reduce((n, c) => n + c.length, 0);
    const all = new Int16Array(total); let o = 0; for (const c of p.chunks) { all.set(c, o); o += c.length; }
    setInterim("Transcribing with Whisper…");
    const r = await fetch("/api/asr?lang=english", { method: "POST", body: all.buffer }).then((x) => x.json());
    setInterim("");
    if (r.text) send(r.text, { asr: `Whisper · ${r.latencyMs} ms`, ms: r.latencyMs });
  }

  const q = state?.qualification;
  const status = !callId ? "Ready" : ended ? (state?.escalated ? "Escalated" : "Ended") : busy ? "Thinking" : "Live";
  const dot = !callId ? "bg-faint" : ended ? "bg-t3" : "bg-g-fg";
  const done = new Set(actions.map((a) => a.type));
  const detail = (t: string) => actions.filter((a) => a.type === t).at(-1)?.detail;

  return (
    <div className="max-w-[1150px]">
      <PageHeader code="Q1" route="/voice-agent" title="Voice agent"
        subtitle="Qualifies health-insurance leads against underwriting rules. Every question and objection goes through the knowledge base — or the agent says it doesn't know."
        actions={<>
          <Segmented<Mode> value={mode} onChange={setMode} disabled={live} options={[{ value: "browser", label: "Browser ASR" }, { value: "whisper", label: "Server Whisper" }, { value: "text", label: "Type only" }]} />
          {live ? <Button variant="danger" onClick={hangUp}>End call</Button> : <Button onClick={start}>Start call</Button>}
        </>} />
      {error && <Notice>{error}</Notice>}

      <div className="grid gap-4 xl:grid-cols-[1fr_456px]">
        <section className="flex min-h-[540px] flex-col overflow-hidden rounded-[10px] border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-[17px] py-3 text-[13.5px]">
            <span className="flex items-center gap-2 font-medium text-ink"><span className={`h-[7px] w-[7px] rounded-full ${dot} ${live && !busy ? "shimmer" : ""}`} />{status}{recording && <Badge tone="red">● mic recording</Badge>}</span>
            <span className="font-mono text-[12px] text-t2">{callId ?? "no call"} · Dravix Health · {clock(startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0)}</span>
          </div>
          <div className="flex-1 overflow-y-auto px-[17px] py-4" style={{ maxHeight: 560 }}>
            {!turns.length ? (
              <Empty title="No call in progress">Choose speech input, start the call and talk to Asha — or pick “Type only” and type as the caller.<div className="mt-4"><Button variant="secondary" onClick={start}>Start call</Button></div></Empty>
            ) : (
              <div className="space-y-4">
                {turns.map((t, i) => (
                  <div key={i} className="rise">
                    <div className="mb-1 flex items-center gap-2 text-[12px]"><span className={t.role === "agent" ? "font-medium text-p-fg" : "font-medium text-t2"}>{t.role === "agent" ? "Asha · agent" : "Caller"}</span>
                      {t.meta?.asr && <span className="text-t4">{t.meta.asr}</span>}
                      {t.meta?.act && t.role === "agent" && <span className="text-t4">{t.meta.act}{t.meta.ms !== undefined ? ` · ${t.meta.ms} ms` : ""}</span>}
                    </div>
                    <div className={`text-[14px] leading-[1.6] ${t.role === "agent" ? "text-ink" : "text-body"}`}>{t.text}</div>
                    {t.role === "agent" && t.meta?.grounded !== undefined && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
                        {t.meta.grounded ? <Badge tone="green">grounded · {t.meta.mode}</Badge> : <Badge tone="amber">no KB answer → fallback</Badge>}
                        {t.meta.citations?.map((c) => <span key={c.recordId} className="text-t3">Source · <span className="font-mono text-body">{c.recordId}</span> {c.source}</span>)}
                      </div>
                    )}
                  </div>
                ))}
                {interim && <div className="text-[13.5px] italic text-t3">{interim}</div>}
                {busy && <div className="shimmer text-[13px] text-t3">Asha is thinking…</div>}
                <div ref={bottom} />
              </div>
            )}
          </div>
          <form className="flex gap-2 border-t border-line px-[17px] py-3" onSubmit={(e) => { e.preventDefault(); const v = text; setText(""); send(v, { asr: "typed" }); }}>
            <input className={inputClass} placeholder={live ? "Type as the caller, e.g. “Is maternity covered?”" : "Start a call first"} value={text} onChange={(e) => setText(e.target.value)} disabled={!live} />
            {mode === "whisper" && <button type="button" className="h-[40px] shrink-0 rounded-[8px] border border-p-bd bg-p-bg px-3 text-[13px] font-medium text-p-fg disabled:opacity-40" disabled={!live} onPointerDown={pttDown} onPointerUp={pttUp} onPointerLeave={() => ptt.current && pttUp()}>Hold to talk</button>}
            <Button type="submit" variant="ink" disabled={!live || !text.trim()}>Send</Button>
          </form>
          {(recUrl || voice) && (
            <div className="border-t border-line px-[17px] py-2 text-[12px] text-t3">
              {voice && <>TTS voice: {voice}. </>}
              {recUrl && <><a href={recUrl} download={`${callId}-mic.webm`}>Download mic recording</a> (caller side; two-sided recordings come from the test-call harness)</>}
            </div>
          )}
        </section>

        <div className="space-y-4">
          <section className="rounded-[10px] border border-line bg-surface px-[17px] py-4">
            <div className="mb-1 flex items-center justify-between"><h2 className="text-[14.5px] font-semibold text-ink">Qualification</h2>
              {q ? <Badge tone={QUAL_TONE[q.status] ?? "gray"}>{q.status.replace(/_/g, " ")}</Badge> : <Badge>{callId ? "In progress" : "Not started"}</Badge>}</div>
            {SLOT_LABELS.filter(([k]) => k !== "parent_age" || (state?.slots.members as string[] | undefined)?.includes("parents")).map(([k, label]) => (
              <Row key={k} label={<span className={state?.currentSlot === k && state.stage === "slot" ? "font-medium text-ink" : ""}>{label}{state?.currentSlot === k && state.stage === "slot" ? <span className="ml-1.5 text-[11.5px] text-p-fg">asking</span> : null}</span>} value={state ? fmt(k, state.slots[k]) : <span className="text-t3">Not captured</span>} />
            ))}
            {q?.recommendedPlan && <Row strong label="Recommended plan" value={`${q.recommendedPlan} · lead ${q.leadScore}`} />}
            {q && [...q.reasons, ...q.notes].length > 0 && <ul className="mt-2 space-y-0.5 text-[12.5px] text-t2">{[...q.reasons, ...q.notes].map((n) => <li key={n}>· {n}</li>)}</ul>}
            {!!state?.conflictsResolved.length && <div className="mt-2 text-[12.5px] text-a-fg">Data quality: {state.conflictsResolved.join("; ")}</div>}
          </section>

          <section className="rounded-[10px] border border-line bg-surface px-[17px] py-4">
            <div className="mb-1 flex items-center justify-between"><h2 className="text-[14.5px] font-semibold text-ink">Retrieved knowledge</h2>{retrieved && <span className="text-[12px] text-t3">{retrieved.latency} ms</span>}</div>
            {!retrieved ? <p className="text-[13px] text-t2">Retrievals appear here as the caller asks questions or raises objections.</p> : (
              <>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]"><span className="text-body">“{retrieved.query}”</span>{retrieved.grounded ? <Badge tone="green">grounded</Badge> : <Badge tone="amber">not grounded</Badge>}</div>
                {retrieved.results.map((r) => (
                  <div key={r.recordId} className="border-t border-divider py-2.5">
                    <div className="text-[13px] font-medium text-ink">{r.title}</div>
                    <div className="mt-0.5 text-[12.5px] leading-[1.55] text-t2">{r.content.length > 200 ? r.content.slice(0, 200) + "…" : r.content}</div>
                    <div className="mt-1 font-mono text-[11px] text-t3">{r.recordId} · {r.source} · rerank {r.rerankScore ?? "n/a"}</div>
                  </div>
                ))}
                <div className="mt-1 text-[11.5px] text-t4">{retrieved.reason}</div>
              </>
            )}
          </section>

          <section className="rounded-[10px] border border-line bg-surface px-[17px] py-4">
            <h2 className="mb-1 text-[14.5px] font-semibold text-ink">Business actions</h2>
            <Row label={ACTION_LABEL.callback} value={done.has("callback") ? <span className="text-g-fg">Scheduled · {detail("callback")}</span> : "Pending"} />
            <Row label={ACTION_LABEL.lead} value={done.has("lead") ? <span className="text-g-fg">Saved</span> : "Pending"} />
            <Row label={ACTION_LABEL.crm_summary} value={done.has("crm_summary") ? <span className="text-g-fg">Written{detail("crm_summary") ? ` · ${detail("crm_summary")}` : ""}</span> : "Pending"} />
            <Row label={ACTION_LABEL.escalation} value={state?.escalated ? <span className="text-r-fg">Escalated · {detail("escalation") ?? "logged"}</span> : "Not required"} />
            {!!state?.unanswered.length && <div className="mt-2 text-[12.5px] text-t2">Sent to advisor: {state.unanswered.join(" | ")}</div>}
          </section>
        </div>
      </div>
    </div>
  );
}
