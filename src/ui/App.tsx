import { useEffect, useRef, useState } from "react";
import { Box, X } from "lucide-react";
import { useEditor } from "./hooks";
import { useShortcuts } from "./shortcuts";
import { Button } from "./Button";
import { TextureCanvas } from "./TextureCanvas";
import { Viewport } from "./Viewport";
import { LayersPanel } from "./LayersPanel";
import { ToolRail } from "./ToolRail";
import { SizeDialog, HelpDialog } from "./Dialogs";
import { MaterialDialog } from "./MaterialDialog";
import { Notice } from "./Notice";
import { SettingsDialog } from "./SettingsDialog";
import { WindowControls } from "./WindowControls";
import { AppMenu } from "./AppMenu";
import { AboutDialog } from "./AboutDialog";
import { IslandMenu } from "./IslandMenu";
import { ImageImportDialog } from "./ImageImportDialog";
export function App() {
  const e = useEditor();
  useShortcuts();
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--ui-text-scale",
      String(e.textScale),
    );
  }, [e.textScale]);
  const [dialog, setDialog] = useState<
      "size" | "help" | "material" | "settings" | "about" | null
    >(null),
    [split, setSplit] = useState(60);
  const workspace = useRef<HTMLDivElement>(null);
  const textureWorkspace = useRef<HTMLDivElement>(null);
  const [inspectorWidth, setInspectorWidth] = useState(300);
  const inspectorDrag = useRef<{ x: number; width: number } | null>(null);
  const resizeInspector = (width: number) =>
    setInspectorWidth(
      Math.max(
        220,
        Math.min(width, (textureWorkspace.current?.clientWidth ?? 800) - 240),
      ),
    );
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
        </div>
        <div className="header-actions">
          <AppMenu onSelect={setDialog} />
          <WindowControls />
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
          <span className="channel-swatch" />{" "}
          {e.doc?.textureUsage ?? "Base Color"}{" "}
          <span className="muted">+ Alpha</span>
        </span>
        {e.model && <select aria-label="UV set" title="Texture UV map"
          value={e.doc?.uvSet ?? "uv"} onChange={ev => e.selectUVSet(ev.target.value)}>
          {e.model.slots.find(s => s.id === e.activeId)?.uvSets.map(uv => <option key={uv} value={uv}>
            {e.doc?.uvNames?.[uv] || e.model?.slots.find(s => s.id === e.activeId)?.uvLabels[uv] || uv}
          </option>)}
        </select>}
        {e.model?.slots.find((s) => s.id === e.activeId)?.documents.length! >
          1 && (
          <select
            aria-label="Active texture"
            value={e.doc?.sourceIndex ?? -1}
            onChange={(event) => e.selectTexture(+event.target.value)}
          >
            {e.model?.slots
              .find((s) => s.id === e.activeId)
              ?.documents.map((d) => (
                <option key={d.sourceIndex ?? -1} value={d.sourceIndex ?? -1}>
                  {d.textureName} · {d.textureUsage}
                </option>
              ))}
          </select>
        )}
        <Button
          title="Material textures and transparency"
          disabled={!e.doc}
          onClick={() => setDialog("material")}
        >
          Material settings
        </Button>
        <div className="spacer" />
      </div>
      <main className="workspace" ref={workspace}>
        <div className="editor-workspace" style={{ width: `${split}%` }}>
          <ToolRail />
          <div className="texture-workspace" ref={textureWorkspace}>
            <TextureCanvas />
            <div
              className="layers-splitter"
              role="separator"
              aria-label="Resize canvas and layers panels"
              aria-orientation="vertical"
              aria-valuenow={inspectorWidth}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  resizeInspector(
                    inspectorWidth + (event.key === "ArrowLeft" ? 16 : -16),
                  );
                }
              }}
              onPointerDown={(event) => {
                inspectorDrag.current = {
                  x: event.clientX,
                  width: inspectorWidth,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (inspectorDrag.current)
                  resizeInspector(
                    inspectorDrag.current.width +
                      inspectorDrag.current.x -
                      event.clientX,
                  );
              }}
              onPointerUp={() => {
                inspectorDrag.current = null;
              }}
              onPointerCancel={() => {
                inspectorDrag.current = null;
              }}
            />
            <div
              className="inspector layers-sidebar"
              style={{ width: inspectorWidth }}
            >
              <LayersPanel />
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
      <Notice />
      {e.imageImport && <ImageImportDialog key={e.imageImport.id} source={e.imageImport} />}
      {e.islandMenu && <IslandMenu />}
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
      {dialog === "about" && <AboutDialog close={() => setDialog(null)} />}
      {dialog === "settings" && (
        <SettingsDialog
          close={() => setDialog(null)}
          openCanvas={() => setDialog("size")}
        />
      )}
      {dialog === "material" && e.doc && (
        <MaterialDialog close={() => setDialog(null)} />
      )}
    </div>
  );
}
