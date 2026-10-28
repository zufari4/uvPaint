import { useEffect, useRef, useState } from "react";
import { Menu, Settings, HelpCircle, Info } from "lucide-react";
export function AppMenu({
  onSelect,
}: {
  onSelect: (item: "settings" | "help" | "about") => void;
}) {
  const [open, setOpen] = useState(false),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
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
            "[role=menuitem]",
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
