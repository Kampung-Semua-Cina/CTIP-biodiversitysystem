import { useState } from "react";
import Shell from "../components/Shell.jsx";
import { Chip, Empty } from "../components/Bits.jsx";
import { useStore } from "../store.js";
import { nameOf, plantView } from "../selectors.js";
import { fmtDateTime } from "../utils.js";
import { OBS_STATUS } from "../data.js";

// A botanist's own submission history, with the status of each record.
export default function Records() {
  const { db, me } = useStore();
  const [filter, setFilter] = useState("all");

  const mine = db.observations
    .filter((o) => o.recorded_by === me.id && (filter === "all" || o.status === filter))
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at));

  return (
    <Shell seg="records">
      <h2>My records</h2>
      <div className="row wrap gap-bottom">
        {["all", ...OBS_STATUS].map((s) => (
          <button key={s} className={"pill" + (filter === s ? " on" : "")} onClick={() => setFilter(s)}>
            {s === "all" ? "All" : s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {mine.length === 0 && <Empty icon="file">No records with this status.</Empty>}
      {mine.map((o) => <RecordRow key={o.id} obs={o} />)}
    </Shell>
  );
}

function RecordRow({ obs }) {
  const { db, syncObservation, resubmit, notify } = useStore();
  const [reply, setReply] = useState("");
  const plant = plantView(db, db.plants.find((p) => p.id === obs.specimen_id));
  const lastReturn = [...db.reviews].reverse().find((r) => r.observation_id === obs.id && r.decision !== "approve");

  return (
    <article className="record">
      <header>
        <div>
          <b>{plant.name}</b>
          <small className="mute block">{plant.qr_id} · seen {fmtDateTime(obs.observed_at)} · version {obs.version}</small>
        </div>
        <Chip value={obs.status} />
      </header>

      {(obs.status === "draft" || obs.status === "queued") && (
        <div className="row">
          <p className="mute grow">{obs.status === "draft" ? "Not sent yet." : "Saved on this phone. Waiting for a signal."}</p>
          <button className="btn" onClick={() => { syncObservation(obs.id); notify("Record synced"); }}>Sync now</button>
        </div>
      )}

      {obs.status === "returned" && (
        <div className="callout">
          <p><b>{nameOf(db, lastReturn?.reviewer_id)}:</b> {lastReturn?.comment || "Please check this record."}</p>
          <label>Your reply<input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="What did you fix?" /></label>
          <button className="btn" onClick={() => { resubmit(obs.id, reply); setReply(""); notify("Record sent again"); }}>Send again</button>
        </div>
      )}

      {obs.status === "rejected" && lastReturn?.comment && <p className="mute">Reason: {lastReturn.comment}</p>}
      {obs.status === "synced" && <p className="mute">Waiting for an officer to review it.</p>}
      {obs.status === "approved" && <p className="mute">Published to the plant library.</p>}
    </article>
  );
}
