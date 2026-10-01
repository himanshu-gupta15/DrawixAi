/**
 * Extraction: turns each raw source into a list of titled sections, removing boilerplate
 * (navigation, headers/footers, cookie banners, promos, repeated PDF page furniture).
 */
import * as cheerio from "cheerio";
import { extractText, getDocumentProxy } from "unpdf";
import type { ExtractedDoc, Section, SourceSpec } from "./types";

const BOILERPLATE_SELECTORS = [
  "script", "style", "noscript", "nav", "header", "footer", "aside", "form", "button", "iframe",
  "[class*=cookie]", "[class*=promo]", "[class*=cta]", "[class*=banner]", "[role=navigation]",
];

export async function extractSource(spec: SourceSpec, data: Buffer): Promise<ExtractedDoc> {
  switch (spec.type) {
    case "html":
    case "url":
      return extractHtml(spec, data.toString("utf8"));
    case "pdf":
      return extractPdf(spec, data);
    case "markdown":
      return extractMarkdown(spec, data.toString("utf8"));
    case "text":
      return extractPlainText(spec, data.toString("utf8"));
    case "csv":
      return extractCsv(spec, data.toString("utf8"));
    case "form_json":
      return extractForm(spec, data.toString("utf8"));
    default:
      throw new Error(`Unsupported source type: ${spec.type}`);
  }
}

/** Fetches a public web page for ingestion (website extraction path). */
export async function fetchUrl(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": "DravixKB/1.0 (+knowledge-base ingestion)" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const type = res.headers.get("content-type") || "";
  if (!type.includes("html") && !type.includes("text")) throw new Error(`Unsupported content-type ${type}`);
  return Buffer.from(await res.arrayBuffer());
}

// ---------------------------------------------------------------- HTML
function extractHtml(spec: SourceSpec, html: string): ExtractedDoc {
  const $ = cheerio.load(html);
  const title = ($("title").first().text() || spec.id).split("|")[0].split(" - ")[0].trim();
  let removedLines = 0;
  for (const sel of BOILERPLATE_SELECTORS) {
    $(sel).each((_, el) => {
      const t = $(el).text().trim();
      if (t) removedLines += t.split(/\n+/).length;
      $(el).remove();
    });
  }
  const root = $("main").length ? $("main") : $("body");
  const sections: Section[] = [];
  let current: Section | null = null;
  const push = () => {
    if (current && current.text.trim()) sections.push(current);
  };
  root.find("h1,h2,h3,h4,p,li,blockquote,table").each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const $el = $(el);
    if (/^h[1-4]$/.test(tag)) {
      push();
      const heading = $el.text().replace(/\s+/g, " ").trim();
      current = { heading, text: "", ref: `${spec.path}#${slug(heading)}`, kind: tag === "h3" ? "faq" : "section" };
      return;
    }
    if (tag === "p" && $el.parents("blockquote,li,table").length) return; // handled by parent
    if (!current) current = { heading: title, text: "", ref: `${spec.path}#top`, kind: "section" };
    if (tag === "table") {
      current.text += "\n" + tableToSentences($, el, current.heading);
      current.kind = "table";
      return;
    }
    const text = $el.text().replace(/\s+/g, " ").trim();
    if (text) current.text += (current.text ? "\n" : "") + text;
  });
  push();
  return { title, sections, removedLines, warnings: [] };
}

/** Linearise a table into self-contained sentences (one per row) so each row is retrievable. */
function tableToSentences($: cheerio.CheerioAPI, table: unknown, caption: string): string {
  const rows = $(table as never).find("tr").toArray().map((tr) =>
    $(tr).find("th,td").toArray().map((c) => $(c).text().replace(/\s+/g, " ").trim()),
  );
  if (rows.length < 2) return "";
  const [header, ...body] = rows;
  return body
    .map((cells) => `${cells[0]}: ` + cells.slice(1).map((c, i) => `${header[i + 1]} – ${c}`).join("; ") + ".")
    .map((s) => (caption ? `${caption} – ${s}` : s))
    .join("\n");
}

