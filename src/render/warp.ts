import * as THREE from "three";
import type { Point } from "../types";
import { canvas, context } from "../core/canvas";
import { homography, validQuad } from "../tools/homography";
// Three.js supplies texture upload, framebuffer management and mesh rasterization.
// The fragment shader evaluates an inverse homography, never a two-triangle affine approximation.
export class WarpRenderer {
  renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
  });
  maxSize: number;
  constructor() {
    this.maxSize = this.renderer.capabilities.maxTextureSize;
    this.renderer.setClearColor(0, 0);
    this.renderer.autoClear = true;
  }
  check(w: number, h: number) {
    const gl = this.renderer.getContext();
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    const limit = Math.min(
      this.maxSize,
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
    );
    if (w > limit || h > limit || w > viewport[0] || h > viewport[1])
      throw new Error(
        `Requested ${w} × ${h}. This GPU supports textures/render targets up to ${limit} and viewports ${viewport[0]} × ${viewport[1]}. No automatic downscaling is performed.`,
      );
    if (this.renderer.getContext().isContextLost())
      throw new Error("GPU context lost. Restart the app or free GPU memory.");
  }
  render(
    source: HTMLCanvasElement,
    points: Point[],
    kind: "perspective" | "mesh",
    w: number,
    h: number,
  ) {
    this.check(w, h);
    if (kind === "perspective" && !validQuad(points))
      throw new Error("Keep the four corners in a convex, non-crossing order.");
    this.renderer.setSize(w, h, false);
    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    const texture = new THREE.CanvasTexture(source);
    texture.flipY = false;
    // Filter premultiplied pixels so transparent texels cannot darken cut edges.
    // The shaders convert the filtered sample back to straight RGBA for output.
    texture.premultiplyAlpha = true;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.NoColorSpace;
    let geometry: THREE.BufferGeometry;
    let material: THREE.ShaderMaterial;
    if (kind === "perspective") {
      const inv = homography(points, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ]);
      geometry = new THREE.PlaneGeometry(2, 2);
      material = new THREE.ShaderMaterial({
        uniforms: {
          image: { value: texture },
          size: { value: new THREE.Vector2(w, h) },
          inverseMap: {
            value: new THREE.Matrix3().set(
              ...(inv as [
                number,
                number,
                number,
                number,
                number,
                number,
                number,
                number,
                number,
              ]),
            ),
          },
        },
        vertexShader: "void main(){gl_Position=vec4(position,1.0);}",
        fragmentShader:
          "uniform sampler2D image; uniform vec2 size; uniform mat3 inverseMap; void main(){vec3 q=inverseMap*vec3(gl_FragCoord.x,size.y-gl_FragCoord.y,1.0); vec2 uv=q.xy/q.z; if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0)discard;vec4 sampleColor=texture2D(image,uv);gl_FragColor=vec4(sampleColor.a>0.0?sampleColor.rgb/sampleColor.a:vec3(0.0),sampleColor.a);}",
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
      });
    } else {
      const pos: number[] = [],
        uv: number[] = [],
        indices: number[] = [];
      points.forEach((p, i) => {
        pos.push((p.x / w) * 2 - 1, 1 - (p.y / h) * 2, 0);
        uv.push((i % 4) / 3, Math.floor(i / 4) / 3);
      });
      for (let y = 0; y < 3; y++)
        for (let x = 0; x < 3; x++) {
          const a = y * 4 + x;
          indices.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);
        }
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(pos, 3),
      );
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geometry.setIndex(indices);
      material = new THREE.ShaderMaterial({
        uniforms: { image: { value: texture } },
        vertexShader:
          "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.0);}",
        fragmentShader:
          "uniform sampler2D image;varying vec2 vUv;void main(){vec4 sampleColor=texture2D(image,vUv);gl_FragColor=vec4(sampleColor.a>0.0?sampleColor.rgb/sampleColor.a:vec3(0.0),sampleColor.a);}",
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
      });
    }
    try {
      scene.add(new THREE.Mesh(geometry, material));
      this.renderer.render(scene, camera);
      const out = canvas(w, h);
      context(out).drawImage(this.renderer.domElement, 0, 0);
      return out;
    } finally {
      texture.dispose();
      material.dispose();
      geometry.dispose();
    }
  }
}
