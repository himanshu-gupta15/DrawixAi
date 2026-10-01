"use client";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Chip, Empty, Notice, PageHeader, Segmented, inputClass } from "@/components/ui";
import { createRecognizer, speak, speechRecognitionAvailable, voicesFor } from "@/lib/client/audio";

type Market = "PH" | "ID";
type Detection = { variant?: string; register?: string; regional?: string | null; regionalMarkers?: string[]; loanwords?: string[]; englishLoanwords?: string[]; tagalog?: number; english?: number; formal?: number; casual?: number };
type Exchange = { said?: string; asr?: string; detection?: Detection; reply: string; tts: string; intent?: string; confidence?: number; method?: string; variant: string };
type Pack = { market: Market; sector: string; flow: string; botName: string; languages: string[]; asr: { browserLocale: string; whisperLanguage: string }; tts: { browserLocales: string[]; note: string }; intents: string[] };
type Example = { market: Market; aspect: string; literal: string; localized: string; why: string };

const QUICK: Record<Market, { label: string; text: string }[]> = {
  PH: [
    { label: "Confirm (Tagalog)", text: "Opo, ako po si Maria." },
    { label: "Cooperative (English)", text: "Yes, I'll pay before the due date." },
    { label: "Objection (Taglish)", text: "Kaso short ako this month, sa next sahod pa ako makakabayad." },
    { label: "Finance terms mix", text: "Ano mangyayari sa coverage ko pag nag-lapse yung policy?" },
    { label: "Colloquial", text: "Sayang lang yung bayad, di ko naman nagagamit eh." },
    { label: "Beneficiary", text: "Pwede ko bang palitan yung beneficiary ko?" },
    { label: "Escalation", text: "Ayoko ng robot, gusto ko makausap yung agent ko." },
  ],
  ID: [
    { label: "Confirm (formal)", text: "Iya, betul, dengan saya sendiri." },
    { label: "Cooperative", text: "Baik, akan saya bayarkan sebelum tanggal 15." },
    { label: "Objection (casual)", text: "Waduh Mbak, gaji saya belum cair nih." },
    { label: "Loanwords", text: "Kalau telat, late fee-nya berapa? Bisa reschedule nggak?" },
    { label: "Regional: Javanese", text: "Durung ono duit, Mbak. Mengko tak bayar." },
    { label: "Regional: Medan", text: "Bah, kek mana lah, awak belum gajian lae." },
    { label: "Escalation", text: "Sambungkan ke petugas aja, saya mau komplain." },
  ],
};
const MARKET_INFO: Record<Market, { languages: string; politeness: string; currency: string; asrKey: string }> = {
  PH: { languages: "English · Tagalog · Taglish", politeness: "po / opo", currency: "₱", asrKey: "PH | Damayanti | whisper-small | tagalog" },
  ID: { languages: "Formal · Casual · Regional", politeness: "Bapak / Pak", currency: "Rp", asrKey: "ID | Damayanti | whisper-small | indonesian" },
};
const VARIANT_LABEL: Record<string, string> = { en: "English", tl: "Tagalog", taglish: "Taglish", formal: "Formal", casual: "Casual" };

