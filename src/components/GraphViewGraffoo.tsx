/**
 * Graffoo visualization — Graphical Framework for OWL Ontologies.
 * https://essepuntato.it/graffoo/
 *
 * Graffoo visual encoding:
 *   Nodes:
 *     class        → yellow rectangle  (#ffffcc, solid 2px black border)
 *     individual   → pink circle       (#ffccee, solid 2px black border)
 *     datatype     → green parallelogram (#ccffcc, solid 2px black border)
 *     restriction  → light-yellow dashed rectangle
 *     concept      → lavender rectangle
 *     unknown      → gray rectangle
 *
 *   Edges (collapsed from property nodes):
 *     objectProperty     → blue solid,  filled-circle source, filled-arrow target
 *     dataProperty       → green solid, open-circle source,  open-arrow target
 *     annotationProperty → orange dashed, no source marker, dashed-arrow target
 *     subClassOf         → black solid, open-triangle target
 *     instanceOf         → dark solid,  filled-arrow target
 *     equivalentClass    → blue dashed, double-arrow
 *     disjointWith       → red dashed,  double-cross
 *     other              → gray solid,  open-arrow target
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ForceGraph2D } from "../lib/forceGraph2D";
import type { CreateEntityInput } from "../lib/editor";
import type { GraphNode } from "../lib/graphModel";
import type { GraffooLink, GraffooModel, GraffooNode } from "../lib/graffooModel";
import GraphCreateMenu from "./GraphCreateMenu";

type Props = {
  graffooData: GraffooModel;
  highlightNodeId: string | null;
  focusNodeId: string | null;
  editingEnabled?: boolean;
  baseIri?: string;
  onCreateEntity?: (input: CreateEntityInput) => Promise<string> | string;
  autoOpenCreateMenuToken?: number;
  showNodeLabels?: boolean;
  showEdgeLabels?: boolean;
  onNodeClick: (node: GraphNode | null) => void;
  onLinkClick: (link: any) => void;
  onBackgroundClick: () => void;
};

const GRAFFOO = {
  class:       { fill: "#ffffcc", border: "#333333", text: "#1a1a1a" },
  individual:  { fill: "#ffccee", border: "#333333", text: "#1a1a1a" },
  datatype:    { fill: "#ccffcc", border: "#333333", text: "#1a1a1a" },
  restriction: { fill: "#fffff5", border: "#333333", text: "#444444" },
  concept:     { fill: "#e8d5ff", border: "#6633cc", text: "#2d006d" },
  unknown:     { fill: "#dddddd", border: "#666666", text: "#333333" },
  selected:    { fill: "#ffffff", border: "#000000", text: "#000000" },
};

const LINK_STYLE: Record<
  GraffooLink["graffooKind"],
  { color: string; dash: number[]; width: number }
> = {
  objectProperty:     { color: "#3b82f6", dash: [],       width: 2   },
  dataProperty:       { color: "#22c55e", dash: [],       width: 2   },
  annotationProperty: { color: "#f97316", dash: [5, 3],   width: 1.5 },
  propertyFacility:   { color: "#94a3b8", dash: [4, 4],   width: 1.5 },
  subClassOf:         { color: "#1e293b", dash: [],       width: 1.8 },
  instanceOf:         { color: "#475569", dash: [],       width: 1.5 },
  equivalentClass:    { color: "#3b82f6", dash: [6, 3],   width: 1.5 },
  disjointWith:       { color: "#ef4444", dash: [4, 3],   width: 1.5 },
  inverseOf:          { color: "#8b5cf6", dash: [5, 3],   width: 1.5 },
  subPropertyOf:      { color: "#64748b", dash: [],       width: 1.5 },
  other:              { color: "#94a3b8", dash: [],       width: 1.2 },
};

// Node geometry helpers
function nodeW(node: GraffooNode): number {
  const deg = node.incoming + node.outgoing;
  return Math.max(50, 36 + deg * 3);
}
function nodeH(_node: GraffooNode): number { return 24; }
function nodeR(node: GraffooNode): number {
  const deg = node.incoming + node.outgoing;
  return Math.max(12, 10 + deg * 1.5);
}

function graffooColors(node: GraffooNode, selected: boolean) {
  if (selected) return GRAFFOO.selected;
  return GRAFFOO[node.graffooKind as keyof typeof GRAFFOO] ?? GRAFFOO.unknown;
}

export default function GraphViewGraffoo(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const graffooRef = useRef<GraffooModel>(props.graffooData);
  const pendingFocusIdRef = useRef<string | null>(null);

  const graphData = useMemo(
    () => ({
      nodes: props.graffooData.nodes.map((n) => ({ ...n })),
      links: props.graffooData.links.map((l) => ({ ...l })),
    }),
    [props.graffooData],
  );

  useEffect(() => { graffooRef.current = props.graffooData; }, [props.graffooData]);

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
    const node = graffooRef.current.nodes.find((n) => n.id === nodeId) as any;
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
      const node = n as GraffooNode;
      const { x = 0, y = 0 } = n;
      const isSelected = node.id === props.highlightNodeId;
      const colors = graffooColors(node, isSelected);

      ctx.save();

      if (node.graffooKind === "individual") {
        // Pink circle
        const r = nodeR(node);
        ctx.fillStyle = colors.fill;
        ctx.strokeStyle = isSelected ? "#000" : colors.border;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (props.showNodeLabels) {
          const label = clipText(node.label || node.id, 16);
          const fontSize = Math.max(7, Math.min(r * 0.5, 12 / globalScale));
          ctx.font = `${fontSize}px ui-sans-serif, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = colors.text;
          ctx.fillText(label, x, y);
        }
      } else if (node.graffooKind === "datatype") {
        // Green parallelogram
        const w = nodeW(node);
        const h = nodeH(node);
        const skew = h * 0.35;
        ctx.fillStyle = colors.fill;
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - w / 2 + skew, y - h / 2);
        ctx.lineTo(x + w / 2 + skew, y - h / 2);
        ctx.lineTo(x + w / 2 - skew, y + h / 2);
        ctx.lineTo(x - w / 2 - skew, y + h / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        if (props.showNodeLabels) {
          const label = clipText(node.label || node.id, 18);
          const fontSize = Math.max(7, 10 / globalScale);
          ctx.font = `${fontSize}px ui-sans-serif, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = colors.text;
          ctx.fillText(label, x, y);
        }
      } else if (node.graffooKind === "restriction") {
        // Dashed light-yellow rectangle
        const w = nodeW(node);
        const h = nodeH(node);
        ctx.fillStyle = colors.fill;
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.fillRect(x - w / 2, y - h / 2, w, h);
        ctx.strokeRect(x - w / 2, y - h / 2, w, h);
        ctx.setLineDash([]);

        if (props.showNodeLabels) {
          const label = clipText(node.label || node.id, 20);
          const fontSize = Math.max(7, 9 / globalScale);
          ctx.font = `italic ${fontSize}px ui-sans-serif, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = colors.text;
          ctx.fillText(label, x, y);
        }
      } else {
        // Default: solid rectangle (class, concept, unknown)
        const w = nodeW(node);
        const h = nodeH(node);
        ctx.fillStyle = colors.fill;
        ctx.strokeStyle = isSelected ? "#000" : colors.border;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.fillRect(x - w / 2, y - h / 2, w, h);
        ctx.strokeRect(x - w / 2, y - h / 2, w, h);

        if (props.showNodeLabels) {
          const label = clipText(node.label || node.id, 22);
          const fontSize = Math.max(7, 10 / globalScale);
          ctx.font = `600 ${fontSize}px ui-sans-serif, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = colors.text;
          ctx.fillText(label, x, y);
        }
      }

      ctx.restore();
    },
    [props.highlightNodeId, props.showNodeLabels],
  );

  const nodePointerAreaPaint = useCallback(
    (n: any, color: string, ctx: CanvasRenderingContext2D) => {
      const node = n as GraffooNode;
      const { x = 0, y = 0 } = n;
      ctx.fillStyle = color;
      if (node.graffooKind === "individual") {
        ctx.beginPath();
        ctx.arc(x, y, nodeR(node), 0, Math.PI * 2);
        ctx.fill();
      } else if (node.graffooKind === "datatype") {
        const w = nodeW(node) + 8;
        const h = nodeH(node);
        ctx.fillRect(x - w / 2, y - h / 2, w, h);
      } else {
        const w = nodeW(node);
        const h = nodeH(node);
        ctx.fillRect(x - w / 2, y - h / 2, w, h);
      }
    },
    [],
  );

  const linkCanvasObject = useCallback(
    (l: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const link = l as GraffooLink;
      const src = l.source as any;
      const tgt = l.target as any;
      if (!src || !tgt) return;
      const { x: sx = 0, y: sy = 0 } = src;
      const { x: tx = 0, y: ty = 0 } = tgt;

      const style = LINK_STYLE[link.graffooKind] ?? LINK_STYLE.other;
      const angle = Math.atan2(ty - sy, tx - sx);

      // Adjust start/end to node boundaries
      const srcNode = src as GraffooNode;
      const tgtNode = tgt as GraffooNode;
      const startPt = edgeStartPoint(sx, sy, angle, srcNode);
      const endPt = edgeEndPoint(tx, ty, angle, tgtNode);

      ctx.save();
      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.width;
      ctx.setLineDash(style.dash);
      ctx.beginPath();
      ctx.moveTo(startPt.x, startPt.y);
      ctx.lineTo(endPt.x, endPt.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Target arrowhead
      drawGraffooArrowhead(ctx, endPt.x, endPt.y, angle, style.color, link.graffooKind);

      // Source marker (filled circle for objectProperty, open circle for dataProperty)
      if (link.graffooKind === "objectProperty") {
        const cx = startPt.x + Math.cos(angle) * 6;
        const cy = startPt.y + Math.sin(angle) * 6;
        ctx.fillStyle = style.color;
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (link.graffooKind === "dataProperty") {
        const cx = startPt.x + Math.cos(angle) * 6;
        const cy = startPt.y + Math.sin(angle) * 6;
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 1.5;
        ctx.fillStyle = "#0b1020";
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Edge label
      if (props.showEdgeLabels && link.label) {
        const label = clipText(link.label, 18);
        const fontSize = Math.max(7, 9 / globalScale);
        ctx.font = `${fontSize}px ui-sans-serif, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = style.color;
        const mx = (startPt.x + endPt.x) / 2;
        const my = (startPt.y + endPt.y) / 2;
        const perp = angle - Math.PI / 2;
        ctx.fillText(label, mx + Math.cos(perp) * 10, my + Math.sin(perp) * 10);
      }

      ctx.restore();
    },
    [props.showEdgeLabels],
  );

  return (
    <div ref={containerRef} className="graphCanvas">
      {props.graffooData.nodes.length === 0 ? (
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
        onNodeClick={(node: any) => props.onNodeClick((node as GraffooNode) ?? null)}
        onLinkClick={(link: any) => props.onLinkClick(link ?? null)}
        onBackgroundClick={props.onBackgroundClick}
        nodeLabel={(n: any) => {
          const node = n as GraffooNode;
          return `${node.label}\n${node.graffooKind.toUpperCase()}\n${node.iri ?? node.id}`;
        }}
        linkLabel={(l: any) => {
          const link = l as GraffooLink;
          return `${link.label ?? ""}\n${link.graffooKind}\n${link.predicate}`;
        }}
        d3VelocityDecay={0.25}
        enableNodeDrag
      />

      <div className="graffooLegend">
        <div className="vowlLegendTitle">Graffoo Legend</div>
        {[
          { shape: "rect",   fill: "#ffffcc", border: "#333", label: "Class" },
          { shape: "circle", fill: "#ffccee", border: "#333", label: "Individual" },
          { shape: "para",   fill: "#ccffcc", border: "#333", label: "Datatype" },
          { shape: "dash",   fill: "#fffff5", border: "#333", label: "Restriction" },
          { shape: "line",   fill: "#3b82f6", border: "",     label: "Object property" },
          { shape: "line",   fill: "#22c55e", border: "",     label: "Data property" },
          { shape: "line",   fill: "#f97316", border: "",     label: "Annotation property" },
          { shape: "line",   fill: "#1e293b", border: "",     label: "subClassOf" },
        ].map(({ fill, label }) => (
          <div key={label} className="vowlLegendRow">
            <span className="vowlLegendDot" style={{ background: fill, border: "1px solid #555" }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Returns the point on the node boundary in the direction of `angle`
function edgeStartPoint(cx: number, cy: number, angle: number, node: GraffooNode) {
  if (node.graffooKind === "individual") {
    const r = nodeR(node);
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  }
  // Rectangle-based: find intersection with border
  const hw = nodeW(node) / 2;
  const hh = nodeH(node) / 2;
  return rectBorderPoint(cx, cy, angle, hw, hh);
}

function edgeEndPoint(cx: number, cy: number, angle: number, node: GraffooNode) {
  const backAngle = angle + Math.PI;
  if (node.graffooKind === "individual") {
    const r = nodeR(node);
    return { x: cx + Math.cos(backAngle) * r, y: cy + Math.sin(backAngle) * r };
  }
  const hw = nodeW(node) / 2;
  const hh = nodeH(node) / 2;
  return rectBorderPoint(cx, cy, backAngle, hw, hh);
}

function rectBorderPoint(cx: number, cy: number, angle: number, hw: number, hh: number) {
  const tan = Math.abs(Math.tan(angle));
  const isMoreHorizontal = hh * Math.abs(Math.cos(angle)) >= hw * Math.abs(Math.sin(angle));
  let dist: number;
  if (isMoreHorizontal) {
    dist = hw / Math.abs(Math.cos(angle)) || hw;
  } else {
    dist = hh / Math.abs(Math.sin(angle)) || hh;
  }
  return { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist };
}

function drawGraffooArrowhead(
  ctx: CanvasRenderingContext2D,
  ex: number, ey: number,
  angle: number,
  color: string,
  kind: GraffooLink["graffooKind"],
) {
  const size = 9;
  const a = Math.PI / 6;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;

  if (kind === "subClassOf") {
    // Open hollow triangle
    ctx.beginPath();
    ctx.moveTo(ex - size * Math.cos(angle - a), ey - size * Math.sin(angle - a));
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex - size * Math.cos(angle + a), ey - size * Math.sin(angle + a));
    ctx.closePath();
    ctx.fillStyle = "#0b1020";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.stroke();
  } else if (kind === "equivalentClass" || kind === "disjointWith") {
    // Double-headed style: two open arrowheads
    ctx.beginPath();
    ctx.moveTo(ex - size * Math.cos(angle - a), ey - size * Math.sin(angle - a));
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex - size * Math.cos(angle + a), ey - size * Math.sin(angle + a));
    ctx.stroke();
    const offset = size * 0.6;
    ctx.beginPath();
    ctx.moveTo(ex - offset - size * Math.cos(angle - a), ey - offset * Math.sin(angle) - size * Math.sin(angle - a));
    ctx.lineTo(ex - offset * Math.cos(angle), ey - offset * Math.sin(angle));
    ctx.lineTo(ex - offset - size * Math.cos(angle + a), ey - offset * Math.sin(angle) - size * Math.sin(angle + a));
    ctx.stroke();
  } else if (kind === "dataProperty" || kind === "annotationProperty" || kind === "propertyFacility" || kind === "other") {
    // Open arrowhead
    ctx.beginPath();
    ctx.moveTo(ex - size * Math.cos(angle - a), ey - size * Math.sin(angle - a));
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex - size * Math.cos(angle + a), ey - size * Math.sin(angle + a));
    ctx.stroke();
  } else {
    // Filled arrowhead (objectProperty, instanceOf, subPropertyOf, inverseOf)
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - size * Math.cos(angle - a), ey - size * Math.sin(angle - a));
    ctx.lineTo(ex - size * Math.cos(angle + a), ey - size * Math.sin(angle + a));
    ctx.closePath();
    ctx.fill();
  }
}

function clipText(text: string, maxLen: number): string {
  const s = text ?? "";
  return s.length <= maxLen ? s : `${s.slice(0, maxLen - 1)}…`;
}
