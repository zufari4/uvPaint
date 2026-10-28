import * as THREE from "three";
import { sourceGeometry } from "./mesh-source";
import { faceKey } from "../tools/uv-guides";
export class IslandPreview {
  private entries: {part:THREE.Mesh; source:THREE.BufferGeometry; display:THREE.BufferGeometry; overlay:THREE.Mesh; faces:number[]; edge:THREE.LineSegments}[]=[];
  private hidden:Set<string>|null=null;
  private selected:Set<string>|null=null;
  rebuilds=0;
  constructor(parts:THREE.Mesh[]) {
    for(const part of parts){
      const source=sourceGeometry(part), display=source.clone();
      part.geometry=display;
      const overlay=new THREE.Mesh(source.clone(),new THREE.MeshBasicMaterial({color:0x65e6bf,transparent:true,opacity:.35,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,side:THREE.DoubleSide}));
      overlay.geometry.clearGroups();overlay.geometry.setIndex([]);overlay.visible=false;overlay.raycast=()=>{};
      overlay.userData.uvPaintSelection=true;
      const edge=new THREE.LineSegments(new THREE.EdgesGeometry(display,25),new THREE.LineBasicMaterial({color:0x9fd5ca,transparent:true,opacity:.5,depthWrite:false}));
      edge.raycast=()=>{};
      part.add(overlay,edge);
      this.entries.push({part,source,display,overlay,faces:[],edge});
    }
  }
  sync(hidden:Set<string>,selected:Set<string>,edgesVisible:boolean) {
    const visibilityChanged=this.hidden!==hidden, selectionChanged=this.selected!==selected;
    for(const entry of this.entries){
      entry.edge.visible=edgesVisible;
      if(!visibilityChanged&&!selectionChanged)continue;
      const {source,display,overlay,part}=entry;
      const count=source.index?.count ?? source.getAttribute("position").count;
      const index=(i:number)=>source.index?.getX(i) ?? i;
      const overlayIndices:number[]=[];
      if(visibilityChanged){
        const visible:number[]=[];entry.faces=[];display.clearGroups();
        const groups=source.groups.length?source.groups:[{start:0,count,materialIndex:0}];
        for(const group of groups){
          const start=visible.length;
          for(let i=group.start;i<Math.min(group.start+group.count,count);i+=3){
            if(hidden.has(faceKey({meshId:part.uuid,triangle:i/3})))continue;
            visible.push(index(i),index(i+1),index(i+2));entry.faces.push(i/3);
          }
          display.addGroup(start,visible.length-start,group.materialIndex);
        }
        display.setIndex(visible);
        entry.edge.geometry.dispose();entry.edge.geometry=new THREE.EdgesGeometry(display,25);
        this.rebuilds++;
      }
      for(const face of entry.faces) if(selected.has(faceKey({meshId:part.uuid,triangle:face})))
        overlayIndices.push(index(face*3),index(face*3+1),index(face*3+2));
      overlay.geometry.setIndex(overlayIndices);overlay.visible=overlayIndices.length>0;
    }
    this.hidden=hidden;this.selected=selected;
  }
  originalFace(part:THREE.Mesh,index:number){ return this.entries.find(e=>e.part===part)?.faces[index]; }
  dispose(){for(const e of this.entries){
    e.part.geometry=e.source;e.part.remove(e.overlay,e.edge);e.display.dispose();e.overlay.geometry.dispose();
    (e.overlay.material as THREE.Material).dispose();e.edge.geometry.dispose();(e.edge.material as THREE.Material).dispose();
  }}
}
