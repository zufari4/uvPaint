import {describe,it,expect} from "vitest";
import * as THREE from "three";
import {guideEdges,faceKey} from "../src/tools/uv-guides";
import {extractIslands} from "../src/tools/uv";
import {IslandPreview} from "../src/render/island-preview";
import type {Island} from "../src/types";
const square:Island={id:0,triangles:[[{x:0,y:0},{x:1,y:0},{x:1,y:1}],[{x:0,y:0},{x:1,y:1},{x:0,y:1}]]};
describe("UV guide topology",()=>{
  it("keeps five unique triangle edges, four contour edges and removes only the quad diagonal",()=>{
    const edges=guideEdges(square);
    expect(edges).toHaveLength(5);
    expect(edges.filter(e=>e.triangles.length===1)).toHaveLength(4);
    expect(edges.filter(e=>!e.diagonal)).toHaveLength(4);
    expect(guideEdges(square)).toBe(edges);
    const mirrored={...square,triangles:square.triangles.map(t=>t.map(p=>({x:1-p.x,y:p.y})))};
    expect(guideEdges(mirrored).filter(e=>e.diagonal)).toHaveLength(1);
  });
  it("preserves inner contours around a hole",()=>{
    const outer=[{x:0,y:0},{x:3,y:0},{x:3,y:3},{x:0,y:3}];
    const inner=[{x:1,y:1},{x:2,y:1},{x:2,y:2},{x:1,y:2}];
    const ring:Island={id:0,triangles:outer.flatMap((a,i)=>[[a,outer[(i+1)%4],inner[(i+1)%4]],[a,inner[(i+1)%4],inner[i]]])};
    expect(guideEdges(ring).filter(e=>e.triangles.length===1)).toHaveLength(8);
  });
  it("does not turn sharply bent faces into a quad",()=>{
    const bent:Island={...square,faces:[{meshId:"m",triangle:0,vertices:["a","b","c"],normal:[0,0,1]},{meshId:"m",triangle:1,vertices:["a","c","d"],normal:[1,0,0]}]};
    expect(guideEdges(bent).filter(e=>e.diagonal)).toHaveLength(0);
  });
});
describe("Island preview identity and isolation",()=>{
  it("isolates original faces across meshes without changing geometry or parts visibility",()=>{
    const material=new THREE.MeshBasicMaterial();material.userData.slotId="m";
    const a=new THREE.Mesh(new THREE.PlaneGeometry(),material),b=new THREE.Mesh(new THREE.PlaneGeometry(),material);
    const scene=new THREE.Group();scene.add(a,b);
    const originals=[a.geometry,b.geometry],indices=originals.map(g=>[...g.index!.array]);
    const islands=extractIslands(scene,"m","uv");
    expect(islands).toHaveLength(2);
    expect(islands[0].faces![0].meshId).not.toBe(islands[1].faces![0].meshId);
    const view=new IslandPreview([a,b]);
    const selected=new Set(islands[0].faces!.map(faceKey));
    const hidden=new Set(islands[1].faces!.map(faceKey));
    view.sync(hidden,selected,true);
    expect(a.geometry.index!.count).toBe(6);expect(b.geometry.index!.count).toBe(0);
    const overlay=a.children.find(c=>c.userData.uvPaintSelection) as THREE.Mesh;
    expect(overlay.geometry.index!.count).toBe(6);
    expect(view.originalFace(a,1)).toBe(1);
    const rebuilt=view.rebuilds;view.sync(hidden,selected,true);expect(view.rebuilds).toBe(rebuilt);
    expect(extractIslands(scene,"m","uv")).toHaveLength(2);
    b.visible=false;view.sync(new Set(),new Set(),false);expect(b.visible).toBe(false);
    view.dispose();expect(a.geometry).toBe(originals[0]);expect(b.geometry).toBe(originals[1]);
    originals.forEach((g,i)=>expect([...g.index!.array]).toEqual(indices[i]));
  });
});
