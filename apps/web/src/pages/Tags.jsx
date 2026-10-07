import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import { Chip } from "../components/Bits.jsx";
import { useStore } from "../store.js";
import { tagUrl } from "../selectors.js";
import { fmtDate } from "../utils.js";

// QR tag stock (qr_tags table): make a batch, print the unused ones, retire damaged ones.
export default function Tags() {
  const { db, generateTags, retireTag, notify } = useStore();
  const [count, setCount] = useState(10);
  const [batch, setBatch] = useState("2026-10-A");

  const unused = db.tags.filter((t) => t.status === "unused");

  const make = (e) => {
    e.preventDefault();
    const n = Math.min(Math.max(Number(count) || 0, 1), 50);
    generateTags(n, batch.trim() || "batch");
    notify(`${n} new tag${n > 1 ? "s" : ""} created`);
  };

  return (
    <Shell seg="tags">
      <h2>QR tags</h2>
      <form className="row wrap" onSubmit={make}>
        <label>How many<input type="number" min="1" max="50" value={count} onChange={(e) => setCount(e.target.value)} /></label>
        <label>Batch label<input value={batch} onChange={(e) => setBatch(e.target.value)} /></label>
        <button className="btn" type="submit"><Icon name="qr" size={18} /> Create tags</button>
        <button className="btn ghost" type="button" disabled={!unused.length} onClick={() => window.print()}><Icon name="printer" size={18} /> Print unused</button>
      </form>

      <div className="tablewrap">
        <table>
          <thead><tr><th>Tag</th><th>Status</th><th>Batch</th><th>Created</th><th><span className="sr">Actions</span></th></tr></thead>
          <tbody>
            {db.tags.map((t) => (
              <tr key={t.qr_id}>
                <td>{t.qr_id}</td>
                <td><Chip value={t.status} /></td>
                <td>{t.batch_label}</td>
                <td>{fmtDate(t.created_at)}</td>
                <td className="actions">{t.status === "unused" && <button className="btn ghost small-btn" onClick={() => retireTag(t.qr_id)}>Retire</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="printsheet" aria-label="Printable tags">
        {unused.map((t) => (
          <figure key={t.qr_id}>
            <QRCodeSVG value={tagUrl(t.qr_id)} size={96} />
            <figcaption>{t.qr_id}</figcaption>
          </figure>
        ))}
      </div>
    </Shell>
  );
}
