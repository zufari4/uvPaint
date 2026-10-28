import { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const desktop = window.desktop;
    if (!desktop) return;
    let active = true;
    void desktop.windowState().then((state) => {
      if (active) setMaximized(state.maximized);
    });
    const unsubscribe = desktop.onWindowState((state) =>
      setMaximized(state.maximized),
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  if (!window.desktop) return null;
  return (
    <div className="window-controls" role="group" aria-label="Window controls">
      <button
        title="Minimize window"
        onClick={() => void window.desktop!.windowAction("minimize")}
      >
        <Minus size={19} />
      </button>
      <button
        title={maximized ? "Restore window" : "Maximize window"}
        onClick={() => void window.desktop!.windowAction("maximize")}
      >
        {maximized ? <Copy size={17} /> : <Square size={17} />}
      </button>
      <button
        title="Close window"
        className="window-close"
        onClick={() => void window.desktop!.windowAction("close")}
      >
        <X size={20} />
      </button>
    </div>
  );
}
