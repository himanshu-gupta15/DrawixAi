"use client";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Empty, Notice, PageHeader, Segmented } from "@/components/ui";
import { startMicCapture } from "@/lib/client/audio";

type Timings = { endpointMs: number; asrQueueMs: number; asrMs: number; signalMs: number; llmMs: number | null; genMs: number; serverMs: number };
type Line = { id: string; speaker: "agent" | "customer"; text: string; startMs: number; endMs: number; snrDb: number; timings: Timings };
type Nudge = { id: string; type: string; group: string; priority: "high" | "medium" | "low"; text: string; confidence: number; evidence: string[]; createdCallMs: number; expiresCallMs: number; count: number; status: string; timings?: Timings; detail?: string };
type Sup = { signal: { type: string; confidence: number; evidence: string }; reason: string; callMs: number };
type Lat = { n: number; p50: number | null; p95: number | null; max: number | null };
type Metrics = { callMs: number; nudges: Record<string, number>; latencyMs: Record<string, Lat>; llmEnabled: boolean };
type Scenario = { id: string; title: string; expected: string[]; noisy: boolean; audioReady: boolean };
type Mode = "replay" | "mic";

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
const P_TONE = { high: "red", medium: "amber", low: "blue" } as const;
const P_ORDER = { high: 0, medium: 1, low: 2 };
const KIND: Record<string, string> = { compliance_disclosure: "Compliance", compliance_risky_statement: "Risky statement", cross_sell: "Missed cross-sell", frustration: "Frustration", payment_difficulty: "Payment difficulty", callback_need: "Callback", buying_signal: "Buying signal", churn_risk: "Churn risk" };
const LAT_ROWS: [string, string][] = [["asr", "ASR · Whisper CPU"], ["signalExtraction", "Signal extraction"], ["llm", "LLM phrasing (async)"], ["delivery", "Delivery · render"], ["endToEndTranscript", "Audio → transcript"], ["endToEndNudge", "Audio → nudge"], ["endToEndPhrasedNudge", "Audio → phrased nudge"]];

