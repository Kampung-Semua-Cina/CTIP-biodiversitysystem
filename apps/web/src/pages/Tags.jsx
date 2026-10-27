// apps/web/src/pages/Tags.jsx
import { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import { Chip, Mono, Modal } from "../components/Bits.jsx";
import TagPrint from "../components/TagPrint.jsx";
import { useStore } from "../../../shared/store.js";
import { tagUrl } from "../../../shared/selectors.js";
import { download, fmtDate } from "../../../shared/utils.js";

// QR tag stock (qr_tags table): make a batch, print tags at any size, retire damaged ones,
// delete unused ones made by mistake. Each tag's QR code opens in a popup to share or print.
export default function Tags() {
  const { db, generateTags, retireTag, deleteTag, notify } = useStore();
  const [count, setCount] = useState(10);
  const [batch, setBatch] = useState("2026-10-A");
  const [viewing, setViewing] = useState(null); // tag whose QR code is open
  const [removing, setRemoving] = useState(null); // unused tag waiting for delete confirmation
  const [printing, setPrinting] = useState(null); // qr_ids ticked when the print setup opens

  const remove = () => {
    notify(deleteTag(removing.qr_id) ? `${removing.qr_id} deleted` : "Only unused tags can be deleted");
    setRemoving(null);
  };

  const unused = db.tags.filter((t) => t.status === "unused");
  const printable = db.tags.filter((t) => t.status !== "retired"); // assigned ones can be reprinted if a tag gets damaged

  const make = async (e) => {
    e.preventDefault();
    const n = Math.min(Math.max(Number(count) || 0, 1), 50);
    await generateTags(n, batch.trim() || "batch");
    notify(`${n} new tag${n > 1 ? "s" : ""} created`);
  };

  return (
    <Shell seg="tags">
      <h2>QR tags</h2>
      <form className="row wrap" onSubmit={make}>
        <label>How many<input type="number" min="1" max="50" value={count} onChange={(e) => setCount(e.target.value)} /></label>
        <label>Batch label<input value={batch} onChange={(e) => setBatch(e.target.value)} /></label>
        <button className="btn" type="submit"><Icon name="qr" size={18} /> Create tags</button>
        <button className="btn ghost" type="button" disabled={!printable.length} onClick={() => setPrinting(unused.map((t) => t.qr_id))}><Icon name="printer" size={18} /> Print tags</button>
      </form>

      <div className="tablewrap">
        <table>
          <thead><tr><th>Tag</th><th>Status</th><th>Batch</th><th>Created</th><th><span className="sr">Actions</span></th></tr></thead>
          <tbody>
            {db.tags.map((t) => (
              <tr key={t.qr_id}>
                <td><Mono>{t.qr_id}</Mono></td>
                <td><Chip value={t.status} /></td>
                <td>{t.batch_label}</td>
                <td>{fmtDate(t.created_at)}</td>
                <td className="actions">
                  <button className="btn ghost small-btn" onClick={() => setViewing(t)} aria-label={`Show QR code for ${t.qr_id}`}><Icon name="qr" size={16} /> QR</button>
                  {t.status === "unused" && (
                    <>
                      <button className="btn ghost small-btn" onClick={() => retireTag(t.qr_id)}><Icon name="x" size={16} /> Retire</button>
                      <button className="ic" onClick={() => setRemoving(t)} aria-label={`Delete ${t.qr_id}`}><Icon name="trash" size={18} /></button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewing && <TagQr tag={viewing} onClose={() => setViewing(null)} onPrint={() => { setPrinting([viewing.qr_id]); setViewing(null); }} />}
      {printing && <TagPrint tags={printable} initial={printing} onClose={() => setPrinting(null)} />}

      {removing && (
        <Modal title="Delete QR tag" onClose={() => setRemoving(null)}>
          <p>Delete <Mono>{removing.qr_id}</Mono>? It has not been put on a plant. Its number will not be used again, so throw away the sticker if it was already printed.</p>
          <div className="row">
            <button className="btn danger" onClick={remove}><Icon name="trash" size={18} /> Delete</button>
            <button className="btn ghost" onClick={() => setRemoving(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </Shell>
  );
}

// Popup with one tag's QR code, big enough to scan from the screen, plus share, save and print.
function TagQr({ tag, onClose, onPrint }) {
  const { notify } = useStore();
  const box = useRef(null);
  const url = tagUrl(tag.qr_id);

  // Draws the QR code with its tag ID underneath onto a white PNG, for sharing or saving.
  // Black on white whatever the theme, so the code always scans and prints.
  const toPng = () =>
    new Promise((resolve, reject) => {
      const svg = new XMLSerializer().serializeToString(box.current.querySelector("svg"));
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = 600;
        c.height = 680;
        const g = c.getContext("2d");
        g.fillStyle = "#fff";
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 40, 40, 520, 520);
        g.fillStyle = "#000";
        g.font = "500 44px 'JetBrains Mono', monospace"; // tag IDs are always mono
        g.textAlign = "center";
        g.fillText(tag.qr_id, 300, 630);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png");
      };
      img.onerror = reject;
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      notify("Link copied");
    } catch {
      notify("Could not copy the link");
    }
  };

  // Phones share the picture itself; browsers that cannot share files share the link; others copy it.
  const share = async () => {
    try {
      const file = new File([await toPng()], `${tag.qr_id}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], title: tag.qr_id, text: url });
      if (navigator.share) return await navigator.share({ title: tag.qr_id, url });
      await copy();
    } catch (e) {
      if (e?.name !== "AbortError") notify("Could not share this tag");
    }
  };

  const save = async () => {
    try {
      download(`${tag.qr_id}.png`, await toPng(), "image/png");
    } catch {
      notify("Could not save the picture");
    }
  };

  return (
    <Modal title={`QR tag ${tag.qr_id}`} onClose={onClose}>
      <figure className="qrbig" ref={box}>
        <QRCodeSVG value={url} size={240} marginSize={2} title={`QR code for ${tag.qr_id}`} />
        <figcaption>{tag.qr_id}</figcaption>
      </figure>
      <p className="center"><Chip value={tag.status} /> <span className="mute small">Batch {tag.batch_label}</span></p>
      <p className="mute small center breakall">{url}</p>
      <div className="row wrap center">
        <button className="btn" onClick={share}><Icon name="upload" size={16} /> Share</button>
        <button className="btn ghost" onClick={onPrint}><Icon name="printer" size={16} /> Print…</button>
        <button className="btn ghost" onClick={save}><Icon name="download" size={16} /> Save PNG</button>
        <button className="btn ghost" onClick={copy}><Icon name="file" size={16} /> Copy link</button>
      </div>
    </Modal>
  );
}
