import type * as THREE from "three";
export type Point = { x: number; y: number };
export type Blend =
  | "source-over"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten";
export type Layer = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blend: Blend;
  canvas: HTMLCanvasElement;
};
export type Island = { id: number; triangles: Point[][] };
export type TextureDocument = {
  id: string;
  name: string;
  width: number;
  height: number;
  layers: Layer[];
  activeId: string;
  selection: HTMLCanvasElement | null;
  uvSet: string;
  islands: Island[];
  selectedIslands: number[];
  restrict: boolean;
};
export type MaterialSlot = {
  id: string;
  name: string;
  original: THREE.MeshStandardMaterial;
  preview: THREE.MeshBasicMaterial;
  texture: THREE.CanvasTexture;
  uvSets: string[];
};
export type ModelAsset = {
  name: string;
  scene: THREE.Group;
  slots: MaterialSlot[];
  parts: THREE.Mesh[];
};
export type Tool =
  | "move"
  | "rect"
  | "lasso"
  | "polygon"
  | "wand"
  | "brush"
  | "eraser"
  | "fill"
  | "eyedropper"
  | "clone"
  | "island"
  | "pan";
export type SelectionMode = "replace" | "add" | "subtract";
export type TransformSession = {
  kind: "perspective" | "mesh";
  source: HTMLCanvasElement;
  rest: HTMLCanvasElement;
  points: Point[];
  original: Point[];
  before: TextureDocument;
  layerId: string;
  clip: HTMLCanvasElement | null;
};
declare global {
  interface Window {
    desktop?: {
      openFile(
        kind: "model" | "image",
      ): Promise<{ name: string; bytes: Uint8Array } | null>;
      savePNG(bytes: Uint8Array, name: string): Promise<string | null>;
      memory(): Promise<number>;
    };
  }
}
