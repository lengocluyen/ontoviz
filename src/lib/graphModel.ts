export type TermType = "iri" | "blank" | "literal";

export type NodeKind =
  | "class"
  | "property"
  | "individual"
  | "concept"
  | "restriction"
  | "blank"
  | "literal"
  | "unknown";

export type BoxKind = "tbox" | "abox" | "unknown";

export type RdfTerm =
  | { termType: "iri"; value: string }
  | { termType: "blank"; value: string }
  | {
      termType: "literal";
      value: string;
      datatype?: string;
      language?: string;
    };

export interface RdfTriple {
  s: RdfTerm;
  p: RdfTerm & { termType: "iri" };
  o: RdfTerm;
}

export interface GraphNode {
  id: string;
  label: string;
  iri?: string;
  kind: NodeKind;
  box: BoxKind;
  types: string[];
  incoming: number;
  outgoing: number;
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  predicate: string;
  label: string;
  box: BoxKind;
}

export interface LiteralFact {
  predicate: string;
  predicateLabel: string;
  value: string;
  datatype?: string;
  language?: string;
}

export interface NodeFacts {
  id: string;
  iri?: string;
  termType: TermType;
  labels: string[];
  types: string[];
  literalFacts: LiteralFact[];
}

export interface OntologyModel {
  nodes: GraphNode[];
  links: GraphLink[];
  nodeFactsById: Record<string, NodeFacts>;
  triplesCount: number;
}

export const DEFAULT_BASE_IRI = "https://example.org/base#";

