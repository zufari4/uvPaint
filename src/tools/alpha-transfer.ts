import * as THREE from "three";
import type { ModelAsset, TextureDocument, SourceTexture } from "../types";
import { canvas, context } from "../core/canvas";
import type { WarpRenderer } from "../render/warp";
import { sourceGeometry } from "../render/mesh-source";
// Reprojects the source alpha through geometry: target UVs determine pixel positions,
// while the source's own UV set determines sampling. It never multiplies AO into RGB.
export function transferAlpha(
  model: ModelAsset,
  doc: TextureDocument,
  source: SourceTexture,
  sourceUV: string,
  warp: WarpRenderer,
) {
  warp.check(doc.width, doc.height);
  const positions: number[] = [],
    uvs: number[] = [];
  const targetMap = model.slots.find((s) => s.id === doc.id)!.texture;
  source.texture.updateMatrix();
  targetMap.updateMatrix();
  for (const mesh of model.parts) {
    const geometry = sourceGeometry(mesh);
    const src = geometry.getAttribute(sourceUV),
      dst = geometry.getAttribute(doc.uvSet);
    const multiple = Array.isArray(mesh.material),
      materials = multiple
        ? (mesh.material as THREE.Material[])
        : [mesh.material as THREE.Material];
    if (!materials.some((m) => m.userData.slotId === doc.id)) continue;
    if (!src || !dst)
      throw new Error(
        `Mesh ${mesh.name || mesh.uuid} lacks the selected source or destination UV set.`,
      );
    const index = geometry.index,
      groups = multiple
        ? geometry.groups
        : [{ start: 0, count: index?.count ?? dst.count, materialIndex: 0 }];
    for (const group of groups) {
      if (materials[group.materialIndex ?? 0]?.userData.slotId !== doc.id)
        continue;
      for (let i = group.start; i < group.start + group.count; i++) {
        const k = index ? index.getX(i) : i;
        const p = new THREE.Vector2(dst.getX(k), dst.getY(k)).applyMatrix3(
          targetMap.matrix,
        );
        const q = new THREE.Vector2(src.getX(k), src.getY(k)).applyMatrix3(
          source.texture.matrix,
        );
        positions.push(p.x * 2 - 1, 1 - p.y * 2, 0);
        uvs.push(q.x, q.y);
      }
    }
  }
  if (!positions.length)
    throw new Error("No triangles available for alpha transfer.");
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  const texture = source.texture.clone();
  texture.flipY = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.premultiplyAlpha = false;
  texture.needsUpdate = true;
  const material = new THREE.ShaderMaterial({
    uniforms: { sourceImage: { value: texture } },
    vertexShader:
      "varying vec2 sourceUV;void main(){sourceUV=uv;gl_Position=vec4(position,1.0);}",
    fragmentShader:
      "uniform sampler2D sourceImage;varying vec2 sourceUV;void main(){gl_FragColor=vec4(1.0,1.0,1.0,texture2D(sourceImage,sourceUV).a);}",
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry, material));
  try {
    warp.renderer.setSize(doc.width, doc.height, false);
    warp.renderer.render(scene, new THREE.Camera());
    const result = canvas(doc.width, doc.height);
    context(result).drawImage(warp.renderer.domElement, 0, 0);
    return result;
  } finally {
    geometry.dispose();
    material.dispose();
    texture.dispose();
  }
}
