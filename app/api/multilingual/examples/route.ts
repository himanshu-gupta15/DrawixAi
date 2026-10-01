import fs from "node:fs";

export async function GET() {
  return Response.json(JSON.parse(fs.readFileSync("data/markets/localization-examples.json", "utf8")));
}
