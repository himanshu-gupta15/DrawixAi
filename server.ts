/**
 * Custom Next.js server: serves the app and a WebSocket endpoint (/ws/insights) for Q4 live
 * insights. Next.js route handlers cannot hold persistent WebSockets, so the socket lives here,
 * in the same process and the same TypeScript codebase.
 */
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import next from "next";
import { WebSocketServer, type WebSocket } from "ws";
import { InsightSession, type InsightEvent, type Speaker } from "./lib/realtime/session";
import { startReplay } from "./lib/realtime/replay";
import { int16ToFloat32 } from "./lib/audio/wav";
import { warmupAsr } from "./lib/asr/whisper";

const port = parseInt(process.env.PORT || "3100", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, port });
const handle = app.getRequestHandler();

const SCENARIO_FILE = path.join(process.cwd(), "data/test-cases/q4-scenarios.json");
const AUDIO_DIR = path.join(process.cwd(), "public/audio/q4");

function scenarioAudio(id: string) {
  const ids = (JSON.parse(fs.readFileSync(SCENARIO_FILE, "utf8")) as { id: string }[]).map((s) => s.id);
  if (!ids.includes(id)) return null;
  const p = path.join(AUDIO_DIR, `${id}.wav`);
  return fs.existsSync(p) ? p : null;
}

function handleSocket(ws: WebSocket) {
  let session: InsightSession | null = null;
  let cancelReplay: (() => void) | null = null;
  let micSpeaker: Speaker = "customer";
  const send = (e: InsightEvent | Record<string, unknown>) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(e));
  const finish = async () => {
    if (!session) return;
    const s = session;
    session = null;
    const summary = await s.stop();
    send({ type: "ended", summary });
  };

  ws.on("message", async (data, isBinary) => {
    if (isBinary) {
      // Mic mode: raw PCM16 mono 16 kHz from the browser's AudioWorklet.
      if (!session || session.mode !== "mic") return;
      const pcm = int16ToFloat32(data as Buffer);
      session.pushAudio(micSpeaker, pcm);
      session.advanceSilence(micSpeaker === "agent" ? "customer" : "agent", pcm.length);
      return;
    }
    let msg: { type: string; mode?: string; scenario?: string; speaker?: Speaker; id?: string };
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.type === "start") {
      if (session) await finish();
      if (msg.mode === "replay") {
        const wav = msg.scenario ? scenarioAudio(msg.scenario) : null;
        if (!wav) return send({ type: "error", message: `Unknown scenario or audio not generated: ${msg.scenario}. Run npm run audio:q4.` });
        session = new InsightSession("replay", msg.scenario!, send);
        const r = startReplay(session, wav, { onDone: () => void finish() });
        cancelReplay = r.cancel;
        send({ type: "session", id: session.id, mode: "replay", scenario: msg.scenario, durationMs: r.durationMs, audioUrl: `/audio/q4/${msg.scenario}.wav` });
      } else {
        session = new InsightSession("mic", null, send);
        micSpeaker = msg.speaker ?? "customer";
        send({ type: "session", id: session.id, mode: "mic" });
      }
      const s = session;
      const timer = setInterval(() => (session === s ? send({ type: "metrics", metrics: s.metrics() }) : clearInterval(timer)), 2000);
    } else if (msg.type === "speaker" && msg.speaker) micSpeaker = msg.speaker;
    else if (msg.type === "ack" && msg.id) session?.ack(msg.id);
    else if (msg.type === "stop") { cancelReplay?.(); await finish(); }
  });
  ws.on("close", () => { cancelReplay?.(); void finish(); });
}

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));
  const wss = new WebSocketServer({ noServer: true });
  const nextUpgrade = app.getUpgradeHandler();
  server.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/ws/insights")) wss.handleUpgrade(req, socket, head, (ws) => handleSocket(ws));
    else nextUpgrade(req, socket, head); // Next.js dev HMR socket
  });
  server.listen(port, () => {
    console.log(`> Dravix AI ready on http://localhost:${port} (${dev ? "dev" : "production"}) — WebSocket at /ws/insights`);
    warmupAsr().then(() => console.log("> Whisper ASR model loaded")).catch((e) => console.error("ASR warmup failed", e));
  });
});
