export type LibraryEntryMeta = {
  id: string;
  name: string;
  description?: string;
  fileName: string;
  baseIri?: string;
  createdAt: number;
  updatedAt: number;
  sizeBytes: number;
};

export type LibraryEntry = LibraryEntryMeta & {
  content: string;
};

type SaveArgs = {
  id?: string;
  name: string;
  description?: string;
  fileName: string;
  baseIri?: string;
  content: string;
};

const INDEX_KEY = "onthub:library:v1:index";
const CONTENT_PREFIX = "onthub:library:v1:content:";

export function listLibraryEntries(): LibraryEntryMeta[] {
  const index = loadIndex();
  index.sort((a, b) => b.updatedAt - a.updatedAt);
  return index;
}

export function getLibraryEntry(id: string): LibraryEntry | null {
  const index = loadIndex();
  const meta = index.find((e) => e.id === id);
  if (!meta) return null;
  const contentKey = contentKeyFor(id);
  const content = safeGetItem(contentKey);
  if (content == null) return null;
  return { ...meta, content };
}

export function saveLibraryEntry(args: SaveArgs): LibraryEntryMeta {
  const now = Date.now();
  const id = args.id?.trim() ? args.id.trim() : makeId();
  const index = loadIndex();
  const existing = index.find((e) => e.id === id);
  const createdAt = existing?.createdAt ?? now;

  const content = args.content ?? "";
  const sizeBytes = byteSize(content);

  const meta: LibraryEntryMeta = {
    id,
    name: args.name.trim() || "Untitled",
    description: args.description?.trim() || undefined,
    fileName: args.fileName.trim() || "ontology.ttl",
    baseIri: args.baseIri?.trim() || undefined,
    createdAt,
    updatedAt: now,
    sizeBytes,
  };

  const nextIndex = [meta, ...index.filter((e) => e.id !== id)];
  safeSetItem(contentKeyFor(id), content);
  saveIndex(nextIndex);
  return meta;
}

export function deleteLibraryEntry(id: string) {
  const index = loadIndex().filter((e) => e.id !== id);
  safeRemoveItem(contentKeyFor(id));
  saveIndex(index);
}

export function inferEntryKind(fileName: string, content?: string): "Graph JSON" | "Turtle" | "JSON-LD" | "RDF/XML" | "Other" {
  const fn = (fileName ?? "").toLowerCase();
  if (fn.endsWith(".json")) {
    if (content && looksLikeGraphJson(content)) return "Graph JSON";
    return "JSON-LD";
  }
  if (fn.endsWith(".jsonld")) return "JSON-LD";
  if (fn.endsWith(".ttl") || fn.endsWith(".n3") || fn.endsWith(".nt")) return "Turtle";
  if (fn.endsWith(".owl") || fn.endsWith(".rdf") || fn.endsWith(".xml")) return "RDF/XML";
  return "Other";
}

function looksLikeGraphJson(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as any;
    return Boolean(parsed && typeof parsed === "object" && Array.isArray(parsed.nodes) && Array.isArray(parsed.links));
  } catch {
    return false;
  }
}

function loadIndex(): LibraryEntryMeta[] {
  const raw = safeGetItem(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMeta).map(normalizeMeta);
  } catch {
    return [];
  }
}

function saveIndex(index: LibraryEntryMeta[]) {
  safeSetItem(INDEX_KEY, JSON.stringify(index));
}

function isMeta(value: unknown): value is LibraryEntryMeta {
  if (!value || typeof value !== "object") return false;
  const v = value as any;
  return typeof v.id === "string" && typeof v.name === "string" && typeof v.fileName === "string";
}

function normalizeMeta(meta: LibraryEntryMeta): LibraryEntryMeta {
  return {
    ...meta,
    createdAt: Number(meta.createdAt) || Date.now(),
    updatedAt: Number(meta.updatedAt) || Number(meta.createdAt) || Date.now(),
    sizeBytes: Number(meta.sizeBytes) || 0,
  };
}

function makeId(): string {
  const cryptoAny = crypto as any;
  if (cryptoAny?.randomUUID) return `lib:${cryptoAny.randomUUID()}`;
  return `lib:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function contentKeyFor(id: string): string {
  return `${CONTENT_PREFIX}${id}`;
}

function byteSize(text: string): number {
  try {
    return new Blob([text]).size;
  } catch {
    return text.length;
  }
}

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : "Browser storage quota exceeded. Consider exporting files or using a backend store.";
    throw new Error(msg);
  }
}

function safeRemoveItem(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

