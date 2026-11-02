// apps/web/src/components/SendTo.jsx
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { useStore } from "../../../shared/store.js";
import { ROLE_LABEL } from "../../../shared/permissions.js";

// Tick-box drop-down: choose people, then write to them in your own email app.
// There is no API route for sending someone a message inside the site yet, so
// this opens an email already addressed and filled in. Botanists can only read
// their own profile, so they have nobody to choose and see no button.
// Send a link only: no plant data or coordinates ever go by email (threat model).
export default function SendTo({ subject, body }) {
  const { db, me } = useStore();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState([]);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.key === "Escape" || (e.type === "pointerdown" && !box.current?.contains(e.target))) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const people = db.profiles
    .filter((p) => p.id !== me?.id && p.is_active && p.email)
    .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  if (!people.length) return null;

  const toggle = (email) => setChosen(chosen.includes(email) ? chosen.filter((x) => x !== email) : [...chosen, email]);
  const href = `mailto:${chosen.join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div className="sendto" ref={box}>
      <button type="button" className="btn ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="send" size={16} /> Send to…
      </button>
      {open && (
        <div className="popover">
          <p className="overline">Send to</p>
          <ul>
            {people.map((p) => (
              <li key={p.id}>
                <label className="check">
                  <input type="checkbox" checked={chosen.includes(p.email)} onChange={() => toggle(p.email)} />
                  <span>{p.full_name || p.email} <small className="mute block">{ROLE_LABEL[p.role]}</small></span>
                </label>
              </li>
            ))}
          </ul>
          {chosen.length > 0
            ? <a className="btn" href={href} onClick={() => setOpen(false)}><Icon name="send" size={16} /> Email {chosen.length} {chosen.length === 1 ? "person" : "people"}</a>
            : <p className="mute small">Tick at least one person.</p>}
        </div>
      )}
    </div>
  );
}
