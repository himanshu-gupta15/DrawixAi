import fs from "node:fs";

export async function GET() {
  const scenarios = JSON.parse(fs.readFileSync("data/test-cases/q4-scenarios.json", "utf8")) as { id: string; title: string; expected: string[]; mustNotFire: string[]; noise?: { snrDb: number } }[];
  return Response.json(scenarios.map((s) => ({ id: s.id, title: s.title, expected: s.expected, mustNotFire: s.mustNotFire, noisy: !!s.noise, audioReady: fs.existsSync(`public/audio/q4/${s.id}.wav`) })));
}
