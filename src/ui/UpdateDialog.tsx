import { useEffect, useState } from "react";
import { X, Download, RefreshCw } from "lucide-react";
import { Button } from "./Button";
import { version } from "../../package.json";
import { openProjectPage, projectUrl } from "./AboutDialog";

const newer = (latest: string, current: string) => {
  const a = latest.split(".").map(Number), b = current.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
};

type State = { kind: "checking" } | { kind: "current"; latest: string } | { kind: "update"; latest: string; url: string } | { kind: "error"; message: string };

export function UpdateDialog({ close }: { close: () => void }) {
  const [state, setState] = useState<State>({ kind: "checking" });
  const check = () => {
    setState({ kind: "checking" });
    if (!window.desktop) { setState({ kind: "error", message: "Update checks need the desktop application." }); return; }
    window.desktop.latestRelease().then(
      (release) => setState(newer(release.version, version)
        ? { kind: "update", latest: release.version, url: release.url }
        : { kind: "current", latest: release.version }),
      (error) => setState({ kind: "error", message: error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(error) }),
    );
  };
  useEffect(check, []);
  return (
    <div className="modal-backdrop">
      <div className="modal about-modal" role="dialog" aria-modal="true" aria-labelledby="update-title"
        onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
        <div className="modal-title">
          <h2 id="update-title">Check for updates</h2>
          <Button autoFocus title="Close update check" onClick={close}><X size={18} /></Button>
        </div>
        <p>Installed version: <b>{version}</b></p>
        <p role="status">
          {state.kind === "checking" && "Checking GitHub for the latest release…"}
          {state.kind === "current" && `You have the latest version${state.latest !== version ? ` (latest release: ${state.latest})` : ""}.`}
          {state.kind === "update" && <>A new version <b>{state.latest}</b> is available.</>}
          {state.kind === "error" && state.message}
        </p>
        <div className="filter-footer">
          {state.kind === "error" && <Button title="Try again" onClick={check}><RefreshCw size={15} /> Try again</Button>}
          <div className="spacer" />
          {state.kind === "update"
            ? <button className="primary" onClick={() => openProjectPage(state.url)}><Download size={15} /> Download {state.latest}</button>
            : <button onClick={() => openProjectPage(`${projectUrl}/releases`)}>Open releases page</button>}
        </div>
      </div>
    </div>
  );
}
