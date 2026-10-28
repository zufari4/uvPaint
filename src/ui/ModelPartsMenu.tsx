import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { useEditor } from "./hooks";
import { Button } from "./Button";
export function ModelPartsMenu() {
  const e = useEditor(),
    [open, setOpen] = useState(false),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement | null>(null),
    id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  useEffect(() => setOpen(false), [e.model]);
  return (
    <div className="parts-menu" ref={root}>
      <button
        ref={trigger}
        className="parts-trigger"
        title="Model parts"
        aria-expanded={open}
        aria-controls={id}
        disabled={!e.model}
        onClick={() => setOpen(!open)}
      >
        Model parts{e.model && <span>{e.model.parts.length}</span>}
        <ChevronDown size={13} />
      </button>
      {open && e.model && (
        <div
          id={id}
          className="parts-popover"
          role="group"
          aria-label="Model parts visibility"
        >
          <div className="parts-list">
            {e.model.parts.map((part, i) => (
              <Button
                key={part.uuid}
                title={`Toggle visibility: ${part.name || `Mesh ${i + 1}`}`}
                aria-pressed={part.visible}
                onClick={() => {
                  part.visible = !part.visible;
                  e.emit();
                }}
              >
                {part.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                <span>{part.name || `Mesh ${i + 1}`}</span>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
