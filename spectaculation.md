# Spectaculation — Web Ontology Editor (Vision + Roadmap)

This document captures the “north star” direction for turning this app into a professional, web-based ontology workbench: editor + validator + reviewer, with AI suggestions and human-in-the-loop approval.

## Product goals

- **Make ontology work legible**: let people *see* TBox/ABox structure, constraints, and consequences.
- **Make changes safe**: edits are validated (SHACL + SPARQL tests + reasoning checks) before they are accepted/published.
- **Make collaboration real**: review workflows, comments, audit trail, and “why” explanations.
- **Make scale possible**: smooth UX for small local files and large graphs via a triplestore.

## Core pillars (what “best” looks like)

### 1) Explore
- **Hybrid visualization**:
  - **3D graph** for discovery and pattern spotting (clusters, bridges, hubs).
  - **2D/structured views** for precision: class tree, property table, instance list, restriction list.
- **Explainable navigation**:
  - shortest path / semantic path between entities
  - “why is this connected?” edge provenance (axiom / triple origin)
  - focus modes: neighborhood, module, named graph, imports closure
- **Power search**:
  - label/IRI search, type filters, predicate filters
  - saved queries and saved “views” per task/persona

### 2) Edit (OWL authoring UX)
- **Entity editor** with guided forms:
  - Class: labels/definitions, parents, equivalent/disjoint, restrictions, annotations
  - Property: domain/range, subproperty, inverse, characteristics (functional, transitive…), annotations
  - Individual: types, property assertions, annotations
- **Restriction wizard**:
  - `some/all/value`, min/max/exact cardinalities, `hasValue`, `oneOf`
  - guardrails + previews (“this implies…”)
- **IRI + prefix policy**:
  - prefix manager + IRI minting rules (slugging, namespaces, versioning)
  - duplicate detection and consistent labeling conventions
- **Undo/redo and change sets**:
  - every edit is a change set (batchable), with diff and rationale

### 3) Validate
- **SHACL**:
  - shapes editor (or import shapes graphs)
  - run validation; render a clickable report that focuses failing nodes/properties
  - severity, message, path, and suggested fixes
- **SPARQL “tests”**:
  - saved SPARQL queries as regression checks (“competency tests”)
  - pass/fail results in CI style
- **OWL reasoning** (as an optional “quality gate”):
  - consistency check (unsat classes / contradictions)
  - classification (inferred hierarchy)
  - explanations/justifications for inferences and inconsistencies

### 4) Review + governance
- **RDF-aware diffs**:
  - entity-level diff: “this class changed restrictions”
  - triple/axiom diff: additions/removals grouped by intent
- **Commenting and approvals**:
  - comment on entities/axioms/shapes
  - approval gates (e.g. “must pass SHACL + reasoner to merge”)
- **Audit + provenance**:
  - who changed what, when, why
  - link changes to issues, tickets, sources, or evidence
- **Release/publish**:
  - versioned exports, change logs, and deployment to endpoints

### 5) Integration + scale
- **Triplestore / endpoint mode** for large graphs:
  - connect to SPARQL endpoints (GraphDB, Stardog, Fuseki, Virtuoso, etc.)
  - pagination, query timeouts, caching, “explain query” hints
- **Git-native mode**:
  - treat ontology as code: PRs, CI validations, release tags
- **Module/import management**:
  - imports closure controls; named graphs; alignment/mappings to external vocabularies

## AI + human-in-the-loop (the “killer feature”)

AI should *propose*, not silently mutate. The system should be designed so humans can trust and verify every generated suggestion.

### AI responsibilities (suggestion generation)
- Propose **patches**: new entities, axioms, labels/definitions, shapes, mappings.
- Provide **rationale + evidence**:
  - what data/text it used
  - why this axiom/shapes improves competency questions
  - confidence and assumptions
- Provide **impact analysis**:
  - which entities are touched
  - what validations might fail (SHACL), what reasoning consequences change
  - estimated “blast radius”

### Human responsibilities (verification + governance)
- Review suggestions line-by-line (entity-by-entity).
- Accept/reject/modify; require a rationale for acceptance.
- Confirm that validation gates pass before publishing.

### Safety gates (non-negotiable)
- No “auto-apply” in production contexts.
- Every accepted patch runs:
  - SHACL validation
  - SPARQL regression suite
  - (optional) OWL reasoner checks
- Keep the ontology in a **reviewable format** (patch-based change sets + diffs).

## Competency-question driven workflow

1) Define competency questions (CQs): “Can we answer X?”  
2) Translate CQs into SPARQL queries + SHACL constraints.  
3) AI proposes ontology changes to satisfy CQs.  
4) Human reviews + validation gates decide acceptance.  
5) CQs become regression tests to prevent future drift.

## UX principles (professional editor ergonomics)

- **Two-speed UI**: “quick edit” for small fixes, “guided wizard” for complex axioms.
- **Progressive disclosure**: hide OWL complexity until the user asks for it.
- **Explain everything**: inference previews, validation errors with fixes, and provenance.
- **Make it hard to do the wrong thing**: guardrails for punning, domain/range misuse, datatype/language collisions, duplicate IRIs.

## WebProtégé parity map (what to emulate, not copy)

WebProtégé is a strong reference for “editor ergonomics”: predictable information architecture, collaboration primitives, and governance workflows. For this app, the goal is:

