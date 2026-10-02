/**
 * Optional LLM layer. Providers, in order of precedence:
 *   1. Groq (GROQ_API_KEY)      – fast hosted open models, e.g. openai/gpt-oss-120b
 *   2. Anthropic (LLM_API_KEY)  – Claude
 * Every caller has a deterministic fallback, so the system still works (extractive answers,
 * template nudges) when no key is set or a call fails. Answers are always checked by the
 * grounding verifier in lib/rag/answer.ts, whichever provider produced them.
 */
import Anthropic from "@anthropic-ai/sdk";
import Groq from "groq-sdk";

export type LlmProvider = "groq" | "anthropic" | "none";

export function llmProvider(): LlmProvider {
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.LLM_API_KEY) return "anthropic";
  return "none";
}
export const llmEnabled = () => llmProvider() !== "none";

export const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
/** Small, fast model for Q4 nudge phrasing; on Groq each model has its own rate-limit bucket. */
export const GROQ_NUDGE_MODEL = process.env.GROQ_NUDGE_MODEL || "openai/gpt-oss-20b";
export const ANTHROPIC_MODEL = process.env.LLM_MODEL || "claude-opus-5-5";
export const LLM_MODEL = llmProvider() === "groq" ? GROQ_MODEL : ANTHROPIC_MODEL;

const g = globalThis as unknown as { __anthropic?: Anthropic; __groq?: Groq };
const anthropic = () => (g.__anthropic ??= new Anthropic({ apiKey: process.env.LLM_API_KEY, maxRetries: 1, timeout: 10_000 }));
const groq = () => (g.__groq ??= new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: 1, timeout: 10_000 }));

export class LlmUnavailable extends Error {}

type Result = { text: string; latencyMs: number; model: string };

/** Single short completion for voice-length answers; low reasoning effort keeps latency call-friendly. */
export async function complete(opts: { system: string; user: string; maxTokens?: number; purpose?: "answer" | "nudge" }): Promise<Result> {
  const provider = llmProvider();
  if (provider === "none") throw new LlmUnavailable("no LLM key set (GROQ_API_KEY or LLM_API_KEY)");
  const t0 = performance.now();
  return provider === "groq" ? completeGroq(opts, t0) : completeAnthropic(opts, t0);
}

async function completeGroq(opts: { system: string; user: string; maxTokens?: number; purpose?: "answer" | "nudge" }, t0: number): Promise<Result> {
  try {
    const model = opts.purpose === "nudge" ? GROQ_NUDGE_MODEL : GROQ_MODEL;
    const isReasoning = /gpt-oss|qwen3/.test(model);
    const res = await groq().chat.completions.create({
      model,
      max_completion_tokens: opts.maxTokens ?? 1024,
      temperature: 0.2,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      // gpt-oss / qwen3 are reasoning models: keep reasoning short and out of the answer text.
      ...(isReasoning ? { reasoning_effort: "low" as const, reasoning_format: "hidden" as const } : {}),
    });
    const text = (res.choices[0]?.message?.content ?? "").trim();
    if (!text) throw new LlmUnavailable("empty response");
    return { text, latencyMs: Math.round(performance.now() - t0), model: res.model };
  } catch (e) {
    if (e instanceof LlmUnavailable) throw e;
    if (e instanceof Groq.RateLimitError) throw new LlmUnavailable("rate limited");
    if (e instanceof Groq.APIConnectionError) throw new LlmUnavailable("connection error"); // subclass of APIError: check first
    if (e instanceof Groq.APIError) throw new LlmUnavailable(`API error ${e.status}`);
    throw e;
  }
}

async function completeAnthropic(opts: { system: string; user: string; maxTokens?: number }, t0: number): Promise<Result> {
  try {
    const res = await anthropic().beta.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      output_config: { effort: "low" },
      // Server-side refusal fallback: routes a declined request to a fallback model automatically.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (res.stop_reason === "refusal") throw new LlmUnavailable("model declined the request");
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    if (!text) throw new LlmUnavailable("empty response");
    return { text, latencyMs: Math.round(performance.now() - t0), model: res.model };
  } catch (e) {
    if (e instanceof LlmUnavailable) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new LlmUnavailable("rate limited");
    if (e instanceof Anthropic.APIConnectionError) throw new LlmUnavailable("connection error"); // subclass of APIError: check first
    if (e instanceof Anthropic.APIError) throw new LlmUnavailable(`API error ${e.status}`);
    throw e;
  }
}
