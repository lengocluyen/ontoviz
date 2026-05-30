import { useMemo, useRef, useState } from "react";

type Props = {
  hasData: boolean;
  canExportTurtle: boolean;
  baseIri: string;
  onBaseIriChange: (value: string) => void;
  onNewOntology: () => void;
  onOpenFiles: (files: File[]) => Promise<void> | void;
  onExportTurtle: () => Promise<string>;
  onExportGraphJson: () => string;
  onClear: () => void;
  onLoadSampleTtl: () => void;
  onLoadSampleJsonLd: () => void;
  onLoadSampleFoaf: () => void;
  onLoadSamplePizza: () => void;
  error: string | null;
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

export default function WorkspaceCard(props: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const canExportGraphJson = useMemo(() => props.hasData, [props.hasData]);

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
    }
  }

  function exportGraphJson() {
    if (!canExportGraphJson || busy) return;
    try {
      const json = props.onExportGraphJson();
      downloadText("graph.json", json, "application/json;charset=utf-8");
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <div className="card">
      <div className="cardTitle">Import / Open ontology</div>
      <div className="mutedSmall">
        Manage your workspace: create, import, export, and reset the current ontology graph.
      </div>

      <div className="row gap8 mt10 wrap">
        <button className="button" type="button" onClick={props.onNewOntology} title="Create an empty ontology store">
          New ontology
        </button>
        <button className="button" type="button" onClick={triggerOpen}>
          Open file…
        </button>
        <button
          className="button danger"
          type="button"
          onClick={props.onClear}
          title="Clear store + graph (back to empty workspace)"
        >
          Clear workspace
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
          try {
            await props.onOpenFiles(files);
          } catch (err) {
            reportError(err);
          }
        }}
      />

      <div className="row gap8 mt10 wrap">
        <button
          className="button"
          type="button"
          onClick={exportTurtle}
          disabled={!props.canExportTurtle || busy}
          title={!props.canExportTurtle ? "Load RDF/OWL/JSON-LD to export Turtle." : "Download Turtle"}
        >
          {busy ? "Exporting…" : "Export Turtle (.ttl)"}
        </button>
        <button
          className="button"
          type="button"
          onClick={exportGraphJson}
          disabled={!canExportGraphJson || busy}
          title={!canExportGraphJson ? "Nothing to export." : "Download graph JSON"}
        >
          Export graph JSON
        </button>
      </div>

      <div className="row gap8 mt10 wrap">
        <button className="button" type="button" onClick={props.onLoadSampleTtl}>
          Sample TTL
        </button>
        <button className="button" type="button" onClick={props.onLoadSampleJsonLd}>
          Sample JSON-LD
        </button>
        <button className="button" type="button" onClick={props.onLoadSampleFoaf}>
          FOAF
        </button>
        <button className="button" type="button" onClick={props.onLoadSamplePizza}>
          Pizza
        </button>
      </div>

      <div className="field mt12">
        <label className="label" htmlFor="workspaceBaseIri">
          Base IRI
        </label>
        <input
          id="workspaceBaseIri"
          className="input"
          value={props.baseIri}
          onChange={(e) => props.onBaseIriChange(e.target.value)}
          spellCheck={false}
        />
        <div className="help">Used to resolve relative IRIs when parsing RDF.</div>
      </div>

      {props.error ? <div className="errorBox mt12">{props.error}</div> : null}
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

