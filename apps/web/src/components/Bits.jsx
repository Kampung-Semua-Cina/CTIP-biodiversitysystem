// web/src/components/Bits.jsx
import { useEffect } from "react";
import Icon from "./Icon.jsx";
import { label } from "../utils.js";

// Colour-coded label for statuses (approved, open, endangered, ...)
export function Chip({ value, children }) {
  const key = String(value || "").replaceAll(" ", "-").replaceAll("_", "-");
  return <span className={`chip chip-${key}`}>{children || label(value)}</span>;
}

// Centered popup. Closes with the X button, a click outside, or the Escape key.
export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal" onClick={onClose}>
      <div className={"glass pop" + (wide ? " wide" : "")} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="pophead">
          <h3>{title}</h3>
          <button className="ic" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ icon = "leaf", children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <p>{children}</p>
    </div>
  );
}

// Line chart for sensor readings. `limit` draws a dashed threshold line.
export function Sparkline({ values, limit, unit, title }) {
  const w = 320;
  const h = 90;
  if (!values.length) return <Empty icon="activity">No readings yet.</Empty>;
  const all = limit == null ? values : [...values, limit];
  const lo = Math.min(...all) - 1;
  const hi = Math.max(...all) + 1;
  const x = (i) => (values.length === 1 ? w / 2 : (i / (values.length - 1)) * w);
  const y = (v) => h - ((v - lo) / (hi - lo)) * h;
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  return (
    <figure className="spark">
      <figcaption>{title}: <b>{last}{unit}</b></figcaption>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`${title}, latest ${last}${unit}`}>
        {limit != null && <line x1="0" x2={w} y1={y(limit)} y2={y(limit)} className="spark-limit" />}
        <polyline points={pts} className="spark-line" />
      </svg>
    </figure>
  );
}
