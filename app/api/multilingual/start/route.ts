import { startMlCall } from "@/lib/multilingual/service";

export async function POST(req: Request) {
  const { market } = (await req.json()) as { market?: string };
  if (market !== "PH" && market !== "ID") return Response.json({ error: "market must be PH or ID" }, { status: 400 });
  return Response.json(await startMlCall(market));
}
