import * as rdf from "rdflib";
import type { RdfTerm, RdfTriple } from "./graphModel";

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

function stripBrackets(input: string): string {
  const s = input.trim();
  if (s.startsWith("<") && s.endsWith(">")) return s.slice(1, -1).trim();
  return s;
}

function expandIriLike(
  input: string,
  baseIri: string,
): { kind: "iri"; iri: string } | { kind: "blank"; id: string } {
  const raw = stripBrackets(input);
  if (!raw) throw new Error("Empty IRI.");

  if (raw.startsWith("_:")) return { kind: "blank", id: raw.slice(2) };
  if (raw.startsWith("http://") || raw.startsWith("https://")) return { kind: "iri", iri: raw };

  const schemeMatch = raw.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (schemeMatch) {
    const idx = raw.indexOf(":");
    const prefix = raw.slice(0, idx);
    const local = raw.slice(idx + 1);
    const ns = prefix === "ex" ? baseIri : PREFIXES[prefix];
    if (ns) return { kind: "iri", iri: `${ns}${local}` }; // CURIE
    return { kind: "iri", iri: raw }; // absolute IRI with unknown scheme
  }

  // Relative IRI.
  if (baseIri.endsWith("#") || baseIri.endsWith("/")) {
    return { kind: "iri", iri: `${baseIri}${raw}` };
  }
  try {
    return { kind: "iri", iri: new URL(raw, baseIri).toString() };
  } catch {
    return { kind: "iri", iri: `${baseIri}${raw}` };
  }
}

export function termFromIriInput(input: string, baseIri: string): any {
  const expanded = expandIriLike(input, baseIri);
  if (expanded.kind === "blank") return rdf.blankNode(expanded.id);
  return rdf.sym(expanded.iri);
}

export function predicateFromInput(input: string, baseIri: string): any {
  const expanded = expandIriLike(input, baseIri);
  if (expanded.kind === "blank") {
    throw new Error("Predicate must be an IRI (not a blank node).");
  }
  return rdf.sym(expanded.iri);
}

export function literalFromInput(args: {
  value: string;
  datatype?: string;
  language?: string;
  baseIri: string;
}): any {
  const v = args.value ?? "";
  const language = (args.language ?? "").trim();
  const datatype = (args.datatype ?? "").trim();

  if (language) return rdf.literal(v, language);
  if (datatype) {
    const dt = expandIriLike(datatype, args.baseIri);
    if (dt.kind !== "iri") throw new Error("Datatype must be an IRI.");
    return rdf.literal(v, rdf.sym(dt.iri));
  }
  return rdf.literal(v);
}

export function addTripleToStore(args: {
  store: any;
  baseIri: string;
  subject: string;
  predicate: string;
  objectKind: "iri" | "literal";
  objectValue: string;
  objectDatatype?: string;
  objectLanguage?: string;
}) {
  const { triple } = parseTripleInputToRdfTriple(args);
  addRdfTripleToStore(args.store, triple);
  return triple;
}

export async function serializeStoreToTurtle(store: any, baseIri: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    try {
      (rdf as any).serialize(undefined, store, baseIri, "text/turtle", (err: unknown, str: string) => {
        if (err) reject(err);
        else resolve(str ?? "");
      });
    } catch (e) {
      reject(e);
    }
  });
}

export function parseTripleInputToRdfTriple(args: {
  baseIri: string;
  subject: string;
  predicate: string;
  objectKind: "iri" | "literal";
  objectValue: string;
  objectDatatype?: string;
  objectLanguage?: string;
}): { triple: RdfTriple } {
  const s = rdfTermFromIriLike(args.subject, args.baseIri);
  const p = rdfTermFromPredicate(args.predicate, args.baseIri);

  const o =
    args.objectKind === "literal"
      ? rdfTermFromLiteralInput({
          value: args.objectValue,
          datatype: args.objectDatatype,
          language: args.objectLanguage,
          baseIri: args.baseIri,
        })
      : rdfTermFromIriLike(args.objectValue, args.baseIri);

  return {
    triple: {
      s,
      p: { termType: "iri", value: p.value },
      o,
    },
  };
}

function rdfTermFromIriLike(input: string, baseIri: string): RdfTerm {
  const expanded = expandIriLike(input, baseIri);
  if (expanded.kind === "blank") return { termType: "blank", value: expanded.id };
  return { termType: "iri", value: expanded.iri };
}

function rdfTermFromPredicate(input: string, baseIri: string): RdfTerm & { termType: "iri" } {
  const expanded = expandIriLike(input, baseIri);
  if (expanded.kind === "blank") {
    throw new Error("Predicate must be an IRI (not a blank node).");
  }
  return { termType: "iri", value: expanded.iri };
}

function rdfTermFromLiteralInput(args: {
  value: string;
  datatype?: string;
  language?: string;
  baseIri: string;
}): RdfTerm {
  const v = args.value ?? "";
  const language = (args.language ?? "").trim();
  const datatypeRaw = (args.datatype ?? "").trim();

  if (language && datatypeRaw) {
    throw new Error("Choose either language or datatype for a literal (not both).");
  }

  if (datatypeRaw) {
    const dt = expandIriLike(datatypeRaw, args.baseIri);
    if (dt.kind !== "iri") throw new Error("Datatype must be an IRI.");
    return { termType: "literal", value: v, datatype: dt.iri };
  }

  if (language) return { termType: "literal", value: v, language };
  return { termType: "literal", value: v };
}

export function rdfTermFromRdflibTerm(node: any): RdfTerm {
  const termType = node?.termType ?? "";
  if (termType === "NamedNode") return { termType: "iri", value: String(node.value) };
  if (termType === "BlankNode") return { termType: "blank", value: String(node.value) };
  if (termType === "Literal") {
    const datatype = node?.datatype?.value ? String(node.datatype.value) : undefined;
    const language = node?.lang ? String(node.lang) : undefined;
    return { termType: "literal", value: String(node.value), datatype, language };
  }
  return { termType: "iri", value: String(node?.value ?? node) };
}

export function rdfTripleFromStatement(statement: any): RdfTriple {
  const s = rdfTermFromRdflibTerm(statement?.subject);
  const p = rdfTermFromRdflibTerm(statement?.predicate);
  const o = rdfTermFromRdflibTerm(statement?.object);
  if (p.termType !== "iri") throw new Error("Invalid statement: predicate is not an IRI.");
  return { s, p: p as RdfTerm & { termType: "iri" }, o };
}

export function rdflibTermFromRdfTerm(term: RdfTerm): any {
  if (term.termType === "iri") return rdf.sym(term.value);
  if (term.termType === "blank") return rdf.blankNode(term.value);
  const language = term.language?.trim();
  if (language) return rdf.literal(term.value, language);
  const datatype = term.datatype?.trim();
  if (datatype) return rdf.literal(term.value, rdf.sym(datatype));
  return rdf.literal(term.value);
}

export function addRdfTripleToStore(store: any, triple: RdfTriple) {
  const s = rdflibTermFromRdfTerm(triple.s);
  const p = rdflibTermFromRdfTerm(triple.p);
  const o = rdflibTermFromRdfTerm(triple.o);
  store.add(s, p, o);
}

export function removeRdfTripleFromStore(store: any, triple: RdfTriple) {
  const s = rdflibTermFromRdfTerm(triple.s);
  const p = rdflibTermFromRdfTerm(triple.p);
  const o = rdflibTermFromRdfTerm(triple.o);
  store.removeMatches(s, p, o);
}
