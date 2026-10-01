"use client";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Chip, Empty, PageHeader, StatStrip, Tabs, inputClass } from "@/components/ui";

type Record_ = { recordId: string; title: string; content: string; category: string; productLine: string; source: string; sourceRef: string; version: string; containsPii: boolean; piiTypes: string[]; status: string; duplicateOf: string | null; metadata: { topic: string; authority: number; revision: number; flags: string[]; normalizations: string[]; aliases?: string[] } };
type Doc = { id: string; uri: string; sourceType: string; title: string; version: string; effectiveDate: string | null; status: string; error: string | null; removedLines: number; _count: { records: number } };
type Issue = { severity: string; sourceId: string; type: string; message: string };
type Retrieved = { recordId: string; title: string; content: string; category: string; source: string; sourceRef: string; version: string; denseScore: number; bm25Score: number; fusedScore: number; rerankScore: number | null };
type Search = { retrieval: { grounded: boolean; reason: string; processedQuery: string; intentHint: string | null; results: Retrieved[]; latencyMs: { total: number; embed: number; vector: number; bm25: number; rerank: number } }; answer: { text: string; mode: string; grounded: boolean; citations: { recordId: string; source: string; sourceRef: string; label: string }[] } };
type EvalRow = { id: string; type: string; question: string; grounded: boolean; retrieved: { recordId: string; title: string } | null; sourceReference: string | null; relevanceExplanation: string; answer: string; verdict: string };
type Tab = "search" | "records" | "documents" | "tests";

