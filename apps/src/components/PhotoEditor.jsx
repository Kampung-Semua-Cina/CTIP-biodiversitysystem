import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import Img from "./Img.jsx";
import { nowIso, uid } from "../utils.js";

// Popup from the whiteboard sketch: upload icon on the left, close on the right,
// numbered photo cards you drag to arrange, and a Save button.
// The first card is the primary photo. Arrow buttons do the same job as dragging on a phone.
export default function PhotoEditor({ photos, onSave, onClose }) {
  const [list, setList] = useState(photos);
  const [from, setFrom] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const move = (a, b) => {
    if (a === null || b < 0 || b >= list.length || a === b) return;
    const next = [...list];
    const [item] = next.splice(a, 1);
    next.splice(b, 0, item);
    setList(next);
  };

  const add = (e) => {
    const created = nowIso();
    const added = [...e.target.files].map((f) => ({ id: uid(), observation_id: null, url: URL.createObjectURL(f), created_at: created, is_primary: false }));
    setList([...list, ...added]);
    e.target.value = "";
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="glass pop editor" role="dialog" aria-label="Arrange photos" onClick={(e) => e.stopPropagation()}>
        <div className="pophead">
          <label className="upl" title="Upload photos">
            <Icon name="upload" />
            <span className="sr">Upload photos</span>
            <input type="file" accept="image/*" multiple hidden onChange={add} />
          </label>
          <p className="hint">Drag to arrange photos</p>
          <button className="ic" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>

        <div className="cards">
          {list.map((p, k) => (
            <div
              className={"pcard" + (from === k ? " dragging" : "")}
              key={p.id}
              draggable
              onDragStart={() => setFrom(k)}
              onDragEnd={() => setFrom(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { move(from, k); setFrom(null); }}
            >
              <Img src={p.url} />
              <span className="num">{k + 1}</span>
              {k === 0 && <span className="primary-badge"><Icon name="star" size={12} /></span>}
              <div className="acts">
                <button onClick={() => move(k, k - 1)} disabled={k === 0} aria-label="Move earlier"><Icon name="chevL" size={15} /></button>
                <button onClick={() => move(k, 0)} disabled={k === 0} aria-label="Make primary"><Icon name="star" size={15} /></button>
                <button onClick={() => move(k, k + 1)} disabled={k === list.length - 1} aria-label="Move later"><Icon name="chevR" size={15} /></button>
                <button onClick={() => setList(list.filter((x) => x.id !== p.id))} disabled={list.length < 2} aria-label="Remove photo"><Icon name="trash" size={15} /></button>
              </div>
            </div>
          ))}
        </div>

        <p className="editnote">The first photo is the primary photo. If no one chooses one, the oldest photo is used.</p>
        <button className="btn" onClick={() => onSave(list.map((p, k) => ({ ...p, is_primary: k === 0 })))}>Save</button>
      </div>
    </div>
  );
}
