import { useEffect, useRef, useState } from "react";
import { Box, X } from "lucide-react";
import { useEditor } from "./hooks";
import { useShortcuts } from "./shortcuts";
import { Button } from "./Button";
import { TextureCanvas } from "./TextureCanvas";
import { Viewport } from "./Viewport";
import { OptionsBar } from "./OptionsBar";
import { ToolRail } from "./ToolRail";
import { SizeDialog, HelpDialog } from "./Dialogs";
import { Notice } from "./Notice";
import { ModelLoading } from "./ModelLoading";
import { SettingsDialog } from "./SettingsDialog";
import { WindowControls } from "./WindowControls";
import { AppMenu } from "./AppMenu";
import { AboutDialog } from "./AboutDialog";
import { IslandMenu } from "./IslandMenu";
import { ImageImportDialog } from "./ImageImportDialog";
import { PixelateDialog } from "./PixelateDialog";
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
      "size" | "help" | "settings" | "about" | "pixelate" | null
    >(null),
    [split, setSplit] = useState(70);
  const [expandedView, setExpandedView] = useState<"texture" | "preview" | null>(null);
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
        </div>
        {e.projectName && <span className="project-file-name" title={e.projectName}>{e.projectName}</span>}
        <div className="header-actions">
          <AppMenu onSelect={setDialog} />
          <WindowControls />
        </div>
      </header>
      <div className="material-bar" inert={!!e.modelLoading}>
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
        <div className="spacer" />
      </div>
      <main className="workspace" inert={!!e.modelLoading} aria-busy={!!e.modelLoading}>
        <ToolRail />
        <div className="workspace-content">
          <OptionsBar />
          <div className="workspace-views" data-expanded={expandedView ?? "none"} ref={workspace}>
        <div className="editor-workspace" style={{ width: `${split}%` }}>
          <div className="texture-workspace">
            <TextureCanvas expanded={expandedView === "texture"} onToggleExpand={() => setExpandedView(value => value === "texture" ? null : "texture")} />
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
        <Viewport expanded={expandedView === "preview"} onToggleExpand={() => setExpandedView(value => value === "preview" ? null : "preview")} />
          </div>
        </div>
      </main>
      <Notice />
      <ModelLoading />
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
      {dialog === "pixelate" && <PixelateDialog close={() => setDialog(null)} />}
      {dialog === "settings" && (
        <SettingsDialog
          close={() => setDialog(null)}
          openCanvas={() => setDialog("size")}
        />
      )}
    </div>
  );
}
