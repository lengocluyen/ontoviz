import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  hasData: boolean;
  canExportTurtle: boolean;
  onNewOntology: () => void;
  onOpenFiles: (files: File[]) => Promise<void> | void;
  onExportTurtle: () => Promise<string>;
  onExportGraphJson: () => string;
  onClear: () => void;
  onError?: (message: string) => void;
};

export default function FileMenu(props: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const accept = useMemo(() => {
    return [
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
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  function reportError(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    props.onError?.(msg);
  }

  function triggerOpen() {
    fileInputRef.current?.click();
  }

  async function exportTurtle() {
    if (!props.canExportTurtle || busy) return;
    setBusy(true);
    try {
      const ttl = await props.onExportTurtle();
      downloadText("ontology.ttl", ttl, "text/turtle;charset=utf-8");
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  function exportGraphJson() {
    if (!props.hasData || busy) return;
    setOpen(false);
    try {
      const json = props.onExportGraphJson();
      downloadText("graph.json", json, "application/json;charset=utf-8");
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <div ref={rootRef} className="menuRoot">
      <button
        className="button"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
        title="File menu"
      >
        File
      </button>
      <input
        ref={fileInputRef}
        className="fileInput"
        type="file"
        multiple
        accept={accept}
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length === 0) return;
          setOpen(false);
          try {
            await props.onOpenFiles(files);
          } catch (err) {
            reportError(err);
          }
        }}
      />

      {open ? (
        <div className="menuDropdown" role="menu" aria-label="File menu">
          <button
            type="button"
            className="menuItem"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              props.onNewOntology();
            }}
          >
            New ontology
          </button>
          <button type="button" className="menuItem" role="menuitem" onClick={triggerOpen}>
            Open file…
          </button>

          <div className="menuSep" role="separator" />

          <button
            type="button"
            className={`menuItem ${!props.canExportTurtle || busy ? "disabled" : ""}`}
            role="menuitem"
            onClick={exportTurtle}
            disabled={!props.canExportTurtle || busy}
            title={!props.canExportTurtle ? "Load RDF/OWL/JSON-LD to export Turtle." : "Download Turtle"}
          >
            {busy ? "Exporting…" : "Export Turtle (.ttl)"}
          </button>
          <button
            type="button"
            className={`menuItem ${!props.hasData || busy ? "disabled" : ""}`}
            role="menuitem"
            onClick={exportGraphJson}
            disabled={!props.hasData || busy}
            title={!props.hasData ? "Nothing to export." : "Download graph JSON"}
          >
            Export graph JSON
          </button>

          <div className="menuSep" role="separator" />

          <button
            type="button"
            className="menuItem danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              props.onClear();
            }}
          >
            Clear workspace
          </button>
        </div>
      ) : null}
    </div>
  );
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

