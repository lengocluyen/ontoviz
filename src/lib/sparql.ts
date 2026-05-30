import * as rdf from "rdflib";

export type SparqlTerm = {
  termType: string;
  value: string;
  datatype?: string;
  language?: string;
};

export type SparqlRow = Record<string, SparqlTerm>;

export type SparqlResults = {
  vars: string[];
  rows: SparqlRow[];
  rowCount: number;
};

function toSparqlTerm(term: any): SparqlTerm {
  const termType = String(term?.termType ?? "");
  if (termType === "NamedNode" || termType === "BlankNode") {
    return { termType, value: String(term.value ?? "") };
  }
  if (termType === "Literal") {
    const datatype = term?.datatype?.value ? String(term.datatype.value) : undefined;
    const language = term?.lang ? String(term.lang) : undefined;
    return { termType, value: String(term.value ?? ""), datatype, language };
  }
  return { termType, value: String(term?.value ?? term ?? "") };
}

export function termToNodeId(term: SparqlTerm): string | null {
  if (!term.value) return null;
  if (term.termType === "NamedNode") return term.value;
  if (term.termType === "BlankNode") return `_:${term.value}`;
  return null;
}

export async function runSparqlSelect(store: any, queryText: string): Promise<SparqlResults> {
  const text = queryText.trim();
  if (!text) throw new Error("Enter a SPARQL query.");

  // rdflib supports a practical subset; start with SELECT to keep UI predictable.
  if (!/^\s*(?:prefix\s+[^\n]+\n\s*)*select\b/i.test(text)) {
    throw new Error("This panel supports SPARQL SELECT queries only.");
  }

  const query = (rdf as any).SPARQLToQuery?.(text, false, store);
  if (!query) {
    throw new Error("SPARQL parser not available in rdflib build.");
  }

  const rawRows: any[] = [];

  await new Promise<void>((resolve, reject) => {
    try {
      store.query(
        query,
        (row: any) => rawRows.push(row),
        undefined,
        () => resolve(),
      );
    } catch (e) {
      reject(e);
    }
  });

  const varsSet = new Set<string>();
  const rows: SparqlRow[] = rawRows.map((row) => {
    const out: SparqlRow = {};
    for (const [key, value] of Object.entries(row ?? {})) {
      if (key === "why") continue;
      const k = key.startsWith("?") ? key.slice(1) : key;
      varsSet.add(k);
      out[k] = toSparqlTerm(value);
    }
    return out;
  });

  return {
    vars: Array.from(varsSet),
    rows,
    rowCount: rows.length,
  };
}
