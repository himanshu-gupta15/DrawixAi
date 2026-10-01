/** Q3 conversation tests: language/register detection, intent, in-language replies, escalation. */
import fs from "node:fs";
import { initialMlState, mlTurn, type Market, type MlState } from "@/lib/multilingual/engine";
import { detectPh } from "@/lib/multilingual/lang";

type T = { text: string; intent: string[]; variant?: string; regional?: string; ended?: boolean; escalated?: boolean };
type C = { id: string; market: Market; title: string; turns: T[] };

async function main() {
  const heldout = process.argv[2] === "v2";
  const cases: C[] = JSON.parse(fs.readFileSync(heldout ? "data/test-cases/q3-conversations-v2.json" : "data/test-cases/q3-conversations.json", "utf8"));
  const out = [];
  let passed = 0, failed = 0;
  for (const c of cases) {
    let state: MlState = initialMlState(c.market);
    const turns = [];
    for (const t of c.turns) {
      const r = await mlTurn(state, t.text);
      state = r.state;
      const intent = r.method === "fallback" ? "fallback" : r.intent;
      const det = r.detection as { variant?: string; register?: string; regional?: string | null };
      const detected = det.variant ?? det.register;
      const checks: { name: string; pass: boolean }[] = [{ name: `intent ∈ {${t.intent.join(",")}} (got ${intent})`, pass: t.intent.includes(intent) }];
      if (t.variant) checks.push({ name: `detected ${t.variant} (got ${detected})`, pass: detected === t.variant });
      if (t.regional) checks.push({ name: `regional ${t.regional} (got ${det.regional})`, pass: det.regional === t.regional });
      // No unexpected English switching: a non-English caller must get a non-English reply variant.
      if (detected && detected !== "en") checks.push({ name: `reply stays in caller variant (${r.variant})`, pass: r.variant !== "en" && (c.market === "ID" || detectPh(r.reply).variant !== "en") });
      if (t.ended !== undefined) checks.push({ name: `call ${t.ended ? "ended" : "continues"}`, pass: r.ended === t.ended });
      if (t.escalated) checks.push({ name: "escalated to human", pass: r.state.escalated });
      checks.forEach((k) => (k.pass ? passed++ : failed++));
      turns.push({ text: t.text, reply: r.reply, ttsText: r.ttsText, intent, confidence: r.confidence, method: r.method, variant: detected, regional: det.regional ?? null, replyVariant: r.variant, checks });
    }
    out.push({ id: c.id, market: c.market, title: c.title, turns });
    const bad = turns.flatMap((t) => t.checks.filter((k) => !k.pass).map((k) => `"${t.text}": ${k.name}`));
    console.log(`${bad.length ? "✗" : "✓"} ${c.market} ${c.title}`);
    bad.forEach((b) => console.log("    " + b));
  }
  const note = heldout
    ? "Held-out v2: written before the last round of fixes and run once afterwards; not used for tuning."
    : "Development set (was held-out v1; its first-run result is kept in q3-tests-heldout-v1.json, then it was used to drive general fixes).";
  fs.writeFileSync(heldout ? "docs/evaluation/q3-tests-heldout-v2.json" : "docs/evaluation/q3-tests.json", JSON.stringify({ ranAt: new Date().toISOString(), note, summary: { passed, failed, total: passed + failed }, cases: out }, null, 2));
  console.log({ passed, failed });
}
main();
