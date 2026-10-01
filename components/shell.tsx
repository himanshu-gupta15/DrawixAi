"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const WORKSPACE = [
  { href: "/", label: "Overview" },
  { href: "/evaluation", label: "Evaluation" },
];
const SYSTEMS = [
  { href: "/knowledge-base", label: "Knowledge base", code: "Q2" },
  { href: "/voice-agent", label: "Voice agent", code: "Q1" },
  { href: "/multilingual", label: "Multilingual", code: "Q3" },
  { href: "/live-insights", label: "Live insights", code: "Q4" },
];
const ALL = [...WORKSPACE, ...SYSTEMS, { href: "/settings", label: "Settings" }];

type Status = { postgres?: { ok: boolean }; qdrant?: { ok: boolean }; llm?: { configured: boolean; model: string }; embeddings?: { model: string }; asr?: { server: string } };

const short = (m?: string) => (m ? m.replace(/Xenova\//g, "").replace("multilingual-", "").replace("local Whisper (", "").replace(")", "") : "…");

function NavItem({ href, label, code, active }: { href: string; label: string; code?: string; active: boolean }) {
  return (
    <Link href={href} className={`relative flex items-center justify-between rounded-md px-[13px] py-[7px] text-[13.5px] ${active ? "bg-chip font-medium text-ink" : "text-body hover:bg-row-hover hover:no-underline"}`}>
      {active && <span className="absolute left-[10px] top-[8px] bottom-[8px] w-[2px] rounded bg-primary" />}
      <span className={active ? "pl-[10px]" : ""}>{label}</span>
      {code && <span className={`font-mono text-[11px] ${active ? "text-t2" : "text-t4"}`}>{code}</span>}
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch("/api/system").then((r) => r.json()).then(setStatus).catch(() => setStatus({}));
  }, []);

  // The theme lives on <html data-theme>; the button label is switched by CSS, so no state is needed.
  const toggle = () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch { /* storage unavailable */ }
  };

  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const crumb = ALL.find((i) => isActive(i.href))?.label ?? "";
  const services = [status?.postgres?.ok, status?.qdrant?.ok];
  const up = services.filter(Boolean).length;
  const llmOn = !!status?.llm?.configured;

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="sticky top-0 hidden h-screen w-[244px] shrink-0 flex-col border-r border-line bg-subtle px-3 pb-3 pt-4 md:flex">
        <Link href="/" className="mb-5 flex items-center gap-2.5 px-2 hover:no-underline">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-[13px] font-semibold text-on-ink">D</span>
          <span>
            <span className="block text-[14px] font-semibold leading-tight text-ink">Dravix AI</span>
            <span className="block text-[12px] leading-tight text-t2">Grounded voice agents</span>
          </span>
        </Link>
        <div className="px-2 pb-1.5 text-[12px] text-t3">Workspace</div>
        <nav className="mb-4 space-y-0.5">{WORKSPACE.map((i) => <NavItem key={i.href} {...i} active={isActive(i.href)} />)}</nav>
        <div className="px-2 pb-1.5 text-[12px] text-t3">Systems</div>
        <nav className="space-y-0.5">{SYSTEMS.map((i) => <NavItem key={i.href} {...i} active={isActive(i.href)} />)}</nav>
        <div className="flex-1" />
        <div className="mb-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-[12.5px]">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-medium text-ink">Runtime</span>
            <span className={`text-[11.5px] ${llmOn ? "text-p-fg" : "text-g-fg"}`}>{llmOn ? "local · Claude on" : "local · no keys"}</span>
          </div>
          {[
            ["Embeddings", short(status?.embeddings?.model)],
            ["Reranker", "MiniLM-L6"],
            ["ASR", short(status?.asr?.server)],
            ["Claude", status ? (llmOn ? "configured" : "no key") : "…"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between py-[3px]"><span className="text-t2">{k}</span><span className={`font-mono text-[11.5px] ${k === "Claude" && !llmOn ? "text-t4" : "text-body"}`}>{v}</span></div>
          ))}
        </div>
        <div className="flex items-center gap-2.5 px-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-avatar text-[11px] font-semibold text-body">HG</span>
          <span>
            <span className="block text-[13px] font-medium leading-tight text-ink">Himanshu Gupta</span>
            <span className="block text-[12px] leading-tight text-t2">Reviewer workspace</span>
          </span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[56px] items-center justify-between border-b border-line bg-header px-6 backdrop-blur">
          <div className="text-[13.5px]"><span className="text-t3">Dravix AI</span><span className="mx-2 text-faint">/</span><span className="text-ink">{crumb}</span></div>
          <div className="flex items-center gap-2">
            <span className="flex h-[30px] items-center gap-2 rounded-full border border-line px-3 text-[12.5px] text-body" title="PostgreSQL and Qdrant health from /api/system">
              <span className={`h-[7px] w-[7px] rounded-full ${!status ? "bg-faint" : up === services.length ? "bg-g-fg" : "bg-r-fg"}`} />
              {status ? `${up} / ${services.length} services up` : "checking…"}
            </span>
            <button onClick={toggle} className="flex h-[30px] items-center gap-1.5 rounded-md border border-line px-2.5 text-[12.5px] text-body hover:border-strong" aria-label="Toggle colour theme">
              <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" /></svg>
              <span className="theme-to-light">Light</span><span className="theme-to-dark">Dark</span>
            </button>
            <Link href="/settings" className={`flex h-[30px] items-center rounded-md border px-2.5 text-[12.5px] hover:no-underline ${path.startsWith("/settings") ? "border-strong text-ink" : "border-line text-body hover:border-strong"}`}>Settings</Link>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-6 pb-12 pt-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
