"use client";
import { useEffect, useState } from "react";
import { Badge, Card, PageHeader } from "@/components/ui";

export default function SettingsPage() {
  const [s, setS] = useState<Record<string, Record<string, unknown> | boolean> | null>(null);
  useEffect(() => { fetch("/api/system").then((r) => r.json()).then(setS); }, []);
  const ok = (v: unknown) => (v ? <Badge tone="green">ok</Badge> : <Badge tone="red">down</Badge>);
  return (
    <div>
      <PageHeader route="/settings" title="Settings & system status" subtitle="Providers in use and whether each dependency is reachable. Configure via .env (see .env.example); secrets are never shown here." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Infrastructure">
          {!s ? "Loading…" : (
            <ul className="space-y-2 text-sm">
              <li>PostgreSQL (Prisma) {ok((s.postgres as { ok: boolean }).ok)} <span className="text-t2">{JSON.stringify(s.postgres)}</span></li>
              <li>Qdrant vector DB {ok((s.qdrant as { ok: boolean }).ok)} <span className="text-t2">{JSON.stringify(s.qdrant)}</span></li>
              <li>Escalation webhook {s.escalationWebhook ? <Badge tone="green">configured</Badge> : <Badge>not set — escalations stored in DB</Badge>}</li>
            </ul>
          )}
        </Card>
        <Card title="AI providers">
          {!s ? "Loading…" : (
            <ul className="space-y-2 text-sm">
              <li>LLM: {(s.llm as { configured: boolean }).configured ? <Badge tone="green">{String((s.llm as { provider?: string }).provider === "groq" ? "Groq" : "Claude")} configured</Badge> : <Badge tone="amber">no LLM_API_KEY</Badge>} <span className="text-t2">{String((s.llm as { model: string }).model)} — {String((s.llm as { mode: string }).mode)}</span></li>
              <li>Embeddings: <span className="text-t2">{String((s.embeddings as { provider: string }).provider)} · {String((s.embeddings as { model: string }).model)}</span></li>
              <li>ASR: <span className="text-t2">{String((s.asr as { server: string }).server)}; {String((s.asr as { browser: string }).browser)}</span></li>
              <li>TTS: <span className="text-t2">{String((s.tts as { browser: string }).browser)}; {String((s.tts as { tests: string }).tests)}</span></li>
            </ul>
          )}
        </Card>
        <Card title="Environment variables" className="lg:col-span-2">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-t2"><tr><th className="py-1">Variable</th><th>Required</th><th>Purpose</th></tr></thead>
            <tbody>
              {[["DATABASE_URL", "yes", "PostgreSQL connection (docker compose provides port 5433)"], ["VECTOR_DATABASE_URL", "yes", "Qdrant URL (http://localhost:6333)"], ["GROQ_API_KEY", "no", "Groq API key. Takes precedence: LLM answer phrasing (checked by the grounding verifier) and nudge phrasing via Groq."], ["GROQ_MODEL", "no", "Groq model id (default openai/gpt-oss-120b)"], ["LLM_API_KEY", "no", "Anthropic API key, used when no Groq key is set. Without any key, answers are extractive."], ["LLM_MODEL", "no", "Claude model id (default claude-opus-5-5)"], ["ESCALATION_WEBHOOK_URL", "no", "POST target for human-escalation events"], ["EMBEDDING_MODEL / ASR_MODEL", "no", "Local transformers.js models (downloaded once, no key)"], ["PORT", "no", "Server port (default 3100)"]].map(([k, r, p]) => (
                <tr key={k} className="border-t border-divider"><td className="py-1 font-mono text-xs">{k}</td><td>{r}</td><td className="text-t2">{p}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
