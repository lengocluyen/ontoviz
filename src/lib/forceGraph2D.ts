// Wraps the `force-graph` (2D canvas) kapsule as a React component using react-kapsule.
//
// We intentionally do NOT import from `react-force-graph` here.
// That package bundles 3D-VR and 3D-AR components whose modules call
// `AFRAME.registerComponent(...)` at load time. AFRAME is not defined in
// most browser environments, so the import throws a ReferenceError before
// React can render anything — producing a blank page.
//
// `force-graph` (2D only) and `react-kapsule` are already in node_modules
// as transitive deps of `react-force-graph`; we just use them directly.
import type { ComponentType } from "react";
import fromKapsule from "react-kapsule";
import ForceGraphKapsule from "force-graph";

export const ForceGraph2D = fromKapsule(ForceGraphKapsule as any, {
  methodNames: ["centerAt", "zoom", "d3Force", "refresh", "pauseAnimation", "resumeAnimation"],
}) as ComponentType<any>;