export default function MultilingualPage() {
  const [market, setMarket] = useState<Market>("PH");
  const [packs, setPacks] = useState<Record<Market, Pack> | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  const [wer, setWer] = useState<Record<string, number>>({});
  const [callId, setCallId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Exchange[]>([]);
  const [ended, setEnded] = useState(false);
  const [text, setText] = useState("");
  const [useMic, setUseMic] = useState(true);
  const [tts, setTts] = useState(true);
  const [voiceInfo, setVoiceInfo] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<ReturnType<typeof createRecognizer> | null>(null);
  const callRef = useRef<string | null>(null);
  const endedRef = useRef(false);

  useEffect(() => {
    fetch("/api/multilingual/packs").then((r) => r.json()).then(setPacks);
    fetch("/api/multilingual/examples").then((r) => r.json()).then(setExamples);
    fetch("/api/evaluation").then((r) => r.json()).then((d) => {
      const rows = (d.multilingualAsr?.summary ?? []) as { config: string; meanWer: number }[];
      setWer(Object.fromEntries(rows.map((r) => [r.config, r.meanWer])));
    });
    return () => rec.current?.stop();
  }, []);

  const pack = packs?.[market];
  const info = MARKET_INFO[market];
  const live = !!callId && !ended;

  async function botSays(ttsText: string) {
    if (!tts || !pack) return;
    rec.current?.pause();
    const r = await speak(ttsText, pack.tts.browserLocales);
    setVoiceInfo(r.voice ? `TTS · ${r.voice}` : `No ${pack.tts.browserLocales[0]} voice installed — browser default used`);
    if (!endedRef.current) rec.current?.resume();
  }

  async function start() {
    rec.current?.stop();
    setError(null); setTurns([]); setEnded(false); endedRef.current = false;
    const r = await fetch("/api/multilingual/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ market }) }).then((x) => x.json());
    setCallId(r.callId); callRef.current = r.callId;
    setTurns([{ reply: r.reply, tts: r.ttsText, variant: r.variant }]);
    if (useMic && speechRecognitionAvailable() && pack) {
      rec.current = createRecognizer(pack.asr.browserLocale, (t, c) => t && send(t, `Web Speech ${pack.asr.browserLocale}${c ? ` · conf ${c.toFixed(2)}` : ""}`), setInterim, (e) => e !== "no-speech" && e !== "aborted" && setError(`ASR: ${e}`));
    } else if (useMic) setError("Web Speech API not available in this browser — type, or use the quick utterances.");
    await botSays(r.ttsText);
  }

  function stop() { endedRef.current = true; setEnded(true); rec.current?.stop(); window.speechSynthesis.cancel(); }

  async function send(t: string, asr = "typed") {
    const id = callRef.current;
    if (!id || endedRef.current || !t.trim()) return;
    setInterim("");
    const r = await fetch("/api/multilingual/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callId: id, text: t }) }).then((x) => x.json());
    if (r.error) return setError(r.error);
    setTurns((x) => [...x, { said: t, asr, detection: r.detection, reply: r.reply, tts: r.ttsText, intent: r.intent, confidence: r.confidence, method: r.method, variant: r.variant }]);
    if (r.ended) { endedRef.current = true; setEnded(true); rec.current?.stop(); }
    await botSays(r.ttsText);
  }

  const ttsVoice = typeof window !== "undefined" && pack ? voicesFor(pack.tts.browserLocales) : null;
  const marketWer = wer[info.asrKey];

  return (
    <div className="max-w-[1150px]">
      <PageHeader code="Q3" route="/multilingual" title="Localized voice bots"
        subtitle="Not translation. Each turn detects language, register and regional markers, then replies in a natively written variant — fallbacks and escalation stay in the caller's language."
        actions={<Segmented<Market> value={market} onChange={setMarket} disabled={live} options={[{ value: "PH", label: "Philippines", sub: "Bancassurance · fil-PH" }, { value: "ID", label: "Indonesia", sub: "Multifinance · id-ID" }]} />} />

      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[10px] border border-line bg-surface px-[17px] py-3.5 text-[13px]">
        <span><span className="text-t2">Languages</span> <b className="ml-1 font-semibold text-ink">{info.languages}</b></span>
        <span title="Whisper-small, market language forced, synthesized speech"><span className="text-t2">Whisper WER</span> <b className="ml-1 font-semibold tabular-nums text-ink">{marketWer !== undefined ? marketWer.toFixed(2) : "—"}</b></span>
        <span><span className="text-t2">Politeness</span> <b className="ml-1 font-semibold text-ink">{info.politeness}</b></span>
        <span><span className="text-t2">Currency</span> <b className="ml-1 font-semibold text-ink">{info.currency}</b></span>
        <span className="flex-1" />
        <span className="text-[12px] text-t3">{voiceInfo || (pack ? (ttsVoice ? `Voice available · ${ttsVoice.name}` : `No ${pack.tts.browserLocales[0]} voice in this browser`) : "")}</span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {live ? <Button variant="danger" onClick={stop}>End call</Button> : <Button onClick={start}>Start call</Button>}
        <label className="flex items-center gap-1.5 text-[13px] text-body"><input type="checkbox" checked={useMic} onChange={(e) => setUseMic(e.target.checked)} disabled={live} /> Microphone ({pack?.asr.browserLocale ?? "…"})</label>
        <label className="flex items-center gap-1.5 text-[13px] text-body"><input type="checkbox" checked={tts} onChange={(e) => setTts(e.target.checked)} /> Speak replies</label>
        {pack && <span className="text-[12.5px] text-t3">{pack.botName} · {pack.flow}</span>}
      </div>
      {error && <Notice>{error}</Notice>}

      <section className="overflow-hidden rounded-[10px] border border-line bg-surface">
        {!turns.length ? (
          <Empty title="No call in progress">Start a call, then speak or use the quick utterances below to test each required case: cooperative, objection, finance terms, colloquial, regional speech and escalation.</Empty>
        ) : turns.map((t, i) => (
          <div key={i} className={`rise grid gap-4 px-[17px] py-4 lg:grid-cols-[28px_1fr_1fr] ${i ? "border-t border-line" : ""}`}>
            <span className="font-mono text-[12px] text-t3">{String(i + 1).padStart(2, "0")}</span>
            <div>
              {t.said ? (
                <>
                  <div className="text-[12px] text-t3">Customer said{t.asr && t.asr !== "typed" ? ` · ${t.asr}` : ""}</div>
                  <div className="mt-1 text-[15px] leading-[1.5] text-ink">“{t.said}”</div>
                  {t.detection && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(t.detection.variant || t.detection.register) && <Badge tone="blue">{VARIANT_LABEL[t.detection.variant ?? t.detection.register ?? ""] ?? t.detection.variant}</Badge>}
                      {t.detection.variant && <Badge>tl {t.detection.tagalog} · en {t.detection.english}</Badge>}
                      {t.detection.register && <Badge>Register · formal {t.detection.formal} / casual {t.detection.casual}</Badge>}
                      {t.detection.regional && <Badge tone="amber">Regional · {t.detection.regional}</Badge>}
                      {t.intent && <Badge mono tone={t.method === "fallback" ? "amber" : "gray"}>{t.method === "fallback" ? "fallback" : t.intent} · {t.confidence}</Badge>}
                      {!!(t.detection.loanwords?.length || t.detection.englishLoanwords?.length) && <Badge>loanwords · {(t.detection.loanwords ?? t.detection.englishLoanwords)?.join(", ")}</Badge>}
                    </div>
                  )}
                </>
              ) : <div className="text-[13px] text-t3">Call opened · identity check before any account detail</div>}
            </div>
            <div className="rounded-[9px] border border-line bg-subtle px-4 py-3">
              <div className="text-[12px] text-t3">Bot replied · {VARIANT_LABEL[t.variant] ?? t.variant}{t.intent === "escalation" ? " · in-language escalation" : ""}</div>
              <div className="mt-1 text-[14.5px] leading-[1.55] text-ink">{t.reply}</div>
              {t.tts !== t.reply && <div className="mt-2 font-mono text-[11.5px] leading-[1.5] text-t3">TTS → “{t.tts.length > 120 ? t.tts.slice(0, 120) + "…" : t.tts}”</div>}
            </div>
          </div>
        ))}
        {interim && <div className="border-t border-line px-[17px] py-2 text-[13px] italic text-t3">{interim}</div>}
        <form className="flex gap-2 border-t border-line px-[17px] py-3" onSubmit={(e) => { e.preventDefault(); const v = text; setText(""); send(v); }}>
          <input className={inputClass} value={text} onChange={(e) => setText(e.target.value)} placeholder={live ? "Type a customer utterance…" : "Start a call first"} disabled={!live} />
          <Button type="submit" variant="ink" disabled={!live || !text.trim()}>Send</Button>
        </form>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-[17px] py-3"><span className="mr-1 text-[12.5px] text-t3">Try</span>{QUICK[market].map((q) => <Chip key={q.label} title={q.text} disabled={!live} onClick={() => send(q.text, "quick test")}>{q.label}</Chip>)}</div>
      </section>

      <h2 className="mb-3 mt-8 text-[15px] font-semibold text-ink">Localization, not literal translation</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {examples.filter((e) => e.market === market).map((e) => (
          <section key={e.aspect} className="rounded-[10px] border border-line bg-surface px-[17px] py-4">
            <div className="text-[13.5px] font-semibold text-ink">{e.aspect}</div>
            <div className="mt-2 text-[12.5px] leading-[1.55]"><span className="text-r-fg">Literal · </span><span className="text-t2 line-through decoration-faint">{e.literal}</span></div>
            <div className="mt-1 text-[13px] leading-[1.55]"><span className="text-g-fg">Bot · </span><span className="text-ink">{e.localized}</span></div>
            <div className="mt-2 text-[12.5px] leading-[1.55] text-t2">{e.why}</div>
          </section>
        ))}
      </div>
      {pack && <p className="mt-4 text-[12.5px] text-t3">ASR: browser Web Speech {pack.asr.browserLocale} live; Whisper ({pack.asr.whisperLanguage}) in the recorded tests. TTS: {pack.tts.note}</p>}
    </div>
  );
}
