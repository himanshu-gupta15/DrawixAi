import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/database/prisma";
import { addUploadedSource, RAW_DIR, runIngestion } from "@/lib/kb/ingest";
import { slug } from "@/lib/kb/extract";
import type { SourceType } from "@/lib/kb/types";

export async function GET() {
  const docs = await prisma.sourceDocument.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { records: true } } } });
  return Response.json({ documents: docs });
}

const TYPE_BY_EXT: Record<string, SourceType> = { ".html": "html", ".htm": "html", ".pdf": "pdf", ".md": "markdown", ".txt": "text", ".csv": "csv", ".json": "form_json" };

/** Add a document (file upload or URL) and rebuild the KB so dedupe/conflict checks see the whole corpus. */
export async function POST(req: Request) {
  const form = await req.formData();
  const url = (form.get("url") as string | null)?.trim();
  const file = form.get("file") as File | null;
  const category = (form.get("category") as string) || "faq";
  const authority = Number(form.get("authority") || 1);
  let spec;
  if (url) {
    if (!/^https?:\/\//.test(url)) return Response.json({ error: "URL must start with http(s)://" }, { status: 400 });
    spec = { id: `url_${slug(url).slice(0, 40)}`, path: url, type: "url" as const, family: `url_${slug(url)}`, version: new Date().toISOString().slice(0, 10).replace(/-/g, "."), authority, source: `web page ${new URL(url).hostname}`, defaultCategory: category };
  } else if (file && file.size) {
    const ext = path.extname(file.name).toLowerCase();
    const type = TYPE_BY_EXT[ext];
    if (!type) return Response.json({ error: `Unsupported file type ${ext}` }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return Response.json({ error: "File too large (10 MB max)" }, { status: 400 });
    const rel = path.join("uploads", `${Date.now()}_${file.name.replace(/[^\w.-]/g, "_")}`);
    fs.mkdirSync(path.join(RAW_DIR, "uploads"), { recursive: true });
    fs.writeFileSync(path.join(RAW_DIR, rel), Buffer.from(await file.arrayBuffer()));
    const id = `upload_${slug(path.basename(file.name, ext))}`;
    spec = { id, path: rel, type, family: id, version: String(form.get("version") || "1.0"), authority, source: `uploaded ${file.name}`, defaultCategory: category };
  } else return Response.json({ error: "Provide a file or a url" }, { status: 400 });
  addUploadedSource(spec);
  const report = await runIngestion();
  return Response.json({ added: spec, report });
}
