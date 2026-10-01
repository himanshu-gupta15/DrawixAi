/* eslint-disable @typescript-eslint/no-explicit-any */
import { Badge } from "@/components/ui";
import { loadReports } from "@/lib/evaluation/reports";

export const dynamic = "force-dynamic";

type Row = { area: string; file: string; result: string; pct: number | null; tag: string; tone: string; href: string };

export default function EvaluationPage() {
  const r = loadReports();
  const ratio = (a?: number, b?: number) => (a !== undefined && b ? Math.round((a / b) * 100) : null);
  const rows: Row[] = [];
  if (r.heldoutV2) { const s = r.heldoutV2.summary; rows.push({ area: "Q2 retrieval · held-out v2", file: "RETRIEVAL_EVALUATION.md", result: `${s.correct} correct · ${s.partiallyCorrect} partial · ${s.incorrect} incorrect of ${s.total}`, pct: ratio(s.correct, s.total), tag: "held-out", tone: "blue", href: "RETRIEVAL_EVALUATION.md" }); }
  if (r.heldoutV1 && r.heldoutV1Before) { const a = r.heldoutV1Before.summary, b = r.heldoutV1.summary; rows.push({ area: "Q2 retrieval · held-out v1", file: "RETRIEVAL_EVALUATION.md", result: `${a.correct} / ${a.partiallyCorrect} / ${a.incorrect} before reranker → ${b.correct} / ${b.partiallyCorrect} / ${b.incorrect} after`, pct: ratio(b.correct, b.total), tag: "held-out", tone: "blue", href: "RETRIEVAL_EVALUATION.md" }); }
  if (r.retrieval) { const s = r.retrieval.summary; rows.push({ area: "Q2 retrieval · dev", file: "RETRIEVAL_EVALUATION.md", result: `${s.correct} / ${s.total} — tuned on this set`, pct: ratio(s.correct, s.total), tag: "dev · optimistic", tone: "gray", href: "RETRIEVAL_EVALUATION.md" }); }
  if (r.ingestion) { const s = r.ingestion.stats; rows.push({ area: "Q2 ingestion", file: "ingestion-report.json", result: `${s.sources} sources → ${s.records} records, ${s.activeRecords} active; ${s.failedSources} corrupt PDF flagged`, pct: ratio(s.activeRecords, s.records), tag: "measured", tone: "green", href: "ingestion-report.json" }); }
  if (r.calls) { const s = r.calls.summary; rows.push({ area: "Q1 recorded calls", file: "Q1_TEST_CALLS.md", result: `${s.passed} / ${s.total} calls, ${s.checksPassed} / ${s.checksTotal} checks · caller WER ${s.meanWer}`, pct: ratio(s.checksPassed, s.checksTotal), tag: "synthetic voices", tone: "amber", href: "Q1_TEST_CALLS.md" }); }
  if (r.q3) { const s = r.q3.summary; rows.push({ area: "Q3 conversations · held-out v2", file: "Q3_RESULTS.md", result: `${s.passed} / ${s.total} checks${r.q3v1 ? ` (v1 first run ${r.q3v1.summary.passed} / ${r.q3v1.summary.total})` : ""}`, pct: ratio(s.passed, s.total), tag: "held-out", tone: "blue", href: "Q3_RESULTS.md" }); }
  if (r.q3Asr) {
    const get = (k: string) => r.q3Asr.summary.find((x: any) => x.config === k)?.meanWer;
    const id = get("ID | Damayanti | whisper-small | indonesian"), acc = get("ID | Amira | whisper-small | indonesian"), ph = get("PH | Damayanti | whisper-small | tagalog");
    rows.push({ area: "Q3 ASR · whisper-small", file: "Q3_LOCALIZATION_REPORT.md", result: `WER — ID ${id} · accent proxy ${acc} · PH ${ph}`, pct: id !== undefined ? Math.round((1 - id) * 100) : null, tag: "synthetic voices", tone: "amber", href: "Q3_LOCALIZATION_REPORT.md" });
  }
  if (r.q4) { const t = r.q4.totals; rows.push({ area: "Q4 nudges", file: "Q4_SIGNALS_AND_FALSE_POSITIVES.md", result: `${t.truePositives} / ${t.expected} expected · ${t.falsePositives} false positives · ${t.nudgesBeforeCallEnd} before call end`, pct: ratio(t.truePositives, t.expected), tag: "measured", tone: "green", href: "Q4_SIGNALS_AND_FALSE_POSITIVES.md" }); }
  if (r.unit) rows.push({ area: "Unit & integration tests", file: "unit-tests.json", result: `${r.unit.passed} / ${r.unit.tests} passing`, pct: ratio(r.unit.passed, r.unit.tests), tag: "measured", tone: "green", href: "unit-tests.json" });

  const limitations = ["No LLM key, telephony or human speakers were available.", "Refusal threshold is too strict for some valid questions.", "No Filipino TTS voice; Indonesian accent tested via a proxy.", "CPU Whisper is the 10× scaling bottleneck.", "Rule-based NLU and signals miss paraphrases.", "No native-speaker or compliance review yet."];
  const next = ["Labelled real calls per market", "Streaming ASR with language ID", "Multilingual reranker + answerability check", "Claude phrasing behind the existing verifier", "CPaaS telephony media streams", "Consent and calling-hour controls", "Horizontal ASR workers and observability"];
  const lat = r.q4?.pooledLatency;

  return (
    <div className="max-w-[1150px]">
      <div className="mb-2 font-mono text-[12px] text-t3">/evaluation · docs/evaluation</div>
      <h1 className="text-[24px] font-semibold tracking-[-0.01em] text-ink">Evaluation</h1>
      <p className="mt-1.5 max-w-[640px] text-[14px] leading-[1.6] text-t2">Held-out sets were written before final tuning and are reported as-is. Dev-set scores are shown for reference and are optimistic. Everything below is read from the saved JSON results; re-run the scripts to refresh.</p>

      <div className="mt-6 overflow-x-auto rounded-[10px] border border-line bg-surface">
        <table className="w-full min-w-[760px] text-left text-[13.5px]">
          <thead><tr className="text-[12.5px] text-t2"><th className="px-[17px] py-3 font-normal">Area</th><th className="px-3 font-normal">Result</th><th className="w-[160px] px-3 font-normal">Score</th><th className="px-3 font-normal">Basis</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.area} className="border-t border-line">
                <td className="px-[17px] py-3"><div className="font-medium text-ink">{row.area}</div><div className="font-mono text-[11.5px] text-t3">{row.file}</div></td>
                <td className="px-3 text-body">{row.result}</td>
                <td className="px-3">{row.pct !== null && <div className="flex items-center gap-3"><div className="h-[4px] flex-1 overflow-hidden rounded bg-track"><div className={`h-full rounded ${row.pct >= 85 ? "bg-g-fg" : "bg-a-fg"}`} style={{ width: `${row.pct}%` }} /></div><span className="w-9 text-right tabular-nums text-t2">{row.pct}%</span></div>}</td>
                <td className="px-3"><Badge tone={row.tone}>{row.tag}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lat && (
        <section className="mt-6 rounded-[10px] border border-line bg-surface px-[17px] py-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="text-[14.5px] font-semibold text-ink">Q4 latency, pooled over {r.q4.scenarios.length} calls</h2><span className="text-[12.5px] text-t2">P50 · P95 (ms)</span></div>
          <div className="grid gap-x-8 sm:grid-cols-2">
            {[["ASR · Whisper CPU", lat.asr], ["Signal extraction", lat.signalExtraction], ["Server pipeline", lat.serverPipeline], ["Delivery", lat.delivery], ["Audio → transcript", lat.endToEndTranscript], ["Audio → nudge", lat.endToEndNudge]].map(([k, v]: any) => (
              <div key={k} className="flex justify-between border-t border-divider py-2 text-[13.5px]"><span className="text-body">{k}</span><span className="tabular-nums text-ink">{v.p50 ?? "—"} <span className="ml-3 text-t2">{v.p95 ?? "—"}</span></span></div>
            ))}
          </div>
          <p className="mt-2 text-[12.5px] text-t3">LLM stage not run (no key). Add the 500 ms end-of-speech wait for speech-end → nudge. Details in LATENCY_REPORT.md.</p>
        </section>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-[10px] border border-line bg-surface px-[17px] py-4">
          <h2 className="mb-2 text-[14.5px] font-semibold text-ink">Known limitations</h2>
          {limitations.map((l) => <div key={l} className="border-t border-divider py-2.5 text-[13.5px] text-body first-of-type:border-t-0">{l}</div>)}
        </section>
        <section className="rounded-[10px] border border-line bg-surface px-[17px] py-4">
          <h2 className="mb-2 text-[14.5px] font-semibold text-ink">Next in production</h2>
          {next.map((t, i) => <div key={t} className="flex gap-4 border-t border-divider py-2.5 text-[13.5px] first-of-type:border-t-0"><span className="font-mono text-[12px] text-t3">{String(i + 1).padStart(2, "0")}</span><span className="text-body">{t}</span></div>)}
        </section>
      </div>
    </div>
  );
}
