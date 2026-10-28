import { useEffect, useRef, useState } from "react";
import {
  Box,
  FolderOpen,
  ImagePlus,
  Download,
  Undo2,
  Redo2,
  HelpCircle,
  SlidersHorizontal,
  X,
  CheckCircle2,
} from "lucide-react";
import { useEditor } from "./hooks";
import { useShortcuts } from "./shortcuts";
import { Button } from "./Button";
import { TextureCanvas } from "./TextureCanvas";
import { Viewport } from "./Viewport";
import { LayersPanel } from "./LayersPanel";
import { UVPanel } from "./UVPanel";
import { ToolRail } from "./ToolRail";
import { OptionsBar } from "./OptionsBar";
import { SizeDialog, HelpDialog } from "./Dialogs";
export function App() {
  const e = useEditor();
  useShortcuts();
  const [dialog, setDialog] = useState<"size" | "help" | null>(null),
    [split, setSplit] = useState(60);
  const workspace = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  useEffect(() => {
    const fail = (ev: ErrorEvent) => e.fail(ev.error ?? ev.message);
    const rejection = (ev: PromiseRejectionEvent) => {
      e.fail(ev.reason);
      ev.preventDefault();
    };
    window.addEventListener("error", fail);
    window.addEventListener("unhandledrejection", rejection);
    return () => {
      window.removeEventListener("error", fail);
      window.removeEventListener("unhandledrejection", rejection);
    };
  }, []);
  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">
            <Box size={22} strokeWidth={1.5} />
          </div>
          <strong>
            uv<span>paint</span>
          </strong>
          <span className="app-version">TEXTURE STUDIO</span>
        </div>
        <div className="header-actions">
          <Button
            title="Open GLB (Ctrl+O)"
            disabled={e.busy}
            onClick={() => void e.run(() => e.openModel())}
          >
            <FolderOpen size={16} /> Open GLB
          </Button>
          <Button
            title="Import image as layer"
            disabled={e.busy}
            onClick={() => void e.run(() => e.openImage())}
          >
            <ImagePlus size={16} /> Add image
          </Button>
          <Button
            title={e.doc ? "Resize texture" : "New texture"}
            onClick={() => setDialog("size")}
          >
            <SlidersHorizontal size={15} />
            {e.doc ? "Canvas" : "New texture"}
          </Button>
          <span className="divider-line" />
          <Button
            title="Undo (Ctrl+Z)"
            disabled={!e.history.undoStack.length && !e.transform}
            onClick={() => e.undo()}
          >
            <Undo2 size={17} />
          </Button>
          <Button
            title="Redo (Ctrl+Shift+Z)"
            disabled={!e.history.redoStack.length}
            onClick={() => e.redo()}
          >
            <Redo2 size={17} />
          </Button>
          <Button
            title="Keyboard shortcuts and help"
            onClick={() => setDialog("help")}
          >
            <HelpCircle size={17} />
          </Button>
          <Button
            className="primary export-button"
            title="Export PNG (Ctrl+Shift+S)"
            disabled={!e.doc || e.busy}
            onClick={() => void e.run(() => e.export())}
          >
            <Download size={16} /> Export PNG
          </Button>
        </div>
      </header>
      <div className="material-bar">
        <span className="material-label">MATERIAL</span>
        <select
          aria-label="Active material"
          value={e.activeId}
          disabled={!e.doc}
          onChange={(ev) => e.selectMaterial(ev.target.value)}
        >
          {!e.doc ? (
            <option value="">No model loaded</option>
          ) : (
            [...e.docs.values()].map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))
          )}
        </select>
        <span className="material-channel">
          <span className="channel-swatch" /> Base Color{" "}
          <span className="muted">+ Alpha</span>
        </span>
        <div className="spacer" />
        <span className="session-note">
          {e.model
            ? `${e.model.slots.length} materials · ${e.model.parts.length} meshes`
            : "LOCAL WORKSPACE"}
          <span className="muted"> / </span>{" "}
          {e.doc ? "Unsaved session" : "Ready to create"}
        </span>
      </div>
      <OptionsBar />
      <main className="workspace" ref={workspace}>
        <div className="editor-workspace" style={{ width: `${split}%` }}>
          <ToolRail />
          <div className="texture-workspace">
            <TextureCanvas />
            <div className="inspector">
              <LayersPanel />
              <UVPanel />
            </div>
          </div>
        </div>
        <div
          role="separator"
          aria-label="Resize texture and preview panels"
          aria-orientation="vertical"
          aria-valuenow={split}
          tabIndex={0}
          className="splitter"
          onKeyDown={(ev) => {
            if (ev.key === "ArrowLeft") setSplit((s) => Math.max(38, s - 2));
            if (ev.key === "ArrowRight") setSplit((s) => Math.min(76, s + 2));
          }}
          onPointerDown={(ev) => {
            dragging.current = true;
            ev.currentTarget.setPointerCapture(ev.pointerId);
          }}
          onPointerMove={(ev) => {
            if (!dragging.current) return;
            const r = workspace.current!.getBoundingClientRect();
            setSplit(
              Math.max(
                38,
                Math.min(76, ((ev.clientX - r.left) / r.width) * 100),
              ),
            );
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
        />
        <Viewport />
      </main>
      <footer className="status-bar">
        <span>
          <span className={`status-dot ${e.busy ? "busy" : ""}`} />
          {e.busy ? "Working…" : e.message}
        </span>
        <span>
          <CheckCircle2 size={12} />{" "}
          {e.doc ? "RGBA · 8-bit · sRGB" : "All files stay on this computer"}
        </span>
      </footer>
      {e.error && (
        <div className="error-toast" role="alert">
          <div>
            <strong>Could not complete the operation</strong>
            <p>{e.error}</p>
          </div>
          <Button
            title="Dismiss error"
            onClick={() => {
              e.error = "";
              e.emit();
            }}
          >
            <X size={16} />
          </Button>
        </div>
      )}
      {dialog === "size" && <SizeDialog close={() => setDialog(null)} />}{" "}
      {dialog === "help" && <HelpDialog close={() => setDialog(null)} />}
    </div>
  );
}
