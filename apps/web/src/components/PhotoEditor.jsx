// apps/web/src/components/PhotoEditor.jsx
import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import Img from "./Img.jsx";
import { CAPTION_MAX, PHOTO_MAX_MB, PHOTO_TYPES, nowIso, photoProblem, uid } from "../../../shared/utils.js";

// Popup from the whiteboard sketch: upload icon on the left, close on the right,
// numbered photo cards you drag to arrange, and a Save button.
// The first card is the primary photo. Arrow buttons do the same job as dragging on a phone.
// captions: every photo needs a caption (species catalogue). min: fewest photos the list may keep.
export default function PhotoEditor({ photos, onSave, onClose, captions = false, min = 1 }) {
  const [list, setList] = useState(photos);
  const [from, setFrom] = useState(null);
  const [err, setErr] = useState("");

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

  // Files that break the rules are left out and listed in the error line; the rest are added.
  const add = (e) => {
    const created = nowIso();
    const files = [...e.target.files];
    const problems = files.map(photoProblem).filter(Boolean);
    const added = files
      .filter((f) => !photoProblem(f))
      .map((f) => ({ id: uid(), observation_id: null, url: URL.createObjectURL(f), file: f, caption: "", created_at: created, is_primary: false }));
    setList([...list, ...added]);
    setErr(problems.join(". "));
    e.target.value = "";
  };

  const setCaption = (id, caption) => setList(list.map((p) => (p.id === id ? { ...p, caption } : p)));

  const save = () => {
    const k = captions ? list.findIndex((p) => !p.caption?.trim()) : -1;
    if (k >= 0) return setErr(`Add a caption to photo ${k + 1}`);
    onSave(list.map((p, i) => ({ ...p, is_primary: i === 0 })));
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="glass pop editor" role="dialog" aria-label="Arrange photos" onClick={(e) => e.stopPropagation()}>
        <div className="pophead">
          <label className="upl" title="Upload photos">
            <Icon name="upload" />
            <span className="sr">Upload photos</span>
            <input type="file" accept={PHOTO_TYPES.join(",")} multiple hidden onChange={add} />
          </label>
          <p className="hint">Drag to arrange photos</p>
          <button className="ic" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>

        <div className="cards">
          {list.map((p, k) => (
            <div className={captions ? "pslot" : undefined} key={p.id}>
              <div
                className={"pcard" + (from === k ? " dragging" : "")}
                draggable
                onDragStart={() => setFrom(k)}
                onDragEnd={() => setFrom(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { move(from, k); setFrom(null); }}
              >
                <Img src={p.url} alt={p.caption || ""} />
                <span className="num">{k + 1}</span>
                <div className="acts">
                  <button onClick={() => move(k, k - 1)} disabled={k === 0} aria-label="Move earlier"><Icon name="chevL" size={15} /></button>
                  <button onClick={() => move(k, k + 1)} disabled={k === list.length - 1} aria-label="Move later"><Icon name="chevR" size={15} /></button>
                  <button onClick={() => setList(list.filter((x) => x.id !== p.id))} disabled={list.length <= min} aria-label="Remove photo"><Icon name="trash" size={15} /></button>
                </div>
              </div>
              {captions && (
                <textarea
                  className="pcaption"
                  rows="2"
                  maxLength={CAPTION_MAX}
                  placeholder="Caption"
                  aria-label={`Caption for photo ${k + 1}`}
                  value={p.caption || ""}
                  onChange={(e) => setCaption(p.id, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>

        {err && <p className="editerr" role="alert">{err}</p>}
        <p className="editnote">
          JPG, PNG or WebP, up to {PHOTO_MAX_MB} MB each.{captions && " Every photo needs a caption."} The first photo is the primary photo. If no one chooses one, the oldest photo is used.
        </p>
        <button className="btn" onClick={save}>Save</button>
      </div>
    </div>
  );
}
