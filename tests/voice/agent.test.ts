import { test, after } from "node:test";
import assert from "node:assert/strict";
import { classifyTurn, extractAge, extractBudget, extractMembers, extractName, extractTime, splitQuestion, wordsToDigits } from "@/lib/voice/nlu";
import { handleTurn, initialState, type AgentState } from "@/lib/voice/agent";
import { prisma } from "@/lib/database/prisma";

after(() => prisma.$disconnect());

async function run(lines: string[]) {
  let s: AgentState = initialState();
  const out = [];
  for (const l of lines) { const r = await handleTurn(s, l); s = r.state; out.push(r); if (r.ended) break; }
  return { s, out };
}

test("NLU extraction", () => {
  assert.equal(classifyTurn("can I talk to a real person"), "human_request");
  assert.equal(classifyTurn("this is too expensive"), "objection");
  assert.equal(classifyTurn("is diabetes covered?"), "question");
  assert.equal(extractAge("I'm thirty four"), 34);
  assert.equal(extractBudget("around 1,500 rupees a month")!.annual, 18000);
  assert.deepEqual(extractMembers("me and my parents")!.sort(), ["parents", "self"]);
  assert.equal(extractName("My name is Mira Joshi."), "Mira Joshi");
  assert.equal(extractTime("tomorrow at 6 pm"), "tomorrow at 6 pm");
  assert.equal(wordsToDigits("my father is seventy"), "my father is 70");
  assert.equal(splitQuestion("I'm 34, but is diabetes covered?").question, "is diabetes covered?");
});

test("human escalation at any point creates escalation + CRM summary actions", async () => {
  const { s, out } = await run(["yes", "Neha Kapoor", "connect me to a real person please"]);
  assert.ok(s.escalated);
  assert.deepEqual(out.at(-1)!.actions.map((a) => a.type), ["escalation", "crm_summary"]);
});

test("conflicting age is clarified, not silently overwritten", async () => {
  const { s, out } = await run(["yes", "My name is Meera Joshi", "I'm 43", "me and my kids", "Pune", "no", "no", "about 2000 a month. Actually I'm 34", "34 is correct"]);
  assert.ok(out.some((r) => r.reply.startsWith("Just to confirm")));
  assert.equal(s.slots.age, 34);
});

test("objection is answered from the KB with a citation, then the script resumes", async () => {
  const { out } = await run(["yes", "Imran", "29", "just me", "Mumbai", "I already have insurance from my employer"]);
  const last = out.at(-1)!;
  assert.ok(last.answer?.grounded);
  assert.ok(last.answer!.citations[0].recordId.startsWith("kb_objection_"));
  assert.match(last.reply, /health condition/);
});

test("unsupported question gets an explicit unavailable answer and is logged for the advisor", async () => {
  const { s, out } = await run(["yes", "Arjun", "38", "just me", "Delhi", "Does the policy cover IVF treatment?"]);
  assert.match(out.at(-1)!.reply, /don't have verified information/);
  assert.equal(s.unanswered.length, 1);
});

test("proposer older than 65 is not qualified and is referred to a human advisor", async () => {
  const { s, out } = await run(["yes", "Ravi", "67"]);
  assert.equal(s.qualification?.status, "not_eligible");
  assert.match(out.at(-1)!.reply, /advisor/);
});
