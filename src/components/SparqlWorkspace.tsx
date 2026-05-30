import { useEffect, useMemo, useRef, useState } from "react";
import type { OntologyModel } from "../lib/graphModel";
import { compactIri, truncate } from "../lib/ontology";
import type { SparqlResults, SparqlTerm } from "../lib/sparql";
import { runSparqlSelect, termToNodeId } from "../lib/sparql";

type Props = {
  store: any | null;
  model: OntologyModel;
  baseIri: string;
  nodeIdSet: Set<string>;
  onFocusNodeId: (id: string) => void;
  onClose: () => void;
};

const STORAGE_QUERY = "sparql:v1:lastQuery";
const STORAGE_ENDPOINT = "sparql:v1:endpoint";
const STORAGE_API_KEY = "sparql:v1:apiKey";
const STORAGE_INSTRUCTIONS = "sparql:v1:instructions";
const FALLBACK_ENDPOINT = "ai:v1:endpoint";
const FALLBACK_API_KEY = "ai:v1:apiKey";

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

export default function SparqlWorkspace(props: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [query, setQuery] = useState(() => localStorage.getItem(STORAGE_QUERY) ?? DEFAULT_QUERY);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SparqlResults | null>(null);

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiEndpoint, setAiEndpoint] = useState(
    () => localStorage.getItem(STORAGE_ENDPOINT) ?? localStorage.getItem(FALLBACK_ENDPOINT) ?? "",
  );
  const [aiApiKey, setAiApiKey] = useState(
    () => localStorage.getItem(STORAGE_API_KEY) ?? localStorage.getItem(FALLBACK_API_KEY) ?? "",
  );
  const [aiInstructions, setAiInstructions] = useState(
    () =>
      localStorage.getItem(STORAGE_INSTRUCTIONS) ??
      "Generate a SPARQL SELECT query for the user prompt. Use common prefixes and keep it compatible with rdflib.js (SELECT only). Return JSON {\"query\": \"...\"} or plain text SPARQL.",
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_QUERY, query);
    } catch {
      // ignore
    }
  }, [query]);

  useEffect(() => {
    setError(null);
    setResults(null);
  }, [props.store]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") props.onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.onClose]);

  const canRun = Boolean(props.store) && query.trim().length > 0 && !running;
  const canExport = Boolean(results) && !running;

  const vars = results?.vars ?? [];
  const rows = results?.rows ?? [];

  const rowLimit = 500;
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

  function exportResultsJson() {
    if (!results) return;
    downloadText("sparql-results.json", JSON.stringify(results, null, 2), "application/json;charset=utf-8");
  }

  function exportResultsCsv() {
    if (!results) return;
    downloadText("sparql-results.csv", resultsToCsv(results), "text/csv;charset=utf-8");
  }

  function tryFocus(term: SparqlTerm) {
    const id = termToNodeId(term);
    if (!id) return;
    if (!props.nodeIdSet.has(id)) return;
    props.onFocusNodeId(id);
  }

  function persistAiConfig() {
    try {
      localStorage.setItem(STORAGE_ENDPOINT, aiEndpoint);
      localStorage.setItem(STORAGE_API_KEY, aiApiKey);
      localStorage.setItem(STORAGE_INSTRUCTIONS, aiInstructions);
    } catch {
      // ignore
    }
  }

  async function generateQueryWithAi() {
    const url = aiEndpoint.trim();
    const prompt = aiPrompt.trim();
    if (!prompt) return;
    setAiBusy(true);
    setAiError(null);
    persistAiConfig();
    try {
      if (!url) throw new Error("Set an AI endpoint URL first (or configure it in the AI tab).");
      const schema = buildSchemaSummary(props.model, props.baseIri);
      const payload = { version: "v1", mode: "sparql", prompt, instructions: aiInstructions, schema };

      const headers: Record<string, string> = { "content-type": "application/json" };
      if (aiApiKey.trim()) headers.authorization = `Bearer ${aiApiKey.trim()}`;
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
      const rawText = await res.text();
      if (!res.ok) {
        throw new Error(`AI endpoint error (${res.status}): ${rawText.slice(0, 400)}`);
      }
      const next = extractQueryFromAi(rawText);
      if (!next) throw new Error("AI response did not include a SPARQL query.");
      setQuery(next);
      setAiPrompt("");
      setTimeout(() => textareaRef.current?.focus(), 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAiError(msg);
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="sparqlWorkspaceOverlay" role="dialog" aria-modal="true" aria-label="SPARQL workspace">
      <div className="sparqlWorkspaceTop">
        <div>
          <div className="sparqlWorkspaceTitle">SPARQL workspace</div>
          <div className="mutedSmall">Write queries in the center and inspect results here.</div>
        </div>
        <div className="row gap8 wrap">
          <button className="button" type="button" onClick={props.onClose}>
            Back to graph
          </button>
        </div>
      </div>

      <div className="sparqlWorkspaceBody">
        <div className="sparqlWorkspaceMain">
          <div className="card">
            <div className="cardTitle">Query</div>
            <div className="row gap8 wrap">
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
              ref={textareaRef}
              className="textarea mt10"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
              rows={12}
              placeholder="SELECT … WHERE { … }"
            />

            {error ? <div className="errorBox mt10">{error}</div> : null}
          </div>

          <div className="card mt10">
            <div className="cardTitle">Results</div>

            {!results ? <div className="mutedSmall">Execute a query to see results.</div> : null}

            {results ? (
              <div className="mt10">
                <div className="row gap8 wrap" style={{ justifyContent: "space-between" }}>
                  <div className="help">
                    Rows: {results.rowCount}
                    {results.rowCount > rowLimit ? ` (showing first ${rowLimit})` : ""}
                  </div>
                  <div className="row gap8 wrap">
                    <button className="button" type="button" onClick={exportResultsJson} disabled={!canExport}>
                      Export JSON
                    </button>
                    <button className="button" type="button" onClick={exportResultsCsv} disabled={!canExport}>
                      Export CSV
                    </button>
                  </div>
                </div>
                {vars.length === 0 ? (
                  <div className="muted mt8">No variables returned.</div>
                ) : (
                  <div className="tableWrap mt8" style={{ maxHeight: "min(52vh, 620px)" }}>
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
        </div>

        <div className="sparqlWorkspaceSide">
          <div className="card">
            <div className="cardTitle">LLM helper</div>
            <div className="mutedSmall">
              Optional. Generates a SELECT query from natural language (uses your endpoint).
            </div>

            <div className="field mt10">
              <label className="label" htmlFor="sparqlAiPrompt">
                Prompt
              </label>
              <input
                id="sparqlAiPrompt"
                className="input"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g., List all classes with labels"
                spellCheck={false}
                disabled={aiBusy}
              />
            </div>

            <div className="row gap8 mt10 wrap">
              <button
                className="button"
                type="button"
                onClick={generateQueryWithAi}
                disabled={aiBusy || !aiPrompt.trim()}
              >
                {aiBusy ? "Generating…" : "Generate query"}
              </button>
            </div>

            <details className="mt10">
              <summary className="entitySummary">AI config</summary>
              <div className="mt10">
                <div className="field">
                  <label className="label" htmlFor="sparqlAiEndpoint">
                    Endpoint URL
                  </label>
                  <input
                    id="sparqlAiEndpoint"
                    className="input"
                    value={aiEndpoint}
                    onChange={(e) => setAiEndpoint(e.target.value)}
                    placeholder="https://…"
                    spellCheck={false}
                    disabled={aiBusy}
                  />
                </div>

                <div className="field mt10">
                  <label className="label" htmlFor="sparqlAiKey">
                    API key (optional)
                  </label>
                  <input
                    id="sparqlAiKey"
                    className="input"
                    value={aiApiKey}
                    onChange={(e) => setAiApiKey(e.target.value)}
                    placeholder="Bearer …"
                    spellCheck={false}
                    disabled={aiBusy}
                  />
                </div>

                <div className="field mt10">
                  <label className="label" htmlFor="sparqlAiInstructions">
                    Instructions
                  </label>
                  <textarea
                    id="sparqlAiInstructions"
                    className="textarea"
                    value={aiInstructions}
                    onChange={(e) => setAiInstructions(e.target.value)}
                    spellCheck={false}
                    rows={6}
                    disabled={aiBusy}
                  />
                  <div className="help mt8">Expected output: JSON with {`{ "query": "..." }`} or plain text.</div>
                </div>
              </div>
            </details>

            {aiError ? <div className="errorBox mt10">{aiError}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTermShort(term: SparqlTerm): string {
  if (term.termType === "NamedNode") return truncate(compactIri(term.value), 52);
  if (term.termType === "BlankNode") return `_:${truncate(term.value, 50)}`;
  if (term.termType === "Literal") return truncate(term.value, 60);
  return truncate(term.value, 60);
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

function extractQueryFromAi(rawText: string): string | null {
  const trimmed = String(rawText ?? "").trim();
  if (!trimmed) return null;

  try {
    const json = JSON.parse(trimmed);
    const direct =
      typeof json?.query === "string"
        ? json.query
        : typeof json?.sparql === "string"
          ? json.sparql
          : typeof json?.text === "string"
            ? json.text
            : null;
    if (direct && String(direct).trim()) return String(direct).trim();
  } catch {
    // ignore
  }

  const fence = trimmed.match(/```(?:sparql)?\s*([\s\S]*?)```/i);
  if (fence?.[1]?.trim()) return fence[1].trim();
  return trimmed;
}

function buildSchemaSummary(model: OntologyModel, baseIri: string) {
  const classes = model.nodes
    .filter((n) => n.kind === "class")
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, 120)
    .map((n) => ({ iri: n.iri ?? n.id, label: n.label }));

  const properties = model.nodes
    .filter((n) => n.kind === "property")
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, 120)
    .map((n) => ({ iri: n.iri ?? n.id, label: n.label }));

  return {
    baseIri,
    prefixes: {
      rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      rdfs: "http://www.w3.org/2000/01/rdf-schema#",
      owl: "http://www.w3.org/2002/07/owl#",
      xsd: "http://www.w3.org/2001/XMLSchema#",
      skos: "http://www.w3.org/2004/02/skos/core#",
      dct: "http://purl.org/dc/terms/",
      foaf: "http://xmlns.com/foaf/0.1/",
      pizza: "http://www.co-ode.org/ontologies/pizza/pizza.owl#",
      ex: baseIri,
    },
    classes,
    properties,
    triples: model.triplesCount,
  };
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

function resultsToCsv(results: SparqlResults): string {
  const vars = results.vars ?? [];
  const lines: string[] = [];
  lines.push(vars.map(csvEscape).join(","));
  for (const row of results.rows ?? []) {
    const cols = vars.map((v) => {
      const term = row?.[v];
      const value = term ? formatTermLong(term) : "";
      return csvEscape(value);
    });
    lines.push(cols.join(","));
  }
  return lines.join("\r\n");
}

function csvEscape(value: string): string {
  const s = String(value ?? "");
  return `"${s.replace(/\"/g, '""')}"`;
}
