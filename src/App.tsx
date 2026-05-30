import { useEffect, useMemo, useRef, useState } from "react";
import AiAssistantCard from "./components/AiAssistantCard";
import ChangesCard from "./components/ChangesCard";
import CommentsCard from "./components/CommentsCard";
import DetailsCard from "./components/DetailsCard";
import EntityTriplesCard from "./components/EntityTriplesCard";
import FileDrop from "./components/FileDrop";
import EditorCard, { type AddTripleInput } from "./components/EditorCard";
import UserMenu from "./components/UserMenu";
import GraphView3D from "./components/GraphView3D";
import HeaderSearch from "./components/HeaderSearch";
import OwlEntityEditorCard from "./components/OwlEntityEditorCard";
import Sidebar from "./components/Sidebar";
import SparqlCard from "./components/SparqlCard";
import SparqlWorkspace from "./components/SparqlWorkspace";
import type { GraphLink, GraphNode, OntologyModel } from "./lib/graphModel";
import { DEFAULT_BASE_IRI } from "./lib/graphModel";
import type { CreateEntityInput } from "./lib/editor";
import { buildOntologyModel, getLocalName, hashString, IRI, isBuiltInIri } from "./lib/ontology";
import type { StoreChange } from "./lib/changeLog";
import { invertChangeKind } from "./lib/changeLog";
import {
  addRdfTripleToStore,
  parseTripleInputToRdfTriple,
  removeRdfTripleFromStore,
  serializeStoreToTurtle,
  termFromIriInput,
} from "./lib/rdflibOps";
import { createRdfStore, parseFileIntoStore, storeToTriples } from "./lib/rdfParse";
import { saveLibraryEntry } from "./lib/library";

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

type InspectorTab = "details" | "triples" | "edit" | "changes" | "ai" | "comments" | "validate";

const DEFAULT_FILTERS: ViewFilters = {
  showTBox: true,
  showABox: true,
  showClasses: true,
  showProperties: true,
  showIndividuals: true,
  showConcepts: true,
  showRestrictions: true,
  showBlankNodes: false,
  showLiterals: false,
  hideBuiltins: true,
  showNodeLabels: true,
  showEdgeLabels: true,
  labelRenderer: "dom",
  labelScale: 1,
  showEdgeFlow: true,
  highlightAnnotations: true,
};

function emptyModel(): OntologyModel {
  return { nodes: [], links: [], nodeFactsById: {}, triplesCount: 0 };
}

function matchesMediaQuery(query: string): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(query).matches;
}

function normalizeGraphJson(input: any): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodesById = new Map<string, GraphNode>();
  const rawNodes: any[] = Array.isArray(input?.nodes) ? input.nodes : [];
  const rawLinks: any[] = Array.isArray(input?.links) ? input.links : [];

  for (let i = 0; i < rawNodes.length; i += 1) {
    const n = rawNodes[i] ?? {};
    const id = String(n.id ?? n.iri ?? `node:${i}`);
    const kind = String(n.kind ?? "unknown") as GraphNode["kind"];
    const box = String(n.box ?? "unknown") as GraphNode["box"];
    const types = Array.isArray(n.types) ? n.types.map((t: any) => String(t)) : [];
    nodesById.set(id, {
      id,
      label: String(n.label ?? n.name ?? id),
      iri: n.iri ? String(n.iri) : undefined,
      kind,
      box,
      types,
      incoming: Number.isFinite(Number(n.incoming)) ? Number(n.incoming) : 0,
      outgoing: Number.isFinite(Number(n.outgoing)) ? Number(n.outgoing) : 0,
    });
  }

  const links: GraphLink[] = [];
  for (let i = 0; i < rawLinks.length; i += 1) {
    const l = rawLinks[i] ?? {};
    const source = l.source ?? l.from;
    const target = l.target ?? l.to;
    if (source == null || target == null) continue;
    const sourceId = String(source);
    const targetId = String(target);

    const predicate = String(l.predicate ?? l.rel ?? l.label ?? "relatedTo");
    const label = String(l.label ?? predicate);
    const box = String(l.box ?? "unknown") as GraphLink["box"];
    const edgeKey = `${sourceId}|${predicate}|${targetId}|${i}`;
    const id = String(l.id ?? `e:${hashString(edgeKey)}`);

    if (!nodesById.has(sourceId)) {
      nodesById.set(sourceId, {
        id: sourceId,
        label: sourceId,
        kind: "unknown",
        box: "unknown",
        types: [],
        incoming: 0,
        outgoing: 0,
      });
    }
    if (!nodesById.has(targetId)) {
      nodesById.set(targetId, {
        id: targetId,
        label: targetId,
        kind: "unknown",
        box: "unknown",
        types: [],
        incoming: 0,
        outgoing: 0,
      });
    }

    links.push({ id, source: sourceId, target: targetId, predicate, label, box });
  }

  // Recompute degrees (incoming/outgoing) so the UI stays consistent.
  for (const n of nodesById.values()) {
    n.incoming = 0;
    n.outgoing = 0;
  }
  for (const l of links) {
    const s = nodesById.get(l.source);
    const t = nodesById.get(l.target);
    if (s) s.outgoing += 1;
    if (t) t.incoming += 1;
  }

  return { nodes: Array.from(nodesById.values()), links };
}

