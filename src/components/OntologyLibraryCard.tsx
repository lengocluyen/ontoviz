import { useMemo, useRef, useState } from "react";
import {
  deleteLibraryEntry,
  getLibraryEntry,
  inferEntryKind,
  listLibraryEntries,
  saveLibraryEntry,
  type LibraryEntryMeta,
} from "../lib/library";

type Props = {
  baseIri: string;
  canExportTurtle: boolean;
  onExportTurtle: () => Promise<string>;
  onExportGraphJson: () => string;
  onOpenFiles: (files: File[]) => Promise<void> | void;
  onError?: (message: string) => void;
};

const FILE_ACCEPT = [
  ".ttl",
  ".n3",
  ".rdf",
  ".owl",
  ".xml",
  ".jsonld",
  ".json",
  "application/ld+json",
  "application/rdf+xml",
  "text/turtle",
].join(",");

export default function OntologyLibraryCard(props: Props) {
  const [entries, setEntries] = useState<LibraryEntryMeta[]>(() => listLibraryEntries());
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return entries;
    return entries.filter((e) => {
      const hay = `${e.name} ${e.fileName} ${e.description ?? ""}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [entries, q]);

  function refresh() {
    setEntries(listLibraryEntries());
  }

  function reportError(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    props.onError?.(msg);
    setError(msg);
  }

  function triggerAddFiles() {
    fileInputRef.current?.click();
  }

  async function saveCurrent() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const displayName = name.trim() || `Ontology ${new Date().toLocaleString()}`;
      const base = slug(displayName) || "ontology";
      const fileName = props.canExportTurtle ? `${base}.ttl` : `${base}.json`;
      const content = props.canExportTurtle ? await props.onExportTurtle() : props.onExportGraphJson();

      saveLibraryEntry({
        name: displayName,
        description: description.trim() || undefined,
        fileName,
        baseIri: props.baseIri,
        content,
      });
      setName("");
      setDescription("");
      refresh();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  async function addFiles(files: File[]) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of files) {
        const content = await f.text();
        saveLibraryEntry({
          name: f.name,
          fileName: f.name,
          baseIri: props.baseIri,
          content,
        });
      }
      refresh();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  async function openEntry(id: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const entry = getLibraryEntry(id);
      if (!entry) throw new Error("Library entry not found.");
      const file = new File([entry.content], entry.fileName);
      await props.onOpenFiles([file]);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  function downloadEntry(id: string) {
    const entry = getLibraryEntry(id);
    if (!entry) {
      reportError(new Error("Library entry not found."));
      return;
    }
    const type = guessMime(entry.fileName);
    downloadText(entry.fileName, entry.content, type);
  }

  function removeEntry(id: string) {
    deleteLibraryEntry(id);
    refresh();
  }

  return (
    <div className="card">
      <div className="cardTitle">Library</div>
      <div className="mutedSmall">
        Local ontology library (prototype). Saves files in your browser storage; later: team portal + backend storage.
      </div>

      <div className="subTitle mt12">Save current workspace</div>
      <div className="row gap8 mt10 wrap">
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label className="label" htmlFor="libName">
            Name
          </label>
          <input
            id="libName"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Pizza ontology"
            spellCheck={false}
            disabled={busy}
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label className="label" htmlFor="libDesc">
            Description (optional)
          </label>
          <input
            id="libDesc"
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short note…"
            spellCheck={false}
            disabled={busy}
          />
        </div>
      </div>
      <div className="row gap8 mt10 wrap">
        <button className="button" type="button" onClick={saveCurrent} disabled={busy}>
          {busy ? "Saving…" : props.canExportTurtle ? "Save as Turtle" : "Save graph JSON"}
        </button>
        <button className="button" type="button" onClick={triggerAddFiles} disabled={busy}>
          Add files…
        </button>
      </div>

      <input
        ref={fileInputRef}
        className="fileInput"
        type="file"
        multiple
        accept={FILE_ACCEPT}
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length === 0) return;
          await addFiles(files);
        }}
      />

      <div className="subTitle mt12">Saved ontologies</div>
      <div className="field mt10">
        <label className="label" htmlFor="libSearch">
          Search
        </label>
        <input
          id="libSearch"
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by name or file…"
          spellCheck={false}
          disabled={busy}
        />
      </div>

      <div className="libraryList mt10">
        {filtered.length === 0 ? <div className="mutedSmall">No saved ontologies yet.</div> : null}
        {filtered.map((e) => (
          <div key={e.id} className="libraryItem">
            <div className="libraryLeft">
              <div className="libraryName" title={e.fileName}>
                {e.name}
              </div>
              <div className="libraryMeta">
                <span className="pill small">{inferEntryKind(e.fileName)}</span>
                <span className="mutedSmall">{formatBytes(e.sizeBytes)}</span>
                <span className="mutedSmall">{formatTime(e.updatedAt)}</span>
              </div>
              {e.description ? <div className="mutedSmall">{e.description}</div> : null}
            </div>
            <div className="libraryActions">
              <button className="button small" type="button" onClick={() => openEntry(e.id)} disabled={busy}>
                Open
              </button>
              <button className="button small" type="button" onClick={() => downloadEntry(e.id)} disabled={busy}>
                Download
              </button>
              <button
                className="button small danger"
                type="button"
                onClick={() => removeEntry(e.id)}
                disabled={busy}
                title="Delete from local library"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {error ? <div className="errorBox mt12">{error}</div> : null}
    </div>
  );
}

function slug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function formatBytes(bytes: number): string {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function guessMime(fileName: string): string {
  const fn = fileName.toLowerCase();
  if (fn.endsWith(".ttl") || fn.endsWith(".n3") || fn.endsWith(".nt")) return "text/turtle;charset=utf-8";
  if (fn.endsWith(".json")) return "application/json;charset=utf-8";
  if (fn.endsWith(".jsonld")) return "application/ld+json;charset=utf-8";
  if (fn.endsWith(".rdf") || fn.endsWith(".owl") || fn.endsWith(".xml")) return "application/rdf+xml;charset=utf-8";
  return "text/plain;charset=utf-8";
}

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

