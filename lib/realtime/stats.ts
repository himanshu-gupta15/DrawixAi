export function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return Math.round(s[idx] * 10) / 10;
}
export const summarize = (v: number[]) => ({ n: v.length, p50: percentile(v, 50), p95: percentile(v, 95), max: v.length ? Math.round(Math.max(...v) * 10) / 10 : null });
