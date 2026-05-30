import { useMemo, useState } from "react";
import type { CreateEntityKind, CreateEntityInput } from "../lib/editor";
import type { GraphNode } from "../lib/graphModel";

type Props = {
  nodes: GraphNode[];
  onFocusNodeId: (id: string) => void;
  editingEnabled: boolean;
  baseIri: string;
  onCreateEntity: (input: CreateEntityInput) => Promise<string> | string;
};

const GROUPS: Array<{ title: string; kind: GraphNode["kind"]; color: string }> = [
  { title: "Classes", kind: "class", color: "#74c0fc" },
  { title: "Properties", kind: "property", color: "#ffd43b" },
  { title: "Individuals", kind: "individual", color: "#69db7c" },
  { title: "SKOS Concepts", kind: "concept", color: "#b197fc" },
  { title: "OWL Restrictions", kind: "restriction", color: "#ff6b6b" },
  { title: "Blank nodes", kind: "blank", color: "#adb5bd" },
  { title: "Literals", kind: "literal", color: "#ffe066" },
  { title: "Unknown", kind: "unknown", color: "#868e96" },
];

const DATATYPE_OPTIONS = [
  "xsd:string",
  "rdf:langString",
  "rdfs:Literal",
  "xsd:boolean",
  "xsd:integer",
  "xsd:decimal",
  "xsd:double",
  "xsd:date",
  "xsd:time",
  "xsd:dateTime",
  "xsd:anyURI",
  "xsd:duration",
] as const;

