import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight, History } from "lucide-react";
import { useEditor } from "./hooks";

export function RecentProjectsMenu({ close }: { close: () => void }) {
  const e = useEditor(), id = useId();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string; path: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef(false), closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current);closeTimer.current = null; };
  const show = (focus = false) => {
    if (e.busy) return;
    cancelClose();focusOnOpen.current = focus;setOpen(true);
    if (focus) menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  };
  useEffect(() => () => cancelClose(), []);
  useEffect(() => {
    let active = true;
    (window.desktop?.recentProjects() ?? Promise.resolve([])).then(items => {
      if (active) { setProjects(items);setLoading(false); }
    }).catch(error => { if (active) { setLoading(false);e.fail(error); } });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (open && focusOnOpen.current) menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [open, projects]);
  return <div className="recent-projects" onMouseEnter={() => show()} onMouseLeave={() => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      if (menu.current?.contains(document.activeElement)) trigger.current?.focus();
      setOpen(false);
    }, 150);
  }} onKeyDown={event => {
    if (event.key === "ArrowRight") {
      event.preventDefault();event.stopPropagation();show(true);return;
    }
    if (!open) return;
    if (event.key === "Escape" || event.key === "ArrowLeft") {
      event.preventDefault();event.stopPropagation();cancelClose();setOpen(false);trigger.current?.focus();return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();event.stopPropagation();
      const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }}>
    <button ref={trigger} role="menuitem" data-recent-trigger aria-haspopup="menu"
      aria-expanded={open} aria-controls={id} disabled={e.busy}
      onClick={() => show(true)}>
      <History size={18} /> Recent <ChevronRight className="recent-arrow" size={14} />
    </button>
    {open && <div ref={menu} id={id} className="recent-projects-popover" role="menu" aria-label="Recent projects">
      {!projects.length && <div className="recent-empty">{loading ? "Loading…" : "No recent projects"}</div>}
      {projects.map(project => <button key={project.id} role="menuitem" disabled={e.busy}
        title={project.path} onClick={() => { close();void e.run(() => e.openRecentProject(project.id, project.name)); }}>
        <span>{project.name}</span><small>{project.path}</small>
      </button>)}
    </div>}
  </div>;
}
