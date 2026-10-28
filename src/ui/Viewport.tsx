import { useEffect, useRef } from "react";
import * as THREE from "three";
import { ViewportNavigation } from "./viewportNavigation";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Box, Maximize } from "lucide-react";
import { useEditor } from "./hooks";
import { Button } from "./Button";
import { ModelPartsMenu } from "./ModelPartsMenu";
export function Viewport() {
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
    const edgeObjects: THREE.LineSegments[] = [];
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
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(part.geometry, 25),
          new THREE.LineBasicMaterial({
            color: 0x9fd5ca,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
          }),
        );
        edges.userData.uvPaintEdges = true;
        part.add(edges);
        edgeObjects.push(edges);
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
      for (const edges of edgeObjects) edges.visible = e.previewEdges;
      navigation.orbit.update();
      renderer.render(scene, navigation.camera);
    };
    animate();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      navigation.dispose();
      for (const edges of edgeObjects) {
        edges.removeFromParent();
        edges.geometry.dispose();
        (edges.material as THREE.Material).dispose();
      }
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
      <div className="preview-stage">
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
        <div className="viewport-axis">
          <b className="axis-y">Y</b>
          <b className="axis-x">X</b>
          <b className="axis-z">Z</b>
          <i />
        </div>
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
