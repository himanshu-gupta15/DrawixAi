import fs from "node:fs";
import path from "node:path";

export interface AgentConfig {
  useCase: string;
  agentName: string;
  company: string;
  script: Record<string, string> & { slots: Record<string, { ask: string; reprompt: string }> };
  rules: {
    proposerAge: { min: number; max: number };
    parentMaxEntryAge: number;
    plansAllowingParents: string[];
    coPayFromAge: number;
    medicalCheckFromAge: number;
    minAnnualBudget: number;
    smokerLoadingPct: number;
    underwritingConditions: string[];
    acceptedConditions: string[];
    planBands: { plan: string; fromAnnual: number }[];
    maxRepromptsPerSlot: number;
  };
}

let cached: AgentConfig | null = null;
export function loadAgentConfig(): AgentConfig {
  return (cached ??= JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/business/health-lead-qualification.json"), "utf8")));
}

export const fill = (tpl: string, vars: Record<string, string | number | undefined>) => tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
