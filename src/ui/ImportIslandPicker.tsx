import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useEditor } from "./hooks";
import { ViewportNavigation } from "./viewportNavigation";
import { ViewCube } from "./ViewCube";
import { IslandPreview } from "../render/island-preview";
import { sourceGeometry } from "../render/mesh-source";
import { islandForFace } from "../tools/uv";
import { faceKey } from "../tools/uv-guides";

export type ImportIslandChoice = { materialId: string; islandId: number };
export function ImportIslandPicker({ targetMaterial, onPick }: { targetMaterial?: string; onPick: (choice: ImportIslandChoice) => void }) {
  const e = useEditor(), host = useRef<HTMLDivElement>(null);
  const callback = useRef(onPick); callback.current = onPick;
  const [navigation, setNavigation] = useState<ViewportNavigation | null>(null);
  const [label, setLabel] = useState("Click a UV island on the model");
  useEffect(() => {
    const model = e.model, container = host.current!;
    if (!model) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.domElement.dataset.testid = "import-island-preview";
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), parts: THREE.Mesh[] = [];
    model.scene.updateMatrixWorld(true);
    // Separate meshes/geometry keep the main viewport, selection and isolation untouched.
    for (const source of model.parts) {
      const cloneMaterial = (material: THREE.Material) => material.clone();
      const mesh = new THREE.Mesh(sourceGeometry(source).clone(), Array.isArray(source.material) ? source.material.map(cloneMaterial) : cloneMaterial(source.material));
      mesh.uuid = source.uuid; mesh.matrix.copy(source.matrixWorld); mesh.matrixAutoUpdate = false;
      mesh.visible = source.visible; scene.add(mesh); parts.push(mesh);
    }
    scene.add(new THREE.HemisphereLight(0xe9f3ff, 0x424952, 2));
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(4, 8, 6); scene.add(light);
    const box = new THREE.Box3().setFromObject(scene), center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(...box.getSize(new THREE.Vector3()).toArray(), .1);
    let nav: ViewportNavigation;
    const fit = () => nav.fit(center, radius);
    nav = new ViewportNavigation(renderer.domElement, fit, true); fit(); setNavigation(nav); renderer.domElement.focus();
    const overlay = new IslandPreview(parts), empty = new Set<string>();
    let selected = empty, hovered = empty, lastIsland: object | undefined, pointerStart: { x: number; y: number } | null = null;
    const hit = (event: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect(), ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1, 1-(event.clientY-r.top)/r.height*2), nav.camera);
      const intersection = ray.intersectObjects(parts.filter(p=>p.visible), false)[0];
      if (!intersection || intersection.faceIndex == null) return;
      const part = intersection.object as THREE.Mesh;
      const material = Array.isArray(part.material) ? part.material[intersection.face?.materialIndex ?? 0] : part.material;
      const materialId = material.userData.slotId as string;
      if (targetMaterial && targetMaterial !== materialId) return;
      const doc = e.docs.get(materialId), face = overlay.originalFace(part, intersection.faceIndex);
      const island = doc && face !== undefined ? islandForFace(doc.islands, part.uuid, face) : undefined;
      return island && doc ? { island, doc, materialId } : undefined;
    };
    const leave = () => { hovered = empty; lastIsland = undefined; };
    const move = (ev: PointerEvent) => {
      if (ev.buttons) { leave(); return; }
      const result = hit(ev);
      if (result?.island !== lastIsland) { lastIsland = result?.island; hovered = result ? new Set(result.island.faces?.map(faceKey)) : empty; }
      renderer.domElement.style.cursor = result ? "pointer" : "default";
    };
    const down = (ev: PointerEvent) => { pointerStart = ev.button === 0 ? { x: ev.clientX, y: ev.clientY } : null; };
    const up = (ev: PointerEvent) => {
      const start = pointerStart; pointerStart = null;
      if (!start || ev.button !== 0 || Math.hypot(ev.clientX-start.x,ev.clientY-start.y)>4) return;
      const result = hit(ev); if (!result) return;
      selected = new Set(result.island.faces?.map(faceKey));
      setLabel(`${result.doc.name} · Island ${String(result.island.id+1).padStart(2,"0")}`);
      callback.current({ materialId: result.materialId, islandId: result.island.id });
    };
    const contextMenu = (ev: MouseEvent) => ev.preventDefault();
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerleave", leave);
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("contextmenu", contextMenu);
    const resize = new ResizeObserver(([entry]) => {
      if (!entry.contentRect.width || !entry.contentRect.height) return;
      renderer.setSize(entry.contentRect.width, entry.contentRect.height); nav.resize(entry.contentRect.width, entry.contentRect.height);
    }); resize.observe(container);
    let frame = 0;
    const draw = () => { frame = requestAnimationFrame(draw); overlay.sync(e.hiddenFaces, selected, true, hovered); nav.orbit.update(); renderer.render(scene, nav.camera); };
    draw();
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); nav.dispose(); overlay.dispose();
      for (const part of parts) { part.geometry.dispose(); for (const mat of Array.isArray(part.material) ? part.material : [part.material]) mat.dispose(); }
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [e.model, targetMaterial]);
  return <div className="import-island-stage">
    <div ref={host} className="preview-renderer" />
    <div className="import-island-label" role="status">{label}</div>
    <ViewCube navigation={navigation} />
  </div>;
}
