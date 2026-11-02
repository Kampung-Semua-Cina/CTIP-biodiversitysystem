// apps/web/src/pages/Records.jsx
import { useState } from "react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import { Chip, Empty, Mono, Pills } from "../components/Bits.jsx";
import { STATUS_TEXT } from "../../../shared/tokens.js";
import { useStore } from "../../../shared/store.js";
import { fuzzyMatch } from "../../../shared/fuzzy.js";
import { nameOf, plantView, unfinishedPlants } from "../../../shared/selectors.js";
import { fmtDateTime } from "../../../shared/utils.js";
import { OBS_STATUS } from "../../../shared/data.js";

// A botanist's own submission history, with the status of each record.
export default function Records() {
  const { db, me } = useStore();
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [q, setQ] = useState("");

  const unfinished = unfinishedPlants(db, me?.id);
  const mine = db.observations
    .filter((o) => o.recorded_by === me?.id && (filter === "all" || o.status === filter))
    .sort((a, b) => {
      if (sort === "oldest") return (a.observed_at || "").localeCompare(b.observed_at || "");
      if (sort === "name") {
        const pa = plantView(db, db.plants.find((x) => x.id === a.specimen_id));
        const pb = plantView(db, db.plants.find((x) => x.id === b.specimen_id));
        return (pa?.name || "").localeCompare(pb?.name || "");
      }
      if (sort === "tag") {
        const pa = db.plants.find((x) => x.id === a.specimen_id);
        const pb = db.plants.find((x) => x.id === b.specimen_id);
        return (pa?.qr_id || "").localeCompare(pb?.qr_id || "");
      }
      return (b.observed_at || "").localeCompare(a.observed_at || "");
    });

  const needle = q.trim().toLowerCase();
  const filteredMine = mine.filter((o) => {
    if (!needle) return true;
    const pa = plantView(db, db.plants.find((x) => x.id === o.specimen_id));
    if (pa?.qr_id && pa.qr_id.toLowerCase().includes(needle)) return true;
    const text = [pa?.name, pa?.scientific, o.morphology, o.notes].filter(Boolean).join(" ");
    return fuzzyMatch(text, needle);
  });
  const filteredUnfinished = unfinished.filter((p) => {
    if (!needle) return true;
    if (p.qr_id && p.qr_id.toLowerCase().includes(needle)) return true;
    const text = [p.proposed_species].filter(Boolean).join(" ");
    return fuzzyMatch(text, needle);
  });

  return (
    <Shell seg="records">
      <h2>My records</h2>
      <div className="row wrap between gap-bottom gap-top-s" style={{ alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 220 }}>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search records by plant, species or tag..."
            aria-label="Search my records"
            style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--r-small, 8px)", border: "1px solid var(--line)" }}
          />
        </div>
        <Pills label="Status" value={filter} onChange={setFilter}
          items={["all", ...OBS_STATUS].map((s) => ({ key: s, label: s === "all" ? "All" : STATUS_TEXT[s] || s[0].toUpperCase() + s.slice(1) }))} />
        <label className="inline" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort my records">
            <option value="recent">Recent first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Plant name A–Z</option>
            <option value="tag">Tag ID</option>
          </select>
        </label>
      </div>

      {filteredUnfinished.length > 0 && (filter === "all" || filter === "draft") && (
        <div className="callout gap-bottom">
          <p><b>Not sent yet.</b> {filteredUnfinished.length === 1 ? "This plant was" : "These plants were"} saved, but the record did not reach the server. Finish and send to put it in the review queue.</p>
          <ul className="drafts-list">
            {filteredUnfinished.map((p) => (
              <li key={p.id} className="draft-card">
                <div className="row wrap" style={{ alignItems: "center", gap: 10 }}>
                  <Mono className="tagpill">{p.qr_id}</Mono>
                  <span style={{ fontWeight: 600, fontSize: "15px" }}>{p.proposed_species || "Unnamed plant"}</span>
                  <span className="mute small">· Draft saved</span>
                </div>
                <a className="btn small-btn" href={`#/add/${encodeURIComponent(p.qr_id)}`} style={{ whiteSpace: "nowrap" }}>
                  <Icon name="send" size={16} /> Finish and send
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {filteredMine.length === 0 && filteredUnfinished.length === 0 && (
        <Empty icon="file">{needle ? `No records match "${q}".` : "No records with this status."}</Empty>
      )}
      {filteredMine.map((o) => <RecordRow key={o.id} obs={o} />)}
    </Shell>
  );
}

function RecordRow({ obs }) {
  const { db, syncObservation, resubmit } = useStore();
  const [reply, setReply] = useState("");
  // Editable copy of the record while it is returned. Saved only by "Send again".
  const [fix, setFix] = useState({ morphology: obs.morphology || "", height_cm: obs.height_cm ?? "", notes: obs.notes || "" });
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    await fn(); // the store shows success or the reason it failed
    setBusy(false);
  };
  const sendAgain = () => run(async () => {
    const r = await resubmit(obs.id, reply, fix);
    if (r.ok) setReply("");
  });
  const set = (k) => (e) => setFix({ ...fix, [k]: e.target.value });
  // The plant can be missing for a moment while data loads, or if it was deleted.
  const plant = plantView(db, db.plants.find((p) => p.id === obs.specimen_id)) || { name: "Plant not loaded", qr_id: "-" };
  const lastReturn = [...db.reviews].reverse().find((r) => r.observation_id === obs.id && r.decision !== "approve");

  return (
    <article className="record">
      <header>
        <div>
          <b>{plant.name}</b>
          <small className="mute block"><Mono>{plant.qr_id}</Mono> · seen {fmtDateTime(obs.observed_at)} · version {obs.version}</small>
        </div>
        <Chip value={obs.status} />
      </header>

      {(obs.status === "draft" || obs.status === "queued") && (
        <div className="row">
          <p className="mute grow">{obs.status === "draft" ? "Not sent yet." : "Saved on this phone. Waiting for a signal."}</p>
          <button className="btn" disabled={busy} onClick={() => run(() => syncObservation(obs.id))}><Icon name="upload" size={18} /> {busy ? "Sending…" : "Send for review"}</button>
        </div>
      )}

      {obs.status === "returned" && (
        <div className="callout">
          <p><b>Returned by {nameOf(db, lastReturn?.reviewer_id)}:</b> {lastReturn?.comment || "Please check this record."}</p>
          <label>Appearance<textarea rows="3" value={fix.morphology} onChange={set("morphology")} /></label>
          <div className="two">
            <label>Height (cm)<input type="number" min="0" value={fix.height_cm} onChange={set("height_cm")} /></label>
            <label>Notes<input value={fix.notes} onChange={set("notes")} /></label>
          </div>
          <label>Your reply<input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="What did you fix?" /></label>
          <p><button className="btn" disabled={busy} onClick={sendAgain}><Icon name="send" size={18} /> {busy ? "Sending…" : "Send again"}</button></p>
        </div>
      )}

      {obs.status === "rejected" && lastReturn?.comment && <p className="mute">Reason: {lastReturn.comment}</p>}
      {obs.status === "synced" && <p className="mute"><Icon name="lock" size={14} /> Waiting for an officer to review it. Record edits are locked until a decision is returned.</p>}
      {obs.status === "approved" && <p className="mute">Published to the plant library.</p>}
    </article>
  );
}
