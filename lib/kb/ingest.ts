/**
 * Ingestion pipeline (Q2):
 *   load sources -> extract (boilerplate removal) -> supersede old versions -> clean/standardise
 *   -> redact PII -> chunk -> classify (taxonomy) -> dedupe (exact + near) -> fact conflicts
 *   -> assign record ids -> Postgres (metadata) + Qdrant (vectors)
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../database/prisma";
import { cosine, embedPassages } from "../embeddings/local";
import { recreateCollection, upsertPoints } from "../vector/qdrant";
import { chunkSection } from "./chunk";
import { cleanText, normalizeDate, standardizeHeading } from "./clean";
import { contentHash, isNearDuplicate, jaccard, shingles } from "./dedupe";
import { extractSource, fetchUrl } from "./extract";
import { detectConflicts } from "./facts";
import { redactPii } from "./pii";
import { classifyCategory, classifyTopic, detectProductLine } from "./taxonomy";
import type { ChunkDraft, IngestIssue, SourceSpec } from "./types";

export const RAW_DIR = path.join(process.cwd(), "data", "raw");
const UPLOAD_MANIFEST = path.join(RAW_DIR, "uploads", "manifest.json");

export function loadManifest(): SourceSpec[] {
  const base = JSON.parse(fs.readFileSync(path.join(RAW_DIR, "manifest.json"), "utf8")).sources as SourceSpec[];
  const uploads = fs.existsSync(UPLOAD_MANIFEST) ? (JSON.parse(fs.readFileSync(UPLOAD_MANIFEST, "utf8")) as SourceSpec[]) : [];
  return [...base, ...uploads];
}

export function addUploadedSource(spec: SourceSpec) {
  fs.mkdirSync(path.dirname(UPLOAD_MANIFEST), { recursive: true });
  const list = fs.existsSync(UPLOAD_MANIFEST) ? (JSON.parse(fs.readFileSync(UPLOAD_MANIFEST, "utf8")) as SourceSpec[]) : [];
  fs.writeFileSync(UPLOAD_MANIFEST, JSON.stringify([...list.filter((s) => s.id !== spec.id), spec], null, 2));
}

const cmpVersion = (a: string, b: string) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};

export interface IngestReport {
  runId: string;
  durationMs: number;
  stats: Record<string, number>;
  issues: IngestIssue[];
}

export async function runIngestion(opts: { log?: (s: string) => void } = {}): Promise<IngestReport> {
  const log = opts.log ?? (() => {});
  const t0 = Date.now();
  const specs = loadManifest();
  const issues: IngestIssue[] = [];
  const docs: { spec: SourceSpec; status: string; error?: string; title: string; effectiveDate?: string; removedLines: number; chars: number; hash?: string }[] = [];
  const drafts: ChunkDraft[] = [];
  const stats: Record<string, number> = { sources: specs.length, failedSources: 0, removedBoilerplateLines: 0, piiRedactions: 0, exactDuplicates: 0, nearDuplicates: 0, superseded: 0, conflictsFlagged: 0, invalidDates: 0, normalizations: 0 };

  // Latest version per family wins; older versions are kept but marked superseded.
  const latest = new Map<string, string>();
  for (const s of specs) if (!latest.has(s.family) || cmpVersion(s.version, latest.get(s.family)!) > 0) latest.set(s.family, s.version);

  for (const spec of specs) {
    let data: Buffer;
    try {
      data = spec.type === "url" ? await fetchUrl(spec.path) : fs.readFileSync(path.join(RAW_DIR, spec.path));
      const doc = await extractSource(spec, data);
      const superseded = latest.get(spec.family) !== spec.version;
      const eff = doc.meta?.effectiveDate ? normalizeDate(doc.meta.effectiveDate).iso : undefined;
      if (doc.meta?.version && doc.meta.version !== spec.version)
        issues.push({ severity: "warning", sourceId: spec.id, type: "version_mismatch", message: `Manifest says v${spec.version} but document header says v${doc.meta.version}` });
      if (doc.meta?.formSchema) issues.push({ severity: "info", sourceId: spec.id, type: "form_fields_standardised", message: `Form labels mapped to canonical fields: ${JSON.parse(doc.meta.formSchema).map((f: { name: string }) => f.name).join(", ")}` });
      doc.warnings.forEach((w) => issues.push({ severity: "info", sourceId: spec.id, type: "extraction_note", message: w }));
      stats.removedBoilerplateLines += doc.removedLines;
      if (superseded) {
        stats.superseded++;
        issues.push({ severity: "info", sourceId: spec.id, type: "superseded", message: `${spec.source} superseded by v${latest.get(spec.family)} of the same document family` });
      }
      docs.push({ spec, status: superseded ? "superseded" : "ingested", title: doc.title, effectiveDate: eff, removedLines: doc.removedLines, chars: doc.sections.reduce((n, s) => n + s.text.length, 0), hash: contentHash(doc.sections.map((s) => s.text).join("\n")) });

      for (const sec of doc.sections) {
        const heading = standardizeHeading(sec.heading);
        const cleaned = cleanText(sec.text);
        const hc = cleanText(heading).text;
        const headingClean = hc.charAt(0).toUpperCase() + hc.slice(1);
        if (cleaned.invalidDates.length) {
          stats.invalidDates += cleaned.invalidDates.length;
          issues.push({ severity: "warning", sourceId: spec.id, type: "source_error_invalid_date", message: `Invalid date "${cleaned.invalidDates.join(", ")}" in section "${heading}" – flagged for content owner` });
        }
        stats.normalizations += cleaned.changes.length;
        const parts = chunkSection(cleaned.text);
        parts.forEach((part, i) => {
          const pii = redactPii(part);
          const headPii = redactPii(headingClean);
          stats.piiRedactions += pii.count + headPii.count;
          const category = classifyCategory(spec.defaultCategory, heading, pii.text);
          drafts.push({
            key: `${spec.id}:${sec.ref}:${i}`,
            sourceId: spec.id,
            title: parts.length > 1 ? `${headPii.text} (part ${i + 1})` : headPii.text,
            content: pii.text,
            category,
            topic: classifyTopic(heading, pii.text),
            productLine: detectProductLine(`${heading} ${pii.text}`),
            source: spec.source,
            sourceRef: sec.ref,
            version: spec.version,
            authority: spec.authority,
            containsPii: pii.count + headPii.count > 0,
            piiTypes: [...new Set([...pii.types, ...headPii.types])],
            status: superseded ? "superseded" : "active",
            contentHash: contentHash(pii.text),
            normalizations: cleaned.changes,
            flags: cleaned.invalidDates.length ? ["invalid_date_in_source"] : [],
            aliases: [],
            effectiveDate: eff,
          });
        });
      }
      log(`extracted ${spec.id}: ${doc.sections.length} sections`);
    } catch (e) {
      stats.failedSources++;
      const msg = (e as Error).message;
      issues.push({ severity: "error", sourceId: spec.id, type: "extraction_failed", message: msg });
      docs.push({ spec, status: "failed", error: msg, title: spec.source, removedLines: 0, chars: 0 });
      log(`FAILED ${spec.id}: ${msg}`);
    }
  }

  // ---- embeddings first: used for semantic near-duplicate detection and for the vector index
  log(`embedding ${drafts.length} records...`);
  const vectors = await embedPassages(drafts.map((d) => `${d.title}. ${d.content}`));
  const vecOf = new Map(drafts.map((d, i) => [d.key, vectors[i]]));

  // ---- de-duplication: higher authority first, then newer version, then longer text wins.
  const order = [...drafts].sort((a, b) => b.authority - a.authority || cmpVersion(b.version, a.version) || b.content.length - a.content.length);
  const kept: { d: ChunkDraft; sh: Set<string> }[] = [];
  for (const d of order) {
    if (d.status !== "active") continue;
    const sh = shingles(`${d.title} ${d.content}`);
    const exact = kept.find((k) => k.d.contentHash === d.contentHash);
    let near: { k: (typeof kept)[number]; jac: number; cos: number } | undefined;
    if (!exact) {
      for (const k of kept) {
        const jac = jaccard(k.sh, sh), cos = cosine(vecOf.get(k.d.key)!, vecOf.get(d.key)!);
        if (isNearDuplicate(jac, cos)) { near = { k, jac, cos }; break; }
      }
    }
    const winner = exact ?? near?.k;
    if (winner) {
      d.status = "duplicate";
      d.duplicateOf = winner.d.key;
      if (d.title !== winner.d.title && !winner.d.aliases.includes(d.title)) winner.d.aliases.push(d.title);
      stats[exact ? "exactDuplicates" : "nearDuplicates"]++;
      issues.push({ severity: "info", sourceId: d.sourceId, type: exact ? "exact_duplicate" : "near_duplicate", message: `"${d.title}" (${d.source}) duplicates "${winner.d.title}" (${winner.d.source})${near ? ` – bigram jaccard ${near.jac.toFixed(2)}, cosine ${near.cos.toFixed(3)}` : ""}` });
    } else kept.push({ d, sh });
  }

  // ---- fact conflicts: lower-authority record is flagged and excluded from retrieval.
  for (const c of detectConflicts(drafts)) {
    const d = drafts.find((x) => x.key === c.flagged.recordKey)!;
    d.status = "flagged";
    d.flags.push(`conflict:${c.fact}=${c.flagged.value} vs ${c.kept.value} in ${c.kept.source}`);
    stats.conflictsFlagged++;
    issues.push({ severity: "warning", sourceId: d.sourceId, type: "source_error_conflict", message: `${c.fact}: "${d.title}" (${c.flagged.source}) says ${c.flagged.value} but ${c.kept.source} says ${c.kept.value}. Lower-authority record flagged for review and excluded from answers.` });
  }

  // ---- stable, human-readable record ids: kb_<category>_<nnn> in manifest/section order
  const counters = new Map<string, number>();
  const idOf = new Map<string, string>();
  for (const d of drafts) {
    const n = (counters.get(d.category) || 0) + 1;
    counters.set(d.category, n);
    idOf.set(d.key, `kb_${d.category}_${String(n).padStart(3, "0")}`);
  }

  // ---- versioning: compare against the previous build by stable key
  const prev = await prisma.kbRecord.findMany({ select: { metadata: true, contentHash: true } });
  const prevByKey = new Map(prev.map((p) => [(p.metadata as { key: string; revision?: number }).key, p]));
  let added = 0, changed = 0, unchanged = 0;
  const revisionOf = new Map<string, number>();
  for (const d of drafts) {
    const p = prevByKey.get(d.key);
    const prevRev = (p?.metadata as { revision?: number } | undefined)?.revision ?? 1;
    if (!p) { added++; revisionOf.set(d.key, 1); }
    else if (p.contentHash !== d.contentHash) { changed++; revisionOf.set(d.key, prevRev + 1); }
    else { unchanged++; revisionOf.set(d.key, prevRev); }
  }
  const currentKeys = new Set(drafts.map((d) => d.key));
  const removed = [...prevByKey.keys()].filter((k) => !currentKeys.has(k)).length;
  Object.assign(stats, { records: drafts.length, activeRecords: drafts.filter((d) => d.status === "active").length, recordsAdded: added, recordsChanged: changed, recordsUnchanged: unchanged, recordsRemoved: removed, recordsWithPii: drafts.filter((d) => d.containsPii).length });

  // ---- persist metadata (Postgres) then vectors (Qdrant)
  await prisma.$transaction([prisma.kbRecord.deleteMany(), prisma.sourceDocument.deleteMany()]);
  await prisma.sourceDocument.createMany({
    data: docs.map((d) => ({ id: d.spec.id, uri: d.spec.path, sourceType: d.spec.type, title: d.title, family: d.spec.family, version: d.spec.version, effectiveDate: d.effectiveDate ?? null, status: d.status, error: d.error ?? null, contentHash: d.hash ?? null, extractedChars: d.chars, removedLines: d.removedLines })),
  });
  await prisma.kbRecord.createMany({
    data: drafts.map((d) => ({
      recordId: idOf.get(d.key)!, documentId: d.sourceId, title: d.title, content: d.content, category: d.category, productLine: d.productLine,
      source: d.source, sourceRef: d.sourceRef, version: d.version, containsPii: d.containsPii, piiTypes: d.piiTypes, status: d.status,
      duplicateOf: d.duplicateOf ? idOf.get(d.duplicateOf) : null, contentHash: d.contentHash, wordCount: d.content.split(/\s+/).length,
      metadata: { key: d.key, topic: d.topic, authority: d.authority, revision: revisionOf.get(d.key), effectiveDate: d.effectiveDate ?? null, normalizations: d.normalizations, flags: d.flags, aliases: d.aliases },
    })),
  });

  // records that absorbed near-duplicates are re-embedded with their alternate phrasings
  const withAliases = drafts.filter((d) => d.aliases.length);
  if (withAliases.length) {
    const av = await embedPassages(withAliases.map((d) => `${d.title}. ${d.aliases.join(". ")}. ${d.content}`));
    withAliases.forEach((d, i) => (vectors[drafts.indexOf(d)] = av[i]));
  }
  await recreateCollection();
  await upsertPoints(drafts.map((d, i) => ({ recordId: idOf.get(d.key)!, vector: vectors[i], payload: { record_id: idOf.get(d.key)!, category: d.category, status: d.status, product_line: d.productLine, version: d.version, title: d.title } })));

  const run = await prisma.ingestionRun.create({ data: { stats, issues: issues as never, finishedAt: new Date() } });
  (globalThis as { __kbVersion?: string }).__kbVersion = run.id; // invalidates the in-memory BM25 index
  return { runId: run.id, durationMs: Date.now() - t0, stats, issues };
}
