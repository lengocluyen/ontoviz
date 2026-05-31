/**
 * VOWL-inspired 2D visualization.
 *
 * Visual encoding (simplified VOWL):
 *   - Class          → blue filled circle, white label inside
 *   - Individual     → yellow circle, orange border
 *   - Concept (SKOS) → purple circle
 *   - Property node  → small colored rectangle (object=blue, data=green, annot=orange)
 *   - Restriction    → gray dashed circle
 *   - Literal / blank→ small gray circle
 *
 * Edge types:
 *   - subClassOf     → open triangle arrowhead, black
 *   - rdf:type       → filled arrowhead, dark gray
 *   - object prop    → filled arrowhead, blue
 *   - data prop      → filled arrowhead, green
 *   - annot prop     → dashed line, orange
 *   - other tbox     → blue thin
 *   - other abox     → green thin
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ForceGraph2D } from "react-force-graph";
import type { CreateEntityInput } from "../lib/editor";
import type { GraphLink, GraphNode } from "../lib/graphModel";
import { IRI } from "../lib/ontology";
import GraphCreateMenu from "./GraphCreateMenu";

type GraphData = { nodes: GraphNode[]; links: GraphLink[] };

type Props = {
  graphData: GraphData;
  highlightNodeId: string | null;
  focusNodeId: string | null;
  editingEnabled?: boolean;
  baseIri?: string;
  onCreateEntity?: (input: CreateEntityInput) => Promise<string> | string;
  autoOpenCreateMenuToken?: number;
  showNodeLabels?: boolean;
  showEdgeLabels?: boolean;
  highlightAnnotations?: boolean;
  annotationMetaById?: Record<string, { hasLabel: boolean; hasDefinition: boolean }>;
  onNodeClick: (node: GraphNode | null) => void;
  onLinkClick: (link: GraphLink | null) => void;
  onBackgroundClick: () => void;
};

const VOWL_COLORS = {
  class: { fill: "#3b6ecc", border: "#2955a0", text: "#ffffff" },
  individual: { fill: "#f0c539", border: "#c8960d", text: "#1a1a1a" },
  concept: { fill: "#9b59b6", border: "#7d3c98", text: "#ffffff" },
  restriction: { fill: "#555566", border: "#888899", text: "#cccccc" },
  property: { fill: "#2980b9", border: "#1a5276", text: "#ffffff" },
  dataProperty: { fill: "#27ae60", border: "#1e8449", text: "#ffffff" },
  annotationProperty: { fill: "#e67e22", border: "#ca6f1e", text: "#ffffff" },
  blank: { fill: "#555", border: "#888", text: "#aaa" },
  literal: { fill: "#6b6", border: "#494", text: "#fff" },
  unknown: { fill: "#666", border: "#999", text: "#ccc" },
  selected: { fill: "#ffffff", border: "#ffffff", text: "#000000" },
};

const EDGE_STYLE: Record<string, { color: string; dash: number[]; headStyle: "filled" | "open" | "triangle" }> = {
  [IRI.rdfsSubClassOf]: { color: "#e8e8e8", dash: [], headStyle: "triangle" },
  [IRI.rdfType]: { color: "#adb5bd", dash: [], headStyle: "filled" },
  [IRI.owlEquivalentClass]: { color: "#74c0fc", dash: [4, 2], headStyle: "filled" },
  [IRI.owlDisjointWith]: { color: "#ff6b6b", dash: [4, 2], headStyle: "filled" },
};

function vowlColors(node: GraphNode, selected: boolean) {
  if (selected) return VOWL_COLORS.selected;
  const t = node.types ?? [];
  if (node.kind === "property") {
    if (t.includes(IRI.owlDatatypeProperty)) return VOWL_COLORS.dataProperty;
    if (t.includes(IRI.owlAnnotationProperty)) return VOWL_COLORS.annotationProperty;
    return VOWL_COLORS.property;
  }
  return VOWL_COLORS[node.kind as keyof typeof VOWL_COLORS] ?? VOWL_COLORS.unknown;
}

function nodeR(node: GraphNode): number {
  if (node.kind === "property") return 6;
  const deg = node.incoming + node.outgoing;
  return 8 * Math.cbrt(Math.max(1, deg));
}

function edgeStyle(link: GraphLink) {
  const s = EDGE_STYLE[link.predicate];
  if (s) return s;
  if (link.box === "tbox") return { color: "#4dabf7", dash: [], headStyle: "filled" as const };
  return { color: "#51cf66", dash: [], headStyle: "filled" as const };
}

export default function GraphViewVOWL(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const graphDataRef = useRef<GraphData>({ nodes: [], links: [] });
  const pendingFocusIdRef = useRef<string | null>(null);

  const graphData = useMemo(
    () => ({
      nodes: props.graphData.nodes.map((n) => ({ ...n })),
      links: props.graphData.links.map((l) => ({ ...l })),
    }),
    [props.graphData.nodes, props.graphData.links],
  );

  useEffect(() => { graphDataRef.current = graphData; }, [graphData]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setSize({ width: Math.floor(cr.width), height: Math.floor(cr.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const attemptFocus = useCallback((nodeId: string): boolean => {
    const node = graphDataRef.current.nodes.find((n) => n.id === nodeId) as any;
    if (!node) { pendingFocusIdRef.current = null; return true; }
    if (node.x == null || node.y == null) return false;
    pendingFocusIdRef.current = null;
    fgRef.current?.centerAt(node.x, node.y, 900);
    fgRef.current?.zoom(4, 900);
    return true;
  }, []);

  const handleEngineStop = useCallback(() => {
    if (pendingFocusIdRef.current) attemptFocus(pendingFocusIdRef.current);
  }, [attemptFocus]);

  useEffect(() => {
    if (!props.focusNodeId) { pendingFocusIdRef.current = null; return; }
    pendingFocusIdRef.current = props.focusNodeId;
    attemptFocus(props.focusNodeId);
  }, [props.focusNodeId, graphData.nodes, attemptFocus]);

  const nodeCanvasObject = useCallback(
    (n: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = n as GraphNode;
      const { x = 0, y = 0 } = n;
      const isSelected = node.id === props.highlightNodeId;
      const colors = vowlColors(node, isSelected);
      const r = nodeR(node);

      if (node.kind === "property") {
        // Property nodes: small colored rectangle
        const hw = r * 1.8;
        const hh = r * 0.9;
        ctx.fillStyle = colors.fill;
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        roundRect(ctx, x - hw, y - hh, hw * 2, hh * 2, 4);
        ctx.fill();
        ctx.stroke();
      } else if (node.kind === "restriction") {
        // Restrictions: dashed circle
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = colors.border;
        ctx.fillStyle = colors.fill;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else {
        // Classes, individuals, concepts: solid circle
        ctx.fillStyle = colors.fill;
        ctx.strokeStyle = isSelected ? "#fff" : colors.border;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Label inside circle (for large enough nodes) or below
      if (props.showNodeLabels) {
        const label = clipText(node.label || node.id, 20);
        const fontSize = Math.max(7, Math.min(r * 0.55, 13 / globalScale));
        ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        const textW = ctx.measureText(label).width;

        if (textW < r * 1.8 && node.kind !== "property") {
          // Inside the circle
          ctx.textBaseline = "middle";
          ctx.fillStyle = colors.text;
          ctx.fillText(label, x, y);
        } else {
          // Below the node
          ctx.textBaseline = "top";
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.fillText(label, x, y + r + 3);
        }
      }
    },
    [props.highlightNodeId, props.showNodeLabels],
  );

  const nodePointerAreaPaint = useCallback(
    (n: any, color: string, ctx: CanvasRenderingContext2D) => {
      const node = n as GraphNode;
      const { x = 0, y = 0 } = n;
      const r = nodeR(node);
      ctx.fillStyle = color;
      if (node.kind === "property") {
        ctx.fillRect(x - r * 1.8, y - r * 0.9, r * 3.6, r * 1.8);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    [],
  );

  const linkCanvasObject = useCallback(
    (l: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const link = l as GraphLink;
      const src = l.source as any;
      const tgt = l.target as any;
      if (!src || !tgt) return;
      const { x: sx = 0, y: sy = 0 } = src;
      const { x: tx = 0, y: ty = 0 } = tgt;

      const style = edgeStyle(link);
      const angle = Math.atan2(ty - sy, tx - sx);
      const tgtR = nodeR(tgt as GraphNode) + 3;
      const ex = tx - Math.cos(angle) * tgtR;
      const ey = ty - Math.sin(angle) * tgtR;

      ctx.save();
      ctx.strokeStyle = style.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(style.dash);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);

      drawArrowhead(ctx, ex, ey, angle, style.color, style.headStyle, 9);

      if (props.showEdgeLabels) {
        const label = clipText(link.label, 16);
        const fontSize = Math.max(7, 9 / globalScale);
        ctx.font = `${fontSize}px ui-sans-serif, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = style.color;
        const mx = (sx + ex) / 2;
        const my = (sy + ey) / 2;
        const perp = angle - Math.PI / 2;
        ctx.fillText(label, mx + Math.cos(perp) * 9, my + Math.sin(perp) * 9);
      }

      ctx.restore();
    },
    [props.showEdgeLabels],
  );

  return (
    <div ref={containerRef} className="graphCanvas">
      {props.graphData.nodes.length === 0 ? (
        <div className="graphOverlay">
          <div className="overlayTitle">
            {props.editingEnabled ? "Start by creating your first entity" : "Import an ontology to start"}
          </div>
          <div className="overlaySub">
            {props.editingEnabled
              ? "Use the + button to create a Class / Property / Individual."
              : "Drag & drop a file in the left panel."}
          </div>
        </div>
      ) : null}

      {props.onCreateEntity ? (
        <div
          className="graphTools"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <GraphCreateMenu
            enabled={Boolean(props.editingEnabled)}
            baseIri={props.baseIri ?? ""}
            onCreateEntity={props.onCreateEntity}
            autoOpenToken={props.autoOpenCreateMenuToken}
          />
        </div>
      ) : null}

      <ForceGraph2D
        ref={fgRef}
        width={size.width}
        height={size.height}
        graphData={graphData}
        backgroundColor="rgba(0,0,0,0)"
        warmupTicks={50}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode="replace"
        nodePointerAreaPaint={nodePointerAreaPaint}
        linkCanvasObject={linkCanvasObject}
        linkCanvasObjectMode="replace"
        onEngineStop={handleEngineStop}
        onNodeClick={(node: any) => props.onNodeClick((node as GraphNode) ?? null)}
        onLinkClick={(link: any) => props.onLinkClick((link as GraphLink) ?? null)}
        onBackgroundClick={props.onBackgroundClick}
        nodeLabel={(n: any) => {
          const node = n as GraphNode;
          return `${node.label}\n${node.kind.toUpperCase()} • ${node.box.toUpperCase()}\n${node.iri ?? node.id}`;
        }}
        linkLabel={(l: any) => {
          const link = l as GraphLink;
          return `${link.label}\n${link.predicate}`;
        }}
        d3VelocityDecay={0.25}
        enableNodeDrag
      />

      <div className="vowlLegend">
        <div className="vowlLegendTitle">VOWL Legend</div>
        {[
          { color: "#3b6ecc", label: "Class" },
          { color: "#f0c539", label: "Individual", border: "#c8960d" },
          { color: "#9b59b6", label: "Concept" },
          { color: "#2980b9", label: "Object property" },
          { color: "#27ae60", label: "Data property" },
          { color: "#e67e22", label: "Annotation property" },
        ].map(({ color, label }) => (
          <div key={label} className="vowlLegendRow">
            <span className="vowlLegendDot" style={{ background: color }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  ex: number, ey: number,
  angle: number,
  color: string,
  style: "filled" | "open" | "triangle",
  size: number,
) {
  const a = Math.PI / 6;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  if (style === "filled") {
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - size * Math.cos(angle - a), ey - size * Math.sin(angle - a));
    ctx.lineTo(ex - size * Math.cos(angle + a), ey - size * Math.sin(angle + a));
    ctx.closePath();
    ctx.fill();
  } else if (style === "open") {
    ctx.beginPath();
    ctx.moveTo(ex - size * Math.cos(angle - a), ey - size * Math.sin(angle - a));
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex - size * Math.cos(angle + a), ey - size * Math.sin(angle + a));
    ctx.stroke();
  } else {
    // open triangle (subClassOf)
    ctx.beginPath();
    ctx.moveTo(ex - size * Math.cos(angle - a), ey - size * Math.sin(angle - a));
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex - size * Math.cos(angle + a), ey - size * Math.sin(angle + a));
    ctx.closePath();
    ctx.stroke();
  }
}

function clipText(text: string, maxLen: number): string {
  const s = text ?? "";
  return s.length <= maxLen ? s : `${s.slice(0, maxLen - 1)}…`;
}