export default function EntitiesCard(props: Props) {
  const [createOpen, setCreateOpen] = useState(() => props.nodes.length === 0);
  const [createKind, setCreateKind] = useState<CreateEntityKind>("class");
  const [createIri, setCreateIri] = useState("");
  const [createLabel, setCreateLabel] = useState("");
  const [createLang, setCreateLang] = useState("en");
  const [createParent, setCreateParent] = useState("");
  const [createDomain, setCreateDomain] = useState("");
  const [createRange, setCreateRange] = useState("");
  const [createType, setCreateType] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const qNorm = q.trim().toLowerCase();

  const classOptions = useMemo(() => {
    return props.nodes
      .filter((n) => n.kind === "class")
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, 250);
  }, [props.nodes]);

  const showParent = createKind === "class";
  const showDomainRange = createKind === "objectProperty" || createKind === "dataProperty";
  const showType = createKind === "individual";

  const canCreate = props.editingEnabled && !createBusy && createIri.trim().length > 0;

  function resetCreate() {
    setCreateIri("");
    setCreateLabel("");
    setCreateParent("");
    setCreateDomain("");
    setCreateRange("");
    setCreateType("");
    setCreateError(null);
  }

  async function doCreate() {
    if (!canCreate) return;
    setCreateBusy(true);
    setCreateError(null);
    try {
      const input: CreateEntityInput = {
        kind: createKind,
        iriInput: createIri,
        label: createLabel.trim() || undefined,
        lang: createLang.trim() || undefined,
        parentClassIri: showParent ? createParent.trim() || undefined : undefined,
        domainClassIri: showDomainRange ? createDomain.trim() || undefined : undefined,
        rangeClassIri: showDomainRange ? createRange.trim() || undefined : undefined,
        individualTypeIri: showType ? createType.trim() || undefined : undefined,
      };
      await props.onCreateEntity(input);
      resetCreate();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCreateError(msg);
    } finally {
      setCreateBusy(false);
    }
  }

  const grouped = useMemo(() => {
    const out: Record<string, GraphNode[]> = {};
    for (const g of GROUPS) out[g.kind] = [];
    for (const n of props.nodes) {
      out[n.kind] ??= [];
      out[n.kind].push(n);
    }
    for (const k of Object.keys(out)) {
      out[k].sort((a, b) => a.label.localeCompare(b.label));
    }
    return out;
  }, [props.nodes]);

  const matches = useMemo(() => {
    if (!qNorm) return [] as GraphNode[];
    return props.nodes
      .filter((n) => {
        const iri = (n.iri ?? n.id).toLowerCase();
        return n.label.toLowerCase().includes(qNorm) || iri.includes(qNorm);
      })
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, 80);
  }, [props.nodes, qNorm]);

  return (
    <div className="card">
      <div className="cardTitle">Entities</div>

      <details
        className="entityGroup mt10"
        open={createOpen}
        onToggle={(e) => setCreateOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="entitySummary">
          <span className="entitySummaryLeft">
            <span className="toggleSwatch" style={{ background: "#ffd43b" }} aria-hidden="true" />
            Create entity
          </span>
          <span className="mutedSmall">{props.editingEnabled ? kindLabel(createKind) : "Read-only"}</span>
        </summary>

        <div className="mt10">
          {!props.editingEnabled ? (
            <div className="mutedSmall">
              Editing is available only for RDF/OWL/JSON-LD workspaces. Use <span className="mono">New</span> in the
              Import tab or open an ontology file.
            </div>
          ) : (
            <>
              <div className="row gap8 wrap">
                <div className="field" style={{ minWidth: 220, flex: 1 }}>
                  <label className="label" htmlFor="createKind">
                    Type
                  </label>
                  <select
                    id="createKind"
                    className="input miniSelect"
                    value={createKind}
                    onChange={(e) => {
                      const v = e.target.value as CreateEntityKind;
                      setCreateKind(v);
                      setCreateError(null);
                    }}
                    disabled={createBusy}
                  >
                    <option value="class">Class</option>
                    <option value="objectProperty">Object property</option>
                    <option value="dataProperty">Data property</option>
                    <option value="annotationProperty">Annotation property</option>
                    <option value="individual">Individual</option>
                    <option value="concept">SKOS Concept</option>
                  </select>
                </div>

                <div className="field" style={{ minWidth: 220, flex: 2 }}>
                  <label className="label" htmlFor="createIri">
                    IRI / CURIE / local name
                  </label>
                  <input
                    id="createIri"
                    className="input"
                    value={createIri}
                    onChange={(e) => {
                      setCreateIri(e.target.value);
                      setCreateError(null);
                    }}
                    placeholder={createKind === "class" ? "Person" : createKind.includes("Property") ? "hasFriend" : "Alice"}
                    spellCheck={false}
                    disabled={createBusy}
                  />
                  <div className="help">Tip: use `ex:` to mint in Base IRI ({props.baseIri}).</div>
                </div>
              </div>

              <div className="row gap8 mt10 wrap">
                <div className="field" style={{ minWidth: 220, flex: 2 }}>
                  <label className="label" htmlFor="createLabel">
                    Label (optional)
                  </label>
                  <input
                    id="createLabel"
                    className="input"
                    value={createLabel}
                    onChange={(e) => setCreateLabel(e.target.value)}
                    placeholder="Human label…"
                    spellCheck={false}
                    disabled={createBusy}
                  />
                </div>
                <div className="field" style={{ minWidth: 92 }}>
                  <label className="label" htmlFor="createLang">
                    Lang
                  </label>
                  <input
                    id="createLang"
                    className="input miniInput"
                    value={createLang}
                    onChange={(e) => setCreateLang(e.target.value)}
                    spellCheck={false}
                    disabled={createBusy}
                  />
                </div>
              </div>

              {showParent ? (
                <div className="field mt10">
                  <label className="label" htmlFor="createParent">
                    Parent class (optional)
                  </label>
                  <input
                    id="createParent"
                    className="input"
                    list="classOptions"
                    value={createParent}
                    onChange={(e) => setCreateParent(e.target.value)}
                    placeholder="ex:Thing"
                    spellCheck={false}
                    disabled={createBusy}
                  />
                </div>
              ) : null}

              {showDomainRange ? (
                <div className="row gap8 mt10 wrap">
                  <div className="field" style={{ minWidth: 220, flex: 1 }}>
                    <label className="label" htmlFor="createDomain">
                      Domain (optional)
                    </label>
                    <input
                      id="createDomain"
                      className="input"
                      list="classOptions"
                      value={createDomain}
                      onChange={(e) => setCreateDomain(e.target.value)}
                      placeholder="ex:Person"
                      spellCheck={false}
                      disabled={createBusy}
                    />
                  </div>
                  <div className="field" style={{ minWidth: 220, flex: 1 }}>
                    <label className="label" htmlFor="createRange">
                      Range (optional)
                    </label>
                    <input
                      id="createRange"
                      className="input"
                      list={createKind === "dataProperty" ? "datatypeOptions" : "classOptions"}
                      value={createRange}
                      onChange={(e) => setCreateRange(e.target.value)}
                      placeholder={createKind === "dataProperty" ? "xsd:string" : "ex:Person"}
                      spellCheck={false}
                      disabled={createBusy}
                    />
                  </div>
                </div>
              ) : null}

              {showType ? (
                <div className="field mt10">
                  <label className="label" htmlFor="createType">
                    Type (optional)
                  </label>
                  <input
                    id="createType"
                    className="input"
                    list="classOptions"
                    value={createType}
                    onChange={(e) => setCreateType(e.target.value)}
                    placeholder="ex:Person"
                    spellCheck={false}
                    disabled={createBusy}
                  />
                </div>
              ) : null}

              <datalist id="classOptions">
                {classOptions.map((c) => (
                  <option key={c.id} value={c.iri ?? c.id}>
                    {c.label}
                  </option>
                ))}
              </datalist>

              <datalist id="datatypeOptions">
                {DATATYPE_OPTIONS.map((dt) => (
                  <option key={dt} value={dt} />
                ))}
              </datalist>

              <div className="row gap8 mt10 wrap">
                <button className="button" type="button" onClick={doCreate} disabled={!canCreate}>
                  {createBusy ? "Creating…" : "Create"}
                </button>
                <button className="button" type="button" onClick={resetCreate} disabled={createBusy}>
                  Reset
                </button>
              </div>

              {createError ? <div className="errorBox mt10">{createError}</div> : null}
              <div className="help mt10">Remove/adjust axioms in the Triples tab (prototype).</div>
            </>
          )}
        </div>
      </details>

      <div className="field">
        <label className="label" htmlFor="entityFilter">
          Filter
        </label>
        <input
          id="entityFilter"
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type to filter entities…"
          spellCheck={false}
        />
      </div>

      {qNorm ? (
        <div className="entityList mt10" role="list" aria-label="Entity matches">
          {matches.length === 0 ? <div className="mutedSmall">No matches.</div> : null}
          {matches.map((n) => (
            <button
              key={n.id}
              type="button"
              className="entityItem"
              onClick={() => props.onFocusNodeId(n.id)}
              title={n.iri ?? n.id}
            >
              <span className="entityLabel">{n.label}</span>
              <span className="pill small">{n.kind}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="entityGroups mt10">
          {GROUPS.filter((g) => (grouped[g.kind]?.length ?? 0) > 0).map((g) => (
            <details key={g.kind} className="entityGroup" open={g.kind === "class" || g.kind === "property"}>
              <summary className="entitySummary">
                <span className="entitySummaryLeft">
                  <span className="toggleSwatch" style={{ background: g.color }} aria-hidden="true" />
                  {g.title}
                </span>
                <span className="mutedSmall">{grouped[g.kind].length}</span>
              </summary>
              <div className="entityList" role="list" aria-label={g.title}>
                {grouped[g.kind].slice(0, 40).map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="entityItem"
                    onClick={() => props.onFocusNodeId(n.id)}
                    title={n.iri ?? n.id}
                  >
                    <span className="entityLabel">{n.label}</span>
                    <span className="pill small">{n.box}</span>
                  </button>
                ))}
                {grouped[g.kind].length > 40 ? (
                  <div className="mutedSmall" style={{ padding: "8px 4px" }}>
                    Showing first 40. Use filter to find more.
                  </div>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function kindLabel(kind: CreateEntityKind): string {
  if (kind === "class") return "Class (owl:Class)";
  if (kind === "objectProperty") return "Object property (owl:ObjectProperty)";
  if (kind === "dataProperty") return "Data property (owl:DatatypeProperty)";
  if (kind === "annotationProperty") return "Annotation property (owl:AnnotationProperty)";
  if (kind === "individual") return "Individual (owl:NamedIndividual)";
  return "SKOS Concept (skos:Concept)";
}
