// apps/web/src/pages/Review.jsx
import { useState } from "react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import Img from "../components/Img.jsx";
import { Chip, Empty, Mono, Pills, Sci } from "../components/Bits.jsx";
import { useStore } from "../../../shared/store.js";
import { nameOf, plantView } from "../../../shared/selectors.js";
import { fmtDate, fmtDateTime } from "../../../shared/utils.js";

// Which records each filter pill shows. Only "Needs review" records can be decided on;
// the others are shown so officers can look back at what they returned or decided.
const FILTERS = [
  { key: "synced", label: "Needs review", test: (o) => o.status === "synced" },
  { key: "returned", label: "Returned", test: (o) => o.status === "returned" },
  { key: "all", label: "All", test: (o) => ["synced", "returned", "approved", "rejected"].includes(o.status) },
];

// Officer review queue: records synced from the field and waiting for a decision.
export default function Review() {
  const { db } = useStore();
  const [filter, setFilter] = useState("synced");
  const [picked, setPicked] = useState(null);

  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, db.observations.filter(f.test).length]));
  const cur = FILTERS.find((f) => f.key === filter);
  const list = db.observations
    .filter(cur.test)
    // Oldest first while waiting, so nothing sits at the bottom forever; newest first otherwise.
    .sort((a, b) => (filter === "synced" ? 1 : -1) * (a.last_synced_at || a.observed_at || "").localeCompare(b.last_synced_at || b.observed_at || ""));
  const obs = list.find((o) => o.id === picked) || list[0];
  const waiting = counts.synced;

  return (
    <Shell seg="review" plain>
      <div className="pagehead">
        <div>
          <h1>Review queue</h1>
          <p className="mute">
            {waiting ? `${waiting} field ${waiting === 1 ? "record is" : "records are"} waiting for a decision.` : "Nothing is waiting for a decision."}
          </p>
        </div>
        <Pills label="Show" value={filter} onChange={(k) => { setFilter(k); setPicked(null); }}
          items={FILTERS.map((f) => ({ key: f.key, label: f.label, count: f.key === "all" ? undefined : counts[f.key] }))} />
      </div>

      {!obs ? (
        <div className="glass pad">
          <Empty icon="clipboard">{filter === "synced" ? "No records are waiting for review." : "No records here."}</Empty>
        </div>
      ) : (
        <div className="reviewgrid">
          <div className="reviewlist" role="list" aria-label="Records">
            {list.map((o) => {
              const p = plantView(db, db.plants.find((x) => x.id === o.specimen_id));
              return (
                <button key={o.id} role="listitem" className={"rqcard" + (o.id === obs.id ? " on" : "")} aria-current={o.id === obs.id ? "true" : undefined} onClick={() => setPicked(o.id)}>
                  <Img src={p.photos[0]?.url} />
                  <span>
                    <span className="name">{p.name}</span>
                    <span className="meta"><Mono>{p.qr_id}</Mono> · {nameOf(db, o.recorded_by)} · {fmtDate(o.last_synced_at || o.observed_at)}</span>
                    <Chip value={o.status} />
                  </span>
                </button>
              );
            })}
          </div>
          <ReviewDetail key={obs.id} obs={obs} />
        </div>
      )}
    </Shell>
  );
}

