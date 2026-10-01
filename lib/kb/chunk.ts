/**
 * Section-aware chunking. A section (heading + body) is the natural retrieval unit; FAQ items
 * stay whole. Long sections are split on sentence boundaries into ~110-word windows with a
 * one-sentence overlap so a voice answer can be built from a single chunk.
 */
export const MAX_WORDS = 140;
export const TARGET_WORDS = 110;

export function splitSentences(text: string) {
  return text
    .split(/\n+/)
    // split after . ! ? only when followed by whitespace + an uppercase/quote (keeps "96.4%" and "e.g." intact)
    .flatMap((p) => p.split(/(?<=[.!?])\s+(?=[A-Z"“(₹])/))
    .map((s) => s.trim())
    .filter(Boolean);
}

export function chunkSection(text: string): string[] {
  const words = text.split(/\s+/).length;
  if (words <= MAX_WORDS) return [text];
  const sents = splitSentences(text);
  const chunks: string[] = [];
  let cur: string[] = [];
  let count = 0;
  for (const s of sents) {
    const w = s.split(/\s+/).length;
    if (count + w > TARGET_WORDS && cur.length) {
      chunks.push(cur.join(" "));
      cur = [cur[cur.length - 1]]; // overlap
      count = cur[0].split(/\s+/).length;
    }
    cur.push(s);
    count += w;
  }
  if (cur.length) chunks.push(cur.join(" "));
  return chunks;
}
