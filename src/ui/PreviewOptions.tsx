import { Maximize } from "lucide-react";
import { Button } from "./Button";
import { useEditor } from "./hooks";

export function PreviewOptions({ onFrameModel }: { onFrameModel: () => void }) {
  const e = useEditor();
  return (
    <div className="preview-options" role="group" aria-label="3D view options">
      <label title="Highlight geometry edges (preview only)">
        <input type="checkbox" aria-label="Show model edges" checked={e.previewEdges}
          onChange={(ev) => { e.previewEdges = ev.target.checked; e.emit(); }} />
        Edges
      </label>
      <Button title="Frame model" disabled={!e.model} onClick={onFrameModel}>
        <Maximize size={14} />
      </Button>
    </div>
  );
}
