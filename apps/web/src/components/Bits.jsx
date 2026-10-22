// apps/web/src/components/Bits.jsx
// Small shared pieces of the Daun design language: status chips, scientific names,
// tag IDs, filter pills, popups, empty states, the sensor sparkline, avatars and password boxes.
import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import { initials, label } from "../../../shared/utils.js";
import { STATUS_TEXT } from "../../../shared/tokens.js";

// Password box with an eye button that shows or hides what was typed.
export function PasswordInput(props) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="pwfield">
      <input {...props} type={visible ? "text" : "password"} />
      <button type="button" className="ic" onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible}>
        <Icon name={visible ? "eyeOff" : "eye"} size={18} />
      </button>
    </span>
  );
}

// Round profile picture, or the person's initials when they have no photo.
export function Avatar({ user, large }) {
  return (
    <span className={"avatar" + (large ? " lg" : "")} aria-hidden="true">
      {user?.avatar_url ? <img src={user.avatar_url} alt="" /> : initials(user?.full_name)}
    </span>
  );
}

// Colour-coded status with a dot (approved, open, endangered, ...).
// The colour comes from STATUS_TONE in tokens.js, the same as the mobile app.
// Plain-language names for record statuses ("synced" shows as "Needs review").
export function Chip({ value, children }) {
  const key = String(value || "").replaceAll(" ", "-").replaceAll("_", "-");
  return <span className={`chip chip-${key}`}>{children || STATUS_TEXT[value] || label(value)}</span>;
}

// Scientific name: always Fraunces italic.
export function Sci({ children, block, className = "" }) {
  if (!children) return null;
  return <i className={`sci ${block ? "block " : ""}${className}`}>{children}</i>;
}

// Tag IDs, coordinates and readings: JetBrains Mono, so 0 and O never get confused.
export function Mono({ children, className = "" }) {
  return <span className={`mono ${className}`}>{children}</span>;
}

// One row of filter pills. items = [{ key, label, count? }]; the picked one is filled.
export function Pills({ items, value, onChange, label: groupLabel }) {
  return (
    <div className="pills" role="group" aria-label={groupLabel}>
      {items.map((it) => (
        <button key={it.key} type="button" className={"pill" + (value === it.key ? " on" : "")} aria-pressed={value === it.key} onClick={() => onChange(it.key)}>
          {it.label}{it.count != null && <b>{it.count}</b>}
        </button>
      ))}
    </div>
  );
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
      <div className={"pop" + (wide === "xl" ? " xl" : wide ? " wide" : "")} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
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
