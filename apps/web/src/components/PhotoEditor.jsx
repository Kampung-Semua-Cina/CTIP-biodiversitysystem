// apps/web/src/components/PhotoEditor.jsx
import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import Img from "./Img.jsx";
import { CAPTION_MAX, PHOTO_MAX_MB, PHOTO_TYPES, nowIso, photoProblem, uid } from "../../../shared/utils.js";

// Popup from the whiteboard sketch: upload icon on the left, close on the right,
// numbered photo cards you drag to arrange, and a Save button.
// The first card is the primary photo. Arrow buttons do the same job as dragging on a phone.
// captions: every photo needs a caption (species catalogue). min: fewest photos the list may keep.
export default function PhotoEditor({
  photos,
  observationPhotos = [],
  onSave,
  onClose,
  captions = false,
  min = 1,
}) {
  const [list, setList] = useState(photos);
  const [from, setFrom] = useState(null);
  const [err, setErr] = useState("");
  const [showObs, setShowObs] = useState(false);

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

  const toggleObsPhoto = (obs) => {
    const exists = list.some((p) => p.url === obs.url || (p.id && obs.id && p.id === obs.id));
    if (exists) {
      if (list.length <= min) {
        return setErr(`You must keep at least ${min} photo(s).`);
      }
      setList(list.filter((p) => !(p.url === obs.url || (p.id && obs.id && p.id === obs.id))));
    } else {
      const added = {
        id: uid(),
        observation_id: obs.observation_id || null,
        url: obs.url,
        file: null,
        caption: obs.caption || (obs.plant_qr ? `Observation from ${obs.plant_qr}` : "Field observation"),
        created_at: obs.created_at || nowIso(),
        is_primary: false,
      };
      setList([...list, added]);
    }
  };

  // Files that break the rules are left out and listed in the error line; the rest are added.
  const add = (e) => {
    const created = nowIso();
    const files = [...e.target.files];
    const problems = files.map(photoProblem).filter(Boolean);
    const added = files
      .filter((f) => !photoProblem(f))
      .map((f) => ({
        id: uid(),
        observation_id: null,
        url: URL.createObjectURL(f),
        file: f,
        caption: "",
        created_at: created,
        is_primary: false,
      }));
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
      <div className="glass pop editor wide" role="dialog" aria-label="Arrange photos" onClick={(e) => e.stopPropagation()}>
        <div className="pophead" style={{ flexWrap: "wrap", gap: 10 }}>
          <div className="row wrap" style={{ alignItems: "center", gap: 8 }}>
            <label className="upl" title="Upload photos from device">
              <Icon name="upload" />
              <span className="sr">Upload photos</span>
              <input type="file" accept={PHOTO_TYPES.join(",")} multiple hidden onChange={add} />
            </label>
            {observationPhotos.length > 0 && (
              <button
                type="button"
                className={`btn ghost small-btn ${showObs ? "on" : ""}`}
                onClick={() => setShowObs(!showObs)}
                title="Select photos from field observations of this species"
              >
                <Icon name="camera" size={16} /> From observations ({observationPhotos.length})
              </button>
            )}
          </div>
          <p className="hint">Drag to arrange photos</p>
          <button className="ic" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>

        {showObs && observationPhotos.length > 0 && (
          <div className="obs-picker" style={{ margin: "14px 0", padding: "12px", borderRadius: "var(--r-card, 12px)", background: "var(--sunken)", border: "1px solid var(--line)" }}>
            <div className="row between wrap gap-bottom-s" style={{ alignItems: "center", marginBottom: 8 }}>
              <b>Field observation photos</b>
              <span className="mute small">Click any photo to add or remove it from the species display</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8, maxHeight: 220, overflowY: "auto", padding: 2 }}>
              {observationPhotos.map((obs) => {
                const isSelected = list.some((p) => p.url === obs.url || (p.id && obs.id && p.id === obs.id));
                return (
                  <button
                    key={obs.id || obs.url}
                    type="button"
                    onClick={() => toggleObsPhoto(obs)}
                    style={{
                      position: "relative",
                      aspectRatio: "1",
                      borderRadius: "var(--r-control, 8px)",
                      overflow: "hidden",
                      border: isSelected ? "3px solid var(--acc)" : "1px solid var(--line)",
                      background: "var(--surface)",
                      cursor: "pointer",
                      padding: 0,
                    }}
                    title={obs.caption || obs.plant_qr || "Observation photo"}
                  >
                    <Img src={obs.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    <span
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: "rgba(0,0,0,0.7)",
                        color: "#fff",
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 4px",
                        textAlign: "center",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {obs.plant_qr || "Observation"}
                    </span>
                    {isSelected && (
                      <span
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          background: "var(--acc)",
                          color: "var(--on-acc)",
                          borderRadius: "50%",
                          width: 22,
                          height: 22,
                          display: "grid",
                          placeItems: "center",
                          fontSize: 13,
                          fontWeight: "bold",
                        }}
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="cards">
          {list.map((p, k) => (
            <div className={captions ? "pslot" : undefined} key={p.id}>
              <div
                className={"pcard" + (from === k ? " dragging" : "")}
                draggable
                onDragStart={() => setFrom(k)}
                onDragEnd={() => setFrom(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  move(from, k);
                  setFrom(null);
                }}
              >
                <Img src={p.url} alt={p.caption || ""} />
                <span className="num">{k + 1}</span>
                <div className="acts">
                  <button onClick={() => move(k, k - 1)} disabled={k === 0} aria-label="Move earlier">
                    <Icon name="chevL" size={15} />
                  </button>
                  <button onClick={() => move(k, k + 1)} disabled={k === list.length - 1} aria-label="Move later">
                    <Icon name="chevR" size={15} />
                  </button>
                  <button
                    onClick={() => setList(list.filter((x) => x.id !== p.id))}
                    disabled={list.length <= min}
                    aria-label="Remove photo"
                  >
                    <Icon name="trash" size={15} />
                  </button>
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
