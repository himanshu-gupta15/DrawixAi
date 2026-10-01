import type { ReactNode } from "react";

/** Page header: mono "Q2 · /route" line, title, description, actions on the right. */
export function PageHeader({ code, route, title, subtitle, actions }: { code?: string; route?: string; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-[640px]">
        {(code || route) && <div className="mb-2 font-mono text-[12px] text-t3">{[code, route].filter(Boolean).join(" · ")}</div>}
        <h1 className="text-[24px] font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[14px] leading-[1.6] text-t2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, children, actions, className = "", flush = false }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={`rounded-[10px] border border-line bg-surface ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-[17px] pt-4 pb-3">
          <h2 className="text-[14.5px] font-semibold text-ink">{title}</h2>
          {actions && <div className="flex items-center gap-2 text-[12.5px] text-t2">{actions}</div>}
        </div>
      )}
      <div className={flush ? "" : `px-[17px] pb-4 ${title || actions ? "" : "pt-4"}`}>{children}</div>
    </section>
  );
}

const TONES: Record<string, string> = {
  gray: "bg-chip text-t2",
  green: "bg-g-bg text-g-fg",
  red: "bg-r-bg text-r-fg",
  amber: "bg-a-bg text-a-fg",
  blue: "bg-p-bg text-p-fg",
  violet: "bg-p-bg text-p-fg",
};

export function Badge({ children, tone = "gray", mono = false }: { children: ReactNode; tone?: keyof typeof TONES | string; mono?: boolean }) {
  return <span className={`inline-flex items-center rounded-[4px] px-[7px] py-[2px] text-[11.5px] leading-[1.45] ${mono ? "font-mono" : ""} ${TONES[tone] ?? TONES.gray}`}>{children}</span>;
}

export function Button({ children, onClick, disabled, variant = "primary", type = "button", size = "md" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: "primary" | "secondary" | "ink" | "danger"; type?: "button" | "submit"; size?: "sm" | "md" }) {
  const styles = {
    primary: "bg-primary text-white hover:bg-primary-hover",
    ink: "bg-ink text-on-ink hover:bg-ink-hover",
    secondary: "border border-line bg-surface text-ink hover:border-strong",
    danger: "border border-line bg-surface text-r-fg hover:border-r-bd",
  }[variant];
  const sz = size === "sm" ? "h-[30px] px-3 text-[12.5px]" : "h-[36px] px-[14px] text-[13.5px]";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center rounded-[7px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${sz} ${styles}`}>
      {children}
    </button>
  );
}

/** Segmented control (e.g. ASR mode, market). */
export function Segmented<T extends string>({ options, value, onChange, disabled }: { options: { value: T; label: ReactNode; sub?: ReactNode }[]; value: T; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className={`inline-flex rounded-[9px] border border-line bg-subtle p-[3px] ${disabled ? "opacity-60" : ""}`}>
      {options.map((o) => (
        <button key={o.value} disabled={disabled} onClick={() => onChange(o.value)} className={`rounded-[6px] px-3 py-1.5 text-left text-[12.5px] ${value === o.value ? "bg-chip text-ink shadow-[0_0_0_1px_var(--border)]" : "text-body hover:text-ink"} disabled:cursor-not-allowed`}>
          <span className={o.sub ? "block font-semibold text-[13px]" : ""}>{o.label}</span>
          {o.sub && <span className="block text-[11.5px] text-t3">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

/** Underlined tabs with optional counts. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-6 flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)} className={`-mb-px border-b-2 px-3 pb-2.5 pt-1 text-[13.5px] ${value === t.value ? "border-ink font-medium text-ink" : "border-transparent text-t2 hover:text-ink"}`}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 text-[12px] text-t4">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Horizontal strip of metrics (value + label), as in the design's summary rows. */
export function StatStrip({ items }: { items: { value: ReactNode; label: ReactNode; tone?: "green" | "amber" | "red" }[] }) {
  const tone = { green: "text-g-fg", amber: "text-a-fg", red: "text-r-fg" };
  return (
    <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 rounded-[10px] border border-line bg-surface px-[17px] py-3.5 text-[13px]">
      {items.map((i, k) => <span key={k}><b className={`mr-1.5 font-semibold tabular-nums ${i.tone ? tone[i.tone] : "text-ink"}`}>{i.value}</b><span className="text-t2">{i.label}</span></span>)}
    </div>
  );
}

/** Key/value row used in qualification, actions and latency lists. */
export function Row({ label, value, strong = false }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-divider py-[9px] text-[13.5px] first:border-t-0">
      <span className={strong ? "font-semibold text-ink" : "text-body"}>{label}</span>
      <span className={`text-right ${strong ? "font-semibold text-ink" : "text-t2"}`}>{value}</span>
    </div>
  );
}

export function Empty({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {title && <div className="mb-1.5 text-[14.5px] font-medium text-ink">{title}</div>}
      {children && <div className="max-w-sm text-[13.5px] leading-[1.6] text-t2">{children}</div>}
    </div>
  );
}

export function Chip({ children, onClick, disabled, title }: { children: ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <button title={title} onClick={onClick} disabled={disabled} className="rounded-[6px] border border-line bg-surface px-2.5 py-1 text-[12.5px] text-body hover:border-strong hover:text-ink disabled:opacity-40">{children}</button>
  );
}

export function Notice({ tone = "amber", children }: { tone?: "amber" | "blue" | "red"; children: ReactNode }) {
  const t = { amber: "border-a-bd bg-a-bg text-a-fg", blue: "border-p-bd bg-p-bg text-p-fg", red: "border-r-bd bg-r-bg text-r-fg" }[tone];
  return <div className={`mb-4 rounded-[8px] border px-3.5 py-2.5 text-[13px] ${t}`}>{children}</div>;
}

export const inputClass = "h-[40px] w-full rounded-[8px] border border-input bg-surface px-3 text-[14px] text-ink placeholder:text-t4 disabled:opacity-50";
