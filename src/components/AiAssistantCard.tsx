import { useEffect, useMemo, useState } from "react";
import type { GraphNode, NodeFacts, OntologyModel } from "../lib/graphModel";
import { compactIri, getLocalName, hashString, IRI, isBuiltInIri } from "../lib/ontology";
import type { AddTripleInput } from "./EditorCard";

type PatchOp = {
  op: "add" | "remove";
  input: AddTripleInput;
};

type Suggestion = {
  id: string;
  title: string;
  rationale?: string;
  confidence?: number;
  ops: PatchOp[];
  source: "api";
};

type Props = {
  enabled: boolean;
  baseIri: string;
  model: OntologyModel;
  node: GraphNode | null;
  nodeFacts?: NodeFacts;
  onApplyOps: (ops: PatchOp[]) => Promise<void>;
};

const STORAGE_ENDPOINT = "ai:v1:endpoint";
const STORAGE_API_KEY = "ai:v1:apiKey";
const STORAGE_INSTRUCTIONS = "ai:v1:instructions";

export default function AiAssistantCard(props: Props) {
  const storageKey = useMemo(() => {
    if (!props.node?.id) return null;
    return `ai:v1:suggestions:node:${props.node.id}`;
  }, [props.node?.id]);

  const [endpoint, setEndpoint] = useState(() => localStorage.getItem(STORAGE_ENDPOINT) ?? "");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_API_KEY) ?? "");
  const [instructions, setInstructions] = useState(
    () =>
      localStorage.getItem(STORAGE_INSTRUCTIONS) ??
      "Suggest labels/definitions and schema improvements. Return RDF changes as add/remove operations.",
  );

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [labelValue, setLabelValue] = useState("");
  const [labelLang, setLabelLang] = useState("en");
  const [definitionValue, setDefinitionValue] = useState("");
  const [definitionLang, setDefinitionLang] = useState("en");

  const nodeIsWritable = Boolean(props.enabled && props.node && props.node.kind !== "literal");
  const nodeHasLabel = Boolean((props.nodeFacts?.labels?.length ?? 0) > 0);
  const nodeHasDefinition = Boolean(
    (props.nodeFacts?.literalFacts ?? []).some(
      (f) => f.predicate === IRI.rdfsComment || f.predicate === IRI.dctDescription || f.predicate === IRI.skosDefinition,
    ),
  );

  useEffect(() => {
    setError(null);
    if (!storageKey) {
      setSuggestions([]);
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? (JSON.parse(raw) as Suggestion[]) : [];
      setSuggestions(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSuggestions([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!props.node) {
      setLabelValue("");
      setDefinitionValue("");
      return;
    }
    if (props.node.kind === "literal") {
      setLabelValue("");
      setDefinitionValue("");
      return;
    }
    setLabelValue((prev) => prev || deriveLabel(props.node));
    setDefinitionValue((prev) => prev || "");
  }, [props.node?.id, props.node?.kind]);

  function persist(next: Suggestion[]) {
    setSuggestions(next);
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  const quickLabelPredicate = props.node?.kind === "concept" ? "skos:prefLabel" : "rdfs:label";
  const quickDefinitionPredicate = props.node?.kind === "concept" ? "skos:definition" : "rdfs:comment";

  const inferred = useMemo(() => {
    if (!props.node || props.node.kind !== "property") return null;
    const propertyIri = props.node.iri ?? props.node.id;
    if (!propertyIri || propertyIri.startsWith("lit:")) return null;
    const hasDomain = props.model.links.some((l) => l.source === props.node?.id && l.predicate === IRI.rdfsDomain);
    const hasRange = props.model.links.some((l) => l.source === props.node?.id && l.predicate === IRI.rdfsRange);

    const nodesById = new Map(props.model.nodes.map((n) => [n.id, n]));
    const usage = props.model.links.filter((l) => l.predicate === propertyIri);
    if (usage.length === 0) return { hasDomain, hasRange, domain: [], range: [], literalTargets: 0 };

    const domainCounts = new Map<string, number>();
    const rangeCounts = new Map<string, number>();
    let literalTargets = 0;

    for (const link of usage) {
      const s = nodesById.get(link.source);
      if (s) {
        for (const t of s.types) {
          if (isBuiltInIri(t)) continue;
          domainCounts.set(t, (domainCounts.get(t) ?? 0) + 1);
        }
      }
      const o = nodesById.get(link.target);
      if (o?.kind === "literal") literalTargets += 1;
      if (o) {
        for (const t of o.types) {
          if (isBuiltInIri(t)) continue;
          rangeCounts.set(t, (rangeCounts.get(t) ?? 0) + 1);
        }
      }
    }

    const domain = Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([iri, count]) => ({ iri, count }));

    const range = Array.from(rangeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([iri, count]) => ({ iri, count }));

    return { hasDomain, hasRange, domain, range, literalTargets };
  }, [props.model.links, props.model.nodes, props.node]);

  async function applyQuickLabel() {
    if (!nodeIsWritable) return;
    const subject = (props.node?.iri ?? props.node?.id ?? "").trim();
    const value = labelValue.trim();
    if (!subject || !value) {
      setError("Subject and label are required.");
      return;
    }
    setError(null);
    await props.onApplyOps([
      {
        op: "add",
        input: {
          subject,
          predicate: quickLabelPredicate,
          objectKind: "literal",
          objectValue: value,
          objectLanguage: labelLang.trim() || undefined,
        },
      },
    ]);
  }

  async function applyQuickDefinition() {
    if (!nodeIsWritable) return;
    const subject = (props.node?.iri ?? props.node?.id ?? "").trim();
    const value = definitionValue.trim();
    if (!subject || !value) {
      setError("Subject and definition text are required.");
      return;
    }
    setError(null);
    await props.onApplyOps([
      {
        op: "add",
        input: {
          subject,
          predicate: quickDefinitionPredicate,
          objectKind: "literal",
          objectValue: value,
          objectLanguage: definitionLang.trim() || undefined,
        },
      },
    ]);
  }

  async function applyInferred(kind: "domain" | "range", iri: string) {
    if (!nodeIsWritable) return;
    if (!props.node) return;
    const subject = (props.node.iri ?? props.node.id).trim();
    if (!subject || !iri) return;
    setError(null);
    await props.onApplyOps([
      {
        op: "add",
        input: {
          subject,
          predicate: kind === "domain" ? "rdfs:domain" : "rdfs:range",
          objectKind: "iri",
          objectValue: iri,
        },
      },
    ]);
  }

  function saveApiConfig() {
    localStorage.setItem(STORAGE_ENDPOINT, endpoint.trim());
    localStorage.setItem(STORAGE_API_KEY, apiKey);
    localStorage.setItem(STORAGE_INSTRUCTIONS, instructions);
  }

  async function generateFromApi() {
    if (!props.node) {
      setError("Select a node to generate AI suggestions.");
      return;
    }
    if (!props.enabled) {
      setError("Load RDF/OWL/JSON-LD to enable AI suggestions.");
      return;
    }
    const url = endpoint.trim();
    if (!url) {
      setError("Set an AI endpoint URL first.");
      return;
    }
    setBusy(true);
    setError(null);
    saveApiConfig();
    try {
      const nodeId = props.node.id;
      const outgoing = props.model.links.filter((l) => l.source === nodeId).slice(0, 200);
      const incoming = props.model.links.filter((l) => l.target === nodeId).slice(0, 200);
      const payload = {
        version: "v1",
        baseIri: props.baseIri,
        node: props.node,
        nodeFacts: props.nodeFacts ?? null,
        neighborhood: { outgoing, incoming },
        instructions,
      };

      const headers: Record<string, string> = { "content-type": "application/json" };
      if (apiKey.trim()) headers.authorization = `Bearer ${apiKey.trim()}`;
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
      const rawText = await res.text();
      if (!res.ok) {
        throw new Error(`AI endpoint error (${res.status}): ${rawText.slice(0, 400)}`);
      }
      const json = rawText ? JSON.parse(rawText) : {};
      const parsed = parseSuggestions(json);
      persist([...parsed, ...suggestions]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function applySuggestion(s: Suggestion) {
    if (!props.enabled) return;
    setBusy(true);
    setError(null);
    try {
      await props.onApplyOps(s.ops);
      persist(suggestions.filter((x) => x.id !== s.id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="cardTitle">AI assistant</div>

      {!props.node ? (
        <div className="mutedSmall">Select a node to generate suggestions and apply patches.</div>
      ) : props.node.kind === "literal" ? (
        <div className="mutedSmall">AI suggestions are not available for literal nodes.</div>
      ) : (
        <div className="mutedSmall">
          Prototype: offline quick fixes + optional API suggestions (human-in-the-loop).
        </div>
      )}

      <div className="subTitle mt10">Quick fixes (offline)</div>

      <div className="aiGrid">
        <div className="aiBox">
          <div className="aiBoxTitle">
            <span>Label</span>
            {nodeHasLabel ? <span className="pill small">exists</span> : <span className="pill small">missing</span>}
          </div>
          <div className="mutedSmall">Predicate: {quickLabelPredicate}</div>
          <div className="field mt8">
            <label className="label" htmlFor="aiLabelValue">
              Value
            </label>
            <input
              id="aiLabelValue"
              className="input"
              value={labelValue}
              onChange={(e) => setLabelValue(e.target.value)}
              spellCheck={false}
              disabled={!nodeIsWritable || busy}
            />
          </div>
          <div className="row gap8 mt8">
            <div className="field" style={{ flex: 1 }}>
              <label className="label" htmlFor="aiLabelLang">
                Lang
              </label>
              <input
                id="aiLabelLang"
                className="input"
                value={labelLang}
                onChange={(e) => setLabelLang(e.target.value)}
                spellCheck={false}
                disabled={!nodeIsWritable || busy}
              />
            </div>
          </div>
          <div className="row gap8 mt10 wrap">
            <button className="button" type="button" onClick={applyQuickLabel} disabled={!nodeIsWritable || busy}>
              Add label
            </button>
          </div>
        </div>

        <div className="aiBox">
          <div className="aiBoxTitle">
            <span>Definition</span>
            {nodeHasDefinition ? (
              <span className="pill small">exists</span>
            ) : (
              <span className="pill small">missing</span>
            )}
          </div>
          <div className="mutedSmall">Predicate: {quickDefinitionPredicate}</div>
          <div className="field mt8">
            <label className="label" htmlFor="aiDefValue">
              Text
            </label>
            <textarea
              id="aiDefValue"
              className="textarea"
              value={definitionValue}
              onChange={(e) => setDefinitionValue(e.target.value)}
              placeholder="Write a definition (or generate via API)…"
              rows={3}
              disabled={!nodeIsWritable || busy}
            />
          </div>
          <div className="row gap8 mt8">
            <div className="field" style={{ flex: 1 }}>
              <label className="label" htmlFor="aiDefLang">
                Lang
              </label>
              <input
                id="aiDefLang"
                className="input"
                value={definitionLang}
                onChange={(e) => setDefinitionLang(e.target.value)}
                spellCheck={false}
                disabled={!nodeIsWritable || busy}
              />
            </div>
          </div>
          <div className="row gap8 mt10 wrap">
            <button
              className="button"
              type="button"
              onClick={applyQuickDefinition}
              disabled={!nodeIsWritable || busy}
            >
              Add definition
            </button>
          </div>
        </div>
      </div>

      {props.node?.kind === "property" && inferred ? (
        <div className="mt10">
          <div className="subTitle">Domain / range (inferred)</div>
          <div className="mutedSmall">
            Looks at ABox usage of this property and suggests likely domain/range (heuristic).
          </div>

          <div className="aiInferGrid mt8">
            <div className="aiInferBox">
              <div className="aiInferTitle">
                <span>Domain</span>
                {inferred.hasDomain ? <span className="pill small">already set</span> : null}
              </div>
              {inferred.domain.length === 0 ? (
                <div className="mutedSmall">No strong type signal.</div>
              ) : (
                <div className="aiInferList">
                  {inferred.domain.map((c) => (
                    <button
                      key={c.iri}
                      type="button"
                      className="aiInferItem"
                      onClick={() => applyInferred("domain", c.iri)}
                      disabled={!nodeIsWritable || busy || inferred.hasDomain}
                      title={c.iri}
                    >
                      <span className="mono">{compactIri(c.iri)}</span>
                      <span className="mutedSmall">{c.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="aiInferBox">
              <div className="aiInferTitle">
                <span>Range</span>
                {inferred.hasRange ? <span className="pill small">already set</span> : null}
              </div>
              {inferred.range.length === 0 ? (
                <div className="mutedSmall">
                  {inferred.literalTargets > 0 ? "Mostly literal values → consider rdfs:range rdfs:Literal." : "No strong type signal."}
                </div>
              ) : (
                <div className="aiInferList">
                  {inferred.range.map((c) => (
                    <button
                      key={c.iri}
                      type="button"
                      className="aiInferItem"
                      onClick={() => applyInferred("range", c.iri)}
                      disabled={!nodeIsWritable || busy || inferred.hasRange}
                      title={c.iri}
                    >
                      <span className="mono">{compactIri(c.iri)}</span>
                      <span className="mutedSmall">{c.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="subTitle mt12">AI suggestions (API)</div>
      <div className="mutedSmall">
        Call your own AI endpoint (recommended: backend proxy for keys + CORS). Response should return suggestions as RDF patch ops.
      </div>

      <div className="field mt10">
        <label className="label" htmlFor="aiEndpoint">
          Endpoint URL
        </label>
        <input
          id="aiEndpoint"
          className="input"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://your-api.example/suggest"
          spellCheck={false}
          disabled={busy}
        />
      </div>

      <div className="field mt10">
        <label className="label" htmlFor="aiKey">
          API key (optional)
        </label>
        <input
          id="aiKey"
          className="input"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Bearer token"
          spellCheck={false}
          disabled={busy}
        />
      </div>

      <div className="field mt10">
        <label className="label" htmlFor="aiInstructions">
          Instructions
        </label>
        <textarea
          id="aiInstructions"
          className="textarea"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={4}
          spellCheck={false}
          disabled={busy}
        />
      </div>

      <div className="row gap8 mt10 wrap">
        <button className="button" type="button" onClick={generateFromApi} disabled={busy || !props.node}>
          {busy ? "Working…" : "Generate suggestions"}
        </button>
        <button className="button" type="button" onClick={() => persist([])} disabled={busy || suggestions.length === 0}>
          Clear suggestions
        </button>
      </div>

      {suggestions.length > 0 ? (
        <div className="aiSuggestionList mt10">
          {suggestions.slice(0, 8).map((s) => (
            <div key={s.id} className="aiSuggestionItem">
              <div className="aiSuggestionHeader">
                <div className="aiSuggestionTitle">{s.title}</div>
                <div className="aiSuggestionMeta">
                  {Number.isFinite(s.confidence) ? <span className="pill small">{Math.round((s.confidence ?? 0) * 100)}%</span> : null}
                  <span className="pill small">{s.source}</span>
                </div>
              </div>
              {s.rationale ? <div className="mutedSmall mt8">{s.rationale}</div> : null}
              <div className="aiOps mt8">
                {s.ops.map((op, idx) => (
                  <div key={`${s.id}-op-${idx}`} className="aiOpLine mono">
                    {formatOp(op)}
                  </div>
                ))}
              </div>
              <div className="row gap8 mt10 wrap">
                <button className="button" type="button" onClick={() => applySuggestion(s)} disabled={busy || !props.enabled}>
                  Apply
                </button>
                <button
                  className="button danger"
                  type="button"
                  onClick={() => persist(suggestions.filter((x) => x.id !== s.id))}
                  disabled={busy}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
          {suggestions.length > 8 ? <div className="mutedSmall mt8">Showing first 8 suggestions.</div> : null}
        </div>
      ) : (
        <div className="mutedSmall mt10">No API suggestions yet.</div>
      )}

      {error ? <div className="errorBox mt10">{error}</div> : null}
    </div>
  );
}

function deriveLabel(node: GraphNode): string {
  const iri = node.iri ?? node.id;
  if (!iri) return "";
  if (iri.startsWith("_:")) return iri;
  const local = getLocalName(iri);
  return humanize(local);
}

function humanize(input: string): string {
  const s = String(input ?? "").trim();
  if (!s) return "";
  const withSpaces = s
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (!withSpaces) return "";
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

function parseSuggestions(json: any): Suggestion[] {
  const raw = Array.isArray(json?.suggestions)
    ? json.suggestions
    : Array.isArray(json?.patches)
      ? json.patches
      : Array.isArray(json)
        ? json
        : [];

  const out: Suggestion[] = [];
  for (const item of raw) {
    const opsRaw = Array.isArray(item?.changes) ? item.changes : Array.isArray(item?.ops) ? item.ops : [];
    const ops = opsRaw
      .map((op: any) => normalizeOp(op))
      .filter(Boolean) as PatchOp[];
    if (ops.length === 0) continue;
    const title = String(item?.title ?? item?.name ?? "Suggestion");
    const rationale = item?.rationale ? String(item.rationale) : item?.reason ? String(item.reason) : undefined;
    const confidence = Number(item?.confidence);
    const baseKey = JSON.stringify({ title, rationale, ops });
    const id = String(item?.id ?? `ai:${hashString(baseKey)}`);
    out.push({
      id,
      title,
      rationale,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : undefined,
      ops,
      source: "api",
    });
  }
  return out;
}

function normalizeOp(input: any): PatchOp | null {
  const opRaw = String(input?.op ?? input?.kind ?? input?.action ?? "add").toLowerCase();
  const op: PatchOp["op"] = opRaw === "remove" || opRaw === "delete" ? "remove" : "add";

  const subject = String(input?.subject ?? input?.s ?? "").trim();
  const predicate = String(input?.predicate ?? input?.p ?? "").trim();
  const objectValue = String(input?.objectValue ?? input?.o ?? input?.object ?? "").trim();
  if (!subject || !predicate || !objectValue) return null;

  const objectKindRaw = String(input?.objectKind ?? input?.oKind ?? "").toLowerCase();
  const objectKind: AddTripleInput["objectKind"] =
    objectKindRaw === "iri" || objectKindRaw === "namednode" ? "iri" : objectKindRaw === "literal" ? "literal" : guessObjectKind(objectValue);

  const objectDatatype = input?.objectDatatype ? String(input.objectDatatype) : input?.datatype ? String(input.datatype) : undefined;
  const objectLanguage = input?.objectLanguage ? String(input.objectLanguage) : input?.language ? String(input.language) : undefined;

  return {
    op,
    input: {
      subject,
      predicate,
      objectKind,
      objectValue,
      objectDatatype: objectKind === "literal" ? (objectDatatype?.trim() || undefined) : undefined,
      objectLanguage: objectKind === "literal" ? (objectLanguage?.trim() || undefined) : undefined,
    },
  };
}

function guessObjectKind(value: string): AddTripleInput["objectKind"] {
  const s = value.trim();
  if (s.startsWith("_:")) return "iri";
  if (s.startsWith("http://") || s.startsWith("https://")) return "iri";
  if (s.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:.+/)) return "iri"; // CURIE or other scheme
  return "literal";
}

function formatOp(op: PatchOp): string {
  const sign = op.op === "add" ? "+" : "−";
  const o =
    op.input.objectKind === "literal"
      ? `"${op.input.objectValue}"${op.input.objectLanguage ? `@${op.input.objectLanguage}` : ""}${
          op.input.objectDatatype ? `^^${op.input.objectDatatype}` : ""
        }`
      : op.input.objectValue;
  return `${sign} ${op.input.subject} ${op.input.predicate} ${o}`;
}

