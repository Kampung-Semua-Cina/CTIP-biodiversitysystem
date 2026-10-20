// apps/web/src/pages/Records.jsx
import { useState } from "react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import { Chip, Empty, Mono, Pills } from "../components/Bits.jsx";
import { STATUS_TEXT } from "../../../shared/tokens.js";
import { useStore } from "../../../shared/store.js";
import { nameOf, plantView } from "../../../shared/selectors.js";
import { fmtDateTime } from "../../../shared/utils.js";
import { OBS_STATUS } from "../../../shared/data.js";

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
      <div className="gap-bottom gap-top-s">
        <Pills label="Status" value={filter} onChange={setFilter}
          items={["all", ...OBS_STATUS].map((s) => ({ key: s, label: s === "all" ? "All" : STATUS_TEXT[s] || s[0].toUpperCase() + s.slice(1) }))} />
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
          <small className="mute block"><Mono>{plant.qr_id}</Mono> · seen {fmtDateTime(obs.observed_at)} · version {obs.version}</small>
        </div>
        <Chip value={obs.status} />
      </header>

      {(obs.status === "draft" || obs.status === "queued") && (
        <div className="row">
          <p className="mute grow">{obs.status === "draft" ? "Not sent yet." : "Saved on this phone. Waiting for a signal."}</p>
          <button className="btn" onClick={() => { syncObservation(obs.id); notify("Record synced"); }}><Icon name="upload" size={18} /> Sync now</button>
        </div>
      )}

      {obs.status === "returned" && (
        <div className="callout">
          <p><b>Returned by {nameOf(db, lastReturn?.reviewer_id)}:</b> {lastReturn?.comment || "Please check this record."}</p>
          <label>Your reply<input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="What did you fix?" /></label>
          <p><button className="btn" onClick={() => { resubmit(obs.id, reply); setReply(""); notify("Record sent again"); }}><Icon name="send" size={18} /> Send again</button></p>
        </div>
      )}

      {obs.status === "rejected" && lastReturn?.comment && <p className="mute">Reason: {lastReturn.comment}</p>}
      {obs.status === "synced" && <p className="mute">Waiting for an officer to review it.</p>}
      {obs.status === "approved" && <p className="mute">Published to the plant library.</p>}
    </article>
  );
}
