import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { CreateEntityInput } from "../lib/editor";
import type { GraphLink, GraphNode, OntologyModel } from "../lib/graphModel";
import EntitiesCard from "./EntitiesCard";
import OntologyLibraryCard from "./OntologyLibraryCard";

type ViewFilters = {
  showTBox: boolean;
  showABox: boolean;
  showClasses: boolean;
  showProperties: boolean;
  showIndividuals: boolean;
  showConcepts: boolean;
  showRestrictions: boolean;
  showBlankNodes: boolean;
  showLiterals: boolean;
  hideBuiltins: boolean;
  showNodeLabels: boolean;
  showEdgeLabels: boolean;
  labelRenderer: "sprite" | "dom";
  labelScale: number;
  showEdgeFlow: boolean;
  highlightAnnotations: boolean;
};

type Props = {
  children: ReactNode;
  toolCards?: ReactNode;
  onTabChange?: (tab: SidebarTab) => void;
  baseIri: string;
  onBaseIriChange: (value: string) => void;
  filters: ViewFilters;
  onFiltersChange: (value: ViewFilters) => void;
  error: string | null;
  canExportTurtle: boolean;
  onNewOntology: () => void;
  onExportTurtle: () => Promise<string>;
  onExportGraphJson: () => string;
  onCreateEntity: (input: CreateEntityInput) => Promise<string> | string;
  onError?: (message: string) => void;
  model: OntologyModel;
  filtered: { nodes: GraphNode[]; links: GraphLink[] };
  onFocusNodeId: (id: string) => void;
  onLoadSampleTtl: () => void;
  onLoadSampleJsonLd: () => void;
  onLoadSampleFoaf: () => void;
  onLoadSamplePizza: () => void;
  onClear: () => void;
  onOpenFiles: (files: File[]) => Promise<void> | void;
  collapsed: boolean;
  onCollapsedChange: (value: boolean) => void;
};

export type SidebarTab = "import" | "library" | "entities" | "view" | "tools";

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

