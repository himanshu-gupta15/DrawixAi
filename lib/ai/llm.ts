/**
 * Optional Claude integration. Every caller has a deterministic fallback, so the system works
 * (retrieval-only, extractive answers) when LLM_API_KEY is not configured or the call fails.
 */
import Anthropic from "@anthropic-ai/sdk";

export const LLM_MODEL = process.env.LLM_MODEL || "claude-opus-5-5";
export const llmEnabled = () => !!process.env.LLM_API_KEY;

const g = globalThis as unknown as { __anthropic?: Anthropic };
function client() {
  return (g.__anthropic ??= new Anthropic({ apiKey: process.env.LLM_API_KEY, maxRetries: 1, timeout: 10_000 }));
}

export class LlmUnavailable extends Error {}

/** Single short completion for voice-length answers. Low effort keeps latency suitable for a live call. */
export async function complete(opts: { system: string; user: string; maxTokens?: number }): Promise<{ text: string; latencyMs: number; model: string }> {
  if (!llmEnabled()) throw new LlmUnavailable("LLM_API_KEY not set");
  const t0 = performance.now();
  try {
    const res = await client().beta.messages.create({
      model: LLM_MODEL,
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