export default function LiveInsightsPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenario, setScenario] = useState("");
  const [mode, setMode] = useState<Mode>("replay");
  const [state, setState] = useState<"idle" | "connecting" | "live" | "ended">("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [suppressed, setSuppressed] = useState<Sup[]>([]);
  const [topics, setTopics] = useState<{ from: string | null; to: string; callMs: number }[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [callMs, setCallMs] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [speaker, setSpeaker] = useState<"agent" | "customer">("customer");
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const mic = useRef<{ stop: () => void } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/insights/scenarios").then((r) => r.json()).then((s: Scenario[]) => { setScenarios(s); setScenario(s.find((x) => x.id === "health_compliance")?.id ?? s[0]?.id ?? ""); });
    return () => { mic.current?.stop(); ws.current?.close(); };
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [lines]);

  // The dashboard acks after the event has rendered; the server uses this for delivery and end-to-end latency.
  const ack = (id: string) => requestAnimationFrame(() => { if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type: "ack", id })); });

  function start() {
    setError(null); setLines([]); setNudges([]); setSuppressed([]); setTopics([]); setMetrics(null); setCallMs(0); setDuration(null);
    setState("connecting");
    const sock = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/insights`);
    ws.current = sock;
    sock.onopen = async () => {
      if (mode === "replay") sock.send(JSON.stringify({ type: "start", mode: "replay", scenario }));
      else {
        sock.send(JSON.stringify({ type: "start", mode: "mic", speaker }));
        try { mic.current = await startMicCapture((pcm) => { if (sock.readyState === WebSocket.OPEN) sock.send(pcm.buffer); }); }
        catch { setError("Microphone permission denied."); stop(); }
      }
    };
    sock.onerror = () => setError("WebSocket connection failed. Start the app with `npm run dev` (custom server), not `next dev`.");
    sock.onmessage = (m) => {
      const e = JSON.parse(m.data);
      if (e.type === "error") { setError(e.message); setState("idle"); return; }
      if (e.type === "session") {
        setState("live");
        if (e.durationMs) setDuration(e.durationMs);
        if (e.audioUrl && audio.current) { audio.current.src = e.audioUrl; audio.current.currentTime = 0; void audio.current.play().catch(() => {}); }
      } else if (e.type === "progress") setCallMs(e.callMs);
      else if (e.type === "transcript") { setLines((l) => [...l, e]); ack(e.id); }
      else if (e.type === "suppressed") setSuppressed((s) => [...s, e]);
      else if (e.type === "topic") setTopics((t) => [...t, e]);
      else if (e.type === "nudge") {
        setNudges((ns) => {
          const prev = ns.find((n) => n.id === e.nudge.id);
          return [...ns.filter((n) => n.id !== e.nudge.id), { ...prev, ...e.nudge, timings: e.timings ?? prev?.timings, detail: e.detail ?? prev?.detail }];
        });
        if (e.event === "created" || e.event === "rephrased") ack(e.eventId);
      } else if (e.type === "metrics") setMetrics(e.metrics);
      else if (e.type === "ended") { setMetrics(e.summary.metrics); setState("ended"); mic.current?.stop(); sock.close(); }
    };
  }

  function stop() {
    mic.current?.stop(); mic.current = null;
    audio.current?.pause();
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type: "stop" }));
  }

  function switchSpeaker(s: "agent" | "customer") {
    setSpeaker(s);
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type: "speaker", speaker: s }));
  }

  const sc = scenarios.find((s) => s.id === scenario);
  const active = nudges.filter((n) => n.status === "active").sort((a, b) => P_ORDER[a.priority] - P_ORDER[b.priority] || b.createdCallMs - a.createdCallMs);
  const past = nudges.filter((n) => n.status !== "active");
  const running = state === "live" || state === "connecting";
  const stateLabel = { idle: "Idle", connecting: "Connecting", live: mode === "replay" ? "Replaying" : "Live mic", ended: "Ended" }[state];
  const topic = topics.at(-1)?.to;

  return (
    <div className="max-w-[1150px]">
      <PageHeader code="Q4" route="/live-insights" title="Live insights"
        subtitle="Call audio streams in 100 ms frames while the call is running. Nudges are thresholded, merged, spaced and expired so agents don't learn to ignore them."
        actions={<>
          <Segmented<Mode> value={mode} onChange={setMode} disabled={running} options={[{ value: "replay", label: "Real-time replay" }, { value: "mic", label: "Live mic" }]} />
          {running ? <Button variant="danger" onClick={stop}>Stop</Button> : <Button onClick={start} disabled={mode === "replay" && !sc?.audioReady}>{mode === "replay" ? "Start replay" : "Start mic"}</Button>}
        </>} />
      {error && <Notice>{error}</Notice>}

      <section className="mb-4 rounded-[10px] border border-line bg-surface px-[17px] py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {mode === "replay" ? (
            <select className="max-w-full rounded-[7px] border border-line bg-surface px-2 py-1 text-[13.5px] font-medium text-ink" value={scenario} onChange={(e) => setScenario(e.target.value)} disabled={running}>
              {scenarios.map((s, i) => <option key={s.id} value={s.id} disabled={!s.audioReady}>Call {String(i + 1).padStart(2, "0")} · {s.title}{s.audioReady ? "" : " (run npm run audio:q4)"}</option>)}
            </select>
          ) : (
            <div className="flex items-center gap-2 text-[13.5px] text-body">Speaking as
              <Segmented value={speaker} onChange={switchSpeaker} options={[{ value: "agent", label: "Agent" }, { value: "customer", label: "Customer" }]} />
            </div>
          )}
          <span className="font-mono text-[12px] text-t2">{mmss(callMs)}{duration ? ` / ${mmss(duration)}` : ""} · {stateLabel}{topic ? ` · ${topic}` : ""}</span>
        </div>
        <div className="mt-3 h-[3px] overflow-hidden rounded bg-track"><div className="h-full bg-primary transition-all" style={{ width: duration ? `${Math.min(100, (callMs / duration) * 100)}%` : state === "live" ? "100%" : "0%", opacity: duration || state !== "live" ? 1 : 0.35 }} /></div>
        {mode === "replay" && sc && <div className="mt-2.5 text-[12.5px] text-t3">Real-time replay / simulation of a recorded stereo call (left = agent, right = customer). Nothing is analysed in advance. Expected nudges: {sc.expected.length ? sc.expected.map((e) => KIND[e] ?? e).join(", ") : "none — this call should stay quiet"}{sc.noisy ? " · noisy line" : ""}.</div>}
        <audio ref={audio} className={`mt-3 h-8 w-full ${mode === "replay" && state !== "idle" ? "" : "hidden"}`} controls />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_430px]">
        <section className="flex min-h-[480px] flex-col overflow-hidden rounded-[10px] border border-line bg-surface">
          <div className="flex items-center justify-between px-[17px] pt-4 pb-3"><h2 className="text-[14.5px] font-semibold text-ink">Transcript</h2><span className="text-[12.5px] text-t2">Whisper-base · per-speaker VAD</span></div>
          {topics.length > 1 && <div className="flex flex-wrap items-center gap-1.5 px-[17px] pb-2 text-[12px] text-t3">Topics {topics.map((t, i) => <span key={i} className="flex items-center gap-1.5"><Badge>{t.to}</Badge><span>{mmss(t.callMs)}</span>{i < topics.length - 1 && <span className="text-faint">→</span>}</span>)}</div>}
          <div className="flex-1 overflow-y-auto border-t border-line px-[17px] py-2" style={{ maxHeight: 520 }}>
            {!lines.length ? <Empty title={state === "live" ? "Listening…" : "Waiting for audio"}>{state === "live" ? "Transcripts appear about half a second after each utterance ends." : "Start the replay to stream transcripts and nudges."}</Empty> : lines.map((l) => (
              <div key={l.id} className="rise flex gap-4 border-b border-divider py-2.5 last:border-b-0">
                <span className="w-9 shrink-0 pt-0.5 font-mono text-[12px] text-t3">{mmss(l.startMs)}</span>
                <span className={`w-[70px] shrink-0 pt-px text-[12.5px] font-medium ${l.speaker === "agent" ? "text-p-fg" : "text-a-fg"}`}>{l.speaker === "agent" ? "Agent" : "Customer"}</span>
                <span className="min-w-0 flex-1 text-[13.5px] leading-[1.55] text-ink">{l.text}<span className="ml-2 whitespace-nowrap text-[11px] text-t4">SNR {l.snrDb} dB · ASR {l.timings.asrMs} ms</span></span>
              </div>
            ))}
            <div ref={bottom} />
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-[10px] border border-line bg-surface px-[17px] py-4">
            <div className="mb-1 flex items-center justify-between"><h2 className="text-[14.5px] font-semibold text-ink">Nudges</h2><span className="text-[12.5px] text-t2">{nudges.length} shown · non-urgent ≥ 10 s apart</span></div>
            {!nudges.length ? <p className="text-[13px] text-t2">Quiet. Nudges are rare by design.</p> : [...active, ...past].map((n) => (
              <div key={n.id} className={`rise border-t border-divider py-3 first-of-type:border-t-0 ${n.status !== "active" ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                  <Badge tone={P_TONE[n.priority]}>{KIND[n.type] ?? n.type}</Badge>
                  <span className="text-t3">{mmss(n.createdCallMs)}{n.timings ? ` · ${n.timings.serverMs} ms` : ""} · conf {n.confidence}</span>
                  {n.count > 1 && <Badge tone="violet">×{n.count} merged</Badge>}
                  {n.status !== "active" && <Badge tone={n.status === "resolved" ? "green" : "gray"}>{n.status}</Badge>}
                </div>
                <div className="mt-1.5 text-[13.5px] font-medium leading-[1.5] text-ink">{n.text}</div>
                <div className="mt-0.5 text-[12.5px] leading-[1.5] text-t2">“{n.evidence[n.evidence.length - 1]}”</div>
                {n.detail && n.status === "resolved" && <div className="mt-0.5 text-[12px] text-g-fg">Resolved by agent: {n.detail}</div>}
                {n.detail && n.status === "active" && <div className="mt-0.5 text-[11.5px] text-t4">Phrased by {n.detail.replace(/^openai\//, "")}</div>}
              </div>
            ))}
          </section>

          <section className="rounded-[10px] border border-line bg-surface px-[17px] py-4">
            <div className="mb-1 flex items-center justify-between"><h2 className="text-[14.5px] font-semibold text-ink">Suppressed</h2>{!!suppressed.length && <span className="text-[12.5px] text-t2">{suppressed.length} held back</span>}</div>
            {!suppressed.length ? <p className="text-[13px] text-t2">Nothing held back yet.</p> : suppressed.map((s, i) => (
              <div key={i} className="border-t border-divider py-2.5 text-[12.5px] first-of-type:border-t-0">
                <div className="font-medium text-ink">{KIND[s.signal.type] ?? s.signal.type} <span className="font-normal text-t3">· {mmss(s.callMs)}</span></div>
                <div className="text-t2">{s.reason}</div>
              </div>
            ))}
          </section>

          <section className="rounded-[10px] border border-line bg-surface px-[17px] py-4">
            <div className="mb-1 flex items-center justify-between"><h2 className="text-[14.5px] font-semibold text-ink">Latency</h2><span className="text-[12.5px] text-t2">this call · P50 · P95</span></div>
            {!metrics ? <p className="text-[13px] text-t2">Measured live; updates every 2 s during the call. Pooled benchmark numbers are on the Evaluation page.</p> : (
              <>
                {LAT_ROWS.map(([k, label]) => {
                  const v = metrics.latencyMs[k];
                  const last = k === "endToEndNudge";
                  if (k === "endToEndPhrasedNudge" && !v?.n) return null;
                  return (
                    <div key={k} className={`flex items-center justify-between border-t border-divider py-2 text-[13.5px] first-of-type:border-t-0 ${last ? "font-semibold" : ""}`}>
                      <span className={last ? "text-ink" : "text-body"}>{label}</span>
                      <span className="tabular-nums">{k === "llm" && !v?.n ? <span className="text-t2">{metrics.llmEnabled ? "—" : "not run"}</span> : <><span className="text-ink">{v?.p50 ?? "—"} ms</span><span className="ml-4 text-t2">{v?.p95 ?? "—"} ms</span></>}</span>
                    </div>
                  );
                })}
                <p className="mt-2 text-[12px] leading-[1.5] text-t3">“Audio” = last frame of the utterance received. Add the 500 ms end-of-speech wait for speech end → nudge. Delivery is server send → browser render ack.</p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
