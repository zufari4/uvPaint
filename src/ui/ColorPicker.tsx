import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointer } from "react";
import { createPortal } from "react-dom";

type HSV = { h: number; s: number; v: number };
const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));
export function hexToHsv(hex: string): HSV {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  const h = !d ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
export function hsvToHex({ h, s, v }: HSV) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * clamp(Math.min(k, 4 - k))) * 255).toString(16).padStart(2, "0");
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}
const rgba = (hex: string, alpha: number) =>
  `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",")},${alpha})`;

type Props = {
  label: string;
  color: string;
  alpha: number;
  onChange: (color: string, alpha: number) => void;
  className?: string;
  title?: string;
};
/** Swatch that opens a Blender-style picker: hue/saturation wheel, value and alpha sliders, hex field. */
export function ColorButton({ label, color, alpha, onChange, className = "", title }: Props) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={`color-button ${className}`}
        aria-label={label}
        title={title ?? label}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-color={color}
        data-alpha={Math.round(alpha * 100)}
        style={{ "--swatch": rgba(color, alpha) } as CSSProperties}
        onClick={() => setOpen((o) => !o)}
      />
      {open && anchor.current && (
        <ColorPopover anchor={anchor.current} label={label} color={color} alpha={alpha} onChange={onChange}
          onClose={() => setOpen(false)} />
      )}
    </>
  );
}
function ColorPopover({ anchor, label, color, alpha, onChange, onClose }: Omit<Props, "className" | "title"> & {
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // Hue and saturation survive black or grey colors, which do not encode them.
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(color));
  const [hex, setHex] = useState(color.slice(1));
  const [position, setPosition] = useState({ left: -9999, top: 0 });
  useEffect(() => {
    if (hsvToHex(hsv) !== color) { setHsv(hexToHsv(color)); setHex(color.slice(1)); }
  }, [color]);
  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect(), p = panel.current!.getBoundingClientRect();
    const right = a.right + 8 + p.width <= window.innerWidth;
    const left = right ? a.right + 8 : clamp(a.left, 8, window.innerWidth - p.width - 8);
    const top = right ? a.top : a.bottom + 6;
    setPosition({ left, top: clamp(top, 8, window.innerHeight - p.height - 8) });
  }, [anchor]);
  useEffect(() => {
    const close = (ev: Event) => {
      if (ev instanceof KeyboardEvent) {
        if (ev.key !== "Escape") return;
        ev.stopPropagation();
        onClose();
        anchor.focus();
      } else if (!panel.current?.contains(ev.target as Node) && !anchor.contains(ev.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", close, true);
    };
  }, [anchor, onClose]);
  const apply = (next: HSV, nextAlpha = alpha) => {
    setHsv(next);
    const value = hsvToHex(next);
    setHex(value.slice(1));
    onChange(value, nextAlpha);
  };
  const drag = (pick: (ev: ReactPointer<HTMLDivElement>, box: DOMRect) => void) => ({
    onPointerDown: (ev: ReactPointer<HTMLDivElement>) => {
      ev.currentTarget.setPointerCapture(ev.pointerId);
      pick(ev, ev.currentTarget.getBoundingClientRect());
    },
    onPointerMove: (ev: ReactPointer<HTMLDivElement>) => {
      if (ev.buttons & 1) pick(ev, ev.currentTarget.getBoundingClientRect());
    },
  });
  const wheel = drag((ev, box) => {
    const r = box.width / 2, dx = ev.clientX - box.left - r, dy = ev.clientY - box.top - r;
    apply({ ...hsv, h: ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, s: clamp(Math.hypot(dx, dy) / r) });
  });
  const value = drag((ev, box) => apply({ ...hsv, v: clamp(1 - (ev.clientY - box.top) / box.height) }));
  const opacity = drag((ev, box) => apply(hsv, clamp((ev.clientX - box.left) / box.width)));
  const pure = hsvToHex({ ...hsv, v: 1 }), angle = (hsv.h * Math.PI) / 180;
  return createPortal(
    <div className="color-popover" role="dialog" aria-label={`${label} picker`} ref={panel}
      style={{ left: position.left, top: position.top }}>
      <div className="color-picker-main">
        <div className="color-wheel" role="slider" aria-label="Hue and saturation" aria-valuenow={Math.round(hsv.h)} {...wheel}>
          <div className="color-wheel-shade" style={{ opacity: 1 - hsv.v }} />
          <span className="color-marker" style={{
            left: `${50 + Math.cos(angle) * hsv.s * 50}%`, top: `${50 + Math.sin(angle) * hsv.s * 50}%`,
            background: color,
          }} />
        </div>
        <div className="color-value" role="slider" aria-label="Value" aria-valuenow={Math.round(hsv.v * 100)}
          style={{ background: `linear-gradient(${pure}, #000)` }} {...value}>
          <span className="color-slider-marker" style={{ top: `${(1 - hsv.v) * 100}%` }} />
        </div>
      </div>
      <div className="color-alpha" role="slider" aria-label="Alpha" aria-valuenow={Math.round(alpha * 100)}
        style={{ "--from": rgba(color, 0), "--to": rgba(color, 1) } as CSSProperties} {...opacity}>
        <span className="color-slider-marker" style={{ left: `${alpha * 100}%` }} />
      </div>
      <div className="color-fields">
        <span className="color-compare" style={{ "--swatch": rgba(color, alpha) } as CSSProperties} />
        <label>
          Hex{" "}
          <input aria-label="Hex color" value={hex} maxLength={7} spellCheck={false}
            onChange={(ev) => {
              const text = ev.target.value.replace(/^#/, "");
              setHex(text);
              if (/^[0-9a-f]{6}$/i.test(text)) {
                const next = `#${text.toLowerCase()}`;
                setHsv(hexToHsv(next));
                onChange(next, alpha);
              }
            }} />
        </label>
        <label>
          A{" "}
          <input aria-label="Alpha percent" type="number" min="0" max="100" value={Math.round(alpha * 100)}
            onChange={(ev) => onChange(color, clamp(+ev.target.value / 100))} />{" "}
          %
        </label>
      </div>
    </div>,
    document.body,
  );
}
