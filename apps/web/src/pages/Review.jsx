// web/src/pages/Review.jsx
import { useState } from "react";
import Shell from "../components/Shell.jsx";
import Img from "../components/Img.jsx";
import { Chip, Empty } from "../components/Bits.jsx";
import { useStore } from "../store.js";
import { nameOf, plantView } from "../selectors.js";
import { fmtDateTime } from "../utils.js";

// Officer review queue: records that were synced from the field and are waiting for a decision.
export default function Review() {
  const { db } = useStore();
  const [picked, setPicked] = useState(null);

  const queue = db.observations
    .filter((o) => o.status === "synced")
    .sort((a, b) => (a.last_synced_at || "").localeCompare(b.last_synced_at || ""));
  const obs = queue.find((o) => o.id === picked) || queue[0];

  return (
    <Shell seg="review">
      <h2>Review queue</h2>
      {!obs ? (
        <Empty icon="clipboard">No records are waiting for review.</Empty>
      ) : (
        <div className="split review">
          <aside className="list">
            {queue.map((o) => {
              const p = plantView(db, db.plants.find((x) => x.id === o.specimen_id));
              return (
                <button key={o.id} className={"item" + (o.id === obs.id ? " on" : "")} onClick={() => setPicked(o.id)}>
                  <Img src={p.photos[0]?.url} />
                  <span><b>{p.name}</b><small className="mute">{p.qr_id} · v{o.version}</small></span>
                </button>
              );
            })}
          </aside>
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

  const decide = (decision) => {
    if (decision !== "approve" && !comment.trim()) return notify("Add a comment so the botanist knows why");
    if (decision === "approve" && !plant.species) return notify("Confirm the species before approving");
    reviewObservation(obs.id, decision, comment.trim());
    notify(decision === "approve" ? "Record approved" : decision === "return" ? "Record returned" : "Record rejected");
  };

  return (
    <article>
      <h3>{plant.name}</h3>
      <div className="photos-row">
        {photos.map((p) => <Img key={p.id} src={p.url} />)}
      </div>

      <label>
        Species
        <select value={rawPlant.species_id || ""} onChange={(e) => setPlantSpecies(rawPlant.id, e.target.value || null)}>
          <option value="">Not confirmed</option>
          {species.map((s) => <option key={s.id} value={s.id}>{s.scientific_name}</option>)}
        </select>
      </label>
      {rawPlant.proposed_species && <p className="mute small">Botanist's guess: {rawPlant.proposed_species}</p>}

      <dl>
        <dt>Tag</dt><dd>{plant.qr_id}</dd>
        <dt>Recorded by</dt><dd>{nameOf(db, obs.recorded_by)}</dd>
        <dt>Seen</dt><dd>{fmtDateTime(obs.observed_at)}</dd>
        <dt>Height</dt><dd>{obs.height_cm != null ? `${obs.height_cm} cm` : "-"}</dd>
        <dt>Appearance</dt><dd>{obs.morphology || "-"}</dd>
        <dt>Notes</dt><dd>{obs.notes || "-"}</dd>
        <dt>GPS</dt><dd>{rawPlant.lat.toFixed(5)}, {rawPlant.lng.toFixed(5)} (±{obs.gps_accuracy_m} m)</dd>
        <dt>Version</dt><dd>{obs.version} · {obs.device_id}</dd>
      </dl>

      {history.length > 0 && (
        <>
          <h4>Earlier decisions</h4>
          <ul className="plain">
            {history.map((r) => (
              <li key={r.id}><Chip value={r.decision} /> v{r.observation_ver} by {nameOf(db, r.reviewer_id)} · {fmtDateTime(r.created_at)}</li>
            ))}
          </ul>
        </>
      )}

      <h4>Comments</h4>
      <ul className="plain thread">
        {thread.map((c) => <li key={c.id}><b>{nameOf(db, c.author_id)}</b> {c.body}<small className="mute block">{fmtDateTime(c.created_at)}</small></li>)}
        {!thread.length && <li className="mute">No comments yet.</li>}
      </ul>
      <div className="row">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write a comment" aria-label="Write a comment" />
        <button className="btn ghost" onClick={() => { if (note.trim()) { addComment(obs.id, note.trim()); setNote(""); } }}>Post</button>
      </div>

      <h4>Decision</h4>
      <textarea rows="2" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment for the botanist (needed to return or reject)" aria-label="Decision comment" />
      <div className="row wrap gap-top-s">
        <button className="btn" onClick={() => decide("approve")}>Approve</button>
        <button className="btn ghost" onClick={() => decide("return")}>Return for changes</button>
        <button className="btn danger" onClick={() => decide("reject")}>Reject</button>
      </div>
    </article>
  );
}
