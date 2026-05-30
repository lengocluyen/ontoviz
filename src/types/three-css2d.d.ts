declare module "three/examples/jsm/renderers/CSS2DRenderer.js" {
  import type { Camera, Object3D, Scene, Vector2 } from "three";

  export class CSS2DObject extends Object3D {
    element: HTMLElement;
    center: Vector2;
    constructor(element?: HTMLElement);
  }

  export class CSS2DRenderer {
    domElement: HTMLElement;
    constructor(parameters?: { element?: HTMLElement });
    getSize(): { width: number; height: number };
    setSize(width: number, height: number): void;
    render(scene: Scene, camera: Camera): void;
  }
}

