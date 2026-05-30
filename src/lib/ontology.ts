import type {
  BoxKind,
  GraphLink,
  GraphNode,
  LiteralFact,
  NodeFacts,
  NodeKind,
  OntologyModel,
  RdfTerm,
  RdfTriple,
  TermType,
} from "./graphModel";

const NS = {
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl: "http://www.w3.org/2002/07/owl#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  dct: "http://purl.org/dc/terms/",
} as const;

export const IRI = {
  rdfType: `${NS.rdf}type`,
  rdfProperty: `${NS.rdf}Property`,

  rdfsClass: `${NS.rdfs}Class`,
  rdfsLabel: `${NS.rdfs}label`,
  rdfsComment: `${NS.rdfs}comment`,
  rdfsSubClassOf: `${NS.rdfs}subClassOf`,
  rdfsSubPropertyOf: `${NS.rdfs}subPropertyOf`,
  rdfsDomain: `${NS.rdfs}domain`,
  rdfsRange: `${NS.rdfs}range`,

  owlClass: `${NS.owl}Class`,
  owlRestriction: `${NS.owl}Restriction`,
  owlObjectProperty: `${NS.owl}ObjectProperty`,
  owlDatatypeProperty: `${NS.owl}DatatypeProperty`,
  owlAnnotationProperty: `${NS.owl}AnnotationProperty`,
  owlNamedIndividual: `${NS.owl}NamedIndividual`,
  owlThing: `${NS.owl}Thing`,
  owlEquivalentClass: `${NS.owl}equivalentClass`,
  owlEquivalentProperty: `${NS.owl}equivalentProperty`,
  owlDisjointWith: `${NS.owl}disjointWith`,
  owlInverseOf: `${NS.owl}inverseOf`,
  owlOnProperty: `${NS.owl}onProperty`,
  owlSomeValuesFrom: `${NS.owl}someValuesFrom`,
  owlAllValuesFrom: `${NS.owl}allValuesFrom`,

  skosConcept: `${NS.skos}Concept`,
  skosPrefLabel: `${NS.skos}prefLabel`,
  skosAltLabel: `${NS.skos}altLabel`,
  skosDefinition: `${NS.skos}definition`,

  dctTitle: `${NS.dct}title`,
  dctDescription: `${NS.dct}description`,
} as const;

const BUILTIN_NAMESPACES = [NS.rdf, NS.rdfs, NS.owl, NS.xsd] as const;

const LABEL_PREDICATES = new Set<string>([
  IRI.rdfsLabel,
  IRI.skosPrefLabel,
  IRI.skosAltLabel,
  IRI.dctTitle,
]);

const ANNOTATION_PREDICATES = new Set<string>([
  ...LABEL_PREDICATES,
  IRI.rdfsComment,
  IRI.dctDescription,
  IRI.skosDefinition,
]);

const CLASS_RELATIONS = new Set<string>([
  IRI.rdfsSubClassOf,
  IRI.owlEquivalentClass,
  IRI.owlDisjointWith,
]);

const PROPERTY_RELATIONS = new Set<string>([
  IRI.rdfsSubPropertyOf,
  IRI.rdfsDomain,
  IRI.rdfsRange,
  IRI.owlEquivalentProperty,
  IRI.owlInverseOf,
  IRI.owlOnProperty,
]);

const SCHEMA_PREDICATES = new Set<string>([
  ...CLASS_RELATIONS,
  ...PROPERTY_RELATIONS,
]);

export function isBuiltInIri(iri: string): boolean {
  return BUILTIN_NAMESPACES.some((ns) => iri.startsWith(ns));
}

