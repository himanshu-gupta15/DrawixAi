/** Deterministic, auditable qualification rules for health-insurance leads (Q1 business logic). */
import type { AgentConfig } from "./config";

export interface Slots {
  name?: string;
  age?: number;
  members?: string[];
  parent_age?: number;
  city?: string;
  health?: { none: boolean; conditions: string[] };
  smoker?: boolean;
  budget?: { annual: number; raw: string };
}

export interface Qualification {
  status: "qualified" | "needs_underwriting" | "not_eligible" | "below_budget" | "incomplete";
  recommendedPlan: string | null;
  leadScore: "hot" | "warm" | "cold";
  reasons: string[];
  notes: string[];
  missing: string[];
}

const REQUIRED: (keyof Slots)[] = ["name", "age", "members", "city", "health", "smoker", "budget"];

export function qualify(s: Slots, cfg: AgentConfig): Qualification {
  const r = cfg.rules;
  const reasons: string[] = [];
  const notes: string[] = [];
  const missing = REQUIRED.filter((k) => s[k] === undefined);
  if (s.members?.includes("parents") && s.parent_age === undefined) missing.push("parent_age");

  if (s.age !== undefined && (s.age < r.proposerAge.min || s.age > r.proposerAge.max)) {
    return { status: "not_eligible", recommendedPlan: null, leadScore: "cold", reasons: [`proposer age ${s.age} outside ${r.proposerAge.min}-${r.proposerAge.max}`], notes: s.age > r.proposerAge.max ? ["refer to human advisor for senior-citizen options"] : [], missing };
  }
  const serious = (s.health?.conditions ?? []).filter((c) => r.underwritingConditions.includes(c));
  let parentsAllowed = true;
  if (s.members?.includes("parents") && s.parent_age !== undefined) {
    if (s.parent_age > r.parentMaxEntryAge) {
      parentsAllowed = false;
      notes.push(`parents cannot be added: entry age ${s.parent_age} exceeds ${r.parentMaxEntryAge}`);
    } else if (s.parent_age >= r.coPayFromAge) notes.push(`20% co-payment applies for members aged ${r.coPayFromAge}+`);
  }
  const oldest = Math.max(s.age ?? 0, parentsAllowed ? s.parent_age ?? 0 : 0);
  if (oldest >= r.medicalCheckFromAge) notes.push(`free home medical check-up needed (member aged ${r.medicalCheckFromAge}+)`);
  if (s.smoker) notes.push(`${r.smokerLoadingPct}% smoker loading`);
  const ped = (s.health?.conditions ?? []).filter((c) => !r.underwritingConditions.includes(c));
  if (ped.length) notes.push(`declared pre-existing condition(s): ${ped.join(", ")}`);

  // Plan by budget band; parents require Gold or above.
  let plan: string | null = null;
  if (s.budget) {
    plan = [...r.planBands].reverse().find((b) => s.budget!.annual >= b.fromAnnual)?.plan ?? r.planBands[0].plan;
    if (s.members?.includes("parents") && parentsAllowed && !r.plansAllowingParents.includes(plan)) {
      notes.push(`parents need ${r.plansAllowingParents[0]} or above`);
      plan = r.plansAllowingParents[0];
    }
  }

  if (missing.length) return { status: "incomplete", recommendedPlan: plan, leadScore: "cold", reasons: [`missing: ${missing.join(", ")}`], notes, missing };
  if (serious.length) {
    reasons.push(`condition(s) requiring underwriter review: ${serious.join(", ")}`);
    return { status: "needs_underwriting", recommendedPlan: plan, leadScore: "warm", reasons, notes, missing };
  }
  if (s.budget!.annual < r.minAnnualBudget) {
    reasons.push(`annual budget ₹${s.budget!.annual} below minimum ₹${r.minAnnualBudget}`);
    return { status: "below_budget", recommendedPlan: null, leadScore: "cold", reasons, notes, missing };
  }
  reasons.push("age, members and budget within rules");
  return { status: "qualified", recommendedPlan: plan, leadScore: s.budget!.annual >= 12000 ? "hot" : "warm", reasons, notes, missing };
}
