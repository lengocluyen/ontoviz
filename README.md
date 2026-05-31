# Ontology Graph

Web-based 3D explorer + editor for ontologies / knowledge graphs.

- Import **RDF / OWL / JSON-LD** (client-side parsing)
- Visualize **ABox** (assertions) vs **TBox** (schema) in 3D
- Distinguish **classes / properties / individuals / SKOS concepts / restrictions**
- Run **SPARQL SELECT** in-browser and export results
- Prototype **Protégé-like editing**: guided OWL forms + triple editor + undo/redo

## Tech stack

- Vite + React + TypeScript
- 3D graph: `react-force-graph-3d` + `three`
- RDF store + SPARQL: `rdflib`

## Quick start

```bash
npm install
npm run dev
```

Then:

- Drag & drop an ontology file (`.ttl`, `.rdf`, `.owl`, `.jsonld`, etc.)
- Or load the samples from the Import tab

## Scripts

```bash
npm run dev
npm run build
npm run preview
```

## Docker

### Production (static build served by nginx)

```bash
docker build -t 3d-ontology-graph .
docker run --rm -p 8080:80 3d-ontology-graph
```

Open `http://localhost:8080`.

### Development (hot reload)

```bash
docker compose up
```

Open `http://localhost:5173`.

## Usage

### Explore

- Left sidebar: import/open ontologies, library, entities list, view filters, tools
- Center: 3D graph (click a node/edge to inspect)
- Right panel: details, triples, OWL editor, change history, AI assistant (endpoint), comments, validation (placeholder)

### SPARQL

- Open **Tools → SPARQL → Open in center**
- Execute queries against the currently loaded RDF store (SELECT only)
- Export results: **JSON** or **CSV**

### Editing

- **OWL editor** (guided forms): add labels/comments, subclass, domain/range, typing, etc.
- **Edit** (triple editor): add any triple with ontology-based suggestions (datalists)
- **Changes**: undo/redo for edits made in the current session
- Export the current store as Turtle

Common prefixes are supported in the editor (`rdf:`, `rdfs:`, `owl:`, `xsd:`, `skos:`, `dct:`, `foaf:`, `pizza:`). `ex:` maps to your configured **Base IRI**.

## Supported inputs

### RDF / OWL

- Turtle: `.ttl`, `.n3`
- RDF/XML: `.rdf`, `.owl`, `.xml`

### JSON

- JSON-LD: `.jsonld` (and `.json` if it is JSON-LD)
- Graph JSON: `.json` with `{ "nodes": [...], "links": [...] }` (see `public/sample-graph.json`)

Additional samples:

- `public/sample-foaf.ttl` (FOAF-style)
- `public/sample-pizza.ttl` (Pizza-ontology style)

## ABox/TBox detection (heuristics)

This is heuristic (not full OWL reasoning):

- **Classes**: resources typed `owl:Class` / `rdfs:Class` or used in common class axioms (`rdfs:subClassOf`, etc.)
- **Properties**: resources typed `owl:ObjectProperty` / `owl:DatatypeProperty` / `owl:AnnotationProperty` / `rdf:Property`, etc.
- **Individuals**: resources typed to a detected class, or typed to a non-built-in class
- **TBox edges**: schema predicates (`rdfs:subClassOf`, `rdfs:domain`, `rdfs:range`, …)
- **ABox edges**: `rdf:type` assertions + property assertions involving individuals/literals

If you want stricter separation (named graphs, imports closure, punning), define your conventions and we can adapt the classifier.

## Publish to GitHub

1) Create a new empty repository on GitHub (public or private).
2) Initialize and push from this folder:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/<REPO_NAME>.git
git push -u origin main
```

## Roadmap (ideas)

- SHACL: load shapes + run validation report
- Better OWL axiom editing (restrictions, equivalence, disjointness)
- Collaborative editing + review workflow (WebProtégé-like)
- AI-assisted ontology authoring with human-in-the-loop validation

## License

TBD (add a `LICENSE` file when you decide MIT/Apache-2.0/etc.).