- Keep **graph-first exploration** (our differentiator).
- Add **WebProtégé-like** structured authoring (trees + forms), review, and collaboration.

### Feature mapping

- **Projects / files**
  - File menu: New/Open/Export (Turtle/JSON), clear workspace (implemented).
  - Recent projects + local autosave (planned).
  - Imports closure + module management (planned).
- **Entity browsing**
  - Class hierarchy (tree), property list/table, individuals list (planned).
  - Search everywhere + quick jump (implemented).
- **Editing**
  - Forms for Class / Property / Individual with guardrails (planned).
  - Changesets, undo/redo, diffs, rationale (partial: undo/redo exists; diffs planned).
- **Collaboration**
  - Comments (local prototype) + activity feed hooks (partial; real-time planned).
  - Real-time co-editing (planned; likely CRDT-based).
- **Governance**
  - Roles, approvals, validation gates before merge/publish (planned).

## Interface vNext (modern ontology workbench)

### Top bar (header nav)

- **File**: New, Open…, Export (Turtle/JSON), Clear, (later) Recent projects.
- **Edit**: Undo/Redo, (later) batch changesets.
- **View**: ABox/TBox filters, labels, legend, (later) layouts (tree/graph/table).
- **Tools**: SPARQL, SHACL, reasoner, mappings.
- **Collab**: Share session, comments, review queue.
- **Search**: global entity search (already in header).

### Left sidebar (primary navigation)

- **Project**: base IRI, prefixes, imports, stats.
- **Entities**: Classes / Properties / Individuals / Concepts, each with a structured list/tree.
- **View filters**: ABox/TBox, kind filters, labels.

### Right inspector (context + actions)

- Details (types, facts, annotations)
- Triples (in/out), edit actions
- Forms (Class/Property/Individual), restriction wizard
- Validation (SHACL report, SPARQL tests, reasoner)
- Changes (undo/redo, changesets, diffs)
- AI assistant (suggestions queue + approve/apply)
- Comments/review (threads + approvals)

## Step-by-step implementation plan (pragmatic)

1) **Workbench shell**: header File/Edit/View menus + better layout primitives  
   - Done: File menu (New/Open/Export/Clear).
2) **Entity browser**: class tree + property/individual lists, selection sync with graph
3) **Form-based authoring**: guided editors for OWL entities (plus prefix manager)
4) **Validation layer**: SHACL import + report UI; saved SPARQL tests dashboard
5) **Review workflows**: RDF-aware diffs, comments, approvals, audit trail
6) **Collaboration**: shared sessions + real-time co-editing (CRDT) + presence
7) **AI assist**: suggestion queue (patches) + rationale + impact analysis + gates (partial: AI assistant card prototype)

## AI API contract (prototype v1)

The app includes an **AI assistant card** that can call a user-provided endpoint to return *suggestions as RDF patch operations*.

### Request (POST JSON)

```json
{
  "version": "v1",
  "baseIri": "https://example.org/base#",
  "node": { "id": "…", "iri": "…", "label": "…", "kind": "class|property|individual|…", "box": "tbox|abox|…", "types": [] },
  "nodeFacts": { "labels": [], "types": [], "literalFacts": [] },
  "neighborhood": { "outgoing": [], "incoming": [] },
  "instructions": "Suggest labels/definitions and schema improvements…"
}
```

### Response (JSON)

```json
{
  "suggestions": [
    {
      "id": "optional",
      "title": "Add missing label",
      "rationale": "…",
      "confidence": 0.82,
      "changes": [
        {
          "op": "add",
          "subject": "https://example.org/base#MyClass",
          "predicate": "rdfs:label",
          "objectKind": "literal",
          "objectValue": "My class",
          "objectLanguage": "en"
        }
      ]
    }
  ]
}
```

Notes:
- The browser UI can call any endpoint, but **API keys in the browser are not secure**. For real usage, put your AI provider call behind a backend proxy (CORS + auth + auditing).

## Architecture sketch (pragmatic path)

- **Client-only mode** (today): import files, local store, local visualization, local SPARQL.
- **Hybrid mode** (next): optional backend for heavy tasks:
  - SHACL validation at scale
  - OWL reasoning (HermiT/Pellet/Jena/ELK depending on profile)
  - SWRL reasoning (typically server-side)
  - endpoint connectivity with auth and query governance

## Roadmap (suggested milestones)

### Milestone A — “Editor foundation”
- Robust entity editor forms (classes/properties/individuals)
- Restriction wizard + better annotation editing
- RDF-aware diff + undo/redo
- Export/import round-tripping without surprises

### Milestone B — “Validation & QA”
- SHACL shapes import + validation report UI
- Saved SPARQL tests + pass/fail dashboard
- Optional reasoner checks + explanations

### Milestone C — “Collaboration”
- Change sets + approvals + comments
- Role-based access and audit logs
- Git/PR integration or built-in review workflows

### Milestone D — “AI assist”
- Suggestion queue (patches) + rationale + impact preview
- Human acceptance workflow + automated gates
- Traceability: “why this suggestion exists” + evidence links

## Open questions (to decide before building “real editor” features)

- **Where does reasoning run?** Browser-only vs backend (most teams choose backend).
- **What OWL profile matters?** OWL 2 EL/RL/QL/Full changes tool choice and UX constraints.
- **What’s your source of truth?** Git files, a triplestore, or both.
- **What’s the governance model?** Solo editing, team reviews, or enterprise approvals.
