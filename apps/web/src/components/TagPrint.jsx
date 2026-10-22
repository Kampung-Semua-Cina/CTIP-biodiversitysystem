// apps/web/src/components/TagPrint.jsx
import { useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import Icon from "./Icon.jsx";
import { Chip, Modal } from "./Bits.jsx";
import { tagUrl } from "../../../shared/selectors.js";

// QR code width in millimetres. Small for twigs and pots, large for trunks and signposts.
// Medium is the default and listed first.
const SIZES = [
  { mm: 40, label: "Medium · 40 mm (recommended)" },
  { mm: 20, label: "Tiny · 20 mm" },
  { mm: 30, label: "Small · 30 mm" },
  { mm: 60, label: "Large · 60 mm" },
  { mm: 90, label: "Signpost · 90 mm" },
];
const MIN_MM = 15;
const MAX_MM = 150;
const A4 = { w: 210, h: 297, margin: 10, gap: 4 };
const PAD = 2; // white border around each tag, in mm

// Size of one printed tag (QR + optional ID line underneath), in mm.
const tagBox = (mm, caption) => {
  const font = Math.max(2.4, mm * 0.11);
  return { w: mm + PAD * 2, h: mm + PAD * 2 + (caption ? font * 1.6 : 0), font };
};

// How many tags fit on one A4 page.
const perPage = (box) => {
  const fit = (room, size) => Math.max(0, Math.floor((room + A4.gap) / (size + A4.gap)));
  return fit(A4.w - A4.margin * 2, box.w) * fit(A4.h - A4.margin * 2, box.h);
};

// Print setup for QR tags: pick the tags, their real size, and an A4 sheet or one tag per label.
// `tags` are the tags that can be picked; `initial` are the qr_ids ticked when it opens.
export default function TagPrint({ tags, initial, onClose }) {
  const [picked, setPicked] = useState(() => new Set(initial));
  const [preset, setPreset] = useState(40); // a size in SIZES, or "custom"
  const [custom, setCustom] = useState(40);
  const [layout, setLayout] = useState("label"); // label | sheet
  const [copies, setCopies] = useState(1);
  const [caption, setCaption] = useState(true);
  const [cutLines, setCutLines] = useState(true);
  const [batch, setBatch] = useState("");

  const mm = preset === "custom" ? Math.min(Math.max(Number(custom) || MIN_MM, MIN_MM), MAX_MM) : preset;
  const box = tagBox(mm, caption);
  const n = Math.min(Math.max(Number(copies) || 1, 1), 20);
  const chosen = tags.filter((t) => picked.has(t.qr_id));
  const items = chosen.flatMap((t) => Array.from({ length: n }, (_, i) => ({ key: `${t.qr_id}-${i}`, qr_id: t.qr_id })));
  const fits = perPage(box);
  const pages = layout === "label" ? items.length : Math.ceil(items.length / Math.max(fits, 1));
  const tooBig = layout === "sheet" && fits === 0;

  const batches = [...new Set(tags.map((t) => t.batch_label))];
  const listed = tags.filter((t) => !batch || t.batch_label === batch);
  const toggle = (id) => setPicked((s) => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const pickAll = (on) => setPicked((s) => { const next = new Set(s); listed.forEach((t) => (on ? next.add(t.qr_id) : next.delete(t.qr_id))); return next; });

  // Sheets print on A4 with a margin. Labels make each page exactly one tag, for label printers.
  const page = layout === "label" ? `size: ${box.w}mm ${box.h}mm; margin: 0;` : `size: A4; margin: ${A4.margin}mm;`;
  const vars = { "--qr": `${mm}mm`, "--tw": `${box.w}mm`, "--th": `${box.h}mm`, "--tf": `${box.font}mm`, "--pad": `${PAD}mm`, "--gap": `${A4.gap}mm` };

  return (
    <Modal title="Print QR tags" onClose={onClose} wide="xl">
      <div className="printsetup">
        <div>
          <div className="row between wrap">
            <h4 className="nomargin">Tags <span className="mute small">({chosen.length} picked)</span></h4>
            {batches.length > 1 && (
              <select value={batch} onChange={(e) => setBatch(e.target.value)} aria-label="Show batch">
                <option value="">All batches</option>
                {batches.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            )}
          </div>
          <div className="row wrap small">
            <button className="btn ghost small-btn" type="button" onClick={() => pickAll(true)}>Select all</button>
            <button className="btn ghost small-btn" type="button" onClick={() => pickAll(false)}>Clear</button>
          </div>
          <ul className="plain picklist">
            {listed.map((t) => (
              <li key={t.qr_id}>
                <label className="check">
                  <input type="checkbox" checked={picked.has(t.qr_id)} onChange={() => toggle(t.qr_id)} />
                  <span className="grow"><span className="mono">{t.qr_id}</span> <span className="mute small">· {t.batch_label}</span></span>
                  <Chip value={t.status} />
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <label>Tag size
            <select value={preset} onChange={(e) => setPreset(e.target.value === "custom" ? "custom" : Number(e.target.value))}>
              {SIZES.map((s) => <option key={s.mm} value={s.mm}>{s.label}</option>)}
              <option value="custom">Custom size…</option>
            </select>
          </label>
          {preset === "custom" && (
            <label>QR width in mm ({MIN_MM}-{MAX_MM})
              <input type="number" min={MIN_MM} max={MAX_MM} value={custom} onChange={(e) => setCustom(e.target.value)} />
            </label>
          )}
          <fieldset className="layoutpick">
            <legend>Layout</legend>
            <label className="check"><input type="radio" name="layout" checked={layout === "label"} onChange={() => setLayout("label")} /> One tag per label (label printer) <span className="mute small">recommended</span></label>
            <label className="check"><input type="radio" name="layout" checked={layout === "sheet"} onChange={() => setLayout("sheet")} /> A4 sheet, cut out by hand</label>
          </fieldset>
          <label>Copies of each tag<input type="number" min="1" max="20" value={copies} onChange={(e) => setCopies(e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={caption} onChange={(e) => setCaption(e.target.checked)} /> Print the tag ID under the code</label>
          {layout === "sheet" && <label className="check"><input type="checkbox" checked={cutLines} onChange={(e) => setCutLines(e.target.checked)} /> Dashed cut lines</label>}

          <div className="printpreview" style={vars} aria-hidden="true">
            <TagFace qr_id={chosen[0]?.qr_id || "NIAH-0000"} caption={caption} cut={layout === "sheet" && cutLines} />
          </div>
          <p className="mute small center">
            Actual size {box.w.toFixed(0)} × {box.h.toFixed(0)} mm (screen sizes are approximate).<br />
            {tooBig
              ? "Too big for A4. Pick a smaller size or one tag per label."
              : `${items.length} tag${items.length === 1 ? "" : "s"} · ${layout === "sheet" ? `${fits} per A4 page · ` : ""}${pages} page${pages === 1 ? "" : "s"}`}
          </p>
          <p className="mute small">In the print window, set scale to 100% (not "Fit to page") so the size stays exact.</p>
        </div>
      </div>

      <div className="row wrap formend">
        <button className="btn" disabled={!items.length || tooBig} onClick={() => window.print()}><Icon name="printer" size={18} /> Print {items.length || ""}</button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>

      {/* The sheet itself sits outside the app, so only it prints, at real size, across as many pages as needed. */}
      {createPortal(
        <div className={"tagprint " + layout} style={vars}>
          <style>{`@page { ${page} }`}</style>
          {items.map((it) => <TagFace key={it.key} qr_id={it.qr_id} caption={caption} cut={layout === "sheet" && cutLines} />)}
        </div>,
        document.body,
      )}
    </Modal>
  );
}

function TagFace({ qr_id, caption, cut }) {
  return (
    <figure className={"tagface" + (cut ? " cut" : "")}>
      <QRCodeSVG value={tagUrl(qr_id)} size={256} marginSize={1} />
      {caption && <figcaption>{qr_id}</figcaption>}
    </figure>
  );
}
