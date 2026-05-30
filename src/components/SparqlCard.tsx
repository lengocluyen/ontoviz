import { useEffect, useMemo, useState } from "react";
import { compactIri, truncate } from "../lib/ontology";
import type { SparqlResults, SparqlTerm } from "../lib/sparql";
import { runSparqlSelect, termToNodeId } from "../lib/sparql";

type Props = {
  store: any | null;
  nodeIdSet: Set<string>;
  onFocusNodeId: (id: string) => void;
  onOpenWorkspace?: () => void;
};

const DEFAULT_QUERY = `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>

SELECT ?s ?p ?o WHERE {
  ?s ?p ?o .
}
LIMIT 50`;

const TEMPLATES: Array<{ label: string; query: string }> = [
  {
    label: "Triples",
    query: DEFAULT_QUERY,
  },
  {
    label: "Classes",
    query: `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>

SELECT ?class ?label WHERE {
  ?class rdf:type owl:Class .
  OPTIONAL { ?class rdfs:label ?label }
}
LIMIT 100`,
  },
  {
    label: "Individuals",
    query: `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>

SELECT ?instance ?type ?label WHERE {
  ?instance rdf:type ?type .
  FILTER (?type != owl:Class)
  OPTIONAL { ?instance rdfs:label ?label }
}
LIMIT 100`,
  },
];

export default function SparqlCard(props: Props) {
  const workspaceMode = Boolean(props.onOpenWorkspace);

  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SparqlResults | null>(null);

  useEffect(() => {
    setError(null);
    setResults(null);
  }, [props.store]);

  const canRun = Boolean(props.store) && query.trim().length > 0 && !running;

  const vars = results?.vars ?? [];
  const rows = results?.rows ?? [];

  const rowLimit = 200;
  const visibleRows = useMemo(() => rows.slice(0, rowLimit), [rows]);

  async function run() {
    if (!props.store) {
      setError("Load RDF/OWL/JSON-LD to enable SPARQL.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const r = await runSparqlSelect(props.store, query);
      setResults(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setResults(null);
    } finally {
      setRunning(false);
    }
  }

  function tryFocus(term: SparqlTerm) {
    const id = termToNodeId(term);
    if (!id) return;
    if (!props.nodeIdSet.has(id)) return;
    props.onFocusNodeId(id);
  }

  if (workspaceMode) {
    return (
      <div className="card">
        <div className="cardTitle">SPARQL</div>

        <div className="mutedSmall">Use the center workspace for query editing and results.</div>

        <div className="row gap8 mt10 wrap">
          <button className="button" type="button" onClick={() => props.onOpenWorkspace?.()} disabled={running}>
            Open in center
          </button>
        </div>

        {!props.store ? <div className="help mt10">Load RDF/OWL/JSON-LD to enable SPARQL.</div> : null}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="cardTitle">SPARQL</div>

      <div className="mutedSmall">
        Runs in the browser on the currently loaded RDF store (SELECT only).
      </div>

      <div className="row gap8 mt10 wrap">
        {TEMPLATES.map((t) => (
          <button
            key={t.label}
            className="button"
            type="button"
            onClick={() => setQuery(t.query)}
            disabled={running}
          >
            {t.label}
          </button>
        ))}
        <button className="button" type="button" onClick={run} disabled={!canRun}>
          {running ? "Executing…" : "Execute"}
        </button>
      </div>

      <textarea
        className="textarea mt10"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        spellCheck={false}
        rows={9}
        placeholder="SELECT … WHERE { … }"
      />

      {error ? <div className="errorBox mt10">{error}</div> : null}

      {results ? (
        <div className="mt10">
          <div className="help">
            Rows: {results.rowCount}
            {results.rowCount > rowLimit ? ` (showing first ${rowLimit})` : ""}
          </div>
          {vars.length === 0 ? (
            <div className="muted mt8">No variables returned.</div>
          ) : (
            <div className="tableWrap mt8">
              <table className="table">
                <thead>
                  <tr>
                    {vars.map((v) => (
                      <th key={v} className="th mono">
                        ?{v}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, idx) => (
                    <tr key={idx}>
                      {vars.map((v) => {
                        const term = row[v];
                        const nodeId = term ? termToNodeId(term) : null;
                        const focusable = Boolean(nodeId && props.nodeIdSet.has(nodeId));
                        return (
                          <td
                            key={v}
                            className={`td ${focusable ? "tdClickable" : ""}`}
                            onClick={() => (term ? tryFocus(term) : undefined)}
                            title={term ? formatTermLong(term) : ""}
                          >
                            {term ? formatTermShort(term) : <span className="mutedSmall">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatTermShort(term: SparqlTerm): string {
  if (term.termType === "NamedNode") return truncate(compactIri(term.value), 38);
  if (term.termType === "BlankNode") return `_:${truncate(term.value, 36)}`;
  if (term.termType === "Literal") return truncate(term.value, 42);
  return truncate(term.value, 42);
}

function formatTermLong(term: SparqlTerm): string {
  if (term.termType === "NamedNode") return term.value;
  if (term.termType === "BlankNode") return `_:${term.value}`;
  if (term.termType === "Literal") {
    const suffix = term.language ? `@${term.language}` : term.datatype ? `^^${compactIri(term.datatype)}` : "";
    return `"${term.value}"${suffix}`;
  }
  return term.value;
}
