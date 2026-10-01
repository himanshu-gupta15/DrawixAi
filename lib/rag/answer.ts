/**
 * Grounded answer composition. Two modes:
 *  - "llm": Claude rewrites the retrieved records into a short spoken answer, then a verifier
 *           rejects it if it cites records that were not provided or states numbers not in them.
 *  - "extractive": deterministic; picks the most relevant sentences from the top record.
 * If retrieval is not grounded, both modes return an explicit "information unavailable" answer.
 */
import { complete, llmEnabled, LlmUnavailable } from "../ai/llm";
import { splitSentences } from "../kb/chunk";
import { tokenize } from "./bm25";
import { citationOf, termIdf, type RetrievalResult, type RetrievedRecord } from "./retrieve";

export interface GroundedAnswer {
  text: string;
  grounded: boolean;
  mode: "llm" | "extractive" | "fallback";
  citations: { recordId: string; title: string; source: string; sourceRef: string; version: string; label: string }[];
  llmLatencyMs?: number;
  llmError?: string;
  verifier?: string;
}

export const UNAVAILABLE_TEXT = "I'm sorry, I don't have verified information about that, so I won't guess.";

/** Turn playbook instructions ("Explain that ...") into customer-facing speech. */
export function playbookToSpeech(text: string) {
  return splitSentences(text)
    .filter((s) => !/^(acknowledge|respect|never|do not|don't)\b/i.test(s))
    .map((s) =>
      s
        .replace(/^Explain that /i, "")
        .replace(/^Share (the|our) /i, "We have a ")
        .replace(/^Remind the customer of the /i, "You also get the ")
        .replace(/^Offer a /i, "I can arrange a ")
        .replace(/^Offer to /i, "I can ")
        .replace(/, that /g, ", ")
        .replace(/\band that /g, "and ")
        .replace(/\bthe customer('s)?\b/gi, (m, p) => (p ? "your" : "you"))
        .replace(/\bcustomers\b/gi, "you"),
    )
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

/**
 * Picks the 2 most informative sentences: query terms weighted by IDF (rare terms like "room" or
 * "ambulance" matter more than "plan"), and terms already in the record title count for little,
 * since every sentence of that record is about the title topic.
 */
function extractive(query: string, rec: RetrievedRecord, idf: (t: string) => number, maxWords = 55) {
  const body = rec.category === "objection" ? playbookToSpeech(rec.content) : rec.content;
  const sents = splitSentences(body);
  if (sents.length <= 2) return sents.join(" ");
  const title = new Set(tokenize(rec.title));
  const q = new Set(tokenize(query));
  const weight = (t: string) => idf(t) * (title.has(t) ? 0.2 : 1);
  const scored = sents.map((s, i) => ({ s, i, score: [...new Set(tokenize(s))].filter((t) => q.has(t)).reduce((a, t) => a + weight(t), 0) + (i === 0 ? 0.3 : 0) }));
  const picked = scored.sort((a, b) => b.score - a.score).slice(0, 2).sort((a, b) => a.i - b.i);
  let out = picked.map((p) => p.s).join(" ");
  const words = out.split(/\s+/);
  if (words.length > maxWords) out = words.slice(0, maxWords).join(" ").replace(/[,;]?$/, "...");
  return out;
}

const numbersIn = (s: string) => (s.replace(/(\d),(?=\d)/g, "$1").match(/\d+(?:\.\d+)?/g) ?? []);

/** Reject LLM output that cites unknown records or introduces numbers absent from the sources. */
export function verifyLlmAnswer(answer: string, cited: string[], records: RetrievedRecord[]): string | null {
  const ids = new Set(records.map((r) => r.recordId));
  if (!cited.length) return "no citation";
  const bad = cited.filter((c) => !ids.has(c));
  if (bad.length) return `cited unknown records ${bad.join(",")}`;
  const sourceNums = new Set(records.flatMap((r) => numbersIn(`${r.title} ${r.content}`)));
  const novel = numbersIn(answer).filter((n) => !sourceNums.has(n));
  if (novel.length) return `numbers not in sources: ${novel.join(",")}`;
  return null;
}

const SYSTEM = `You are the voice of Dravix Health's health-insurance phone assistant.
Answer the customer's question using ONLY the knowledge records provided in the user message.
Rules:
- At most 2 short spoken sentences. Plain conversational English, no lists, no markdown.
- Never invent prices, percentages, periods, plan features or policy terms. If a detail is not in the records, do not state it.
- If the records do not answer the question, reply with exactly: UNAVAILABLE
- If the question is an objection (price, existing cover, trust), acknowledge it in a few words, then give the facts from the records.
- After the answer, on a new line, list the record ids you used, like: SOURCES: kb_faq_003, kb_policy_002`;

export async function composeAnswer(query: string, retrieval: RetrievalResult, opts: { allowLlm?: boolean } = {}): Promise<GroundedAnswer> {
  const cite = (r: RetrievedRecord) => ({ recordId: r.recordId, title: r.title, source: r.source, sourceRef: r.sourceRef, version: r.version, label: citationOf(r) });
  if (!retrieval.grounded || !retrieval.results.length) {
    return { text: UNAVAILABLE_TEXT, grounded: false, mode: "fallback", citations: [] };
  }
  const top = retrieval.results[0];
  const idf = await termIdf();

  if (opts.allowLlm !== false && llmEnabled()) {
    const context = retrieval.results
      .map((r) => `<record id="${r.recordId}" title="${r.title}" source="${r.source}" version="${r.version}">\n${r.content}\n</record>`)
      .join("\n");
    try {
      const res = await complete({ system: SYSTEM, user: `Customer question: ${query}\n\nKnowledge records:\n${context}` });
      const [answerPart, srcPart = ""] = res.text.split(/\n?SOURCES:/i);
      const answer = answerPart.trim();
      if (/^UNAVAILABLE/i.test(answer)) {
        return { text: UNAVAILABLE_TEXT, grounded: false, mode: "llm", citations: [], llmLatencyMs: res.latencyMs, verifier: "model reported unavailable" };
      }
      const cited = (srcPart.match(/kb_[a-z]+_\d{3}/g) ?? []) as string[];
      const problem = verifyLlmAnswer(answer, cited, retrieval.results);
      if (!problem) {
        return { text: answer, grounded: true, mode: "llm", citations: retrieval.results.filter((r) => cited.includes(r.recordId)).map(cite), llmLatencyMs: res.latencyMs, verifier: "passed" };
      }
      return { text: extractive(query, top, idf), grounded: true, mode: "extractive", citations: [cite(top)], llmLatencyMs: res.latencyMs, verifier: `LLM answer rejected (${problem}); used extractive answer` };
    } catch (e) {
      const msg = e instanceof LlmUnavailable ? e.message : (e as Error).message;
      return { text: extractive(query, top, idf), grounded: true, mode: "extractive", citations: [cite(top)], llmError: msg };
    }
  }
  return { text: extractive(query, top, idf), grounded: true, mode: "extractive", citations: [cite(top)] };
}
