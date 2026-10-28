import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useEditor } from "./hooks";
import { Button } from "./Button";
export function SettingsDialog({
  close,
  openCanvas,
}: {
  close: () => void;
  openCanvas: () => void;
}) {
  const e = useEditor(),
    root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="modal-backdrop">
      <div
        className="modal settings-modal"
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            close();
          }
          if (event.key === "Tab") {
            const controls =
              root.current?.querySelectorAll<HTMLElement>("button,input");
            if (!controls?.length) return;
            const first = controls[0],
              last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="modal-title">
          <h2 id="settings-title">Program settings</h2>
          <Button title="Close settings" onClick={close}>
            <X size={18} />
          </Button>
        </div>
        <h3>Interface</h3>
        <label className="setting-row">
          <span>Text size</span>
          <input
            aria-label="Text size"
            type="range"
            min="0.8"
            max="2.2"
            step="0.05"
            value={e.textScale}
            onChange={(event) => e.setTextScale(+event.target.value)}
          />
          <output>{Math.round(e.textScale * 100)}%</output>
        </label>
        <h3>UV guides</h3>
        <label className="setting-row">
          <span>Line color</span>
          <input
            aria-label="UV line color"
            type="color"
            value={e.uvColor}
            onChange={(event) =>
              e.setUVAppearance({ uvColor: event.target.value })
            }
          />
        </label>
        <label className="setting-row">
          <span>Line opacity</span>
          <input
            aria-label="UV opacity"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={e.uvOpacity}
            onChange={(event) =>
              e.setUVAppearance({ uvOpacity: +event.target.value })
            }
          />
          <output>{Math.round(e.uvOpacity * 100)}%</output>
        </label>
        <small>Applied immediately and saved for all models.</small>
        <h3>Texture canvas</h3>
        <div className="setting-row">
          <span>
            {e.doc
              ? `${e.doc.width} × ${e.doc.height}`
              : "Create a blank texture"}
          </span>
          <Button
            title={e.doc ? "Resize texture" : "New texture"}
            onClick={openCanvas}
          >
            {e.doc ? "Resize texture" : "New texture"}
          </Button>
        </div>
      </div>
    </div>
  );
}
