import Link from "next/link";
import { loadReports } from "@/lib/evaluation/reports";

export const dynamic = "force-dynamic";

export default function Home() {
  const r = loadReports();
  const s = r.ingestion?.stats;
  const v2 = r.heldoutV2?.summary;
  const lat = r.q4?.pooledLatency;
  const fmt = (v: unknown, suffix = "") => (v === undefined || v === null ? "—" : `${v}${suffix}`);

  const hero = [
    { value: v2 ? `${v2.correct} / ${v2.total}` : "—", label: "Held-out retrieval correct" },
    { value: r.calls ? `${r.calls.summary.passed} / ${r.calls.summary.total}` : "—", label: "Recorded voice calls pass" },
    { value: r.q3 ? `${r.q3.summary.passed} / ${r.q3.summary.total}` : "—", label: "Localization checks (held-out)" },
    { value: lat ? `${Math.round(lat.endToEndNudge.p50)} ms` : "—", label: "Audio → nudge, P50" },
  ];
  const systems = [
    { href: "/knowledge-base", code: "Q2", title: "Knowledge base", desc: "Messy websites, PDFs, rate cards and testimonials cleaned, redacted and versioned for cited answers.", metric: s ? `${s.activeRecords} active` : "—", sub: s ? `of ${s.records} records` : "run npm run ingest" },
    { href: "/voice-agent", code: "Q1", title: "Voice agent", desc: "Qualifies health-insurance leads and answers only from approved content — or says it can't.", metric: r.calls ? `${r.calls.summary.checksPassed} / ${r.calls.summary.checksTotal}` : "—", sub: "call checks" },
    { href: "/multilingual", code: "Q3", title: "Localized voice bots", desc: "Philippines bancassurance in English, Tagalog and Taglish; Indonesia multifinance across formal, casual and regional speech.", metric: "2 markets", sub: "fil-PH · id-ID" },
    { href: "/live-insights", code: "Q4", title: "Live insights", desc: "Disclosure, cross-sell and frustration nudges while the call is still running.", metric: r.q4 ? fmt(r.q4.totals.falsePositives) : "—", sub: "false positives" },
  ];
  const flows = [
    ["Q2", "Extract → supersede → clean → redact PII → chunk → embed → dedupe & conflict check → Postgres + Qdrant"],
    ["Q1", "Mic → ASR → dialog manager → Q2 retrieval → callback, CRM summary, escalation → TTS"],
    ["Q3", "ASR → language, register & regional detection → intent → native reply → ₱ / Rp formatting"],
    ["Q4", "100 ms frames → per-speaker VAD → Whisper → signals → nudge engine → WebSocket → dashboard"],
  ];
  const honesty = [
    ["Local-First Execution", "All embeddings, reranking, and ASR run locally with sub-second latency, with Claude available as an optional phrasing layer."],
    ["Synthetic callers", "Test calls use synthesized voices transcribed by real Whisper — not human speech."],
    ["Held-out as-is", "Held-out sets were written before final tuning; first-run results are included."],
    ["Fictional data", "Companies, customers and all PII are invented."],
  ];

  return (
    <div className="max-w-[1150px]">
      <div className="mb-2 text-[13px] text-p-fg">AI Engineer Assessment · Dravix Health Insurance</div>
      <h1 className="max-w-[460px] text-[28px] font-semibold leading-[1.22] tracking-[-0.015em] text-ink">Voice agents that only say what the approved content supports.</h1>
      <p className="mt-3 max-w-[700px] text-[15px] leading-[1.6] text-t2">Four systems in one Next.js process — a knowledge base, a lead-qualification agent, localized bots for two markets, and live call nudges, optimized for high-performance, private, local execution.</p>

      <div className="mt-7 grid grid-cols-2 overflow-hidden rounded-[10px] border border-line bg-surface lg:grid-cols-4">
        {hero.map((h, i) => (
          <div key={h.label} className={`px-[18px] py-4 ${i ? "border-l border-line" : ""} ${i === 2 ? "max-lg:border-l-0 max-lg:border-t" : ""} ${i === 3 ? "max-lg:border-t" : ""}`}>
            <div className="text-[22px] font-semibold tabular-nums tracking-[-0.01em] text-ink">{h.value}</div>
            <div className="mt-1 text-[12.5px] text-t2">{h.label}</div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-[15px] font-semibold text-ink">Systems</h2>
      <div className="overflow-hidden rounded-[10px] border border-line bg-surface">
        {systems.map((q, i) => (
          <Link key={q.href} href={q.href} className={`group flex items-center gap-5 px-[18px] py-4 hover:bg-row-hover hover:no-underline ${i ? "border-t border-line" : ""}`}>
            <span className="w-7 font-mono text-[12px] text-t3">{q.code}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-semibold text-ink">{q.title}</span>
              <span className="mt-0.5 block text-[13px] text-t2">{q.desc}</span>
            </span>
            <span className="text-right">
              <span className="block text-[17px] font-semibold tabular-nums text-ink">{q.metric}</span>
              <span className="block text-[12px] text-t2">{q.sub}</span>
            </span>
            <span className="text-t4 transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <section className="rounded-[10px] border border-line bg-surface px-[18px] py-4">
          <h2 className="mb-3 text-[14.5px] font-semibold text-ink">How a request flows</h2>
          <div className="space-y-3">
            {flows.map(([c, f]) => <div key={c} className="flex gap-4 text-[13.5px] leading-[1.6]"><span className="w-7 shrink-0 font-mono text-[12px] leading-[1.9] text-t3">{c}</span><span className="text-body">{f}</span></div>)}
          </div>
        </section>
        <section className="rounded-[10px] border border-a-bd bg-honesty px-[18px] py-4">
          <h2 className="mb-3 text-[14.5px] font-semibold text-ink">What these numbers are not</h2>
          <div className="space-y-3">
            {honesty.map(([k, v]) => <div key={k}><div className="text-[13.5px] font-medium text-ink">{k}</div><div className="text-[13px] leading-[1.55] text-t2">{v}</div></div>)}
          </div>
        </section>
      </div>
    </div>
  );
}
