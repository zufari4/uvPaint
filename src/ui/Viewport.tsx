import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ViewportNavigation } from "./viewportNavigation";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Box, Maximize } from "lucide-react";
import { useEditor } from "./hooks";
import { Button } from "./Button";
import { ModelPartsMenu } from "./ModelPartsMenu";
import { ViewCube } from "./ViewCube";
import { IslandPreview } from "../render/island-preview";
export function Viewport() {
  const [navigationState,setNavigationState]=useState<ViewportNavigation|null>(null);
  const e = useEditor(),
    host = useRef<HTMLDivElement>(null),
    fitRef = useRef<() => void>(() => {});
  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
    } catch (err) {
      e.fail(err);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0, 0);
    container.appendChild(renderer.domElement);
    renderer.domElement.dataset.testid = "preview-canvas";
    const scene = new THREE.Scene();
    const navigation = new ViewportNavigation(renderer.domElement, () =>
      fitRef.current(),
    );
    setNavigationState(navigation);
    const model = e.model;
    if (model) scene.add(model.scene);
    const pmrem = new THREE.PMREMGenerator(renderer),
      room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xc7d9ff, 0x343a45, 1));
    const light = new THREE.DirectionalLight(0xfff1de, 3);
    light.position.set(4, 7, 5);
    scene.add(light);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const islands=new IslandPreview(model?.parts ?? []);
    const box = model
      ? new THREE.Box3().setFromObject(model.scene)
      : new THREE.Box3(
          new THREE.Vector3(-1, -1, -1),
          new THREE.Vector3(1, 1, 1),
        );
    const radius = Math.max(box.getSize(new THREE.Vector3()).length(), 1),
      center = box.getCenter(new THREE.Vector3());
    light.position
      .copy(center)
      .add(new THREE.Vector3(radius, radius * 1.7, radius));
    light.target.position.copy(center);
    scene.add(light.target);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -radius;
    light.shadow.camera.right = radius;
    light.shadow.camera.top = radius;
    light.shadow.camera.bottom = -radius;
    light.shadow.camera.near = radius / 100;
    light.shadow.camera.far = radius * 6;
    light.shadow.normalBias = radius * 0.002;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 5, radius * 5),
      new THREE.ShadowMaterial({ opacity: 0.25 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(center.x, box.min.y - radius * 0.003, center.z);
    ground.receiveShadow = true;
    scene.add(ground);
    if (model) {
      for (const slot of model.slots) {
        slot.studio.envMap = environment.texture;
        slot.studio.envMapIntensity = 2.5;
        slot.studio.needsUpdate = true;
      }
      for (const part of model.parts) {
        part.castShadow = true;
        part.receiveShadow = true;
      }
    }
    let lastMode = "";
    const fit = () => {
      if (!model) return;
      const box = new THREE.Box3().setFromObject(model.scene),
        center = box.getCenter(new THREE.Vector3()),
        size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z, 0.1);
      navigation.fit(center, radius);
    };
    fitRef.current = fit;
    fit();
    const resize = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      renderer.setSize(width, height);
      navigation.resize(width, height);
    });
    resize.observe(container);
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (lastMode !== e.previewMode) {
        lastMode = e.previewMode;
        const studio = lastMode === "studio";
        ground.visible = studio;
        renderer.toneMapping = studio
          ? THREE.ACESFilmicToneMapping
          : THREE.NoToneMapping;
        renderer.toneMappingExposure = 1;
        if (model)
          for (const part of model.parts) {
            const swap = (mat: THREE.Material) => {
              const slot = model.slots.find(
                (s) => s.id === mat.userData.slotId,
              );
              return slot ? (studio ? slot.studio : slot.preview) : mat;
            };
            part.material = Array.isArray(part.material)
              ? part.material.map(swap)
              : swap(part.material);
          }
      }
      islands.sync(e.hiddenFaces,e.selectedFaces,e.previewEdges);
      navigation.orbit.update();
      renderer.render(scene, navigation.camera);
    };
    animate();
    const hitUVIsland=(event:MouseEvent, switchMaterial:boolean, selectLayer=false)=>{
      let islandId=-1;
      if(model){
        const r=renderer.domElement.getBoundingClientRect();
        const ray=new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2),navigation.camera);
        const hit=ray.intersectObjects(model.parts.filter(p=>p.visible),false)[0];
        if(hit?.faceIndex!==undefined && hit.faceIndex!==null){
          const part=hit.object as THREE.Mesh, face=islands.originalFace(part,hit.faceIndex);
          const mat=Array.isArray(part.material)?part.material[hit.face?.materialIndex??0]:part.material;
          if(mat.userData.slotId && e.activeId!==mat.userData.slotId) {
            if (!switchMaterial) return -1;
            e.selectMaterial(mat.userData.slotId);
          }
          islandId=e.doc?.islands.find(i=>i.faces?.some(f=>f.meshId===part.uuid&&f.triangle===face))?.id ?? -1;
          if (selectLayer && face !== undefined) e.selectModelFace(part.uuid, face, event.shiftKey);
        }
      }
      return islandId;
    };
    const contextMenu=(event:MouseEvent)=>{
      event.preventDefault();
      const islandId=hitUVIsland(event, !e.pickingLayerIsland);
      e.openIslandMenu(event.clientX,event.clientY,islandId);
    };
    let clickStart: { x: number; y: number; pointerId: number } | null = null;
    const pickIsland=(event:PointerEvent)=>{
      clickStart = null;
      if (event.button !== 0) return;
      if (!e.pickingLayerIsland) { clickStart={ x:event.clientX, y:event.clientY, pointerId:event.pointerId };return; }
      event.preventDefault();
      event.stopImmediatePropagation();
      e.pickLayerIsland(hitUVIsland(event, false));
    };
    const selectIsland=(event:PointerEvent)=>{
      const start=clickStart;clickStart=null;
      if (!start || event.pointerId !== start.pointerId || event.button !== 0 || e.pickingLayerIsland ||
        Math.hypot(event.clientX-start.x,event.clientY-start.y)>4) return;
      hitUVIsland(event,true,true);
    };
    const cancelClick=()=>{clickStart=null;};
    renderer.domElement.addEventListener("pointerdown",pickIsland,true);
    renderer.domElement.addEventListener("pointerup",selectIsland);
    renderer.domElement.addEventListener("pointercancel",cancelClick);
    renderer.domElement.addEventListener("contextmenu",contextMenu);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      navigation.dispose();
      renderer.domElement.removeEventListener("contextmenu",contextMenu);
      renderer.domElement.removeEventListener("pointerdown",pickIsland,true);
      renderer.domElement.removeEventListener("pointerup",selectIsland);
      renderer.domElement.removeEventListener("pointercancel",cancelClick);
      islands.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      environment.dispose();
      light.shadow.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      if (model) scene.remove(model.scene);
    };
  }, [e.model]);
  return (
    <section className="preview-pane">
      <div className="pane-heading preview-toolbar">
        <ModelPartsMenu />
        <div className="mini-actions">
          <span className="live-dot" />
          <select
            aria-label="Preview shading"
            title="Display only: PNG colors are unchanged"
            value={e.previewMode}
            onChange={(ev) => {
              e.previewMode = ev.target.value as typeof e.previewMode;
              e.emit();
            }}
          >
            <option value="unlit">Texture · Unlit</option>
            <option value="studio">Studio · Lit</option>
          </select>
          <label title="Highlight geometry edges (preview only)">
            <input
              type="checkbox"
              aria-label="Show model edges"
              checked={e.previewEdges}
              onChange={(ev) => {
                e.previewEdges = ev.target.checked;
                e.emit();
              }}
            />{" "}
            Edges
          </label>
          <Button title="Frame model" onClick={() => fitRef.current()}>
            <Maximize size={14} />
          </Button>
        </div>
      </div>
      <div className={`preview-stage ${e.pickingLayerIsland ? "picking-island" : ""}`}>
        <div className="preview-renderer" ref={host} />
        {!e.model && (
          <div className="preview-empty">
            <Box size={76} strokeWidth={0.6} />
            <h3>Your model, in real time.</h3>
            <p>
              Import a GLB with existing UVs to see
              <br />
              your texture come to life as you edit.
            </p>
            <span>NO LIGHTING · TRUE BASE COLOR</span>
          </div>
        )}
        <ViewCube navigation={navigationState} />
        {e.model && (
          <div className="model-title">
            <span className="live-dot" />
            {e.model.name}
          </div>
        )}
      </div>
    </section>
  );
}
