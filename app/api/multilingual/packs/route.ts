import { loadPack } from "@/lib/multilingual/engine";

export async function GET() {
  const summary = (m: "PH" | "ID") => {
    const p = loadPack(m);
    return { market: p.market, sector: p.sector, flow: p.flow, botName: p.botName, languages: p.languages, asr: p.asr, tts: p.tts, intents: Object.keys(p.intents), customer: p.customer };
  };
  return Response.json({ PH: summary("PH"), ID: summary("ID") });
}
