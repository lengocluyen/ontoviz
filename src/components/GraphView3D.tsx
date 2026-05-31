import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const SPRITE_FONT =
  "600 28px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif";

// Module-level: no closure — only reads node fields passed as argument.
function nodeVal(n: any): number {
  const node = n as GraphNode;
  return Math.max(1, (node.incoming + node.outgoing) * 2);
}

export default function GraphView3D(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const rawLabelScale = Number(props.labelScale);
  const labelScale = Number.isFinite(rawLabelScale) ? Math.max(0.2, rawLabelScale) : 1;
  const labelRenderer = props.labelRenderer ?? "sprite";
  const css2dRenderer = useMemo(() => new CSS2DRenderer(), []);
  const extraRenderers = useMemo(() => [css2dRenderer], [css2dRenderer]);

  // Sprite label cache — keyed by "n:<id>" or "l:<id>"; cleared with GPU disposal on data/scale change.
  const spriteCacheRef = useRef(new Map<string, THREE.Sprite>());
  // Property rect fill material cache — one material per node ID, reused across renders.
  const rectMaterialCacheRef = useRef(new Map<string, THREE.MeshPhongMaterial>());
  // Pending camera-focus target: set immediately, resolved on engine-stop if simulation hasn't placed the node yet.
  const pendingFocusIdRef = useRef<string | null>(null);
  // Stable snapshot of graphData for use inside zero-dep callbacks.
  const graphDataRef = useRef<GraphData>({ nodes: [], links: [] });

  const graphData = useMemo(
    () => ({
      nodes: props.graphData.nodes.map((n) => ({ ...n })),
      links: props.graphData.links.map((l) => ({ ...l })),
    }),
    [props.graphData.links, props.graphData.nodes],
  );

  // Keep graphDataRef current without triggering re-renders.
  useEffect(() => {
    graphDataRef.current = graphData;
  }, [graphData]);

  // Dispose sprite GPU resources (textures + materials) when graphData or label scale changes.
  useEffect(() => {
    const cache = spriteCacheRef.current;
    for (const sprite of cache.values()) {
      const mat = sprite.material as THREE.SpriteMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    cache.clear();
  }, [graphData, labelScale]);

  // Dispose property rect materials when the graph structure changes.
  useEffect(() => {
    const cache = rectMaterialCacheRef.current;
    for (const mat of cache.values()) mat.dispose();
    cache.clear();
  }, [graphData]);

  // Full GPU cleanup on unmount.
  useEffect(() => {
    return () => {
      for (const sprite of spriteCacheRef.current.values()) {
        const mat = sprite.material as THREE.SpriteMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
      for (const mat of rectMaterialCacheRef.current.values()) mat.dispose();
    };
  }, []);

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

  // Shared border material — color never changes, safe to share across all rect nodes.
  const propertyRectBorderMaterial = useMemo(
    () => new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.25 }),
    [],
  );

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
      return node.id === props.highlightNodeId ? "#ffffff" : "#2b3042";
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

  function isPropertyRectNode(node: GraphNode): boolean {
    return node.kind === "property" && propertyNodesWithDomainOrRange.has(node.id);
  }

  // Stable focus attempt — reads only from refs so it never needs to be recreated.
  // Returns false when the node's position hasn't been set by the simulation yet.
  const attemptFocus = useCallback((nodeId: string): boolean => {
    const node = graphDataRef.current.nodes.find((n) => n.id === nodeId) as any;
    if (!node) {
      pendingFocusIdRef.current = null;
      return true;
    }
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const z = node.z ?? 0;
    const mag = Math.hypot(x, y, z);
    if (mag < 5) return false; // simulation hasn't placed this node yet
    pendingFocusIdRef.current = null;
    const distRatio = 1 + 160 / mag;
    fgRef.current?.cameraPosition(
      { x: x * distRatio, y: y * distRatio, z: z * distRatio },
      node,
      900,
    );
    return true;
  }, []);

  // Stable engine-stop handler — flushes any pending focus once the simulation settles.
  const handleEngineStop = useCallback(() => {
    const nodeId = pendingFocusIdRef.current;
    if (nodeId) attemptFocus(nodeId);
  }, [attemptFocus]);

  // Try to focus immediately; if the node isn't positioned yet, leave it in pendingFocusIdRef
  // so handleEngineStop can resolve it once the simulation finishes.
  useEffect(() => {
    if (!props.focusNodeId) {
      pendingFocusIdRef.current = null;
      return;
    }
    pendingFocusIdRef.current = props.focusNodeId;
    attemptFocus(props.focusNodeId);
  }, [props.focusNodeId, graphData.nodes, attemptFocus]);

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
    fgRef.current?.refresh?.();
  }, [labelScale, props.showEdgeLabels, props.showNodeLabels]);

  // Sprite factory backed by a persistent cache. Cache is invalidated (with disposal) via the
  // useEffect above whenever graphData or labelScale changes.
  function makeCachedSprite(key: string, text: string, color: string, height: number): THREE.Sprite {
    const cache = spriteCacheRef.current;
    const cached = cache.get(key);
    if (cached) return cached;
    const sprite = makeTextSprite(text, {
      color,
      font: SPRITE_FONT,
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
  }

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
        warmupTicks={50}
        extraRenderers={
          labelRenderer === "dom" && (props.showNodeLabels || props.showEdgeLabels) ? extraRenderers : undefined
        }
        nodeColor={nodeColor as any}
        nodeVal={nodeVal}
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
        onEngineStop={handleEngineStop}
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

            // Reuse cached fill material to avoid GPU allocation on every render.
            let fillMaterial = rectMaterialCacheRef.current.get(node.id);
            if (!fillMaterial) {
              fillMaterial = new THREE.MeshPhongMaterial({
                color: nodeColor(node) as any,
                shininess: 40,
              });
              rectMaterialCacheRef.current.set(node.id, fillMaterial);
            } else {
              fillMaterial.color.set(nodeColor(node) as any);
            }

            const box = new THREE.Mesh(propertyRectGeometry, fillMaterial);
            box.userData = { role: "shape" };
            group.add(box);

            // Shared border material — never changes color.
            const border = new THREE.LineSegments(propertyRectEdges, propertyRectBorderMaterial);
            border.userData = { role: "outline" };
            group.add(border);

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
                const sprite = makeCachedSprite(`n:${node.id}`, label, "rgba(255,255,255,0.92)", 18 * labelScale);
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

          const sprite = makeCachedSprite(`n:${node.id}`, label, "rgba(255,255,255,0.92)", 18 * labelScale);
          sprite.position.set(0, 8, 0);
          return sprite;
        }}
        nodePositionUpdate={(obj: any, _coords: any, n: any) => {
          const node = n as GraphNode;
          if (!obj || !isPropertyRectNode(node)) return;
          // Update the cached material's color rather than traversing the group hierarchy.
          const mat = rectMaterialCacheRef.current.get(node.id);
          if (mat?.color) mat.color.set(nodeColor(node) as any);
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
                return makeCachedSprite(`l:${link.id}`, label, "rgba(255,255,255,0.82)", 14 * labelScale);
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
