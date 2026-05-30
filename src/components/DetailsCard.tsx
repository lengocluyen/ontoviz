import type { GraphLink, GraphNode, NodeFacts } from "../lib/graphModel";
import { compactIri, truncate } from "../lib/ontology";

type Props = {
  selectedNode: GraphNode | null;
  selectedLink: GraphLink | null;
  selectedNodeFacts?: NodeFacts;
};

export default function DetailsCard(props: Props) {
  return (
    <div className="card">
      <div className="cardTitle">Details</div>
      {props.selectedNode ? (
        <NodeDetails node={props.selectedNode} facts={props.selectedNodeFacts} />
      ) : props.selectedLink ? (
        <LinkDetails link={props.selectedLink} />
      ) : (
        <div className="muted">Click a node or edge in the graph.</div>
      )}
    </div>
  );
}

function NodeDetails(props: { node: GraphNode; facts?: NodeFacts }) {
  const iri = props.node.iri ?? props.node.id;
  const facts = props.facts;
  const types = facts?.types ?? props.node.types;

  return (
    <div className="details">
      <div className="detailsTitle">{props.node.label}</div>
      <div className="detailsMeta">
        <span className="pill">{props.node.kind}</span>
        <span className="pill">{props.node.box}</span>
      </div>
      <div className="detailsLine">
        <span className="mutedSmall">IRI</span>
        <span className="mono">{iri}</span>
      </div>
      <div className="detailsLine">
        <span className="mutedSmall">In/Out</span>
        <span className="mono">
          {props.node.incoming} / {props.node.outgoing}
        </span>
      </div>

      {types.length > 0 ? (
        <>
          <div className="subTitle mt10">Types</div>
          <div className="tagGrid">
            {types.slice(0, 14).map((t) => (
              <span key={t} className="tag mono" title={t}>
                {compactIri(t)}
              </span>
            ))}
            {types.length > 14 ? <span className="mutedSmall">…</span> : null}
          </div>
        </>
      ) : null}

      {facts?.literalFacts?.length ? (
        <>
          <div className="subTitle mt10">Literal facts</div>
          <div className="factList">
            {facts.literalFacts.slice(0, 18).map((f, idx) => (
              <div key={`${f.predicate}-${idx}`} className="factRow">
                <div className="factKey" title={f.predicate}>
                  {f.predicateLabel}
                </div>
                <div className="factValue" title={f.value}>
                  {truncate(f.value, 64)}
                </div>
              </div>
            ))}
            {facts.literalFacts.length > 18 ? <div className="mutedSmall">…</div> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function LinkDetails(props: { link: GraphLink }) {
  return (
    <div className="details">
      <div className="detailsTitle">{props.link.label}</div>
      <div className="detailsMeta">
        <span className="pill">edge</span>
        <span className="pill">{props.link.box}</span>
      </div>
      <div className="detailsLine">
        <span className="mutedSmall">Predicate</span>
        <span className="mono">{props.link.predicate}</span>
      </div>
      <div className="detailsLine">
        <span className="mutedSmall">From</span>
        <span className="mono">{props.link.source}</span>
      </div>
      <div className="detailsLine">
        <span className="mutedSmall">To</span>
        <span className="mono">{props.link.target}</span>
      </div>
    </div>
  );
}