// ---------------------------------------------------------------- PDF
async function extractPdf(spec: SourceSpec, data: Buffer): Promise<ExtractedDoc> {
  let pages: string[];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    pages = (await extractText(pdf, { mergePages: false })).text as string[];
  } catch (e) {
    throw new Error(`PDF parsing failed (${(e as Error).message}). File may be corrupt or a scanned image; route to OCR/manual review.`);
  }
  const totalChars = pages.join("").replace(/\s/g, "").length;
  if (totalChars < 50) throw new Error("PDF has no extractable text layer (likely scanned). Needs OCR.");

  // Header/footer detection: a line (digits masked) that repeats on >= 50% of pages is page furniture.
  const norm = (l: string) => l.trim().toLowerCase().replace(/\d+/g, "#");
  const counts = new Map<string, number>();
  pages.forEach((p) => new Set(p.split("\n").map(norm)).forEach((l) => counts.set(l, (counts.get(l) || 0) + 1)));
  const furniture = new Set([...counts].filter(([l, c]) => l && pages.length > 1 && c / pages.length >= 0.5).map(([l]) => l));

  let removedLines = 0;
  const sections: Section[] = [];
  pages.forEach((page, i) => {
    const lines = page.split("\n").map((l) => l.trim()).filter(Boolean);
    const kept = lines.filter((l) => {
      const drop = furniture.has(norm(l)) || /^page \d+( of \d+)?$/i.test(l);
      if (drop) removedLines++;
      return !drop;
    });
    let current: Section | null = null;
    for (const line of kept) {
      const isHeading = line.length < 70 && !/[.:;,]$/.test(line) && /^[A-Z]/.test(line) && line.split(" ").length <= 9 && !/\d{2,}/.test(line);
      if (isHeading) {
        if (current?.text) sections.push(current);
        current = { heading: line, text: "", ref: `${spec.path}#page=${i + 1}`, kind: "section" };
      } else {
        if (!current) current = { heading: `Page ${i + 1}`, text: "", ref: `${spec.path}#page=${i + 1}`, kind: "section" };
        // PDF lines wrap mid-sentence: join with a space, but keep a break where a sentence ends.
        current.text += (current.text && /[.!?]$/.test(current.text) ? "\n" : current.text ? " " : "") + line;
      }
    }
    if (current?.text) sections.push(current);
  });
  return { title: spec.title || spec.id, sections, removedLines, warnings: [] };
}

// ---------------------------------------------------------------- Markdown / text
function extractMarkdown(spec: SourceSpec, md: string): ExtractedDoc {
  const lines = md.split("\n");
  let title = spec.id;
  const meta: Record<string, string> = {};
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      if (h[1].length === 1) {
        title = h[2].trim();
        continue;
      }
      if (current?.text) sections.push(current);
      current = { heading: h[2].replace(/^Objection:\s*/i, "Objection – ").trim(), text: "", ref: `${spec.path}#${slug(h[2])}`, kind: "section" };
      continue;
    }
    if (/^(version|updated|effective)\b/i.test(line) || /\|\s*(effective|updated)/i.test(line)) {
      Object.assign(meta, parseMetaLine(line));
      continue;
    }
    if (!line) continue;
    if (!current) current = { heading: title, text: "", ref: `${spec.path}#top`, kind: "section" };
    current.text += (current.text ? "\n" : "") + line.replace(/^[-*]\s+/, "");
  }
  if (current?.text) sections.push(current);
  return { title, sections, removedLines: 0, warnings: [], meta };
}

function extractPlainText(spec: SourceSpec, txt: string): ExtractedDoc {
  const lines = txt.split("\n").map((l) => l.trim());
  const title = lines.find(Boolean) || spec.id;
  const meta: Record<string, string> = {};
  const sections: Section[] = [];
  let current: Section | null = null;
  lines.slice(lines.indexOf(title) + 1).forEach((line, idx, arr) => {
    if (!line) return;
    if (/^version\b/i.test(line)) {
      Object.assign(meta, parseMetaLine(line));
      return;
    }
    const next = arr[idx + 1] || "";
    const isHeading = line.length < 40 && !/[.:]$/.test(line) && !!next && !/:/.test(line);
    if (isHeading) {
      if (current?.text) sections.push(current);
      current = { heading: line, text: "", ref: `${spec.path}#${slug(line)}`, kind: "section" };
      return;
    }
    if (!current) current = { heading: title, text: "", ref: `${spec.path}#top`, kind: "section" };
    current.text += (current.text ? "\n" : "") + line;
  });
  if (current && (current as Section).text) sections.push(current);
  return { title: titleCase(title), sections, removedLines: 0, warnings: [], meta };
}

