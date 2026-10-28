import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/** Blender-style navigation in glTF's Y-up coordinate system. */
export class ViewportNavigation {
  readonly perspective = new THREE.PerspectiveCamera(35, 1, 0.01, 10000);
  readonly orthographic = new THREE.OrthographicCamera(
    -1,
    1,
    1,
    -1,
    0.01,
    10000,
  );
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = this.perspective;
  readonly orbit: OrbitControls;
  private aspect = 1;
  private hovered = false;

  constructor(
    private element: HTMLCanvasElement,
    private frame: () => void,
  ) {
    this.camera.position.set(4, 2, 5);
    this.orbit = new OrbitControls(this.camera, element);
    this.orbit.mouseButtons = { MIDDLE: THREE.MOUSE.ROTATE };
    element.tabIndex = 0;
    element.setAttribute("aria-label", "3D viewport");
    element.addEventListener("pointerdown", this.pointerDown, true);
    element.addEventListener("pointerenter", this.enter);
    element.addEventListener("pointerleave", this.leave);
    window.addEventListener("keydown", this.keyDown, true);
  }
  private enter = () => {
    this.hovered = true;
  };
  private leave = () => {
    this.hovered = false;
  };
  private pointerDown = (event: PointerEvent) => {
    this.element.focus({ preventScroll: true });
    this.orbit.mouseButtons.MIDDLE =
      event.ctrlKey && !event.shiftKey ? THREE.MOUSE.DOLLY : THREE.MOUSE.ROTATE;
  };
  resize(width: number, height: number) {
    this.aspect = width / Math.max(height, 1);
    this.perspective.aspect = this.aspect;
    const halfHeight = (this.orthographic.top - this.orthographic.bottom) / 2;
    this.orthographic.left = -halfHeight * this.aspect;
    this.orthographic.right = halfHeight * this.aspect;
    this.perspective.updateProjectionMatrix();
    this.orthographic.updateProjectionMatrix();
  }
  private switchProjection(orthographic: boolean) {
    const old = this.camera;
    const next = orthographic ? this.orthographic : this.perspective;
    if (old === next) return;
    const offset = old.position.clone().sub(this.orbit.target);
    const tangent = Math.tan(
      THREE.MathUtils.degToRad(this.perspective.fov / 2),
    );
    if (orthographic) {
      const halfHeight = offset.length() * tangent;
      this.orthographic.top = halfHeight;
      this.orthographic.bottom = -halfHeight;
      this.orthographic.left = -halfHeight * this.aspect;
      this.orthographic.right = halfHeight * this.aspect;
      this.orthographic.zoom = 1;
    } else {
      offset.setLength(
        (this.orthographic.top - this.orthographic.bottom) /
          (2 * this.orthographic.zoom * tangent),
      );
    }
    next.position.copy(this.orbit.target).add(offset);
    next.quaternion.copy(old.quaternion);
    next.near = old.near;
    next.far = old.far;
    next.updateProjectionMatrix();
    this.camera = next;
    this.orbit.object = next;
    this.orbit.update();
  }
  fit(center: THREE.Vector3, radius: number) {
    this.switchProjection(false);
    const distance =
      ((radius /
        (2 * Math.tan(THREE.MathUtils.degToRad(this.perspective.fov / 2)))) *
        1.5) /
      Math.min(this.aspect, 1);
    this.camera.position
      .copy(center)
      .add(
        new THREE.Vector3(0.8, 0.45, 1).normalize().multiplyScalar(distance),
      );
    this.camera.near = radius / 1000;
    this.camera.far = radius * 1000;
    this.camera.updateProjectionMatrix();
    this.orbit.target.copy(center);
    this.orbit.update();
  }
  private zoom(factor: number) {
    if (this.camera === this.orthographic) {
      this.orthographic.zoom *= factor;
      this.orthographic.updateProjectionMatrix();
    } else
      this.camera.position
        .sub(this.orbit.target)
        .multiplyScalar(1 / factor)
        .add(this.orbit.target);
    this.orbit.update();
  }
  private keyDown = (event: KeyboardEvent) => {
    if (
      (!this.hovered && document.activeElement !== this.element) ||
      event.defaultPrevented ||
      (event.target as HTMLElement).closest(
        "input,textarea,select,[contenteditable=true]",
      ) ||
      document.querySelector(".modal-backdrop") ||
      event.altKey ||
      event.metaKey
    )
      return;
    const code = event.code;
    const offset = this.camera.position.clone().sub(this.orbit.target);
    if (code === "Home" || code === "NumpadDecimal") this.frame();
    else if (code === "Numpad5")
      this.switchProjection(this.camera !== this.orthographic);
    else if (["Numpad1", "Numpad3", "Numpad7"].includes(code)) {
      this.switchProjection(true);
      const direction =
        code === "Numpad1"
          ? new THREE.Vector3(0, 0, 1)
          : code === "Numpad3"
            ? new THREE.Vector3(1, 0, 0)
            : new THREE.Vector3(0, 1, 0.000001);
      if (event.ctrlKey) direction.negate();
      this.camera.position
        .copy(this.orbit.target)
        .add(direction.normalize().multiplyScalar(offset.length()));
      this.orbit.update();
    } else if (code === "NumpadAdd" || code === "NumpadSubtract")
      this.zoom(code === "NumpadAdd" ? 1.2 : 1 / 1.2);
    else if (
      ["Numpad2", "Numpad4", "Numpad6", "Numpad8", "Numpad9"].includes(code)
    ) {
      const spherical = new THREE.Spherical().setFromVector3(offset),
        step = Math.PI / 12;
      if (code === "Numpad4") spherical.theta -= step;
      if (code === "Numpad6") spherical.theta += step;
      if (code === "Numpad8") spherical.phi -= step;
      if (code === "Numpad2") spherical.phi += step;
      if (code === "Numpad9") spherical.theta += Math.PI;
      spherical.makeSafe();
      this.camera.position
        .copy(this.orbit.target)
        .add(new THREE.Vector3().setFromSpherical(spherical));
      this.orbit.update();
    } else return;
    event.preventDefault();
    event.stopPropagation();
  };
  dispose() {
    this.element.removeEventListener("pointerdown", this.pointerDown, true);
    this.element.removeEventListener("pointerenter", this.enter);
    this.element.removeEventListener("pointerleave", this.leave);
    window.removeEventListener("keydown", this.keyDown, true);
    this.orbit.dispose();
  }
}
