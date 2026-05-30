import * as rdf from "rdflib";
import type { GraphNode, RdfTriple } from "../lib/graphModel";
import { compactIri, truncate } from "../lib/ontology";
import { rdfTripleFromStatement } from "../lib/rdflibOps";

type Props = {
  store: any | null;
  node: GraphNode | null;
  onRemoveTriple: (triple: RdfTriple) => Promise<void> | void;
};

export default function EntityTriplesCard(props: Props) {
  const store = props.store;
  const node = props.node;

  if (!node) {
    return (
      <div className="card">
        <div className="cardTitle">Entity</div>
        <div className="mutedSmall">Select a node in the graph to inspect and edit its triples.</div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="card">
        <div className="cardTitle">Entity</div>
        <div className="mutedSmall">
          Entity editing is available only for RDF/OWL/JSON-LD imports (not raw graph JSON).
        </div>
      </div>
    );
  }

  if (node.kind === "literal") {
    return (
      <div className="card">
        <div className="cardTitle">Entity</div>
        <div className="mutedSmall">Literal nodes can’t be edited as RDF subjects.</div>
      </div>
    );
  }

  const subject = node.iri ?? node.id;
  const subjectTerm = toStoreSubjectTerm(subject);
  const statements: any[] = subjectTerm ? store.statementsMatching(subjectTerm, undefined, undefined) : [];

  const triples: RdfTriple[] = statements
    .slice(0, 200)
    .map((st) => rdfTripleFromStatement(st))
    .sort((a, b) => {
      const ap = compactIri(a.p.value);
      const bp = compactIri(b.p.value);
      if (ap < bp) return -1;
      if (ap > bp) return 1;
      return formatObject(a.o).localeCompare(formatObject(b.o));
    });

  return (
    <div className="card">
      <div className="cardTitle">Entity</div>
      <div className="detailsTitle">{truncate(node.label, 42)}</div>
      <div className="detailsMeta">
        <span className="pill">{node.kind}</span>
        <span className="pill">{node.box}</span>
      </div>

      <div className="detailsLine">
        <span className="mutedSmall">Subject</span>
        <span className="mono">{subject}</span>
      </div>

      <div className="subTitle mt10">Outgoing triples</div>
      {triples.length === 0 ? (
        <div className="muted mt8">No outgoing triples found for this subject.</div>
      ) : (
        <div className="tripleList mt8">
          {triples.map((t, idx) => (
            <div key={`${t.p.value}-${idx}`} className="tripleRow">
              <div className="triplePred mono" title={t.p.value}>
                {compactIri(t.p.value)}
              </div>
              <div className="tripleObj" title={formatObjectLong(t.o)}>
                {formatObject(t.o)}
              </div>
              <button className="button small danger" type="button" onClick={() => props.onRemoveTriple(t)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      {statements.length > 200 ? <div className="help mt8">Showing first 200 triples.</div> : null}
    </div>
  );
}

function toStoreSubjectTerm(subject: string): any | null {
  const s = subject.trim();
  if (!s) return null;
  if (s.startsWith("_:")) return rdf.blankNode(s.slice(2));
  return rdf.sym(s);
}

function formatObject(term: any): string {
  if (term.termType === "iri") return compactIri(term.value);
  if (term.termType === "blank") return `_:${truncate(term.value, 28)}`;
  const suffix = term.language ? `@${term.language}` : term.datatype ? `^^${compactIri(term.datatype)}` : "";
  return `"${truncate(term.value, 52)}"${suffix}`;
}

function formatObjectLong(term: any): string {
  if (term.termType === "iri") return term.value;
  if (term.termType === "blank") return `_:${term.value}`;
  const suffix = term.language ? `@${term.language}` : term.datatype ? `^^${term.datatype}` : "";
  return `"${term.value}"${suffix}`;
}

