export type CreateEntityKind =
  | "class"
  | "objectProperty"
  | "dataProperty"
  | "annotationProperty"
  | "individual"
  | "concept";

export type CreateEntityInput = {
  kind: CreateEntityKind;
  /**
   * IRI input: full IRI, CURIE (e.g., `ex:Person`), or local name (relative to Base IRI).
   */
  iriInput: string;
  /**
   * Optional human label; defaults from local name.
   */
  label?: string;
  /**
   * Literal language tag for labels/comments (default: "en").
   */
  lang?: string;
  /**
   * Optional parent class for new classes (`rdfs:subClassOf`).
   */
  parentClassIri?: string;
  /**
   * Optional domain/range for new properties.
   */
  domainClassIri?: string;
  rangeClassIri?: string;
  /**
   * Optional type for individuals (`rdf:type`). The editor also asserts `owl:NamedIndividual`.
   */
  individualTypeIri?: string;
};