export default function App() {
  const topBarRef = useRef<HTMLElement | null>(null);
  const [baseIri, setBaseIri] = useState(DEFAULT_BASE_IRI);
  const [rdfStore, setRdfStore] = useState<any | null>(null);
  const [model, setModel] = useState<OntologyModel>(() => emptyModel());
  const [workspaceName, setWorkspaceName] = useState("Untitled ontology");
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<StoreChange[]>([]);
  const [redoStack, setRedoStack] = useState<StoreChange[]>([]);
  const [filters, setFilters] = useState<ViewFilters>(DEFAULT_FILTERS);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [createMenuToken, setCreateMenuToken] = useState(0);
  const [showSidebar, setShowSidebar] = useState(() => matchesMediaQuery("(min-width: 900px)"));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("details");
  const [isDesktopLayout, setIsDesktopLayout] = useState(() => matchesMediaQuery("(min-width: 1200px)"));
  const [sparqlWorkspaceOpen, setSparqlWorkspaceOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1200px)");
    const onChange = () => setIsDesktopLayout(mq.matches);
    onChange();
    if ("addEventListener" in mq) {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    // Safari fallback
    (mq as any).addListener?.(onChange);
    return () => (mq as any).removeListener?.(onChange);
  }, []);

  useEffect(() => {
    const el = topBarRef.current;
    if (!el) return;
    const update = () => {
      const h = Math.max(0, Math.ceil(el.getBoundingClientRect().height));
      document.documentElement.style.setProperty("--topbar-h", `${h}px`);
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const filtered = useMemo(() => {
    const allowedNodes = model.nodes.filter((n) => {
      if (filters.hideBuiltins && n.iri && isBuiltInIri(n.iri)) return false;
      if (!filters.showBlankNodes && n.kind === "blank") return false;
      if (!filters.showRestrictions && n.kind === "restriction") return false;
      if (!filters.showLiterals && n.kind === "literal") return false;
      if (!filters.showClasses && n.kind === "class") return false;
      if (!filters.showProperties && n.kind === "property") return false;
      if (!filters.showIndividuals && n.kind === "individual") return false;
      if (!filters.showConcepts && n.kind === "concept") return false;
      if (!filters.showTBox && n.box === "tbox") return false;
      if (!filters.showABox && n.box === "abox") return false;
      return true;
    });

    const allowedIds = new Set(allowedNodes.map((n) => n.id));

    const allowedLinks = model.links.filter((l) => {
      if (!allowedIds.has(l.source) || !allowedIds.has(l.target)) return false;
      if (!filters.showTBox && l.box === "tbox") return false;
      if (!filters.showABox && l.box === "abox") return false;
      return true;
    });

    return {
      nodes: allowedNodes,
      links: allowedLinks,
    };
  }, [filters, model.links, model.nodes]);

  const selection = useMemo(() => {
    const node = selectedNodeId ? model.nodes.find((n) => n.id === selectedNodeId) ?? null : null;
    const link = selectedLinkId ? model.links.find((l) => l.id === selectedLinkId) ?? null : null;
    return { node, link };
  }, [model.links, model.nodes, selectedLinkId, selectedNodeId]);

  const nodeIdSet = useMemo(() => new Set(model.nodes.map((n) => n.id)), [model.nodes]);

  const annotationMetaById = useMemo(() => {
    const out: Record<string, { hasLabel: boolean; hasDefinition: boolean }> = {};
    for (const [id, facts] of Object.entries(model.nodeFactsById)) {
      const hasLabel = (facts.labels?.length ?? 0) > 0;
      const hasDefinition = (facts.literalFacts ?? []).some(
        (f) =>
          f.predicate === IRI.rdfsComment || f.predicate === IRI.dctDescription || f.predicate === IRI.skosDefinition,
      );
      out[id] = { hasLabel, hasDefinition };
    }
    return out;
  }, [model.nodeFactsById]);

  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as GraphNode[];
    return filtered.nodes
      .filter((n) => {
        const iri = (n.iri ?? n.id).toLowerCase();
        return n.label.toLowerCase().includes(q) || iri.includes(q);
      })
      .slice(0, 50);
  }, [filtered.nodes, search]);

  async function importFiles(files: File[]) {
    setError(null);
    setSelectedNodeId(null);
    setSelectedLinkId(null);
    setFocusNodeId(null);
    setActiveLibraryId(null);
    if (files.length === 1) setWorkspaceName(files[0]?.name ?? "Untitled ontology");
    else if (files.length > 1) setWorkspaceName(`Workspace (${files.length} files)`);

    try {
      const store = createRdfStore();
      for (const file of files) {
        const parsed = await parseFileIntoStore(file, baseIri, store);
        if (parsed.kind === "graph") {
          // If the user provides a pre-built graph JSON, visualize it directly.
          const { nodes, links } = normalizeGraphJson(parsed.graph);
          setRdfStore(null);
          setUndoStack([]);
          setRedoStack([]);
          setModel({
            nodes,
            links,
            nodeFactsById: {},
            triplesCount: 0,
          });
          return;
        }
      }

      setRdfStore(store);
      setUndoStack([]);
      setRedoStack([]);
      setModel(buildOntologyModel(storeToTriples(store)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    }
  }

  async function loadSample(path: string) {
    const res = await fetch(path);
    const text = await res.text();
    const name = path.split("/").pop() ?? "sample.ttl";
    const file = new File([text], name);
    await importFiles([file]);
  }

  function newOntology() {
    const store = createRdfStore();
    setRdfStore(store);
    setUndoStack([]);
    setRedoStack([]);
    setModel(buildOntologyModel(storeToTriples(store)));
    setSelectedNodeId(null);
    setSelectedLinkId(null);
    setFocusNodeId(null);
    setError(null);
    setCreateMenuToken((v) => v + 1);
    setWorkspaceName("Untitled ontology");
    setActiveLibraryId(null);
  }

  function clearGraph() {
    setRdfStore(null);
    setUndoStack([]);
    setRedoStack([]);
    setModel(emptyModel());
    setSelectedNodeId(null);
    setSelectedLinkId(null);
    setFocusNodeId(null);
    setError(null);
    setActiveLibraryId(null);
  }

  async function saveWorkspaceToLibrary() {
    const name = workspaceName.trim() || "Untitled ontology";
    if (rdfStore) {
      const ttl = await serializeStoreToTurtle(rdfStore, baseIri);
      const fileName = ensureExtension(name, ".ttl");
      const meta = saveLibraryEntry({
        id: activeLibraryId ?? undefined,
        name,
        fileName,
        baseIri,
        content: ttl,
      });
      setActiveLibraryId(meta.id);
      return;
    }

    const json = exportGraphJson();
    const fileName = ensureExtension(name, ".json");
    const meta = saveLibraryEntry({
      id: activeLibraryId ?? undefined,
      name,
      fileName,
      baseIri,
      content: json,
    });
    setActiveLibraryId(meta.id);
  }

  async function createEntity(input: CreateEntityInput): Promise<string> {
    if (!rdfStore) throw new Error("Load RDF/OWL/JSON-LD (or click New) to enable editing.");

    const raw = input.iriInput.trim();
    if (!raw) throw new Error("IRI / name is required.");
    if (/\s/.test(raw)) throw new Error("Use an IRI/CURIE/local name without spaces.");

    const term: any = termFromIriInput(raw, baseIri);
    if (term?.termType === "BlankNode") throw new Error("New entities must be IRIs (not blank nodes).");
    const iri = String(term?.value ?? raw);

    if (isBuiltInIri(iri)) {
      throw new Error("Choose your own namespace (not rdf/rdfs/owl/xsd).");
    }
    if (model.nodes.some((n) => n.id === iri)) {
      throw new Error(`Entity already exists: ${iri}`);
    }

    const lang = (input.lang ?? "en").trim() || "en";
    const label = (input.label ?? "").trim() || defaultLabelFromIri(iri);

    const ops: AddTripleInput[] = [];
    const addLabel =
      input.kind === "concept"
        ? ({
            subject: iri,
            predicate: "skos:prefLabel",
            objectKind: "literal",
            objectValue: label,
            objectLanguage: lang,
          } satisfies AddTripleInput)
        : ({
            subject: iri,
            predicate: "rdfs:label",
            objectKind: "literal",
            objectValue: label,
            objectLanguage: lang,
          } satisfies AddTripleInput);

    if (input.kind === "class") {
      ops.push({ subject: iri, predicate: "rdf:type", objectKind: "iri", objectValue: "owl:Class" });
      if (label) ops.push(addLabel);
      if (input.parentClassIri?.trim()) {
        ops.push({
          subject: iri,
          predicate: "rdfs:subClassOf",
          objectKind: "iri",
          objectValue: input.parentClassIri.trim(),
        });
      }
    } else if (input.kind === "objectProperty") {
      ops.push({ subject: iri, predicate: "rdf:type", objectKind: "iri", objectValue: "owl:ObjectProperty" });
      if (label) ops.push(addLabel);
      if (input.domainClassIri?.trim()) {
        ops.push({
          subject: iri,
          predicate: "rdfs:domain",
          objectKind: "iri",
          objectValue: input.domainClassIri.trim(),
        });
      }
      if (input.rangeClassIri?.trim()) {
        ops.push({
          subject: iri,
          predicate: "rdfs:range",
          objectKind: "iri",
          objectValue: input.rangeClassIri.trim(),
        });
      }
    } else if (input.kind === "dataProperty") {
      ops.push({ subject: iri, predicate: "rdf:type", objectKind: "iri", objectValue: "owl:DatatypeProperty" });
      if (label) ops.push(addLabel);
      if (input.domainClassIri?.trim()) {
        ops.push({
          subject: iri,
          predicate: "rdfs:domain",
          objectKind: "iri",
          objectValue: input.domainClassIri.trim(),
        });
      }
      if (input.rangeClassIri?.trim()) {
        ops.push({
          subject: iri,
          predicate: "rdfs:range",
          objectKind: "iri",
          objectValue: input.rangeClassIri.trim(),
        });
      }
    } else if (input.kind === "annotationProperty") {
      ops.push({ subject: iri, predicate: "rdf:type", objectKind: "iri", objectValue: "owl:AnnotationProperty" });
      if (label) ops.push(addLabel);
    } else if (input.kind === "concept") {
      ops.push({ subject: iri, predicate: "rdf:type", objectKind: "iri", objectValue: "skos:Concept" });
      if (label) ops.push(addLabel);
    } else if (input.kind === "individual") {
      ops.push({ subject: iri, predicate: "rdf:type", objectKind: "iri", objectValue: "owl:NamedIndividual" });
      if (input.individualTypeIri?.trim()) {
        ops.push({
          subject: iri,
          predicate: "rdf:type",
          objectKind: "iri",
          objectValue: input.individualTypeIri.trim(),
        });
      }
      if (label) ops.push(addLabel);
    }

    for (const op of ops) {
      await addTriple(op);
    }

    focusOnNodeId(iri);
    return iri;
  }

  function focusOnNodeId(id: string) {
    setSelectedNodeId(id);
    setSelectedLinkId(null);
    setFocusNodeId(id);
    setInspectorTab("details");
    if (!showInspector) setShowInspector(true);
    if (matchesMediaQuery("(max-width: 900px)")) setShowSidebar(false);
    setSparqlWorkspaceOpen(false);
  }

  function openInspectorTab(tab: InspectorTab) {
    setSparqlWorkspaceOpen(false);
    if (isDesktopLayout && showInspector && inspectorTab === tab) {
      setShowInspector(false);
      return;
    }
    setInspectorTab(tab);
    setShowInspector(true);
    if (matchesMediaQuery("(max-width: 900px)")) setShowSidebar(false);
  }

  function applyStoreChange(store: any, change: StoreChange) {
    if (change.kind === "add") addRdfTripleToStore(store, change.triple);
    else removeRdfTripleFromStore(store, change.triple);
  }

  async function commitChange(kind: StoreChange["kind"], triple: StoreChange["triple"]) {
    if (!rdfStore) throw new Error("Load RDF/OWL/JSON-LD to enable editing.");
    const at = Date.now();
    const key = `${kind}|${triple.s.termType}:${triple.s.value}|${triple.p.value}|${triple.o.termType}:${triple.o.value}|${at}`;
    const change: StoreChange = {
      id: `chg:${hashString(key)}`,
      kind,
      triple,
      at,
    };
    applyStoreChange(rdfStore, change);
    setModel(buildOntologyModel(storeToTriples(rdfStore)));
    setUndoStack((prev) => [...prev, change]);
    setRedoStack([]);
  }

  async function addTriple(input: AddTripleInput) {
    if (!rdfStore) throw new Error("Load RDF/OWL/JSON-LD to enable editing.");
    const { triple } = parseTripleInputToRdfTriple({ baseIri, ...input });
    await commitChange("add", triple);
  }

  async function removeTriple(triple: StoreChange["triple"]) {
    await commitChange("remove", triple);
  }

  async function applyPatchOps(ops: Array<{ op: "add" | "remove"; input: AddTripleInput }>) {
    if (!rdfStore) throw new Error("Load RDF/OWL/JSON-LD to enable editing.");
    if (ops.length === 0) return;

    const startAt = Date.now();
    const changes: StoreChange[] = ops.map((op, idx) => {
      const { triple } = parseTripleInputToRdfTriple({ baseIri, ...op.input });
      const at = startAt + idx;
      const key = `${op.op}|${triple.s.termType}:${triple.s.value}|${triple.p.value}|${triple.o.termType}:${triple.o.value}|${at}`;
      return {
        id: `chg:${hashString(key)}`,
        kind: op.op,
        triple,
        at,
      };
    });

    for (const change of changes) applyStoreChange(rdfStore, change);
    setModel(buildOntologyModel(storeToTriples(rdfStore)));
    setUndoStack((prev) => [...prev, ...changes]);
    setRedoStack([]);
  }

  async function undo() {
    if (!rdfStore) return;
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    const inverse: StoreChange = { ...last, kind: invertChangeKind(last.kind), at: Date.now() };
    applyStoreChange(rdfStore, inverse);
    setModel(buildOntologyModel(storeToTriples(rdfStore)));
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, last]);
  }

  async function redo() {
    if (!rdfStore) return;
    const last = redoStack[redoStack.length - 1];
    if (!last) return;
    applyStoreChange(rdfStore, last);
    setModel(buildOntologyModel(storeToTriples(rdfStore)));
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, last]);
  }

  async function exportTurtle(): Promise<string> {
    if (!rdfStore) throw new Error("Load RDF/OWL/JSON-LD to export.");
    return await serializeStoreToTurtle(rdfStore, baseIri);
  }

  function exportGraphJson(): string {
    return JSON.stringify({ nodes: model.nodes, links: model.links }, null, 2);
  }

  return (
    <div
      className="appShell"
      data-sidebar-open={showSidebar ? "true" : "false"}
      data-inspector-open={showInspector ? "true" : "false"}
    >
      <header ref={topBarRef} className="topBar">
        <div className="topLeft">
          <button
            className="iconButton"
            type="button"
            onClick={() => {
              if (matchesMediaQuery("(max-width: 900px)")) {
                setSidebarCollapsed(false);
                setShowSidebar((v) => {
                  const next = !v;
                  if (next) setShowInspector(false);
                  return next;
                });
                return;
              }

              if (!showSidebar) {
                setShowSidebar(true);
                setSidebarCollapsed(false);
                return;
              }

              setSidebarCollapsed((v) => !v);
            }}
            aria-label="Toggle sidebar"
            title={
              matchesMediaQuery("(max-width: 900px)")
                ? showSidebar
                  ? "Close menu"
                  : "Open menu"
                : sidebarCollapsed
                  ? "Expand menu"
                  : "Collapse menu"
            }
          >
            <IconHamburger />
          </button>

          <div className="brand">
            <div className="brandTitle">3D Ontology Graph</div>
            <div className="brandSub">RDF / OWL / JSON-LD → ABox &amp; TBox in 3D</div>
          </div>
        </div>
        <div className="topCenter">
          <HeaderSearch
            value={search}
            onChange={setSearch}
            matches={searchMatches}
            onSelectNodeId={focusOnNodeId}
          />
        </div>
        <div className="topRight">
          <UserMenu />
          {!isDesktopLayout ? (
            <button
              className="iconButton"
              type="button"
              onClick={() =>
                setShowInspector((v) => {
                  const next = !v;
                  if (next) setInspectorTab("details");
                  if (next && matchesMediaQuery("(max-width: 900px)")) setShowSidebar(false);
                  if (next) setSparqlWorkspaceOpen(false);
                  return next;
                })
              }
              aria-label="Toggle inspector"
              title={showInspector ? "Close inspector" : "Open inspector"}
            >
              <IconPanel />
            </button>
          ) : null}
        </div>
      </header>

      <div
        className="backdrop"
        aria-hidden="true"
        onClick={() => {
          if (matchesMediaQuery("(max-width: 1199px)")) setShowInspector(false);
          if (matchesMediaQuery("(max-width: 900px)")) setShowSidebar(false);
        }}
      />

      <main
        className={[
          "mainArea",
          showSidebar ? "withSidebar" : "",
          showSidebar && sidebarCollapsed ? "sidebarCollapsed" : "",
          isDesktopLayout ? "withRightbar" : "",
          showInspector ? "withInspector" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <section className="sidebar" data-open={showSidebar ? "true" : "false"}>
          <Sidebar
            baseIri={baseIri}
            onBaseIriChange={setBaseIri}
            filters={filters}
            onFiltersChange={setFilters}
            error={error}
            canExportTurtle={Boolean(rdfStore)}
            onNewOntology={newOntology}
            onExportTurtle={exportTurtle}
            onExportGraphJson={exportGraphJson}
            onCreateEntity={createEntity}
            onError={setError}
            model={model}
            filtered={filtered}
            onFocusNodeId={focusOnNodeId}
            onLoadSampleTtl={() => loadSample("/sample.ttl")}
            onLoadSampleJsonLd={() => loadSample("/sample.jsonld")}
            onLoadSampleFoaf={() => loadSample("/sample-foaf.ttl")}
            onLoadSamplePizza={() => loadSample("/sample-pizza.ttl")}
            onClear={clearGraph}
            onOpenFiles={importFiles}
            collapsed={sidebarCollapsed}
            onCollapsedChange={setSidebarCollapsed}
            onTabChange={(tab) => {
              if (tab !== "tools") setSparqlWorkspaceOpen(false);
            }}
            toolCards={
              <SparqlCard
                store={rdfStore}
                nodeIdSet={nodeIdSet}
                onFocusNodeId={focusOnNodeId}
                onOpenWorkspace={() => {
                  setSparqlWorkspaceOpen(true);
                  if (matchesMediaQuery("(max-width: 900px)")) setShowSidebar(false);
                  if (matchesMediaQuery("(max-width: 1199px)")) setShowInspector(false);
                }}
              />
            }
          >
            <FileDrop onFiles={importFiles} />
          </Sidebar>
        </section>

        <section className="graphPane">
          <GraphView3D
            graphData={filtered}
            focusNodeId={focusNodeId}
            highlightNodeId={selectedNodeId}
            editingEnabled={Boolean(rdfStore)}
            baseIri={baseIri}
            onCreateEntity={createEntity}
            autoOpenCreateMenuToken={createMenuToken}
            showNodeLabels={filters.showNodeLabels}
            showEdgeLabels={filters.showEdgeLabels}
            labelRenderer={filters.labelRenderer}
            labelScale={filters.labelScale}
            showEdgeFlow={filters.showEdgeFlow}
            highlightAnnotations={filters.highlightAnnotations}
            annotationMetaById={annotationMetaById}
            onNodeClick={(node) => {
              if (!node?.id) return;
              focusOnNodeId(node.id);
            }}
            onLinkClick={(link) => {
              setSelectedLinkId(link?.id ?? null);
              setSelectedNodeId(null);
              setInspectorTab("details");
              if (link?.id && !showInspector) setShowInspector(true);
              if (link?.id && matchesMediaQuery("(max-width: 900px)")) setShowSidebar(false);
            }}
            onBackgroundClick={() => {
              setSelectedNodeId(null);
              setSelectedLinkId(null);
            }}
          />
          {sparqlWorkspaceOpen ? (
            <SparqlWorkspace
              store={rdfStore}
              model={model}
              baseIri={baseIri}
              nodeIdSet={nodeIdSet}
              onFocusNodeId={(id) => {
                focusOnNodeId(id);
                setSparqlWorkspaceOpen(false);
              }}
              onClose={() => setSparqlWorkspaceOpen(false)}
            />
          ) : null}
        </section>

        {isDesktopLayout || showInspector ? (
          <section className="rightbar">
            <div className="inspectorShell" data-expanded={showInspector ? "true" : "false"}>
              {showInspector ? (
                <div className="inspectorPane">
                  <div className="sidebarStack">
                    {inspectorTab === "details" ? (
                      <DetailsCard
                        selectedNode={selection.node}
                        selectedLink={selection.link}
                        selectedNodeFacts={selectedNodeId ? model.nodeFactsById[selectedNodeId] : undefined}
                      />
                    ) : null}

                    {inspectorTab === "triples" ? (
                      <EntityTriplesCard store={rdfStore} node={selection.node} onRemoveTriple={removeTriple} />
                    ) : null}

                    {inspectorTab === "edit" ? (
                      <>
                        <OwlEntityEditorCard
                          enabled={Boolean(rdfStore)}
                          baseIri={baseIri}
                          model={model}
                          node={selection.node}
                          onAddTriple={addTriple}
                        />
                        <EditorCard
                          enabled={Boolean(rdfStore)}
                          baseIri={baseIri}
                          model={model}
                          suggestedSubject={
                            selection.node && selection.node.kind !== "literal"
                              ? selection.node.iri ?? selection.node.id
                              : undefined
                          }
                          onAddTriple={addTriple}
                          onExportTurtle={exportTurtle}
                          onSaveToLibrary={saveWorkspaceToLibrary}
                        />
                      </>
                    ) : null}

                    {inspectorTab === "changes" ? (
                      <ChangesCard
                        enabled={Boolean(rdfStore)}
                        undoStack={undoStack}
                        redoStack={redoStack}
                        onUndo={undo}
                        onRedo={redo}
                        onClearHistory={() => {
                          setUndoStack([]);
                          setRedoStack([]);
                        }}
                      />
                    ) : null}

                    {inspectorTab === "ai" ? (
                      <AiAssistantCard
                        enabled={Boolean(rdfStore)}
                        baseIri={baseIri}
                        model={model}
                        node={selection.node}
                        nodeFacts={selectedNodeId ? model.nodeFactsById[selectedNodeId] : undefined}
                        onApplyOps={applyPatchOps}
                      />
                    ) : null}

                    {inspectorTab === "comments" ? <CommentsCard node={selection.node} /> : null}

                    {inspectorTab === "validate" ? (
                      <div className="card">
                        <div className="cardTitle">SHACL / SWRL</div>
                        <div className="mutedSmall">
                          Next steps: SHACL validation (load shapes + run report), SWRL rule authoring and
                          reasoning (typically server-side). Tell me your preferred tooling (TopBraid,
                          Jena, Stardog, GraphDB, Protégé) and I’ll integrate accordingly.
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <nav className="inspectorNav" aria-label="Inspector tools">
                <button
                  type="button"
                  className={`inspectorNavBtn ${inspectorTab === "details" && showInspector ? "active" : ""}`}
                  onClick={() => openInspectorTab("details")}
                  aria-pressed={inspectorTab === "details" && showInspector ? "true" : "false"}
                  title="Details"
                >
                  <IconInfo />
                </button>
                <button
                  type="button"
                  className={`inspectorNavBtn ${inspectorTab === "triples" && showInspector ? "active" : ""}`}
                  onClick={() => openInspectorTab("triples")}
                  aria-pressed={inspectorTab === "triples" && showInspector ? "true" : "false"}
                  title="Triples"
                >
                  <IconTriples />
                </button>
                <button
                  type="button"
                  className={`inspectorNavBtn ${inspectorTab === "edit" && showInspector ? "active" : ""}`}
                  onClick={() => openInspectorTab("edit")}
                  aria-pressed={inspectorTab === "edit" && showInspector ? "true" : "false"}
                  title="Edit"
                >
                  <IconEdit />
                </button>
                <button
                  type="button"
                  className={`inspectorNavBtn ${inspectorTab === "changes" && showInspector ? "active" : ""}`}
                  onClick={() => openInspectorTab("changes")}
                  aria-pressed={inspectorTab === "changes" && showInspector ? "true" : "false"}
                  title="Changes"
                >
                  <IconHistory />
                </button>
                <button
                  type="button"
                  className={`inspectorNavBtn ${inspectorTab === "ai" && showInspector ? "active" : ""}`}
                  onClick={() => openInspectorTab("ai")}
                  aria-pressed={inspectorTab === "ai" && showInspector ? "true" : "false"}
                  title="AI assistant"
                >
                  <IconSparkle />
                </button>
                <button
                  type="button"
                  className={`inspectorNavBtn ${inspectorTab === "comments" && showInspector ? "active" : ""}`}
                  onClick={() => openInspectorTab("comments")}
                  aria-pressed={inspectorTab === "comments" && showInspector ? "true" : "false"}
                  title="Comments"
                >
                  <IconChat />
                </button>
                <button
                  type="button"
                  className={`inspectorNavBtn ${inspectorTab === "validate" && showInspector ? "active" : ""}`}
                  onClick={() => openInspectorTab("validate")}
                  aria-pressed={inspectorTab === "validate" && showInspector ? "true" : "false"}
                  title="Validate (SHACL / SWRL)"
                >
                  <IconShield />
                </button>

                <div className="inspectorNavSpacer" aria-hidden="true" />

                <button
                  type="button"
                  className="inspectorNavBtn"
                  onClick={() => setShowInspector((v) => !v)}
                  title={showInspector ? "Collapse inspector" : "Expand inspector"}
                >
                  {showInspector ? <IconChevronRight /> : <IconChevronLeft />}
                </button>
              </nav>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function defaultLabelFromIri(iri: string): string {
  const local = getLocalName(iri);
  const spaced = local
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return spaced || local || iri;
}

function ensureExtension(name: string, ext: ".ttl" | ".json"): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return `ontology${ext}`;
  if (trimmed.toLowerCase().endsWith(ext)) return trimmed;
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot > 0 && lastDot >= trimmed.length - 6) return trimmed; // keep existing extension
  return `${trimmed}${ext}`;
}

function IconInfo() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 10.5v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M12 7.5h.01"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconTriples() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M10 13a4 4 0 0 1 0-6l1-1a4 4 0 0 1 6 6l-1 1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 11a4 4 0 0 1 0 6l-1 1a4 4 0 0 1-6-6l1-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M12 20h9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M3 12a9 9 0 1 0 3-6.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 4v4h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 7v5l3 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M12 2l1.2 4.3L17.5 8l-4.3 1.2L12 13.5l-1.2-4.3L6.5 8l4.3-1.2L12 2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M19 13l.7 2.4L22 16l-2.3.6L19 19l-.7-2.4L16 16l2.3-.6L19 13Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M4 13l.9 3.1L8 17l-3.1.9L4 21l-.9-3.1L0 17l3.1-.9L4 13Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChat() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M21 14a4 4 0 0 1-4 4H8l-5 3V6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M12 2 20 6v6c0 5-3.4 9.4-8 10-4.6-.6-8-5-8-10V6l8-4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="m8.5 12 2.3 2.3L15.8 9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconHamburger() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPanel() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M15 5v14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
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