const TRY = ["What does the Gold plan include?", "Can my 72 year old father be covered?", "It's too expensive for me", "How do I make a cashless claim?", "Do you sell car insurance?", "Is IVF covered?"];
const STATUS_TONE: Record<string, string> = { active: "green", ingested: "green", duplicate: "gray", superseded: "amber", flagged: "red", failed: "red" };
const VERDICT_TONE: Record<string, string> = { correct: "green", "partially correct": "amber", incorrect: "red" };
const TRUST = [
  ["Active records only", "Superseded, duplicate and flagged records are filtered out of retrieval."],
  ["Refuse below threshold", "If the cross-encoder isn't confident, the agent says it doesn't know instead of guessing."],
  ["Citation verifier", "Any LLM phrasing must cite supplied records and keep their numbers intact (no key set: answers are extractive)."],
  ["PII never indexed", "Phone, PAN, Aadhaar, email and names are redacted before chunking and embedding."],
];
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export default function KnowledgeBasePage() {
  const [tab, setTab] = useState<Tab>("search");
  const [records, setRecords] = useState<Record_[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [run, setRun] = useState<{ stats: Record<string, number>; issues: Issue[] } | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState(TRY[0]);
  const [search, setSearch] = useState<Search | null>(null);
  const [evalReport, setEvalReport] = useState<{ ranAt: string; summary: Record<string, number>; results: EvalRow[] } | null>(null);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState(false);
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = () => {
    fetch("/api/knowledge/documents").then((r) => r.json()).then((d) => setDocs(d.documents));
    fetch("/api/knowledge/ingest").then((r) => r.json()).then((d) => setRun(d.run));
    fetch("/api/knowledge/records").then((r) => r.json()).then((d) => setRecords(d.records));
  };
  useEffect(() => {
    reload();
    fetch("/api/retrieval/eval").then((r) => r.json()).then(setEvalReport);
  }, []);

  function flash(t: string) { setToast(t); setTimeout(() => setToast(""), 5000); }

  async function doSearch(q = query) {
    if (!q.trim()) return;
    setQuery(q);
    setBusy("search");
    setSearch(await fetch("/api/retrieval", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, k: 5 }) }).then((r) => r.json()));
    setBusy("");
  }
  async function reingest() {
    setBusy("ingest");
    const r = await fetch("/api/knowledge/ingest", { method: "POST" }).then((x) => x.json());
    flash(`Rebuilt in ${r.durationMs} ms · ${r.stats.activeRecords} active records`);
    reload();
    setBusy("");
  }
  async function upload() {
    const fd = new FormData();
    const f = fileRef.current?.files?.[0];
    if (url.trim()) fd.set("url", url.trim());
    else if (f) fd.set("file", f);
    else return flash("Choose a file or enter a URL first.");
    setBusy("upload");
    const r = await fetch("/api/knowledge/documents", { method: "POST", body: fd }).then((x) => x.json());
    setBusy("");
    if (r.error) return flash(`Error: ${r.error}`);
    setModal(false); setUrl("");
    const own = r.report.issues.filter((i: Issue) => i.sourceId === r.added.id);
    flash(`Added ${r.added.id} · ${r.report.stats.activeRecords} active records${own.length ? ` · ${own.length} issue(s) for this source` : ""}`);
    reload();
  }
  async function runEval() {
    setBusy("eval");
    setEvalReport(await fetch("/api/retrieval/eval", { method: "POST" }).then((r) => r.json()));
    setBusy("");
  }

  const s = run?.stats;
  const shown = statusFilter === "all" ? records : records.filter((r) => r.status === statusFilter);
  const counts = (st: string) => records.filter((r) => r.status === st).length;

  return (
    <div className="max-w-[1150px]">
      <PageHeader code="Q2" route="/knowledge-base" title="Knowledge base"
        subtitle={s ? `${s.sources} messy sources, cleaned and versioned. Answers come only from active records.` : "Messy sources, cleaned and versioned. Answers come only from active records."}
        actions={<><Button variant="secondary" onClick={reingest} disabled={!!busy}>{busy === "ingest" ? "Rebuilding…" : "Rebuild"}</Button><Button onClick={() => setModal(true)}>Add document</Button></>} />

      {s && <StatStrip items={[
        { value: s.sources, label: "sources" }, { value: s.records, label: "records" }, { value: s.activeRecords, label: "active", tone: "green" },
        { value: s.piiRedactions, label: "PII redacted" }, { value: s.exactDuplicates + s.nearDuplicates, label: "duplicates" },
        { value: s.superseded, label: "superseded" }, { value: s.conflictsFlagged, label: "flagged", tone: "amber" },
        { value: s.invalidDates, label: "invalid date", tone: "amber" }, { value: s.failedSources, label: "failed", tone: "red" },
      ]} />}

      <Tabs value={tab} onChange={setTab} tabs={[{ value: "search", label: "Search" }, { value: "records", label: "Records", count: records.length }, { value: "documents", label: "Documents", count: docs.length }, { value: "tests", label: "Retrieval tests", count: evalReport?.results.length }]} />

      {tab === "search" && (
        <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
          <div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); doSearch(); }}>
              <input className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ask the knowledge base…" />
              <Button type="submit" variant="ink" disabled={busy === "search"}>{busy === "search" ? "Searching…" : "Search"}</Button>
            </form>
            <div className="mt-3 flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[12.5px] text-t3">Try</span>{TRY.map((t) => <Chip key={t} onClick={() => doSearch(t)}>{t}</Chip>)}</div>

            {search && (
              <section className="rise mt-5 overflow-hidden rounded-[10px] border border-line bg-surface">
                <div className="px-[17px] py-4">
                  <div className="mb-2.5 flex flex-wrap items-center gap-2">
                    {search.answer.grounded ? <Badge tone="green">✓ Grounded answer</Badge> : <Badge tone="amber">Not grounded — refused</Badge>}
                    <Badge>{search.answer.mode}</Badge>
                    <span className="text-[12px] text-t3">{search.retrieval.latencyMs.total} ms · embed {search.retrieval.latencyMs.embed} · vector {search.retrieval.latencyMs.vector} · rerank {search.retrieval.latencyMs.rerank}</span>
                  </div>
                  <p className="text-[15px] leading-[1.6] text-ink">{search.answer.text}</p>
                  {search.answer.citations.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">{search.answer.citations.map((c) => <span key={c.recordId} title={c.label} className="rounded-[5px] border border-line bg-subtle px-2 py-0.5 font-mono text-[11.5px] text-body">{c.recordId} · {c.sourceRef.split("/").pop()}</span>)}</div>
                  )}
                  <div className="mt-2 text-[12px] text-t3">{search.retrieval.reason}</div>
                </div>
                <div className="border-t border-line px-[17px] py-3">
                  <div className="mb-1 flex justify-between text-[12.5px] text-t2"><span>Ranked chunks</span><span>hybrid → RRF → cross-encoder</span></div>
                  {search.retrieval.results.map((r) => (
                    <div key={r.recordId} className="flex gap-4 border-t border-divider py-3 first-of-type:border-t-0">
                      <span className="w-9 shrink-0 pt-0.5 font-mono text-[12px] text-t2" title={`cross-encoder logit ${r.rerankScore ?? "n/a"} · dense ${r.denseScore} · bm25 ${r.bm25Score}`}>{r.rerankScore !== null ? sigmoid(r.rerankScore).toFixed(2) : r.denseScore.toFixed(2)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] text-ink"><span className="font-medium">{r.title}</span> <span className="text-body">— {r.content.length > 170 ? r.content.slice(0, 170) + "…" : r.content}</span></div>
                        <div className="mt-0.5 text-[12px] text-t3">{r.recordId} · {r.source} · v{r.version}</div>
                      </div>
                      <span><Badge tone="green">active</Badge></span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
          <section className="h-fit rounded-[10px] border border-line bg-surface px-[17px] py-4">
            <h2 className="mb-1 text-[14.5px] font-semibold text-ink">Why answers are trusted</h2>
            {TRUST.map(([k, v]) => <div key={k} className="border-t border-divider py-3 first-of-type:border-t-0"><div className="text-[13.5px] font-medium text-ink">{k}</div><div className="mt-0.5 text-[13px] leading-[1.55] text-t2">{v}</div></div>)}
          </section>
        </div>
      )}

      {tab === "records" && (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {["all", "active", "duplicate", "superseded", "flagged"].map((f) => (
              <button key={f} onClick={() => setStatusFilter(f)} className={`rounded-[6px] border px-2.5 py-1 text-[12.5px] ${statusFilter === f ? "border-strong bg-chip text-ink" : "border-line text-t2 hover:text-ink"}`}>
                {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)} <span className="text-t4">{f === "all" ? records.length : counts(f)}</span>
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-[10px] border border-line bg-surface">
            <table className="w-full min-w-[820px] text-left text-[13px]">
              <thead><tr className="text-[12.5px] text-t2"><th className="px-[17px] py-3 font-normal">Record</th><th className="px-3 font-normal">Category</th><th className="px-3 font-normal">Source</th><th className="px-3 font-normal">Version</th><th className="px-3 font-normal">PII</th><th className="px-3 font-normal">Status</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.recordId} className="border-t border-line align-top hover:bg-row-hover">
                    <td className="max-w-[420px] px-[17px] py-2.5">
                      <div className="font-medium text-ink">{r.title}</div>
                      <div className="font-mono text-[11.5px] text-t3">{r.recordId}</div>
                      <div className="mt-1 text-[12.5px] text-t2">{r.content.length > 160 ? r.content.slice(0, 160) + "…" : r.content}</div>
                      {r.metadata.flags?.length > 0 && <div className="mt-1 text-[12px] text-r-fg">{r.metadata.flags.join("; ")}</div>}
                      {r.metadata.aliases?.length ? <div className="mt-1 text-[12px] text-t3">aliases: {r.metadata.aliases.join(" | ")}</div> : null}
                    </td>
                    <td className="px-3 py-2.5 text-body">{r.category}<div className="text-[12px] text-t3">{r.metadata.topic}{r.productLine !== "all" ? ` · ${r.productLine}` : ""}</div></td>
                    <td className="px-3 py-2.5 text-body">{r.source}<div className="font-mono text-[11px] text-t3">{r.sourceRef}</div></td>
                    <td className="px-3 py-2.5 font-mono text-[12px] text-body">{r.version}<div className="text-t3">rev {r.metadata.revision}</div></td>
                    <td className="px-3 py-2.5">{r.containsPii ? <Badge tone="red">{r.piiTypes.join(", ")} redacted</Badge> : <span className="text-t3">—</span>}</td>
                    <td className="px-3 py-2.5"><Badge tone={STATUS_TONE[r.status] ?? "gray"}>{r.status}</Badge>{r.duplicateOf && <div className="mt-1 font-mono text-[11px] text-t3">of {r.duplicateOf}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!shown.length && <Empty>No records with this status.</Empty>}
          </div>
        </>
      )}

      {tab === "documents" && (
        <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
          <div className="overflow-hidden rounded-[10px] border border-line bg-surface">
            {docs.map((d, i) => (
              <div key={d.id} className={`flex items-start gap-4 px-[17px] py-3 ${i ? "border-t border-line" : ""}`}>
                <span className="w-16 shrink-0 pt-0.5 font-mono text-[11.5px] uppercase text-t3">{d.sourceType}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium text-ink">{d.title}</div>
                  <div className="font-mono text-[11.5px] text-t3">{d.uri} · v{d.version}{d.effectiveDate ? ` · eff. ${d.effectiveDate}` : ""}</div>
                  {d.error && <div className="mt-1 text-[12.5px] text-r-fg">{d.error}</div>}
                  {!d.error && d.removedLines > 0 && <div className="mt-0.5 text-[12px] text-t2">{d.removedLines} boilerplate lines removed</div>}
                </div>
                <span className="pt-0.5 text-[12.5px] tabular-nums text-t2">{d._count.records} rec</span>
                <Badge tone={STATUS_TONE[d.status] ?? "gray"}>{d.status}</Badge>
              </div>
            ))}
          </div>
          <section className="h-fit rounded-[10px] border border-line bg-surface px-[17px] py-4">
            <h2 className="mb-1 text-[14.5px] font-semibold text-ink">Ingestion issues · latest run</h2>
            {!run ? <Empty>No run yet.</Empty> : run.issues.map((i, k) => (
              <div key={k} className="border-t border-divider py-2.5 text-[12.5px] first-of-type:border-t-0">
                <div className="mb-1 flex items-center gap-2"><Badge tone={i.severity === "error" ? "red" : i.severity === "warning" ? "amber" : "gray"}>{i.type.replace(/_/g, " ")}</Badge><span className="font-mono text-[11px] text-t3">{i.sourceId}</span></div>
                <div className="leading-[1.5] text-t2">{i.message}</div>
              </div>
            ))}
          </section>
        </div>
      )}

      {tab === "tests" && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
            {evalReport && <><Badge tone="green">correct {evalReport.summary.correct}</Badge><Badge tone="amber">partial {evalReport.summary.partiallyCorrect}</Badge><Badge tone="red">incorrect {evalReport.summary.incorrect}</Badge><span className="text-t3">P50 {evalReport.summary.p50LatencyMs} ms · P95 {evalReport.summary.p95LatencyMs} ms · ran {new Date(evalReport.ranAt).toLocaleString()}</span></>}
            <div className="flex-1" />
            <Button variant="secondary" size="sm" onClick={runEval} disabled={busy === "eval"}>{busy === "eval" ? "Running…" : "Run retrieval tests"}</Button>
          </div>
          <p className="mb-3 text-[12.5px] text-a-fg">This is the development set (used for tuning), so it is optimistic. Held-out results are on the Evaluation page.</p>
          <div className="overflow-x-auto rounded-[10px] border border-line bg-surface">
            {!evalReport ? <Empty>Run the tests to see per-query verdicts.</Empty> : (
              <table className="w-full min-w-[900px] text-left text-[12.5px]">
                <thead><tr className="text-t2"><th className="px-[17px] py-3 font-normal">#</th><th className="px-2 font-normal">Question</th><th className="px-2 font-normal">Retrieved record</th><th className="px-2 font-normal">Source</th><th className="px-2 font-normal">Why relevant</th><th className="px-2 font-normal">Verdict</th></tr></thead>
                <tbody>{evalReport.results.map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="px-[17px] py-2.5 font-mono text-t3">{r.id}</td>
                    <td className="max-w-[260px] px-2 py-2.5 text-ink">{r.question}<div className="mt-1 text-t2">→ {r.answer}</div></td>
                    <td className="px-2 py-2.5">{r.retrieved ? <><div className="font-mono text-[11.5px] text-p-fg">{r.retrieved.recordId}</div><div className="text-body">{r.retrieved.title}</div></> : "—"}{!r.grounded && <div className="mt-1"><Badge tone="amber">refused</Badge></div>}</td>
                    <td className="max-w-[200px] px-2 py-2.5 text-t2">{r.sourceReference ?? "—"}</td>
                    <td className="max-w-[300px] px-2 py-2.5 text-t2">{r.relevanceExplanation}</td>
                    <td className="px-2 py-2.5"><Badge tone={VERDICT_TONE[r.verdict] ?? "gray"}>{r.verdict}</Badge></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </>
      )}

      {modal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4" onClick={() => busy !== "upload" && setModal(false)}>
          <div className="rise w-full max-w-[480px] rounded-[12px] border border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[16px] font-semibold text-ink">Add to knowledge base</h2>
            <p className="mt-1 text-[13px] leading-[1.55] text-t2">Runs extract → clean → PII redact → chunk → dedupe over the whole corpus. Conflicts are flagged, not answered from.</p>
            <label className="mt-4 block text-[12.5px] text-t2">Page URL</label>
            <input className={`${inputClass} mt-1`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/faq" />
            {url && !/^https?:\/\//.test(url) && <div className="mt-1 text-[12px] text-r-fg">Enter a URL starting with http:// or https://</div>}
            <div className="my-3 text-center text-[12px] text-t4">or</div>
            <label className="flex cursor-pointer flex-col items-center rounded-[8px] border border-dashed border-input px-4 py-5 text-center hover:border-strong">
              <span className="text-[13.5px] text-ink">Choose a file to upload</span>
              <span className="mt-0.5 text-[12px] text-t3">HTML, PDF, Markdown, TXT, CSV, form JSON · up to 10 MB</span>
              <input ref={fileRef} type="file" accept=".html,.htm,.pdf,.md,.txt,.csv,.json" className="mt-2 text-[12px] text-t2" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setModal(false)} disabled={busy === "upload"}>Cancel</Button>
              <Button onClick={upload} disabled={busy === "upload" || (!!url && !/^https?:\/\//.test(url))}>{busy === "upload" ? "Ingesting…" : "Start ingestion"}</Button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="rise fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-[8px] bg-ink px-4 py-2.5 text-[13px] text-on-ink shadow-lg">{toast}</div>}
    </div>
  );
}
