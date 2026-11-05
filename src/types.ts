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
  uvMask?: HTMLCanvasElement | null;
  // Immutable source island and UV channel; preview visibility never changes this mask.
  uvBinding?: { uvSet: string; island: Island };
  placement?: {
    source: HTMLCanvasElement;
    rest: HTMLCanvasElement;
    points: Point[];
    kind: "free" | "perspective" | "mesh";
    rendered: HTMLCanvasElement;
  };
};
export type UVDisplayMode = "off" | "quads" | "triangles" | "outline";
export type IslandFace = {
  meshId: string;
  triangle: number;
  vertices: string[];
  normal: [number, number, number];
};
export type Island = { id: number; triangles: Point[][]; faces?: IslandFace[] };
export type AlphaMode = "OPAQUE" | "MASK" | "BLEND";
export type SourceTexture = {
  name: string;
  usage: string;
  uvSet: string;
  texture: THREE.Texture;
};
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
  alphaMode?: AlphaMode;
  alphaCutoff?: number;
  uvNames?: Record<string, string>;
  sourceIndex?: number;
  textureUsage?: string;
  textureName?: string;
};
export type MaterialSlot = {
  id: string;
  name: string;
  original: THREE.MeshStandardMaterial;
  preview: THREE.MeshBasicMaterial;
  studio: THREE.MeshStandardMaterial;
  texture: THREE.CanvasTexture;
  uvSets: string[];
  sourceTextures: SourceTexture[];
  uvLabels: Record<string, string>;
  documents: TextureDocument[];
};
export type ModelAsset = {
  source?: { kind: "glb"; bytes: Uint8Array; path?: string } | { kind: "sample" };
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
  /** Newly imported pixels must keep their placement even without a drag. */
  initialPlacement?: boolean;
  kind: "free" | "perspective" | "mesh";
  source: HTMLCanvasElement;
  rest: HTMLCanvasElement;
  points: Point[];
  original: Point[];
  before: TextureDocument;
  layerId: string;
  clip: HTMLCanvasElement | null;
  outside?: HTMLCanvasElement;
  raster?: HTMLCanvasElement;
  warped?: HTMLCanvasElement;
};
declare global {
  interface Window {
    desktop?: {
      reloadModel(path: string): Promise<{ name: string; bytes: Uint8Array; sourcePath: string }>;
      modelFilePath(file: File): string;
      onModelFileReading(callback: (name: string) => void): () => void;
      recentProjects(): Promise<{ id: string; name: string; path: string }[]>;
      rememberProject(handle: string): Promise<void>;
      openRecentProject(id: string): Promise<{ name: string; bytes: Uint8Array; handle: string }>;
      openFile(
        kind: "model" | "image" | "project",
      ): Promise<{ name: string; bytes: Uint8Array; handle?: string; sourcePath?: string } | null>;
      savePNG(bytes: Uint8Array, name: string): Promise<string | null>;
      saveProject(bytes: Uint8Array, name: string, handle?: string): Promise<{ name: string; handle: string } | null>;
      memory(): Promise<number>;
      windowState(): Promise<{ maximized: boolean }>;
      windowAction(action: "minimize" | "maximize" | "close"): Promise<void>;
      onWindowState(
        callback: (state: { maximized: boolean }) => void,
      ): () => void;
    };
  }
}
