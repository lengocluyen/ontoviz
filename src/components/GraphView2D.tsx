import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph";
import type { CreateEntityInput } from "../lib/editor";
import type { GraphLink, GraphNode } from "../lib/graphModel";
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
  showEdgeFlow?: boolean;
  highlightAnnotations?: boolean;
  annotationMetaById?: Record<string, { hasLabel: boolean; hasDefinition: boolean }>;
  onNodeClick: (node: GraphNode | null) => void;
  onLinkClick: (link: GraphLink | null) => void;
  onBackgroundClick: () => void;
};

const NODE_COLORS: Record<GraphNode["kind"], string> = {
  class: "#74c0fc",
  property: "#ffd43b",
  individual: "#69db7c",
  concept: "#b197fc",
  restriction: "#ff6b6b",
  blank: "#adb5bd",
  literal: "#ffe066",
  unknown: "#868e96",
};

const EDGE_COLORS: Record<GraphLink["box"], string> = {
  tbox: "#4dabf7",
  abox: "#51cf66",
  unknown: "#adb5bd",
};

const NODE_BASE_R = 5;

function nodeRadius(node: GraphNode): number {
  const deg = node.incoming + node.outgoing;
  return NODE_BASE_R * Math.cbrt(Math.max(1, deg * 2));
}

function nodeBaseColor(node: GraphNode): string {
  return NODE_COLORS[node.kind] ?? NODE_COLORS.unknown;
}

export default function GraphView2D(props: Props) {
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
      const r = nodeRadius(node);
      const isSelected = node.id === props.highlightNodeId;
      const fill = isSelected ? "#ffffff" : nodeBaseColor(node);

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#ffffff" : "rgba(255,255,255,0.25)";
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      if (props.showNodeLabels) {
        const label = clipText(node.label || node.id, 24);
        const fontSize = Math.max(8, 11 / globalScale);
        ctx.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillText(label, x, y + r + 2);
      }
    },
    [props.highlightNodeId, props.showNodeLabels],
  );

  const nodePointerAreaPaint = useCallback(
    (n: any, color: string, ctx: CanvasRenderingContext2D) => {
      const node = n as GraphNode;
      const { x = 0, y = 0 } = n;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, nodeRadius(node), 0, Math.PI * 2);
      ctx.fill();
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

      const color = EDGE_COLORS[link.box] ?? EDGE_COLORS.unknown;
      const angle = Math.atan2(ty - sy, tx - sx);
      const tgtR = nodeRadius(tgt as GraphNode);
      const ex = tx - Math.cos(angle) * (tgtR + 3);
      const ey = ty - Math.sin(angle) * (tgtR + 3);

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = link.box === "tbox" ? 1.8 : 1.2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Arrowhead
      const headLen = 7;
      const headAngle = Math.PI / 6;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - headLen * Math.cos(angle - headAngle), ey - headLen * Math.sin(angle - headAngle));
      ctx.lineTo(ex - headLen * Math.cos(angle + headAngle), ey - headLen * Math.sin(angle + headAngle));
      ctx.closePath();
      ctx.fill();

      // Edge label
      if (props.showEdgeLabels) {
        const label = clipText(link.label, 18);
        const fontSize = Math.max(7, 9 / globalScale);
        ctx.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = color;
        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2;
        const perp = angle - Math.PI / 2;
        ctx.fillText(label, mx + Math.cos(perp) * 8, my + Math.sin(perp) * 8);
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
          return `${link.label}\n${link.predicate}\n${link.box.toUpperCase()}`;
        }}
        d3VelocityDecay={0.25}
        enableNodeDrag
      />
    </div>
  );
}

function clipText(text: string, maxLen: number): string {
  const s = text ?? "";
  return s.length <= maxLen ? s : `${s.slice(0, maxLen - 1)}…`;
}
