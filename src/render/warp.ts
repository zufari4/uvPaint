import * as THREE from "three";
import type { Point } from "../types";
import { canvas, context } from "../core/canvas";
import { homography, validQuad } from "../tools/homography";

const sampleRGBA = "vec4 sampleColor=texture2D(image,uv);gl_FragColor=vec4(sampleColor.a>0.0?sampleColor.rgb/sampleColor.a:vec3(0.0),sampleColor.a);";

export class WarpRenderer {
  renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
  });
  maxSize: number;
  private checkedWidth = 0;
  private checkedHeight = 0;
  private source: HTMLCanvasElement | null = null;
  private texture: THREE.CanvasTexture | null = null;
  private camera = new THREE.Camera();
  private projectiveScene = new THREE.Scene();
  private meshScene = new THREE.Scene();
  private meshPositions = new THREE.Float32BufferAttribute(new Float32Array(16 * 3), 3);
  private projectiveMaterial = new THREE.ShaderMaterial({
    uniforms: {
      image: { value: null },
      size: { value: new THREE.Vector2() },
      inverseMap: { value: new THREE.Matrix3() },
    },
    vertexShader: "void main(){gl_Position=vec4(position,1.0);}",
    fragmentShader: "uniform sampler2D image; uniform vec2 size; uniform mat3 inverseMap; void main(){vec3 q=inverseMap*vec3(gl_FragCoord.x,size.y-gl_FragCoord.y,1.0); vec2 uv=q.xy/q.z; if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0)discard;" + sampleRGBA + "}",
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  private meshMaterial = new THREE.ShaderMaterial({
    uniforms: { image: { value: null } },
    vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.0);}",
    fragmentShader: "uniform sampler2D image;varying vec2 vUv;void main(){vec2 uv=vUv;" + sampleRGBA + "}",
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  constructor() {
    this.maxSize = this.renderer.capabilities.maxTextureSize;
    this.renderer.setClearColor(0, 0);
    this.renderer.autoClear = true;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.projectiveMaterial);
    plane.frustumCulled = false;
    this.projectiveScene.add(plane);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", this.meshPositions);
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(
      Array.from({ length: 16 }, (_, i) => [(i % 4) / 3, Math.floor(i / 4) / 3]).flat(), 2,
    ));
    const indices: number[] = [];
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 3; x++) {
        const a = y * 4 + x;
        indices.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);
      }
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(geometry, this.meshMaterial);
    mesh.frustumCulled = false;
    this.meshScene.add(mesh);
  }
  check(w: number, h: number) {
    const gl = this.renderer.getContext();
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    const limit = Math.min(this.maxSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
    if (w > limit || h > limit || w > viewport[0] || h > viewport[1])
      throw new Error(
        `Requested ${w} × ${h}. This GPU supports textures/render targets up to ${limit} and viewports ${viewport[0]} × ${viewport[1]}. No automatic downscaling is performed.`,
      );
    if (gl.isContextLost())
      throw new Error("GPU context lost. Restart the app or free GPU memory.");
    this.checkedWidth = w;
    this.checkedHeight = h;
  }
  render(
    source: HTMLCanvasElement,
    points: Point[],
    kind: "perspective" | "mesh",
    w: number,
    h: number,
    target?: HTMLCanvasElement,
  ) {
    if (w !== this.checkedWidth || h !== this.checkedHeight) this.check(w, h);
    if (kind === "perspective" && !validQuad(points))
      throw new Error("Keep the four corners in a convex, non-crossing order.");
    const out = target && target.width === w && target.height === h
      ? target : canvas(w, h, false);
    const ctx = context(out);
    ctx.clearRect(0, 0, w, h);

    // Moving, rotating and scaling a parallelogram needs no projective shader
    // or GPU-to-CPU copy. Canvas handles premultiplied filtering directly.
    if (kind === "perspective" &&
      Math.abs(points[0].x + points[2].x - points[1].x - points[3].x) < 1e-6 &&
      Math.abs(points[0].y + points[2].y - points[1].y - points[3].y) < 1e-6) {
      const [a, b, , d] = points;
      ctx.save();
      ctx.setTransform(
        (b.x - a.x) / source.width, (b.y - a.y) / source.width,
        (d.x - a.x) / source.height, (d.y - a.y) / source.height, a.x, a.y,
      );
      ctx.drawImage(source, 0, 0);
      ctx.restore();
      return out;
    }

    // Transform sources are immutable. Keep the texture, shader programs and
    // geometry alive across pointer events; only uniforms/positions change.
    if (this.source !== source) {
      this.texture?.dispose();
      this.source = source;
      this.texture = new THREE.CanvasTexture(source);
      this.texture.flipY = false;
      this.texture.premultiplyAlpha = true;
      this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
      this.texture.generateMipmaps = false;
      this.texture.colorSpace = THREE.NoColorSpace;
      this.projectiveMaterial.uniforms.image.value = this.texture;
      this.meshMaterial.uniforms.image.value = this.texture;
    }
    if (this.renderer.domElement.width !== w || this.renderer.domElement.height !== h)
      this.renderer.setSize(w, h, false);
    if (kind === "perspective") {
      const inv = homography(points, [
        { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
      ]);
      this.projectiveMaterial.uniforms.size.value.set(w, h);
      this.projectiveMaterial.uniforms.inverseMap.value.set(
        ...(inv as [number, number, number, number, number, number, number, number, number]),
      );
      this.renderer.render(this.projectiveScene, this.camera);
    } else {
      points.forEach((p, i) => this.meshPositions.setXYZ(i, p.x / w * 2 - 1, 1 - p.y / h * 2, 0));
      this.meshPositions.needsUpdate = true;
      this.renderer.render(this.meshScene, this.camera);
    }
    ctx.drawImage(this.renderer.domElement, 0, 0);
    return out;
  }
}
