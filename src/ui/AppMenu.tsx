import { useEffect, useRef, useState } from "react";
import { Menu, Settings, HelpCircle, Info, FolderOpen, Download, Save, SaveAll, RefreshCw } from "lucide-react";
import { useEditor } from "./hooks";
import { RecentProjectsMenu } from "./RecentProjectsMenu";
export function AppMenu({
  onSelect,
}: {
  onSelect: (item: "settings" | "help" | "about") => void;
}) {
  const e = useEditor();
  const [open, setOpen] = useState(false),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);
  return (
    <div
      className="app-menu"
      ref={root}
      onKeyDown={(event) => {
        if (!open) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
          return;
        }
        const items = [
          ...(root.current?.querySelectorAll<HTMLButtonElement>(
            ":scope > .app-menu-popover > button:not(:disabled), [data-recent-trigger]:not(:disabled)",
          ) ?? []),
        ];
        const index = items.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    items.length) %
                  items.length;
          items[next]?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        title="Application menu"
        disabled={!!e.modelLoading}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Menu size={23} />
      </button>
      {open && (
        <div
          className="app-menu-popover"
          role="menu"
          aria-label="Application menu"
        >
          <button role="menuitem" title="Open project (Ctrl+Shift+O)" disabled={e.busy}
            onClick={() => { setOpen(false); trigger.current?.focus(); void e.run(() => e.openProject()); }}>
            <FolderOpen size={18} /> Open project
          </button>
          <RecentProjectsMenu close={() => { setOpen(false);trigger.current?.focus(); }} />
          <button role="menuitem" title="Open GLB (Ctrl+O)" disabled={e.busy}
            onClick={() => { setOpen(false); trigger.current?.focus(); void e.run(() => e.openModel()); }}>
            <FolderOpen size={18} /> Open GLB
          </button>
          <button role="menuitem" disabled={e.busy || e.model?.source?.kind !== "glb"}
            onClick={() => { setOpen(false);trigger.current?.focus();void e.run(() => e.reloadModel()); }}>
            <RefreshCw size={18} /> Reload GLB
          </button>
          <button role="menuitem" title="Save project (Ctrl+S)" disabled={!e.doc || e.busy}
            onClick={() => { setOpen(false); trigger.current?.focus(); void e.run(() => e.saveProject()); }}>
            <Save size={18} /> Save project
          </button>
          <button role="menuitem" title="Save project as (Ctrl+Alt+S)" disabled={!e.doc || e.busy}
            onClick={() => { setOpen(false); trigger.current?.focus(); void e.run(() => e.saveProject(true)); }}>
            <SaveAll size={18} /> Save project as
          </button>
          <button role="menuitem" title="Export PNG (Ctrl+Shift+S)" disabled={!e.doc || e.busy}
            onClick={() => { setOpen(false); trigger.current?.focus(); void e.run(() => e.export()); }}>
            <Download size={18} /> Export PNG
          </button>
          <div className="menu-divider" role="separator" />
          {(
            [
              ["settings", Settings, "Settings"],
              ["help", HelpCircle, "Help"],
              ["about", Info, "About"],
            ] as const
          ).map(([item, Icon, label]) => (
            <button
              key={item}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
                onSelect(item);
              }}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
