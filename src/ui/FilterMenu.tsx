import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight, Grid2x2, SlidersHorizontal } from "lucide-react";
import { useEditor } from "./hooks";

export function FilterMenu({ onSelect }: { onSelect: (item: "pixelate") => void }) {
  const e = useEditor(), id = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef(false), closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disabled = e.busy || !e.doc?.layers.length;
  const cancelClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = null; };
  const show = (focus = false) => {
    if (disabled) return;
    cancelClose(); focusOnOpen.current = focus; setOpen(true);
    if (focus) menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  };
  useEffect(() => () => cancelClose(), []);
  useEffect(() => {
    if (open && focusOnOpen.current) menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [open]);
  return <div className="submenu" onMouseEnter={() => show()} onMouseLeave={() => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      if (menu.current?.contains(document.activeElement)) trigger.current?.focus();
      setOpen(false);
    }, 150);
  }} onKeyDown={event => {
    if (event.key === "ArrowRight") {
      event.preventDefault(); event.stopPropagation(); show(true); return;
    }
    if (!open) return;
    if (event.key === "Escape" || event.key === "ArrowLeft") {
      event.preventDefault(); event.stopPropagation(); cancelClose(); setOpen(false); trigger.current?.focus();
    }
  }}>
    <button ref={trigger} role="menuitem" data-submenu-trigger aria-haspopup="menu"
      aria-expanded={open} aria-controls={id} disabled={disabled}
      title={e.doc?.layers.length ? undefined : "Open or create a texture to apply a filter"}
      onClick={() => show(true)}>
      <SlidersHorizontal size={18} /> Filter <ChevronRight className="recent-arrow" size={14} />
    </button>
    {open && <div ref={menu} id={id} className="submenu-popover" role="menu" aria-label="Filters">
      <button role="menuitem" disabled={disabled} onClick={() => onSelect("pixelate")}>
        <Grid2x2 size={18} /> Smart pixelate…
      </button>
    </div>}
  </div>;
}
