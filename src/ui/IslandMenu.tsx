import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEditor } from "./hooks";
export function IslandMenu() {
  const e=useEditor(), root=useRef<HTMLDivElement>(null);
  const [position,setPosition]=useState(e.islandMenu!);
  const close=()=>{e.islandMenu=null;e.emit();};
  useLayoutEffect(()=>{
    const r=root.current!.getBoundingClientRect(), p=e.islandMenu!;
    setPosition({x:Math.max(4,Math.min(p.x,window.innerWidth-r.width-4)),y:Math.max(4,Math.min(p.y,window.innerHeight-r.height-4))});
    root.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  },[e.islandMenu]);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))close();};
    document.addEventListener("pointerdown",outside,true);
    return()=>document.removeEventListener("pointerdown",outside,true);
  },[]);
  return <div ref={root} className="island-menu" role="menu" aria-label="UV island actions"
    style={{left:position.x,top:position.y}} onContextMenu={ev=>ev.preventDefault()}
    onKeyDown={ev=>{
      if(ev.key==="Escape"){ev.preventDefault();ev.stopPropagation();close();}
      const buttons=[...root.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      if(ev.key==="ArrowDown"||ev.key==="ArrowUp"){
        ev.preventDefault();const i=buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(i+(ev.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length]?.focus();
      }
    }}>
    <button role="menuitem" disabled={!e.selectedFaces.size} onClick={()=>e.setIslandVisibility("isolate")}>Hide other islands</button>
    <button role="menuitem" onClick={()=>e.setIslandVisibility("all")}>Show all islands</button>
    <button role="menuitem" disabled={!e.selectedFaces.size} onClick={()=>e.setIslandVisibility("except")}>Show all except selected</button>
  </div>;
}