export function hashString(input: string): string {
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function getLocalName(iri: string): string {
  const hashIndex = iri.lastIndexOf("#");
  if (hashIndex >= 0 && hashIndex < iri.length - 1) return iri.slice(hashIndex + 1);
  const slashIndex = iri.lastIndexOf("/");
  if (slashIndex >= 0 && slashIndex < iri.length - 1) return iri.slice(slashIndex + 1);
  return iri;
}

export function compactIri(iri: string): string {
  const known: Array<[string, string]> = [
    [NS.rdf, "rdf"],
    [NS.rdfs, "rdfs"],
    [NS.owl, "owl"],
    [NS.xsd, "xsd"],
    [NS.skos, "skos"],
    [NS.dct, "dct"],
  ];
  for (const [ns, prefix] of known) {
    if (iri.startsWith(ns)) return `${prefix}:${iri.slice(ns.length)}`;
  }
  return getLocalName(iri);
}

function termToId(term: RdfTerm, context?: { sId?: string; pIri?: string }): string {
  if (term.termType === "iri") return term.value;
  if (term.termType === "blank") return `_:${term.value}`;
  const literalKey = `${context?.sId ?? ""}|${context?.pIri ?? ""}|${
    term.value
  }|${term.datatype ?? ""}|${term.language ?? ""}`;
  return `lit:${hashString(literalKey)}`;
}

function termTypeOf(term: RdfTerm): TermType {
  if (term.termType === "iri") return "iri";
  if (term.termType === "blank") return "blank";
  return "literal";
}

type Acc = {
  id: string;
  iri?: string;
  termType: TermType;
  types: Set<string>;
  labels: string[];
  literalFacts: LiteralFact[];
  incoming: number;
  outgoing: number;
};

function ensureAcc(map: Map<string, Acc>, id: string, term: RdfTerm): Acc {
  const existing = map.get(id);
  if (existing) return existing;

  const acc: Acc = {
    id,
    iri: term.termType === "iri" ? term.value : undefined,
    termType: termTypeOf(term),
    types: new Set<string>(),
    labels: term.termType === "literal" ? [term.value] : [],
    literalFacts: [],
    incoming: 0,
    outgoing: 0,
  };
  map.set(id, acc);
  return acc;
}

function bestLabel(acc: Acc): string | undefined {
  const trimmed = acc.labels.map((s) => s.trim()).filter(Boolean);
  if (trimmed.length > 0) return trimmed[0];
  if (acc.termType === "literal") return undefined;
  if (!acc.iri) return acc.id;
  return compactIri(acc.iri);
}

function classifyNodeKind(args: {
  id: string;
  acc: Acc;
  classSet: Set<string>;
  propertySet: Set<string>;
  restrictionSet: Set<string>;
  conceptSet: Set<string>;
}): NodeKind {
  const { id, acc, classSet, propertySet, restrictionSet, conceptSet } = args;

  if (acc.termType === "literal") return "literal";
  if (restrictionSet.has(id)) return "restriction";
  if (classSet.has(id)) return "class";
  if (propertySet.has(id)) return "property";
  if (conceptSet.has(id)) return "concept";
  if (acc.termType === "blank") return "blank";

  for (const t of acc.types) {
    if (t === IRI.owlNamedIndividual) return "individual";
    if (classSet.has(t)) return "individual";
    if (!isBuiltInIri(t)) return "individual";
  }

  return "unknown";
}

function boxFromKind(kind: NodeKind): BoxKind {
  if (kind === "class" || kind === "property" || kind === "restriction") return "tbox";
  if (kind === "individual" || kind === "concept" || kind === "literal") return "abox";
  return "unknown";
}

function classifyLinkBox(args: {
  predicate: string;
  sKind: NodeKind;
  oKind: NodeKind;
  sBox: BoxKind;
  oBox: BoxKind;
}): BoxKind {
  const { predicate, sKind, oKind, sBox, oBox } = args;
  if (SCHEMA_PREDICATES.has(predicate)) return "tbox";
  if (predicate === IRI.rdfType) {
    if (sKind === "individual" || sKind === "concept" || oKind === "literal") return "abox";
    if (sKind === "class" || sKind === "property" || sKind === "restriction") return "tbox";
    if (oKind === "class") return "abox";
    return "unknown";
  }
  if (sBox === "abox" || oBox === "abox") return "abox";
  if (sBox === "tbox" || oBox === "tbox") return "tbox";
  return "unknown";
}

export function buildOntologyModel(triples: RdfTriple[]): OntologyModel {
  const accById = new Map<string, Acc>();
  const classSet = new Set<string>();
  const propertySet = new Set<string>();
  const restrictionSet = new Set<string>();
  const conceptSet = new Set<string>();

  type RawEdge = {
    sId: string;
    oId: string;
    predicate: string;
  };
  const edges: RawEdge[] = [];

  for (const triple of triples) {
    const sId = termToId(triple.s);
    const sAcc = ensureAcc(accById, sId, triple.s);

    const predicateIri = triple.p.value;
    const oId = termToId(triple.o, { sId, pIri: predicateIri });
    const oAcc = ensureAcc(accById, oId, triple.o);

    sAcc.outgoing += 1;
    oAcc.incoming += 1;

    // Labels (preferred node label sources).
    if (LABEL_PREDICATES.has(predicateIri) && triple.o.termType === "literal") {
      sAcc.labels.push(triple.o.value);
      continue;
    }

    // Annotations as "facts" instead of structural edges.
    if (ANNOTATION_PREDICATES.has(predicateIri) && triple.o.termType === "literal") {
      sAcc.literalFacts.push({
        predicate: predicateIri,
        predicateLabel: compactIri(predicateIri),
        value: triple.o.value,
        datatype: triple.o.datatype,
        language: triple.o.language,
      });
      continue;
    }

    // rdf:type index
    if (predicateIri === IRI.rdfType && triple.o.termType !== "literal") {
      sAcc.types.add(triple.o.value);
      if (triple.o.termType === "iri") {
        if (triple.o.value === IRI.owlClass || triple.o.value === IRI.rdfsClass) classSet.add(sId);
        if (
          triple.o.value === IRI.owlObjectProperty ||
          triple.o.value === IRI.owlDatatypeProperty ||
          triple.o.value === IRI.owlAnnotationProperty ||
          triple.o.value === IRI.rdfProperty
        ) {
          propertySet.add(sId);
        }
        if (triple.o.value === IRI.owlRestriction) restrictionSet.add(sId);
        if (triple.o.value === IRI.skosConcept) conceptSet.add(sId);
      }
    }

    // Schema relations hint at node roles.
    if (CLASS_RELATIONS.has(predicateIri) && triple.o.termType !== "literal") {
      classSet.add(sId);
      classSet.add(oId);
    }
    if (PROPERTY_RELATIONS.has(predicateIri) && triple.o.termType !== "literal") {
      propertySet.add(sId);
      propertySet.add(oId);
      if (predicateIri === IRI.owlOnProperty) restrictionSet.add(sId);
    }
    if (predicateIri === IRI.owlSomeValuesFrom || predicateIri === IRI.owlAllValuesFrom) {
      restrictionSet.add(sId);
      if (triple.o.termType !== "literal") classSet.add(oId);
    }

    // Data property assertions (literals) as facts + optional literal node/edge.
    if (triple.o.termType === "literal") {
      sAcc.literalFacts.push({
        predicate: predicateIri,
        predicateLabel: compactIri(predicateIri),
        value: triple.o.value,
        datatype: triple.o.datatype,
        language: triple.o.language,
      });
    }

    edges.push({ sId, oId, predicate: predicateIri });
  }

  const kindById = new Map<string, NodeKind>();
  const boxById = new Map<string, BoxKind>();

  for (const [id, acc] of accById.entries()) {
    const kind = classifyNodeKind({
      id,
      acc,
      classSet,
      propertySet,
      restrictionSet,
      conceptSet,
    });
    kindById.set(id, kind);
    boxById.set(id, boxFromKind(kind));
  }

  const nodeFactsById: Record<string, NodeFacts> = {};
  const nodes: GraphNode[] = [];

  for (const [id, acc] of accById.entries()) {
    const kind = kindById.get(id) ?? "unknown";
    const box = boxById.get(id) ?? "unknown";
    const label =
      acc.termType === "literal"
        ? acc.labels[0] ?? acc.literalFacts[0]?.value ?? "(literal)"
        : bestLabel(acc) ?? id;

    const types = Array.from(acc.types).sort();
    nodes.push({
      id,
      label: acc.termType === "literal" ? truncate(label, 48) : label,
      iri: acc.iri,
      kind,
      box,
      types,
      incoming: acc.incoming,
      outgoing: acc.outgoing,
    });

    nodeFactsById[id] = {
      id,
      iri: acc.iri,
      termType: acc.termType,
      labels: acc.labels,
      types,
      literalFacts: acc.literalFacts,
    };
  }

  const links: GraphLink[] = edges.map((e) => {
    const sKind = kindById.get(e.sId) ?? "unknown";
    const oKind = kindById.get(e.oId) ?? "unknown";
    const sBox = boxById.get(e.sId) ?? "unknown";
    const oBox = boxById.get(e.oId) ?? "unknown";
    const box = classifyLinkBox({
      predicate: e.predicate,
      sKind,
      oKind,
      sBox,
      oBox,
    });
    const edgeKey = `${e.sId}|${e.predicate}|${e.oId}`;
    return {
      id: `e:${hashString(edgeKey)}`,
      source: e.sId,
      target: e.oId,
      predicate: e.predicate,
      label: compactIri(e.predicate),
      box,
    };
  });

  return {
    nodes,
    links,
    nodeFactsById,
    triplesCount: triples.length,
  };
}

export function truncate(input: string, maxLen: number): string {
  const s = input ?? "";
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}
