import { X } from "lucide-react";
import { Button } from "./Button";
import { version } from "../../package.json";
export function AboutDialog({ close }: { close: () => void }) {
  return (
    <div className="modal-backdrop">
      <div
        className="modal about-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            close();
          }
        }}
      >
        <div className="modal-title">
          <h2 id="about-title">About uvPaint</h2>
          <Button autoFocus title="Close about" onClick={close}>
            <X size={18} />
          </Button>
        </div>
        <div className="about-brand">
          <img src={`${import.meta.env.BASE_URL}icon.png`} width={48} height={48} alt="" />
          <strong>uvPaint</strong>
        </div>
        <p>Version {version}</p>
        <p>Texture painting with UV guides and a live 3D preview.</p>
        <small>
          Electron · React · Three.js
          <br />
          MIT License
        </small>
      </div>
    </div>
  );
}
