import * as rdf from "rdflib";
import type { RdfTerm, RdfTriple } from "./graphModel";

export type GraphJson = { nodes: unknown[]; links: unknown[] };

export type ParsedInput =
  | { kind: "rdf" }
  | { kind: "graph"; graph: GraphJson };

function contentTypeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ttl":
    case "n3":
      return "text/turtle";
    case "nt":
      return "application/n-triples";
    case "rdf":
    case "owl":
    case "xml":
      return "application/rdf+xml";
    case "jsonld":
      return "application/ld+json";
    case "json":
      return "application/ld+json";
    default:
      return "text/turtle";
  }
}

function isGraphJson(value: unknown): value is GraphJson {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.nodes) && Array.isArray(v.links);
}

function termFromRdflib(node: any): RdfTerm {
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

export function createRdfStore(): any {
  return rdf.graph();
}

export function storeToTriples(store: any): RdfTriple[] {
  const statements: any[] = store?.statements ?? store?.statementsMatching?.() ?? [];
  return statements.map((st) => {
    const s = termFromRdflib(st.subject);
    const p = termFromRdflib(st.predicate);
    const o = termFromRdflib(st.object);
    if (p.termType !== "iri") {
      throw new Error("Unsupported RDF: predicate is not an IRI.");
    }
    return { s, p: p as RdfTerm & { termType: "iri" }, o };
  });
}

async function parseTextIntoStore(args: {
  text: string;
  baseIri: string;
  contentType: string;
  store: any;
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    rdf.parse(args.text, args.store, args.baseIri, args.contentType, (err: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function parseFileIntoStore(
  file: File,
  baseIri: string,
  store: any,
): Promise<ParsedInput> {
  const text = await file.text();
  const contentType = contentTypeFromFilename(file.name);

  if (contentType === "application/ld+json") {
    try {
      const json = JSON.parse(text) as unknown;
      if (isGraphJson(json)) return { kind: "graph", graph: json };
    } catch {
      // fall through (try RDF parse)
    }
  }

  try {
    await parseTextIntoStore({ text, baseIri, contentType, store });
    return { kind: "rdf" };
  } catch (err) {
    if (contentType === "application/ld+json") {
      // Try graph JSON as a last resort, with a more helpful message.
      try {
        const json = JSON.parse(text) as unknown;
        if (isGraphJson(json)) return { kind: "graph", graph: json };
      } catch {
        // ignore
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse "${file.name}" as ${contentType}: ${message}`);
  }
}