export default function Sidebar(props: Props) {
  const { filters } = props;
  const [tab, setTab] = useState<SidebarTab>(() => (props.model.nodes.length > 0 ? "entities" : "import"));
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  function setFilter<K extends keyof ViewFilters>(key: K, value: ViewFilters[K]) {
    props.onFiltersChange({ ...filters, [key]: value });
  }

  function openTab(next: SidebarTab) {
    setTab(next);
    props.onTabChange?.(next);
    if (props.collapsed) props.onCollapsedChange(false);
  }

  function triggerOpenFiles() {
    openTab("import");
    fileInputRef.current?.click();
  }

  function reportError(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    props.onError?.(msg);
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
    if (props.model.nodes.length === 0 || busy) return;
    try {
      const json = props.onExportGraphJson();
      downloadText("graph.json", json, "application/json;charset=utf-8");
    } catch (e) {
      reportError(e);
    }
  }

  const stats = useMemo(() => {
    return {
      nodes: props.filtered.nodes.length,
      edges: props.filtered.links.length,
      triples: props.model.triplesCount,
    };
  }, [props.filtered.links.length, props.filtered.nodes.length, props.model.triplesCount]);

  return (
    <div className="sidebarLayout" data-collapsed={props.collapsed ? "true" : "false"}>
      <nav className="sidebarNav" aria-label="Sidebar">
        <button
          type="button"
          className={`sidebarNavBtn ${tab === "import" ? "active" : ""}`}
          onClick={() => openTab("import")}
          aria-pressed={tab === "import" ? "true" : "false"}
          title="Import / Open ontology"
        >
          <IconImport />
        </button>
        <button
          type="button"
          className={`sidebarNavBtn ${tab === "library" ? "active" : ""}`}
          onClick={() => openTab("library")}
          aria-pressed={tab === "library" ? "true" : "false"}
          title="Ontology library"
        >
          <IconLibrary />
        </button>
        <button
          type="button"
          className={`sidebarNavBtn ${tab === "entities" ? "active" : ""}`}
          onClick={() => openTab("entities")}
          aria-pressed={tab === "entities" ? "true" : "false"}
          title="Entities"
        >
          <IconEntities />
        </button>
        <button
          type="button"
          className={`sidebarNavBtn ${tab === "view" ? "active" : ""}`}
          onClick={() => openTab("view")}
          aria-pressed={tab === "view" ? "true" : "false"}
          title="View options"
        >
          <IconView />
        </button>
        <button
          type="button"
          className={`sidebarNavBtn ${tab === "tools" ? "active" : ""}`}
          onClick={() => openTab("tools")}
          aria-pressed={tab === "tools" ? "true" : "false"}
          title="Tools"
        >
          <IconTools />
        </button>

        <div className="sidebarNavSpacer" aria-hidden="true" />

        <button
          type="button"
          className="sidebarNavBtn"
          onClick={() => props.onCollapsedChange(!props.collapsed)}
          title={props.collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {props.collapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>
      </nav>

      {!props.collapsed ? (
        <div className="sidebarPane">
          {tab === "import" ? (
            <div className="sidebarStack">
              <div className="card">
                <div className="cardTitle">Import</div>

                <div className="row gap8 wrap">
                  <button className="button" type="button" onClick={props.onNewOntology} title="Create an empty ontology">
                    New
                  </button>
                  <button className="button" type="button" onClick={triggerOpenFiles}>
                    Open file…
                  </button>
                  <button
                    className="button danger"
                    type="button"
                    onClick={props.onClear}
                    title="Clear store + graph (back to empty workspace)"
                  >
                    Clear
                  </button>
                </div>
                <div className="help mt8">New creates an empty editable workspace. Use the + button in the graph to add entities.</div>

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
                    } catch {
                      // App-level importer already manages error display.
                    }
                  }}
                />

                <div className="mt10">{props.children}</div>

                <div className="row gap8 mt10 wrap">
                  <button
                    className="button"
                    type="button"
                    onClick={exportTurtle}
                    disabled={!props.canExportTurtle || busy}
                    title={!props.canExportTurtle ? "Load RDF/OWL/JSON-LD to export Turtle." : "Download Turtle"}
                  >
                    {busy ? "Exporting…" : "Export Turtle"}
                  </button>
                  <button
                    className="button"
                    type="button"
                    onClick={exportGraphJson}
                    disabled={props.model.nodes.length === 0 || busy}
                    title={props.model.nodes.length === 0 ? "Nothing to export." : "Download graph JSON"}
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
                  <label className="label" htmlFor="baseIri">
                    Base IRI
                  </label>
                  <input
                    id="baseIri"
                    className="input"
                    value={props.baseIri}
                    onChange={(e) => props.onBaseIriChange(e.target.value)}
                    spellCheck={false}
                  />
                  <div className="help">Used to resolve relative IRIs when parsing RDF.</div>
                </div>

                {props.error ? <div className="errorBox mt12">{props.error}</div> : null}
              </div>
            </div>
          ) : null}

          {tab === "library" ? (
            <div className="sidebarStack">
              <OntologyLibraryCard
                baseIri={props.baseIri}
                canExportTurtle={props.canExportTurtle}
                onExportTurtle={props.onExportTurtle}
                onExportGraphJson={props.onExportGraphJson}
                onOpenFiles={props.onOpenFiles}
                onError={props.onError}
              />
            </div>
          ) : null}

          {tab === "entities" ? (
            <div className="sidebarStack">
              <EntitiesCard
                nodes={props.filtered.nodes}
                onFocusNodeId={props.onFocusNodeId}
                editingEnabled={props.canExportTurtle}
                baseIri={props.baseIri}
                onCreateEntity={props.onCreateEntity}
              />
            </div>
          ) : null}

          {tab === "view" ? (
            <div className="sidebarStack">
              <div className="card">
                <div className="cardTitle">View</div>
                <div className="stats">
                  <div>
                    <div className="statValue">{stats.nodes}</div>
                    <div className="statLabel">Nodes</div>
                  </div>
                  <div>
                    <div className="statValue">{stats.edges}</div>
                    <div className="statLabel">Edges</div>
                  </div>
                  <div>
                    <div className="statValue">{stats.triples}</div>
                    <div className="statLabel">Triples</div>
                  </div>
                </div>

                <div className="toggles">
                  <ToggleRow
                    label="TBox (schema)"
                    color="#4dabf7"
                    checked={filters.showTBox}
                    onChange={(v) => setFilter("showTBox", v)}
                  />
                  <ToggleRow
                    label="ABox (assertions)"
                    color="#51cf66"
                    checked={filters.showABox}
                    onChange={(v) => setFilter("showABox", v)}
                  />
                  <div className="divider" />
                  <ToggleRow
                    label="Classes"
                    color="#74c0fc"
                    checked={filters.showClasses}
                    onChange={(v) => setFilter("showClasses", v)}
                  />
                  <ToggleRow
                    label="Properties"
                    color="#ffd43b"
                    checked={filters.showProperties}
                    onChange={(v) => setFilter("showProperties", v)}
                  />
                  <ToggleRow
                    label="Individuals"
                    color="#69db7c"
                    checked={filters.showIndividuals}
                    onChange={(v) => setFilter("showIndividuals", v)}
                  />
                  <ToggleRow
                    label="SKOS Concepts"
                    color="#b197fc"
                    checked={filters.showConcepts}
                    onChange={(v) => setFilter("showConcepts", v)}
                  />
                  <ToggleRow
                    label="OWL Restrictions"
                    color="#ff6b6b"
                    checked={filters.showRestrictions}
                    onChange={(v) => setFilter("showRestrictions", v)}
                  />
                  <div className="divider" />
                  <ToggleRow
                    label="Blank nodes"
                    color="#adb5bd"
                    checked={filters.showBlankNodes}
                    onChange={(v) => setFilter("showBlankNodes", v)}
                  />
                  <ToggleRow
                    label="Literals as nodes"
                    color="#ffe066"
                    checked={filters.showLiterals}
                    onChange={(v) => setFilter("showLiterals", v)}
                  />
                  <ToggleRow
                    label="Hide rdf/rdfs/owl/xsd"
                    color="#868e96"
                    checked={filters.hideBuiltins}
                    onChange={(v) => setFilter("hideBuiltins", v)}
                  />
                  <div className="divider" />
                  <ToggleRow
                    label="Node labels"
                    checked={filters.showNodeLabels}
                    onChange={(v) => setFilter("showNodeLabels", v)}
                  />
                  <ToggleRow
                    label="Edge labels"
                    checked={filters.showEdgeLabels}
                    onChange={(v) => setFilter("showEdgeLabels", v)}
                  />
                  <ControlRow label="Label renderer">
                    <select
                      className="input miniSelect"
                      value={filters.labelRenderer}
                      onChange={(e) => {
                        const value = e.target.value === "sprite" ? "sprite" : "dom";
                        setFilter("labelRenderer", value);
                      }}
                    >
                      <option value="dom">DOM (readable)</option>
                      <option value="sprite">WebGL (fast)</option>
                    </select>
                  </ControlRow>
                  <ControlRow label="Label size">
                    <input
                      type="number"
                      className="input miniInput"
                      min={0.6}
                      max={2}
                      step={0.1}
                      value={filters.labelScale}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        if (!Number.isFinite(next)) return;
                        setFilter("labelScale", Math.max(0.6, Math.min(2, next)));
                      }}
                    />
                  </ControlRow>
                  <ToggleRow
                    label="Edge flow (direction)"
                    checked={filters.showEdgeFlow}
                    onChange={(v) => setFilter("showEdgeFlow", v)}
                  />
                  <ToggleRow
                    label="Highlight annotations"
                    color="#ff922b"
                    checked={filters.highlightAnnotations}
                    onChange={(v) => setFilter("highlightAnnotations", v)}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {tab === "tools" ? (
            <div className="sidebarStack">
              {props.toolCards ? props.toolCards : <div className="card">No tools yet.</div>}
            </div>
          ) : null}
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

function ToggleRow(props: {
  label: string;
  color?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggleRow">
      <span className="toggleLabel">
        {props.color ? (
          <span className="toggleSwatch" style={{ background: props.color }} aria-hidden="true" />
        ) : null}
        {props.label}
      </span>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
    </label>
  );
}

function ControlRow(props: { label: string; children: ReactNode }) {
  return (
    <div className="controlRow">
      <span>{props.label}</span>
      {props.children}
    </div>
  );
}

function IconImport() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M12 3v10m0 0 4-4m-4 4-4-4M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconEntities() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="7" cy="7" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="7" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="17" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M9 8.7 11 14m4-5.3-2 5.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconLibrary() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M7 4h12a2 2 0 0 1 2 2v14H9a2 2 0 0 0-2 2V6a2 2 0 0 1 2-2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M3 6a2 2 0 0 1 2-2h2v18H5a2 2 0 0 1-2-2V6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M10 9h8M10 13h8M10 17h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconView() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTools() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M14.7 6.3a4.5 4.5 0 0 0-6.4 6.4l-5 5a1.5 1.5 0 0 0 2.1 2.1l5-5a4.5 4.5 0 0 0 6.4-6.4l-2.2 2.2-2.1-2.1 2.2-2.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M14 6 8 12l6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M10 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
