import type { RdfTerm, RdfTriple } from "./graphModel";
import { compactIri, truncate } from "./ontology";

export type StoreChangeKind = "add" | "remove";

export type StoreChange = {
  id: string;
  kind: StoreChangeKind;
  triple: RdfTriple;
  at: number;
};

export function invertChangeKind(kind: StoreChangeKind): StoreChangeKind {
  return kind === "add" ? "remove" : "add";
}

export function formatChangeLine(change: StoreChange): string {
  const sign = change.kind === "add" ? "+" : "−";
  return `${sign} ${formatTerm(change.triple.s)} ${formatTerm(change.triple.p)} ${formatTerm(change.triple.o)}`;
}

function formatTerm(term: RdfTerm): string {
  if (term.termType === "iri") return compactIri(term.value);
  if (term.termType === "blank") return `_:${term.value}`;
  const suffix = term.language ? `@${term.language}` : term.datatype ? `^^${compactIri(term.datatype)}` : "";
  return `"${truncate(term.value, 48)}"${suffix}`;
}