function ReviewDetail({ obs }) {
  const { db, reviewObservation, addComment, setPlantSpecies, notify } = useStore();
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const rawPlant = db.plants.find((p) => p.id === obs.specimen_id);
  const plant = plantView(db, rawPlant);
  const photos = rawPlant.photos.filter((p) => p.observation_id === obs.id);
  const thread = db.comments.filter((c) => c.observation_id === obs.id);
  const history = db.reviews.filter((r) => r.observation_id === obs.id);
  const species = db.species.filter((s) => !s.is_deleted);
  const open = obs.status === "synced"; // only records waiting for review can be decided

  const decide = (decision) => {
    if (decision !== "approve" && !comment.trim()) return notify("Add a note so the botanist knows why");
    if (decision === "approve" && !plant.species) return notify("Confirm the species before approving");
    reviewObservation(obs.id, decision, comment.trim());
    notify(decision === "approve" ? "Record approved and published" : decision === "return" ? "Record returned to the botanist" : "Record rejected");
  };

  return (
    <article className="glass pad rdetail" aria-label={`Record for ${plant.qr_id}`}>
      <div className="rhead">
        <div>
          <h2>{plant.name}</h2>
          {plant.species && <span className="sci block">{plant.scientific} · {plant.species.family}</span>}
        </div>
        <span className="tagpill">{plant.qr_id} · v{obs.version}</span>
      </div>

      {photos.length > 0 && (
        <div className="photo3">
          {photos.map((p, i) => <Img key={p.id} src={p.url} alt={`Photo ${i + 1} of ${photos.length}`} />)}
        </div>
      )}

      <div className="field">
        <label>
          Species {open && <span className="hint">(confirm before approving)</span>}
          <select value={rawPlant.species_id || ""} disabled={!open} onChange={(e) => setPlantSpecies(rawPlant.id, e.target.value || null)}>
            <option value="">Not confirmed</option>
            {species.map((s) => <option key={s.id} value={s.id}>{s.scientific_name}</option>)}
          </select>
        </label>
        {rawPlant.proposed_species && <p className="mute small">Botanist's guess: <Sci>{rawPlant.proposed_species}</Sci></p>}
      </div>

      <dl>
        <dt>Recorded by</dt><dd>{nameOf(db, obs.recorded_by)} · {fmtDateTime(obs.observed_at)}</dd>
        <dt>Height</dt><dd>{obs.height_cm != null ? `${obs.height_cm} cm` : "-"}</dd>
        <dt>Appearance</dt><dd>{obs.morphology || "-"}</dd>
        <dt>Notes</dt><dd>{obs.notes || "-"}</dd>
        <dt>Location</dt><dd><Mono>{rawPlant.lat.toFixed(5)}, {rawPlant.lng.toFixed(5)}</Mono> <span className="mute">±{obs.gps_accuracy_m} m</span></dd>
        <dt>Device</dt><dd><Mono>{obs.device_id}</Mono></dd>
      </dl>

      {history.length > 0 && (
        <div>
          <h3 className="overline">Earlier decisions</h3>
          <ul className="plain history gap-top-s">
            {history.map((r) => (
              <li key={r.id}><Chip value={r.decision} /> v{r.observation_ver} by {nameOf(db, r.reviewer_id)} · {fmtDateTime(r.created_at)}{r.comment && <span className="mute"> · “{r.comment}”</span>}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="overline">Comments</h3>
        <ul className="plain thread gap-top-s">
          {thread.map((c) => <li key={c.id}><b>{nameOf(db, c.author_id)}</b> {c.body}<small className="mute block">{fmtDateTime(c.created_at)}</small></li>)}
          {!thread.length && <li className="mute">No comments yet.</li>}
        </ul>
        <div className="row gap-top-s">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write a comment" aria-label="Write a comment" />
          <button className="btn ghost" onClick={() => { if (note.trim()) { addComment(obs.id, note.trim()); setNote(""); } }}><Icon name="send" size={18} /> Post</button>
        </div>
      </div>

      {open ? (
        <>
          <div className="field">
            <label>
              Note to the botanist <span className="hint">(needed to return or reject)</span>
              <textarea rows="3" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What needs to change?" />
            </label>
          </div>
          <div className="decide">
            <button className="btn" onClick={() => decide("approve")}><Icon name="check" size={18} /> Approve &amp; publish</button>
            <button className="btn ghost" onClick={() => decide("return")}><Icon name="undo" size={18} /> Return for changes</button>
            <button className="btn danger" onClick={() => decide("reject")}><Icon name="x" size={18} /> Reject</button>
          </div>
        </>
      ) : (
        <p className="mute">
          {obs.status === "returned" ? "Returned to the botanist. It comes back here when they send it again." : `This record was ${obs.status === "approved" ? "approved and published" : "rejected"}.`}
        </p>
      )}
    </article>
  );
}
