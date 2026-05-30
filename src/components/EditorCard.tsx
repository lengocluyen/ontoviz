import { useEffect, useMemo, useState } from "react";
import type { OntologyModel } from "../lib/graphModel";
import { IRI } from "../lib/ontology";

export type AddTripleInput = {
  subject: string;
  predicate: string;
  objectKind: "iri" | "literal";
  objectValue: string;
  objectDatatype?: string;
  objectLanguage?: string;
};

type Props = {
  enabled: boolean;
  baseIri: string;
  model?: OntologyModel;
  suggestedSubject?: string;
  onAddTriple: (input: AddTripleInput) => Promise<void>;
  onExportTurtle: () => Promise<string>;
  onSaveToLibrary?: () => Promise<void> | void;
};

export default function EditorCard(props: Props) {
  const [subject, setSubject] = useState(props.suggestedSubject ?? "");
  const [predicate, setPredicate] = useState("rdfs:label");
  const [objectKind, setObjectKind] = useState<"iri" | "literal">("literal");
  const [objectValue, setObjectValue] = useState("");
  const [literalMode, setLiteralMode] = useState<"plain" | "lang" | "datatype">("lang");
  const [objectDatatype, setObjectDatatype] = useState("");
  const [objectLanguage, setObjectLanguage] = useState("en");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!subject && props.suggestedSubject) setSubject(props.suggestedSubject);
  }, [props.suggestedSubject, subject]);

  const suggestions = useMemo(() => {
    const model = props.model;
    const nodes = model?.nodes ?? [];
    const nodeByIri = new Map<string, { label: string }>();
    for (const n of nodes) {
      const iri = n.iri ?? n.id;
      if (!iri) continue;
      nodeByIri.set(iri, { label: n.label });
    }

    const entityOptions = nodes
      .filter((n) => n.kind !== "literal")
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, 450)
      .map((n) => {
        const iri = n.iri ?? n.id;
        return { value: iriToCurieOrIri(iri, props.baseIri), label: n.label };
      })
      .filter((o) => Boolean(o.value));

    const predicateSet = new Set<string>();
    const defaultPredicates = [
      IRI.rdfType,
      IRI.rdfsLabel,
      IRI.rdfsComment,
      IRI.rdfsSubClassOf,
      IRI.rdfsSubPropertyOf,
      IRI.rdfsDomain,
      IRI.rdfsRange,
      IRI.owlEquivalentClass,
      IRI.owlDisjointWith,
      IRI.owlEquivalentProperty,
      IRI.owlInverseOf,
      IRI.owlOnProperty,
      IRI.owlSomeValuesFrom,
      IRI.owlAllValuesFrom,
      IRI.skosPrefLabel,
      IRI.skosAltLabel,
      IRI.skosDefinition,
      IRI.dctTitle,
      IRI.dctDescription,
    ];
    for (const iri of defaultPredicates) predicateSet.add(iri);
    for (const link of model?.links ?? []) predicateSet.add(link.predicate);
    for (const n of nodes) {
      if (n.kind !== "property") continue;
      const iri = n.iri ?? n.id;
      if (iri) predicateSet.add(iri);
    }

    const predicateOptions = Array.from(predicateSet)
      .filter(Boolean)
      .map((iri) => {
        const value = iriToCurieOrIri(iri, props.baseIri);
        const label = nodeByIri.get(iri)?.label ?? value;
        return { iri, value, label };
      })
      .filter((o) => Boolean(o.value))
      .sort((a, b) => (a.label || a.value).localeCompare(b.label || b.value))
      .slice(0, 450)
      .map((o) => ({ value: o.value, label: o.label }));

    const datatypeSet = new Set<string>();
    for (const dt of COMMON_DATATYPES) datatypeSet.add(dt);
    for (const facts of Object.values(model?.nodeFactsById ?? {})) {
      for (const f of facts.literalFacts) {
        if (!f.datatype) continue;
        datatypeSet.add(iriToCurieOrIri(f.datatype, props.baseIri));
      }
    }
    const datatypeOptions = Array.from(datatypeSet)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 200)
      .map((value) => ({ value, label: value }));

    const langSet = new Set<string>(COMMON_LANGS);
    for (const facts of Object.values(model?.nodeFactsById ?? {})) {
      for (const f of facts.literalFacts) {
        if (!f.language) continue;
        const l = String(f.language).trim();
        if (l) langSet.add(l);
      }
    }
    const langOptions = Array.from(langSet)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 100)
      .map((value) => ({ value, label: value }));

    return { entityOptions, predicateOptions, datatypeOptions, langOptions };
  }, [props.baseIri, props.model]);

  const literalInputType = useMemo((): "text" | "date" | "time" | "datetime-local" => {
    if (objectKind !== "literal") return "text";
    if (literalMode !== "datatype") return "text";
    const local = xsdLocalName(objectDatatype);
    if (!local) return "text";
    const key = local.toLowerCase();
    if (key === "date") return "date";
    if (key === "time") return "time";
    if (key === "datetime") return "datetime-local";
    return "text";
  }, [literalMode, objectDatatype, objectKind]);

  const canAdd = useMemo(() => {
    if (!props.enabled) return false;
    if (busy) return false;
    if (!subject.trim() || !predicate.trim() || !objectValue.trim()) return false;
    if (objectKind === "literal" && objectLanguage.trim() && objectDatatype.trim()) return false;
    return true;
  }, [busy, objectDatatype, objectKind, objectLanguage, objectValue, predicate, props.enabled, subject]);

  async function add() {
    if (!canAdd) return;
    setBusy(true);
    setError(null);
    try {
      await props.onAddTriple({
        subject: subject.trim(),
        predicate: predicate.trim(),
        objectKind,
        objectValue: objectValue.trim(),
        objectDatatype:
          objectKind === "literal" && literalMode === "datatype" ? objectDatatype.trim() || undefined : undefined,
        objectLanguage:
          objectKind === "literal" && literalMode === "lang" ? objectLanguage.trim() || undefined : undefined,
      });
      setObjectValue("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function exportTtl() {
    if (!props.enabled) return;
    setBusy(true);
    setError(null);
    try {
      const ttl = await props.onExportTurtle();
      downloadText("ontology.ttl", ttl);
      setSavedAt(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function saveToLibrary() {
    if (!props.onSaveToLibrary) return;
    setBusy(true);
    setError(null);
    try {
      await props.onSaveToLibrary();
      setSavedAt(Date.now());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="cardTitle">Edit</div>
      {props.enabled ? (
        <div className="mutedSmall">
          Add triples to the loaded RDF store (uses common prefixes; `ex:` maps to your Base IRI).
        </div>
      ) : (
        <div className="mutedSmall">
          Editing is enabled only for RDF/OWL/JSON-LD imports (not for raw graph JSON).
        </div>
      )}

      <div className="field mt10">
        <label className="label" htmlFor="editS">
          Subject (IRI / CURIE / _:blank)
        </label>
        <input
          id="editS"
          className="input"
          list="editEntityOptions"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          spellCheck={false}
          placeholder={props.baseIri}
          disabled={!props.enabled || busy}
        />
      </div>

      <div className="field mt10">
        <label className="label" htmlFor="editP">
          Predicate (IRI / CURIE)
        </label>
        <input
          id="editP"
          className="input"
          list="editPredicateOptions"
          value={predicate}
          onChange={(e) => setPredicate(e.target.value)}
          spellCheck={false}
          placeholder="rdf:type"
          disabled={!props.enabled || busy}
        />
      </div>

      <div className="row gap8 mt10 wrap">
        <label className="pill">
          <input
            type="radio"
            name="objectKind"
            checked={objectKind === "iri"}
            onChange={() => setObjectKind("iri")}
            disabled={!props.enabled || busy}
          />
          Object IRI
        </label>
        <label className="pill">
          <input
            type="radio"
            name="objectKind"
            checked={objectKind === "literal"}
            onChange={() => setObjectKind("literal")}
            disabled={!props.enabled || busy}
          />
          Literal
        </label>
      </div>

      <div className="field mt10">
        <label className="label" htmlFor="editO">
          Object value
        </label>
        <input
          id="editO"
          className="input"
          value={objectValue}
          onChange={(e) => setObjectValue(e.target.value)}
          spellCheck={false}
          list={objectKind === "iri" ? "editEntityOptions" : undefined}
          type={objectKind === "literal" ? literalInputType : "text"}
          placeholder={objectKind === "iri" ? "owl:Class" : "Label text…"}
          disabled={!props.enabled || busy}
        />
      </div>

      {objectKind === "literal" ? (
        <div className="row gap8 mt10 wrap">
          <div className="field" style={{ minWidth: 200, flex: 1 }}>
            <label className="label" htmlFor="editLiteralMode">
              Literal kind
            </label>
            <select
              id="editLiteralMode"
              className="input miniSelect"
              value={literalMode}
              onChange={(e) => {
                const next = e.target.value as typeof literalMode;
                setLiteralMode(next);
                if (next === "plain") {
                  setObjectLanguage("");
                  setObjectDatatype("");
                } else if (next === "lang") {
                  setObjectDatatype("");
                  setObjectLanguage((v) => v || "en");
                } else {
                  setObjectLanguage("");
                  setObjectDatatype((v) => v || "xsd:string");
                }
              }}
              disabled={!props.enabled || busy}
            >
              <option value="plain">Plain</option>
              <option value="lang">Language-tagged</option>
              <option value="datatype">Datatype</option>
            </select>
          </div>

          {literalMode === "lang" ? (
            <div className="field" style={{ minWidth: 150 }}>
              <label className="label" htmlFor="editLang">
                Lang
              </label>
              <input
                id="editLang"
                className="input miniInput"
                list="editLangOptions"
                value={objectLanguage}
                onChange={(e) => {
                  if (literalMode !== "lang") setLiteralMode("lang");
                  if (objectDatatype) setObjectDatatype("");
                  setObjectLanguage(e.target.value);
                }}
                spellCheck={false}
                placeholder="en"
                disabled={!props.enabled || busy}
              />
            </div>
          ) : null}

          {literalMode === "datatype" ? (
            <div className="field" style={{ minWidth: 220, flex: 1 }}>
              <label className="label" htmlFor="editDt">
                Datatype
              </label>
              <input
                id="editDt"
                className="input"
                list="editDatatypeOptions"
                value={objectDatatype}
                onChange={(e) => {
                  if (literalMode !== "datatype") setLiteralMode("datatype");
                  if (objectLanguage) setObjectLanguage("");
                  setObjectDatatype(e.target.value);
                }}
                spellCheck={false}
                placeholder="xsd:string"
                disabled={!props.enabled || busy}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <datalist id="editEntityOptions">
        {suggestions.entityOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </datalist>

      <datalist id="editPredicateOptions">
        {suggestions.predicateOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </datalist>

      <datalist id="editDatatypeOptions">
        {suggestions.datatypeOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </datalist>

      <datalist id="editLangOptions">
        {suggestions.langOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </datalist>

      <div className="row gap8 mt12 wrap">
        <button className="button" type="button" onClick={add} disabled={!canAdd}>
          {busy ? "Working…" : "Add triple"}
        </button>
        {props.onSaveToLibrary ? (
          <button className="button" type="button" onClick={saveToLibrary} disabled={!props.enabled || busy}>
            Save to Library
          </button>
        ) : null}
        <button className="button" type="button" onClick={exportTtl} disabled={!props.enabled || busy}>
          Download Turtle
        </button>
      </div>

      {savedAt ? <div className="mutedSmall mt10">Saved to Library at {formatTime(savedAt)}.</div> : null}
      {error ? <div className="errorBox mt10">{error}</div> : null}
    </div>
  );
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

const COMMON_DATATYPES = [
  "xsd:string",
  "xsd:boolean",
  "xsd:integer",
  "xsd:decimal",
  "xsd:double",
  "xsd:date",
  "xsd:time",
  "xsd:dateTime",
  "xsd:anyURI",
  "xsd:duration",
  "rdf:langString",
  "rdfs:Literal",
] as const;

const COMMON_LANGS = ["en", "fr", "es", "de", "it", "pt", "nl", "ar", "zh", "ja", "ko"] as const;

function iriToCurieOrIri(input: string, baseIri: string): string {
  const iri = String(input ?? "").trim();
  if (!iri) return "";
  if (iri.startsWith("_:")) return iri;

  if (baseIri && (baseIri.startsWith("http://") || baseIri.startsWith("https://")) && iri.startsWith(baseIri)) {
    const local = iri.slice(baseIri.length);
    if (local) return `ex:${local}`;
  }

  for (const [prefix, ns] of Object.entries(PREFIXES)) {
    if (iri.startsWith(ns)) return `${prefix}:${iri.slice(ns.length)}`;
  }

  return iri;
}

function xsdLocalName(datatype: string): string | null {
  const dt = String(datatype ?? "").trim();
  if (!dt) return null;
  if (dt.startsWith("xsd:")) return dt.slice(4);
  const ns = "http://www.w3.org/2001/XMLSchema#";
  if (dt.startsWith(ns)) return dt.slice(ns.length);
  return null;
}

const PREFIXES: Record<string, string> = {
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl: "http://www.w3.org/2002/07/owl#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  dct: "http://purl.org/dc/terms/",
  foaf: "http://xmlns.com/foaf/0.1/",
  pizza: "http://www.co-ode.org/ontologies/pizza/pizza.owl#",
};