function parseMetaLine(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  const v = /version:?\s*([\d.]+)/i.exec(line);
  if (v) out.version = v[1];
  const d = /(?:effective(?: date)?|updated):?\s*([0-9]{1,4}[-/][0-9]{1,2}[-/][0-9]{1,4}|\d{1,2} [A-Za-z]+ \d{4})/i.exec(line);
  if (d) out.effectiveDate = d[1];
  const s = /status:?\s*([a-z][a-z ]+?)(?:\s+by|$)/i.exec(line);
  if (s) out.status = s[1].trim();
  return out;
}

// ---------------------------------------------------------------- CSV (tables)
export function parseCsv(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.split(",").map((c) => c.trim()));
}

function extractCsv(spec: SourceSpec, text: string): ExtractedDoc {
  const [header, ...rows] = parseCsv(text);
  const seen = new Set<string>();
  const warnings: string[] = [];
  const unique = rows.filter((r) => {
    const k = r.join("|");
    if (seen.has(k)) {
      warnings.push(`Duplicate table row removed: ${k}`);
      return false;
    }
    seen.add(k);
    return true;
  });
  const col = (name: string) => header.indexOf(name);
  const byPlan = new Map<string, string[][]>();
  unique.forEach((r) => byPlan.set(r[col("plan")], [...(byPlan.get(r[col("plan")]) || []), r]));
  const sections: Section[] = [...byPlan].map(([plan, rs]) => ({
    heading: `${plan} plan premium rates`,
    ref: `${spec.path}#plan=${plan.toLowerCase()}`,
    kind: "table" as const,
    text:
      `${plan} plan indicative annual premium for one adult (sum insured ${rs[0][col("sum_insured")]}): ` +
      rs.map((r) => `age ${r[col("age_band")]}: Rs ${fmtInr(r[col("annual_premium_inr")])} per year or Rs ${fmtInr(r[col("monthly_emi_inr")])} per month`).join("; ") +
      ". Final premium depends on members, city, health declaration and underwriting.",
  }));
  return { title: spec.title || "Premium rate table", sections, removedLines: rows.length - unique.length, warnings };
}

// ---------------------------------------------------------------- Forms
const CANONICAL_FIELDS: [RegExp, string][] = [
  [/full name|^name$/i, "full_name"],
  [/dob|date of birth/i, "date_of_birth"],
  [/mobile|phone/i, "phone"],
  [/e-?mail/i, "email"],
  [/city|town/i, "city"],
  [/members/i, "members_to_cover"],
  [/ped|pre-?existing/i, "has_pre_existing_disease"],
  [/sum insured/i, "sum_insured_inr"],
  [/smok/i, "is_smoker"],
];

export function canonicalField(label: string) {
  return CANONICAL_FIELDS.find(([re]) => re.test(label))?.[1] ?? slug(label).replace(/-/g, "_");
}

function extractForm(spec: SourceSpec, text: string): ExtractedDoc {
  const form = JSON.parse(text) as { form_name: string; form_version?: string; fields: { label: string; type: string; required: boolean; options?: string[]; format?: string }[]; sample_submission?: unknown };
  const fields = form.fields.map((f) => ({ ...f, name: canonicalField(f.label) }));
  const warnings = form.sample_submission ? ["sample_submission dropped: contains personal data and is not knowledge"] : [];
  const required = fields.filter((f) => f.required).map((f) => f.name.replace(/_/g, " "));
  const optional = fields.filter((f) => !f.required).map((f) => f.name.replace(/_/g, " "));
  return {
    title: form.form_name,
    sections: [
      {
        heading: "Details needed for a health insurance quote",
        ref: `${spec.path}#fields`,
        kind: "section",
        text: `To prepare a quote we need: ${required.join(", ")}. Optional: ${optional.join(", ")}. Date of birth is captured as a date; members to cover can be self, spouse, kids and parents.`,
      },
    ],
    removedLines: 0,
    warnings,
    meta: { formSchema: JSON.stringify(fields.map(({ name, type, required, options }) => ({ name, type, required, options }))) },
  };
}

// ---------------------------------------------------------------- helpers
export function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}
function titleCase(s: string) {
  return s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s;
}
function fmtInr(n: string) {
  return Number(n).toLocaleString("en-IN");
}
