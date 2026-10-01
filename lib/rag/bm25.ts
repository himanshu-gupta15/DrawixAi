/** Minimal BM25 (Okapi) keyword index over active KB records — the lexical half of hybrid search. */
const STOP = new Set("a an and are as at be by can do does for from has have how i if in is it its me my of on or our so that the their them there this to was we what when where which who why will with you your yes no not am".split(" "));

export function tokenize(s: string) {
  return s
    .toLowerCase()
    .replace(/₹/g, " rupees ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t))
    .map((t) => t.replace(/(ies)$/, "y").replace(/(?<=[a-z]{3})(es|s)$/, "").replace(/(?<=[a-z]{4})ing$/, ""));
}

export class Bm25 {
  private docs: { id: string; tf: Map<string, number>; len: number }[] = [];
  private df = new Map<string, number>();
  private avgLen = 0;
  constructor(items: { id: string; text: string }[], private k1 = 1.2, private b = 0.75) {
    for (const it of items) {
      const toks = tokenize(it.text);
      const tf = new Map<string, number>();
      toks.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
      tf.forEach((_, t) => this.df.set(t, (this.df.get(t) || 0) + 1));
      this.docs.push({ id: it.id, tf, len: toks.length });
    }
    this.avgLen = this.docs.reduce((s, d) => s + d.len, 0) / (this.docs.length || 1);
  }
  /** Inverse document frequency of a (tokenized) term; unseen terms get the maximum. */
  idf(term: string) {
    const df = this.df.get(term) ?? 0;
    return Math.log(1 + (this.docs.length - df + 0.5) / (df + 0.5));
  }

  search(query: string, limit = 20) {
    const q = [...new Set(tokenize(query))];
    const N = this.docs.length;
    return this.docs
      .map((d) => {
        let score = 0;
        for (const t of q) {
          const f = d.tf.get(t);
          if (!f) continue;
          const idf = Math.log(1 + (N - this.df.get(t)! + 0.5) / (this.df.get(t)! + 0.5));
          score += (idf * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * d.len) / this.avgLen));
        }
        return { recordId: d.id, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
