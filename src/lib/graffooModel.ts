import type { GraphLink, GraphNode, OntologyModel } from "./graphModel";
import { IRI } from "./ontology";

export type GraffooNodeKind =
  | "class"
  | "individual"
  | "datatype"
  | "restriction"
  | "concept"
  | "unknown";

export type GraffooLinkKind =
  | "objectProperty"
  | "dataProperty"
  | "annotationProperty"
  | "propertyFacility"
  | "subClassOf"
  | "instanceOf"
  | "equivalentClass"
  | "disjointWith"
  | "inverseOf"
  | "subPropertyOf"
  | "other";

export interface GraffooNode extends GraphNode {
  graffooKind: GraffooNodeKind;
}

export interface GraffooLink extends GraphLink {
  graffooKind: GraffooLinkKind;
}

export interface GraffooModel {
  nodes: GraffooNode[];
  links: GraffooLink[];
}

const XSD_NS = "http://www.w3.org/2001/XMLSchema#";
const RDFS_LITERAL = "http://www.w3.org/2000/01/rdf-schema#Literal";

function isDatatype(iri?: string): boolean {
  if (!iri) return false;
  return iri.startsWith(XSD_NS) || iri === RDFS_LITERAL;
}

function propLinkKind(node: GraphNode): GraffooLinkKind {
  const t = node.types ?? [];
  if (t.includes(IRI.owlObjectProperty)) return "objectProperty";
  if (t.includes(IRI.owlDatatypeProperty)) return "dataProperty";
  if (t.includes(IRI.owlAnnotationProperty)) return "annotationProperty";
  return "objectProperty";
}

function predicateToLinkKind(predicate: string): GraffooLinkKind {
  switch (predicate) {
    case IRI.rdfsSubClassOf: return "subClassOf";
    case IRI.rdfType: return "instanceOf";
    case IRI.owlEquivalentClass: return "equivalentClass";
    case IRI.owlDisjointWith: return "disjointWith";
    case IRI.owlInverseOf: return "inverseOf";
    case IRI.rdfsSubPropertyOf: return "subPropertyOf";
    default: return "other";
  }
}

function toGraffooKind(node: GraphNode): GraffooNodeKind {
  if (isDatatype(node.iri)) return "datatype";
  switch (node.kind) {
    case "class": return "class";
    case "individual": return "individual";
    case "restriction": return "restriction";
    case "concept": return "concept";
    default: return "unknown";
  }
}

export function buildGraffooModel(model: OntologyModel): GraffooModel {
  const { nodes, links } = model;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Collect rdfs:domain / rdfs:range per property node.
  const domains = new Map<string, string[]>();
  const ranges = new Map<string, string[]>();
  for (const link of links) {
    if (link.predicate === IRI.rdfsDomain) {
      const a = domains.get(link.source) ?? [];
      a.push(link.target);
      domains.set(link.source, a);
    }
    if (link.predicate === IRI.rdfsRange) {
      const a = ranges.get(link.source) ?? [];
      a.push(link.target);
      ranges.set(link.source, a);
    }
  }

  // Property nodes that have both domain AND range become typed edges.
  const collapsedIds = new Set<string>();
  const graffooLinks: GraffooLink[] = [];

  for (const node of nodes) {
    if (node.kind !== "property") continue;
    const doms = domains.get(node.id) ?? [];
    const rngs = ranges.get(node.id) ?? [];

    if (doms.length > 0 && rngs.length > 0) {
      const kind = propLinkKind(node);
      for (const dId of doms) {
        for (const rId of rngs) {
          if (!nodeById.has(dId) || !nodeById.has(rId)) continue;
          graffooLinks.push({
            id: `g:${node.id}:${dId}:${rId}`,
            source: dId,
            target: rId,
            predicate: node.iri ?? node.id,
            label: node.label,
            box: "tbox",
            graffooKind: kind,
          });
        }
      }
      collapsedIds.add(node.id);
    }
    // Properties without both domain+range stay as nodes (property facility).
  }

  // Pass through all other links, skipping domain/range structural ones and
  // any link whose source is a now-collapsed property node.
  const skipPreds = new Set<string>([IRI.rdfsDomain, IRI.rdfsRange]);
  for (const link of links) {
    if (skipPreds.has(link.predicate)) continue;
    if (collapsedIds.has(link.source)) continue;
    graffooLinks.push({ ...link, graffooKind: predicateToLinkKind(link.predicate) });
  }

  // Build node list — exclude collapsed property nodes.
  const graffooNodes: GraffooNode[] = nodes
    .filter((n) => !collapsedIds.has(n.id))
    .map((n) => ({ ...n, graffooKind: toGraffooKind(n) }));

  const includedIds = new Set(graffooNodes.map((n) => n.id));

  // Only keep edges where both endpoints survive.
  const finalLinks = graffooLinks.filter(
    (l) => includedIds.has(String(l.source)) && includedIds.has(String(l.target)),
  );

  // Recompute degrees after the transformation.
  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  for (const l of finalLinks) {
    const s = String(l.source);
    const t = String(l.target);
    outDeg.set(s, (outDeg.get(s) ?? 0) + 1);
    inDeg.set(t, (inDeg.get(t) ?? 0) + 1);
  }
  for (const n of graffooNodes) {
    n.incoming = inDeg.get(n.id) ?? 0;
    n.outgoing = outDeg.get(n.id) ?? 0;
  }

  return { nodes: graffooNodes, links: finalLinks };
}
