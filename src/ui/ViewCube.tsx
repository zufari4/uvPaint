import { useEffect, useRef } from "react";
import { Quaternion, Vector3 } from "three";
import type { ViewportNavigation, ViewName } from "./viewportNavigation";
const faces: {name:ViewName; label:string; normal:number[]; vertices:number[][]; color:string}[] = [
  {name:"front",label:"Front",normal:[0,0,1],vertices:[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],color:"#3b6079"},
  {name:"back",label:"Back",normal:[0,0,-1],vertices:[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]],color:"#3b6079"},
  {name:"right",label:"Right",normal:[1,0,0],vertices:[[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]],color:"#775050"},
  {name:"left",label:"Left",normal:[-1,0,0],vertices:[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]],color:"#775050"},
  {name:"top",label:"Top",normal:[0,1,0],vertices:[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]],color:"#4b6c56"},
  {name:"bottom",label:"Bottom",normal:[0,-1,0],vertices:[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]],color:"#4b6c56"},
];
export function ViewCube({navigation}:{navigation:ViewportNavigation|null}) {
  const svg=useRef<SVGSVGElement>(null), projection=useRef<HTMLButtonElement>(null), root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!navigation)return;
    let frame=0, last="";
    const draw=()=>{
      frame=requestAnimationFrame(draw);
      const cam=navigation.camera, stamp=cam.quaternion.toArray().join(",")+cam.type;
      if(stamp===last)return;last=stamp;
      const inverse=new Quaternion().copy(cam.quaternion).invert();
      for(const face of faces){
        const group=svg.current!.querySelector<SVGGElement>(`[data-face=${face.name}]`)!;
        const normal=new Vector3(...face.normal as [number,number,number]).applyQuaternion(inverse);
        group.style.display=normal.z>0.001?"":"none";
        const pts=face.vertices.map(p=>new Vector3(...p as [number,number,number]).applyQuaternion(inverse));
        group.querySelector("polygon")!.setAttribute("points",pts.map(p=>`${58+p.x*29},${58-p.y*29}`).join(" "));
        const text=group.querySelector("text")!;
        text.setAttribute("x",String(58+pts.reduce((s,p)=>s+p.x,0)/4*29));
        text.setAttribute("y",String(58-pts.reduce((s,p)=>s+p.y,0)/4*29));
      }
      projection.current!.textContent=cam===navigation.orthographic?"Ortho":"Persp";
      root.current!.dataset.projection=cam===navigation.orthographic?"orthographic":"perspective";
      root.current!.dataset.direction=cam.position.clone().sub(navigation.orbit.target).normalize().toArray().join(",");
    };draw();return()=>cancelAnimationFrame(frame);
  },[navigation]);
  return <div ref={root} className="view-cube" aria-label="View cube" onPointerDown={ev=>ev.stopPropagation()} onContextMenu={ev=>{ev.preventDefault();ev.stopPropagation();}}>
    <svg ref={svg} viewBox="0 0 116 116" aria-label="Choose camera view">
      {faces.map(face=><g key={face.name} data-face={face.name}>
        <polygon fill={face.color} role="button" tabIndex={0} aria-label={`${face.label} view`}
          onClick={()=>navigation?.setView(face.name)} onKeyDown={ev=>{if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();navigation?.setView(face.name);}}} />
        <text>{face.label}</text>
      </g>)}
    </svg>
    <div className="view-cube-actions">
      <button ref={projection} title="Toggle perspective / orthographic" disabled={!navigation} onClick={()=>navigation?.toggleProjection()}>Persp</button>
      <button title="Isometric view" disabled={!navigation} onClick={()=>navigation?.setView("isometric")}>Iso</button>
    </div>
  </div>;
}
