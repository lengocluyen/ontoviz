import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
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
  labelRenderer?: "sprite" | "dom";
  labelScale?: number;
  showEdgeFlow?: boolean;
  highlightAnnotations?: boolean;
  annotationMetaById?: Record<
    string,
    {
      hasLabel: boolean;
      hasDefinition: boolean;
    }
  >;
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

export default function GraphView3D(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const rawLabelScale = Number(props.labelScale);
  const labelScale = Number.isFinite(rawLabelScale) ? Math.max(0.2, rawLabelScale) : 1;
  const labelRenderer = props.labelRenderer ?? "sprite";
  const css2dRenderer = useMemo(() => new CSS2DRenderer(), []);
  const extraRenderers = useMemo(() => [css2dRenderer], [css2dRenderer]);

  const graphData = useMemo(() => {
    return {
      nodes: props.graphData.nodes.map((n) => ({ ...n })),
      links: props.graphData.links.map((l) => ({ ...l })),
    };
  }, [props.graphData.links, props.graphData.nodes]);

  const propertyNodesWithDomainOrRange = useMemo(() => {
    const out = new Set<string>();
    for (const link of graphData.links) {
      if (link.predicate === IRI.rdfsDomain || link.predicate === IRI.rdfsRange) {
        out.add(String(link.source));
      }
    }
    return out;
  }, [graphData.links]);

  const propertyRectGeometry = useMemo(() => new THREE.BoxGeometry(14, 7, 3), []);
  const propertyRectEdges = useMemo(() => new THREE.EdgesGeometry(propertyRectGeometry), [propertyRectGeometry]);

  const nodeColor = useMemo(() => {
    return (node: GraphNode) => {
      const baseHex = NODE_COLORS[node.kind] ?? NODE_COLORS.unknown;
      if (!props.highlightNodeId) {
        if (!props.highlightAnnotations || !props.annotationMetaById) return baseHex;
        const meta = props.annotationMetaById[node.id];
        if (!meta) return baseHex;
        const c = new THREE.Color(baseHex);
        if (meta.hasDefinition) c.lerp(new THREE.Color("#ff922b"), 0.28);
        else if (meta.hasLabel) c.lerp(new THREE.Color("#ffffff"), 0.10);
        else c.lerp(new THREE.Color("#343a40"), 0.40);
        return `#${c.getHexString()}`;
      }
      return node.id === props.highlightNodeId
        ? "#ffffff"
        : "#2b3042";
    };
  }, [props.annotationMetaById, props.highlightAnnotations, props.highlightNodeId]);

  const linkColor = useMemo(() => {
    return (link: GraphLink) => EDGE_COLORS[link.box] ?? EDGE_COLORS.unknown;
  }, []);

  const arrowColor = useMemo(() => {
    return (link: GraphLink) => {
      const c = new THREE.Color(EDGE_COLORS[link.box] ?? EDGE_COLORS.unknown);
      c.lerp(new THREE.Color("#ffffff"), 0.12);
      return `#${c.getHexString()}`;
    };
  }, []);

  const labelFactory = useMemo(() => {
    const cache = new Map<string, THREE.Sprite>();

    return (key: string, text: string, color: string, height: number) => {
      const cached = cache.get(key);
      if (cached) return cached;

      const sprite = makeTextSprite(text, {
        color,
        font: "600 28px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif",
        background: "rgba(0,0,0,0.55)",
        border: "rgba(255,255,255,0.14)",
        paddingX: 16,
        paddingY: 10,
        radius: 12,
      });
      const aspect = Number(sprite.userData?.aspect ?? 3);
      sprite.scale.set(height * aspect, height, 1);
      cache.set(key, sprite);
      return sprite;
    };
  }, [graphData, labelScale]);

  function isPropertyRectNode(node: GraphNode): boolean {
    return node.kind === "property" && propertyNodesWithDomainOrRange.has(node.id);
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setSize({ width: Math.max(0, Math.floor(cr.width)), height: Math.max(0, Math.floor(cr.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = css2dRenderer.domElement;
    el.style.position = "absolute";
    el.style.inset = "0";
    el.style.zIndex = "5";
    el.style.pointerEvents = "none";
    el.style.overflow = "hidden";
  }, [css2dRenderer]);

  useEffect(() => {
    if (labelRenderer !== "dom") return;
    css2dRenderer.setSize(size.width, size.height);
  }, [css2dRenderer, labelRenderer, size.height, size.width]);

  useEffect(() => {
    if (!props.focusNodeId) return;
    const node = graphData.nodes.find((n) => n.id === props.focusNodeId) as any;
    if (!node || node.x == null || node.y == null || node.z == null) return;
    const distance = 160;
    const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
    fgRef.current?.cameraPosition(
      { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
      node,
      900,
    );
  }, [graphData.nodes, props.focusNodeId]);

  useEffect(() => {
    fgRef.current?.refresh?.();
  }, [labelScale, props.showEdgeLabels, props.showNodeLabels]);

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
        <div className="graphTools" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
          <GraphCreateMenu
            enabled={Boolean(props.editingEnabled)}
            baseIri={props.baseIri ?? ""}
            onCreateEntity={props.onCreateEntity}
            autoOpenToken={props.autoOpenCreateMenuToken}
          />
        </div>
      ) : null}

      <ForceGraph3D
        ref={fgRef}
        width={size.width}
        height={size.height}
        graphData={graphData}
        backgroundColor="rgba(0,0,0,0)"
        extraRenderers={
          labelRenderer === "dom" && (props.showNodeLabels || props.showEdgeLabels) ? extraRenderers : undefined
        }
        nodeColor={nodeColor as any}
        linkColor={linkColor as any}
        linkWidth={(l: any) => (l.box === "tbox" ? 1.8 : 1.3)}
        linkOpacity={0.9}
        linkDirectionalArrowLength={(l: any) => (l.box === "tbox" ? 7.2 : 6.4)}
        linkDirectionalArrowRelPos={0.78}
        linkDirectionalArrowColor={arrowColor as any}
        linkDirectionalArrowResolution={10}
        linkDirectionalParticles={
          props.showEdgeFlow ? ((l: any) => (l.box === "tbox" ? 2 : 1)) : 0
        }
        linkDirectionalParticleSpeed={0.007}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleColor={arrowColor as any}
        nodeRelSize={4}
        nodeThreeObjectExtend={(n: any) => {
          const node = n as GraphNode;
          if (isPropertyRectNode(node)) return false;
          return Boolean(props.showNodeLabels);
        }}
        nodeThreeObject={(n: any) => {
          const node = n as GraphNode;
          const wantsLabel = Boolean(props.showNodeLabels);
          const label = clipText(node.label?.trim() || node.id, 28);

          if (isPropertyRectNode(node)) {
            const group = new THREE.Group();
            group.userData = { kind: "propertyRect" };

            const fillMaterial = new THREE.MeshPhongMaterial({
              color: nodeColor(node) as any,
              shininess: 40,
            });
            const box = new THREE.Mesh(propertyRectGeometry, fillMaterial);
            box.userData = { role: "shape" };
            group.add(box);

            const borderMaterial = new THREE.LineBasicMaterial({
              color: "#ffffff",
              transparent: true,
              opacity: 0.25,
            });
            const border = new THREE.LineSegments(propertyRectEdges, borderMaterial);
            border.userData = { role: "outline" };
            group.add(border);

            (group.userData as any).shape = box;
            (group.userData as any).outline = border;

            if (wantsLabel) {
              if (labelRenderer === "dom") {
                const el = document.createElement("div");
                el.className = "fgLabel fgLabelNode";
                el.textContent = label;
                el.style.fontSize = `${Math.round(12 * labelScale)}px`;
                const obj = new CSS2DObject(el);
                obj.center.set(0.5, 1);
                obj.position.set(0, 6, 0);
                obj.renderOrder = 999;
                group.add(obj);
              } else {
                const sprite = labelFactory(`n:${node.id}`, label, "rgba(255,255,255,0.92)", 18 * labelScale);
                sprite.position.set(0, 7, 0);
                group.add(sprite);
              }
            }

            return group;
          }

          if (!wantsLabel) return undefined;
          if (labelRenderer === "dom") {
            const el = document.createElement("div");
            el.className = "fgLabel fgLabelNode";
            el.textContent = label;
            el.style.fontSize = `${Math.round(12 * labelScale)}px`;
            const obj = new CSS2DObject(el);
            obj.center.set(0.5, 1);
            obj.position.set(0, 7, 0);
            obj.renderOrder = 999;
            return obj;
          }

          const sprite = labelFactory(`n:${node.id}`, label, "rgba(255,255,255,0.92)", 18 * labelScale);
          sprite.position.set(0, 8, 0);
          return sprite;
        }}
        nodePositionUpdate={(obj: any, _coords: any, n: any) => {
          const node = n as GraphNode;
          if (!obj || !isPropertyRectNode(node)) return;
          const group = obj as any;
          const shape = group.userData?.shape as THREE.Mesh | undefined;
          const mat = shape?.material as any;
          if (mat?.color) {
            mat.color.set(nodeColor(node) as any);
          }
        }}
        linkThreeObjectExtend={Boolean(props.showEdgeLabels)}
        linkThreeObject={
          props.showEdgeLabels
            ? (l: any) => {
                const link = l as GraphLink;
                const label = clipText(link.label, 22);
                if (labelRenderer === "dom") {
                  const el = document.createElement("div");
                  el.className = "fgLabel fgLabelEdge";
                  el.textContent = label;
                  el.style.fontSize = `${Math.round(11 * labelScale)}px`;
                  const obj = new CSS2DObject(el);
                  obj.center.set(0.5, 0.5);
                  obj.renderOrder = 998;
                  return obj;
                }

                const sprite = labelFactory(`l:${link.id}`, label, "rgba(255,255,255,0.82)", 14 * labelScale);
                return sprite;
              }
            : undefined
        }
        linkPositionUpdate={
          props.showEdgeLabels
            ? (sprite: any, { start, end }: any) => {
                if (!sprite) return;
                const mid = new THREE.Vector3(
                  (start.x + end.x) / 2,
                  (start.y + end.y) / 2,
                  (start.z + end.z) / 2,
                );
                sprite.position.copy(mid);
              }
            : undefined
        }
        nodeLabel={(n: any) => {
          const node = n as GraphNode;
          const iri = node.iri ?? node.id;
          return `${node.label}\n${node.kind.toUpperCase()} • ${node.box.toUpperCase()}\n${iri}`;
        }}
        linkLabel={(l: any) => {
          const link = l as GraphLink;
          return `${link.label}\n${link.predicate}\n${link.box.toUpperCase()}`;
        }}
        onNodeClick={(node: any) => props.onNodeClick((node as GraphNode) ?? null)}
        onLinkClick={(link: any) => props.onLinkClick((link as GraphLink) ?? null)}
        onBackgroundClick={props.onBackgroundClick}
        d3VelocityDecay={0.25}
        enableNodeDrag
      />
    </div>
  );
}

function makeTextSprite(
  text: string,
  opts: {
    color: string;
    font: string;
    background: string;
    border: string;
    paddingX: number;
    paddingY: number;
    radius: number;
  },
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const material = new THREE.SpriteMaterial({ color: 0xffffff });
    return new THREE.Sprite(material);
  }

  ctx.font = opts.font;
  const metrics = ctx.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  const height = 56;
  const width = Math.min(2048, Math.max(80, textWidth + opts.paddingX * 2));

  canvas.width = width;
  canvas.height = height;

  const ctx2 = canvas.getContext("2d");
  if (!ctx2) {
    const material = new THREE.SpriteMaterial({ color: 0xffffff });
    return new THREE.Sprite(material);
  }

  ctx2.font = opts.font;
  ctx2.textBaseline = "middle";

  const r = Math.min(opts.radius, height / 2, width / 2);
  drawRoundRect(ctx2, 0.5, 0.5, width - 1, height - 1, r, opts.background, opts.border);

  ctx2.fillStyle = opts.color;
  ctx2.fillText(text, opts.paddingX, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  material.depthTest = false;
  material.sizeAttenuation = false;
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 999;
  sprite.frustumCulled = false;
  sprite.userData = { aspect: width / height };
  return sprite;
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke: string,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();

  ctx.fillStyle = fill;
  ctx.fill();

  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function clipText(text: string, maxLen: number): string {
  const s = text ?? "";
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}
