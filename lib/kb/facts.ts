/**
 * Fact-level conflict detection across sources. Extracts a few business-critical facts
 * (waiting periods, age limits) and flags sources that disagree with a higher-authority source.
 */
import type { ChunkDraft } from "./types";

const toMonths = (n: number, unit: string) => (/year/i.test(unit) ? n * 12 : n);

const FACTS: { name: string; re: RegExp; value: (m: RegExpExecArray) => number }[] = [
  {
    name: "ped_waiting_period_months",
    re: /pre-existing disease[^.]*?(?:after|waiting period of)[^.\d]*(\d+)\s*(months?|years?)/i,
    value: (m) => toMonths(+m[1], m[2]),
  },
  { name: "initial_waiting_period_days", re: /initial (?:waiting period|waiting) (?:of |period:? )?(\d+) days/i, value: (m) => +m[1] },
  { name: "max_proposer_entry_age", re: /aged? (?:between )?18 (?:and|to) (\d+) years/i, value: (m) => +m[1] },
];

export interface Conflict {
  fact: string;
  kept: { recordKey: string; value: number; source: string };
  flagged: { recordKey: string; value: number; source: string };
}

export function detectConflicts(chunks: ChunkDraft[]): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const f of FACTS) {
    const found = chunks
      .filter((c) => c.status === "active")
      .map((c) => ({ c, m: f.re.exec(c.content) }))
      .filter((x): x is { c: ChunkDraft; m: RegExpExecArray } => !!x.m)
      .map(({ c, m }) => ({ c, v: f.value(m) }));
    if (found.length < 2) continue;
    // Reference value = highest authority, then latest effective date.
    const ref = [...found].sort((a, b) => b.c.authority - a.c.authority || (b.c.effectiveDate || "").localeCompare(a.c.effectiveDate || ""))[0];
    for (const x of found) {
      if (x.v !== ref.v && x.c.authority < ref.c.authority) {
        conflicts.push({
          fact: f.name,
          kept: { recordKey: ref.c.key, value: ref.v, source: ref.c.source },
          flagged: { recordKey: x.c.key, value: x.v, source: x.c.source },
        });
      }
    }
  }
  return conflicts;
}
