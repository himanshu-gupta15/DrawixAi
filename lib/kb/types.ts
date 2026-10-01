export type SourceType = "html" | "url" | "pdf" | "markdown" | "text" | "csv" | "form_json";

export interface SourceSpec {
  id: string;
  path: string; // relative to data/raw (or the URL for type "url")
  type: SourceType;
  family: string;
  version: string;
  authority: number; // 3 policy doc > 2 brochure/table > 1 website
  source: string; // human readable source label used in citations
  defaultCategory: string;
  title?: string;
}

export interface Section {
  heading: string;
  text: string;
  ref: string; // path#anchor or path#page=N
  kind: "section" | "faq" | "table";
}

export interface ExtractedDoc {
  title: string;
  sections: Section[];
  removedLines: number;
  warnings: string[];
  meta?: Record<string, string>;
}

export interface ChunkDraft {
  key: string; // stable: sourceId + section ref + part
  sourceId: string;
  title: string;
  content: string;
  category: string;
  topic: string;
  productLine: string;
  source: string;
  sourceRef: string;
  version: string;
  authority: number;
  containsPii: boolean;
  piiTypes: string[];
  status: "active" | "duplicate" | "superseded" | "flagged";
  duplicateOf?: string;
  contentHash: string;
  normalizations: string[];
  flags: string[];
  aliases: string[]; // titles of near-duplicates merged into this record (alternate phrasings)
  effectiveDate?: string;
}

export interface IngestIssue {
  severity: "error" | "warning" | "info";
  sourceId: string;
  type: string;
  message: string;
}
