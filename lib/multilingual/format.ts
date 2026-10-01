/** Market-specific formatting of amounts and dates for text and for speech (TTS). */
const ID_MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const TL_MONTHS = ["Enero", "Pebrero", "Marso", "Abril", "Mayo", "Hunyo", "Hulyo", "Agosto", "Setyembre", "Oktubre", "Nobyembre", "Disyembre"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const parse = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return { y, m, d }; };
export const addDays = (iso: string, n: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n)).toISOString().slice(0, 10);

export const php = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const idr = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
export const dateEn = (iso: string) => { const { m, d } = parse(iso); return `${EN_MONTHS[m - 1]} ${d}`; };
// Formal Tagalog uses "ika-15 ng Oktubre"; everyday Taglish keeps English month names ("October 15").
export const dateTl = (iso: string) => { const { m, d } = parse(iso); return `ika-${d} ng ${TL_MONTHS[m - 1]}`; };
export const dateId = (iso: string) => { const { y, m, d } = parse(iso); return `${d} ${ID_MONTHS[m - 1]} ${y}`; };

// ---- Indonesian number words for TTS ("Rp1.250.000" -> "satu juta dua ratus lima puluh ribu rupiah")
const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
export function terbilang(n: number): string {
  n = Math.floor(n);
  if (n < 12) return SATUAN[n] || "nol";
  if (n < 20) return `${SATUAN[n - 10]} belas`;
  if (n < 100) return `${SATUAN[Math.floor(n / 10)]} puluh ${SATUAN[n % 10]}`.trim();
  if (n < 200) return `seratus ${terbilang(n - 100)}`.trim().replace(/ nol$/, "");
  if (n < 1000) return `${SATUAN[Math.floor(n / 100)]} ratus ${n % 100 ? terbilang(n % 100) : ""}`.trim();
  if (n < 2000) return `seribu ${n % 1000 ? terbilang(n - 1000) : ""}`.trim();
  if (n < 1e6) return `${terbilang(Math.floor(n / 1000))} ribu ${n % 1000 ? terbilang(n % 1000) : ""}`.trim();
  if (n < 1e9) return `${terbilang(Math.floor(n / 1e6))} juta ${n % 1e6 ? terbilang(n % 1e6) : ""}`.trim();
  return `${terbilang(Math.floor(n / 1e9))} miliar ${n % 1e9 ? terbilang(n % 1e9) : ""}`.trim();
}

export function speechId(text: string) {
  return text
    .replace(/Rp\s?([\d.]+)/g, (_, n: string) => `${terbilang(+n.replace(/\./g, ""))} rupiah`)
    .replace(/(\d+),(\d+)%/g, (_, a, b) => `${terbilang(+a)} koma ${b.split("").map((d: string) => terbilang(+d)).join(" ")} persen`)
    .replace(/1x24 jam/g, "satu kali dua puluh empat jam")
    .replace(/ke-(\d+)/g, (_, n) => `ke${terbilang(+n).replace(/^satu$/, "satu")}`)
    .replace(/\bVA\b/g, "virtual account")
    .replace(/\b(\d+)\b/g, (_, n) => terbilang(+n));
}

/** English/Taglish TTS: amounts are spoken in English in everyday Filipino speech. */
export function speechPh(text: string) {
  return text.replace(/₱([\d,]+)(?:\.00)?/g, "$1 pesos").replace(/\bGCash\b/g, "G-Cash");
}
