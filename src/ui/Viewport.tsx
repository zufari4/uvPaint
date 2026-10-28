import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Box, Maximize, Eye, EyeOff, ChevronDown } from "lucide-react";
import { useEditor } from "./hooks";
import { Button } from "./Button";
export function Viewport() {
  const e = useEditor(),
    host = useRef<HTMLDivElement>(null),
    fitRef = useRef<() => void>(() => {});
  const [showParts, setShowParts] = useState(true);
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
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 10000);
    camera.position.set(4, 2, 5);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    const model = e.model;
    if (model) scene.add(model.scene);
    const fit = () => {
      if (!model) return;
      const box = new THREE.Box3().setFromObject(model.scene),
        center = box.getCenter(new THREE.Vector3()),
        size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z, 0.1);
      const distance =
        (radius / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) *
        1.5;
      camera.position
        .copy(center)
        .add(
          new THREE.Vector3(0.8, 0.45, 1).normalize().multiplyScalar(distance),
        );
      camera.near = radius / 1000;
      camera.far = radius * 1000;
      camera.updateProjectionMatrix();
      orbit.target.copy(center);
      orbit.update();
    };
    fitRef.current = fit;
    fit();
    const resize = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    });
    resize.observe(container);
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      orbit.update();
      renderer.render(scene, camera);
    };
    animate();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      orbit.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      if (model) scene.remove(model.scene);
    };
  }, [e.model]);
  return (
    <section className="preview-pane">
      <div className="pane-heading">
        <span>
          <Box size={14} /> LIVE PREVIEW
        </span>
        <div className="mini-actions">
          <span className="live-dot" />
          Unlit
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
      {e.model && (
        <div className="parts-panel">
          <button
            className="parts-header"
            onClick={() => setShowParts(!showParts)}
          >
            <ChevronDown size={13} /> MODEL PARTS{" "}
            <span>{e.model.parts.length}</span>
          </button>
          {showParts && (
            <div className="parts-list">
              {e.model.parts.map((part, i) => (
                <button
                  key={part.uuid}
                  onClick={() => {
                    part.visible = !part.visible;
                    e.emit();
                  }}
                  title="Toggle model part visibility"
                >
                  {part.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  <span>{part.name || `Mesh ${i + 1}`}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="preview-footer">
        <span>Drag to orbit</span>
        <span>Right-drag to pan</span>
        <span>Scroll to zoom</span>
      </div>
    </section>
  );
}
