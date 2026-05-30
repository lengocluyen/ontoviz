import { useEffect, useMemo, useState } from "react";
import type { GraphNode, OntologyModel } from "../lib/graphModel";
import { getLocalName, IRI } from "../lib/ontology";
import type { AddTripleInput } from "./EditorCard";

type Props = {
  enabled: boolean;
  baseIri: string;
  model: OntologyModel;
  node: GraphNode | null;
  onAddTriple: (input: AddTripleInput) => Promise<void>;
};

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

export default function OwlEntityEditorCard(props: Props) {
  const node = props.node;

  const classOptions = useMemo(() => {
    return props.model.nodes
      .filter((n) => n.kind === "class")
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, 250);
  }, [props.model.nodes]);

  const [label, setLabel] = useState("");
  const [labelLang, setLabelLang] = useState("en");
  const [comment, setComment] = useState("");
  const [commentLang, setCommentLang] = useState("en");
  const [parentClass, setParentClass] = useState("");
  const [domainClass, setDomainClass] = useState("");
  const [rangeClass, setRangeClass] = useState("");
  const [typeClass, setTypeClass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setParentClass("");
    setDomainClass("");
    setRangeClass("");
    setTypeClass("");
    setComment("");
    if (!node || node.kind === "literal") {
      setLabel("");
      return;
    }
    setLabel("");
  }, [node?.id, node?.kind]);

  if (!node) {
    return (
      <div className="card">
        <div className="cardTitle">OWL editor</div>
        <div className="mutedSmall">Select a node to edit it (Protégé-like guided forms).</div>
      </div>
    );
  }

  if (!props.enabled) {
    return (
      <div className="card">
        <div className="cardTitle">OWL editor</div>
        <div className="mutedSmall">
          Editing is enabled only for RDF/OWL/JSON-LD workspaces (not raw graph JSON). Use <span className="mono">New</span>{" "}
          in Import or open an ontology file.
        </div>
      </div>
    );
  }

  if (node.kind === "literal") {
    return (
      <div className="card">
        <div className="cardTitle">OWL editor</div>
        <div className="mutedSmall">Literal nodes can’t be edited as RDF subjects.</div>
      </div>
    );
  }

  const subject = node.iri ?? node.id;
  const labelPredicate = node.kind === "concept" ? "skos:prefLabel" : "rdfs:label";
  const commentPredicate = node.kind === "concept" ? "skos:definition" : "rdfs:comment";
  const isDatatypeProperty = node.types.includes(IRI.owlDatatypeProperty);
  const isObjectProperty = node.types.includes(IRI.owlObjectProperty);
  const rangeListId = isDatatypeProperty ? "owlDatatypeOptions" : isObjectProperty ? "owlClassOptions" : "owlRangeOptions";
  const rangePlaceholder = isDatatypeProperty ? "xsd:string" : isObjectProperty ? "ex:Person" : "ex:Person or xsd:string";

  async function run(op: AddTripleInput, onDone?: () => void) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await props.onAddTriple(op);
      onDone?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="cardTitle">OWL editor</div>
      <div className="detailsTitle">{node.label}</div>
      <div className="detailsMeta">
        <span className="pill">{node.kind}</span>
        <span className="pill">{node.box}</span>
      </div>

      <div className="subTitle mt10">Annotations</div>
      <div className="row gap8 mt10 wrap">
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label className="label" htmlFor="owlLabel">
            Label
          </label>
          <input
            id="owlLabel"
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={deriveLabel(node)}
            spellCheck={false}
            disabled={busy}
          />
        </div>
        <div className="field" style={{ minWidth: 92 }}>
          <label className="label" htmlFor="owlLabelLang">
            Lang
          </label>
          <input
            id="owlLabelLang"
            className="input miniInput"
            value={labelLang}
            onChange={(e) => setLabelLang(e.target.value)}
            spellCheck={false}
            disabled={busy}
          />
        </div>
      </div>
      <div className="row gap8 mt10 wrap">
        <button
          className="button"
          type="button"
          disabled={busy || !label.trim()}
          onClick={() =>
            run(
              {
                subject,
                predicate: labelPredicate,
                objectKind: "literal",
                objectValue: label.trim(),
                objectLanguage: labelLang.trim() || undefined,
              },
              () => setLabel(""),
            )
          }
          title={`Adds ${labelPredicate}`}
        >
          Add label
        </button>
      </div>

      <div className="field mt12">
        <label className="label" htmlFor="owlComment">
          {node.kind === "concept" ? "Definition" : "Comment"}
        </label>
        <textarea
          id="owlComment"
          className="textarea"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={node.kind === "concept" ? "skos:definition…" : "rdfs:comment…"}
          rows={3}
          disabled={busy}
        />
      </div>
      <div className="row gap8 mt10 wrap">
        <div className="field" style={{ minWidth: 92 }}>
          <label className="label" htmlFor="owlCommentLang">
            Lang
          </label>
          <input
            id="owlCommentLang"
            className="input miniInput"
            value={commentLang}
            onChange={(e) => setCommentLang(e.target.value)}
            spellCheck={false}
            disabled={busy}
          />
        </div>
        <button
          className="button"
          type="button"
          disabled={busy || !comment.trim()}
          onClick={() =>
            run(
              {
                subject,
                predicate: commentPredicate,
                objectKind: "literal",
                objectValue: comment.trim(),
                objectLanguage: commentLang.trim() || undefined,
              },
              () => setComment(""),
            )
          }
          title={`Adds ${commentPredicate}`}
        >
          Add {node.kind === "concept" ? "definition" : "comment"}
        </button>
      </div>

      {node.kind === "class" ? (
        <>
          <div className="subTitle mt12">Class axioms</div>
          <div className="field mt10">
            <label className="label" htmlFor="owlParent">
              Parent class (rdfs:subClassOf)
            </label>
            <input
              id="owlParent"
              className="input"
              list="owlClassOptions"
              value={parentClass}
              onChange={(e) => setParentClass(e.target.value)}
              placeholder="ex:Thing"
              spellCheck={false}
              disabled={busy}
            />
          </div>
          <div className="row gap8 mt10 wrap">
            <button
              className="button"
              type="button"
              disabled={busy || !parentClass.trim()}
              onClick={() =>
                run(
                  { subject, predicate: "rdfs:subClassOf", objectKind: "iri", objectValue: parentClass.trim() },
                  () => setParentClass(""),
                )
              }
            >
              Add parent
            </button>
          </div>
        </>
      ) : null}

      {node.kind === "property" ? (
        <>
          <div className="subTitle mt12">Property schema</div>
          <div className="row gap8 mt10 wrap">
            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <label className="label" htmlFor="owlDomain">
                Domain (rdfs:domain)
              </label>
              <input
                id="owlDomain"
                className="input"
                list="owlClassOptions"
                value={domainClass}
                onChange={(e) => setDomainClass(e.target.value)}
                placeholder="ex:Person"
                spellCheck={false}
                disabled={busy}
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <label className="label" htmlFor="owlRange">
                Range (rdfs:range)
              </label>
              <input
                id="owlRange"
                className="input"
                list={rangeListId}
                value={rangeClass}
                onChange={(e) => setRangeClass(e.target.value)}
                placeholder={rangePlaceholder}
                spellCheck={false}
                disabled={busy}
              />
            </div>
          </div>
          <div className="row gap8 mt10 wrap">
            <button
              className="button"
              type="button"
              disabled={busy || !domainClass.trim()}
              onClick={() =>
                run(
                  { subject, predicate: "rdfs:domain", objectKind: "iri", objectValue: domainClass.trim() },
                  () => setDomainClass(""),
                )
              }
            >
              Add domain
            </button>
            <button
              className="button"
              type="button"
              disabled={busy || !rangeClass.trim()}
              onClick={() =>
                run(
                  { subject, predicate: "rdfs:range", objectKind: "iri", objectValue: rangeClass.trim() },
                  () => setRangeClass(""),
                )
              }
            >
              Add range
            </button>
          </div>
        </>
      ) : null}

      {node.kind === "individual" ? (
        <>
          <div className="subTitle mt12">Assertions</div>
          <div className="field mt10">
            <label className="label" htmlFor="owlType">
              Type (rdf:type)
            </label>
            <input
              id="owlType"
              className="input"
              list="owlClassOptions"
              value={typeClass}
              onChange={(e) => setTypeClass(e.target.value)}
              placeholder="ex:Person"
              spellCheck={false}
              disabled={busy}
            />
            <div className="help mt8">
              Tip: individuals are usually typed to a class. Removal/cleanup is available in the Triples tab.
            </div>
          </div>
          <div className="row gap8 mt10 wrap">
            <button
              className="button"
              type="button"
              disabled={busy || !typeClass.trim()}
              onClick={() =>
                run(
                  { subject, predicate: "rdf:type", objectKind: "iri", objectValue: typeClass.trim() },
                  () => setTypeClass(""),
                )
              }
            >
              Add type
            </button>
          </div>
        </>
      ) : null}

      <datalist id="owlClassOptions">
        {classOptions.map((c) => (
          <option key={c.id} value={c.iri ?? c.id}>
            {c.label}
          </option>
        ))}
      </datalist>

      <datalist id="owlDatatypeOptions">
        {DATATYPE_OPTIONS.map((dt) => (
          <option key={dt} value={dt} />
        ))}
      </datalist>

      <datalist id="owlRangeOptions">
        {classOptions.map((c) => (
          <option key={`r:${c.id}`} value={c.iri ?? c.id}>
            {c.label}
          </option>
        ))}
        {DATATYPE_OPTIONS.map((dt) => (
          <option key={`r:${dt}`} value={dt} />
        ))}
      </datalist>

      {error ? <div className="errorBox mt12">{error}</div> : null}
      <div className="help mt10">
        Base IRI: <span className="mono">{props.baseIri}</span>
      </div>
    </div>
  );
}

function deriveLabel(node: GraphNode): string {
  const iri = node.iri ?? node.id;
  if (!iri) return node.label;
  const local = getLocalName(iri);
  const spaced = local
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return spaced || local || node.label;
}
