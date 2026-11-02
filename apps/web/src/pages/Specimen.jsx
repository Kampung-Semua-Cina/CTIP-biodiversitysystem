import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Icon from "../components/Icon.jsx";
import Img from "../components/Img.jsx";
import MiniMap from "../components/MiniMap.jsx";
import NewSpeciesButton from "../components/NewSpeciesButton.jsx";
import PhotoGallery from "../components/PhotoGallery.jsx";
import PhotoEditor from "../components/PhotoEditor.jsx";
import PublicPlant from "./PublicPlant.jsx";
import { Chip, Empty, Mono, Sci } from "../components/Bits.jsx";
import { useStore } from "../../../shared/store.js";
import { can } from "../../../shared/permissions.js";
import { lastUpdated, nameOf, plantVisits, shownCoords, tagUrl, visiblePlants } from "../../../shared/selectors.js";
import { HIDE_LOCATION_LABEL, hideLocationRule } from "../../../shared/data.js";
import { fmtDate, fmtDateTime, label } from "../../../shared/utils.js";

const height = (cm) => (cm == null ? "-" : cm >= 100 ? `${(cm / 100).toFixed(cm % 10 ? 2 : 1)} m` : `${cm} cm`);

// One tagged plant (a specimen): the page a QR tag opens.
// Tabs: Overview and Photos for everyone; Visits, Sensor and Discussion for staff.
export default function Specimen({ qr }) {
  const { db, me, role, setPlantPhotos, setPlantSpecies, setPlantLocationHidden, reviewObservation, notify } = useStore();
  const staff = can(role, "pending");
  const canReview = can(role, "review");
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [showReviewPanel, setShowReviewPanel] = useState(false);

  const plant = visiblePlants(db, role).find((p) => p.qr_id === qr);
  // Visitors are sent no plants at start-up: ask the API for this one (CTIP-33).
  if (!plant && !staff) return <PublicPlant qr={qr} />;
  if (!plant) {
    const exists = db.plants.some((p) => p.qr_id === qr && !p.is_deleted);
    return (
      <section className="glass pad prose narrow">
        <h1>{exists ? "This plant is not published yet" : "Tag not found"}</h1>
        <p>{exists ? <>Tag <Mono>{qr}</Mono> is still being checked by park officers. Its page will open here once it is approved.</> : <>There is no plant with tag <Mono>{qr}</Mono>. Check the code on the tag.</>}</p>
        <a className="btn" href="#/plants"><Icon name="leaf" size={18} /> Browse all plants</a>
      </section>
    );
  }

  const rawPlant = db.plants.find((p) => p.id === plant.id);
  const visits = plantVisits(db, plant.id, role);
  const plantObs = db.observations.filter((o) => o.specimen_id === plant.id).sort((a, b) => (b.observed_at || "").localeCompare(a.observed_at || ""));
  const pendingObs = plantObs.find((o) => o.status === "synced");
  const canEditPhotos = can(role, "editPhotos") && (role !== "botanist" || !pendingObs);
  const activeObsForReview = pendingObs || (showReviewPanel ? plantObs[0] : null);
  const speciesList = db.species.filter((s) => !s.is_deleted);

  const first = visits[visits.length - 1];
  const updated = lastUpdated(db, plant, role);
  const coords = shownCoords(plant, role);
  const node = db.nodes.find((n) => n.specimen_id === plant.id);
  const obsIds = new Set(db.observations.filter((o) => o.specimen_id === plant.id).map((o) => o.id));
  const comments = db.comments.filter((c) => obsIds.has(c.observation_id)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const siblings = plant.species ? visiblePlants(db, role).filter((p) => p.species_id === plant.species_id && p.id !== plant.id) : [];

  const tabs = [
    ["overview", "Overview"],
    staff && ["visits", `Visits`, visits.length],
    ["photos", "Photos", plant.photos.length],
    staff && node && ["sensor", "Sensor"],
    staff && ["discussion", "Discussion", comments.length],
  ].filter(Boolean);
  const active = tabs.some(([k]) => k === tab) ? tab : "overview";

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href={staff ? "#/dashboard" : "#/plants"}>{staff ? "Tagged plants" : "Plants"}</a> <span aria-hidden="true">›</span>{" "}
        {plant.species ? <a href={"#/plants/" + plant.species.id}>{plant.name}</a> : <span>{plant.name}</span>} <span aria-hidden="true">›</span>{" "}
        <Mono><span aria-current="page">{plant.qr_id}</span></Mono>
      </nav>

      <section className="glass pad tagheader">
        <Img className="tagthumb" src={plant.photos[0]?.url} alt="" />
        <div className="grow">
          {staff && (
            <p className="row wrap">
              <Chip value={plant.status} />
              {plant.species && <Chip value={plant.conservation} />}
            </p>
          )}
          <h1 className="tagid">{plant.qr_id}</h1>
          <p className="lede-s">
            {plant.species ? <a className="textlink" href={"#/plants/" + plant.species.id}>{plant.name}</a> : <b>{plant.name}</b>}
            {plant.scientific && <> · <Sci>{plant.scientific}</Sci></>}
          </p>
          <p className="mute small">
            {first ? `First recorded ${fmtDate(first.observed_at)} by ${nameOf(db, plant.registered_by)}` : `Tagged by ${nameOf(db, plant.registered_by)}`}
            {visits.length > 0 && ` · ${visits.length} ${visits.length === 1 ? "visit" : "visits"} · last visited ${fmtDate(visits[0].observed_at)}`}
            {updated && ` · last updated ${fmtDate(updated)}`}
          </p>
        </div>
        <div className="row wrap">
          {canReview && (
            <button
              type="button"
              className={`btn ${pendingObs ? "" : "ghost"}`}
              onClick={() => setShowReviewPanel(!showReviewPanel)}
            >
              <Icon name="clipboard" size={16} /> {pendingObs ? "Review record (Action needed)" : showReviewPanel ? "Hide review" : "Review tag"}
            </button>
          )}
          {coords && <a className="btn ghost" href={"#/map/" + plant.qr_id}><Icon name="pin" size={16} /> Show on map</a>}
          {can(role, "tags") && <a className="btn ghost" href="#/tags"><Icon name="printer" size={16} /> Print tags</a>}
        </div>
      </section>

      {/* Saved without its record (an earlier send failed half-way): only the botanist who tagged it can finish it. */}
      {visits.length === 0 && me?.id === plant.registered_by && can(role, "add") && (
        <div className="callout">
          <p><b>Not sent yet.</b> This plant was saved, but its record did not reach the server, so no officer can see it. Add the details and photos, then send it for review.</p>
          <p><a className="btn" href={`#/add/${encodeURIComponent(plant.qr_id)}`}><Icon name="send" size={18} /> Finish and send</a></p>
        </div>
      )}

      {/* Officer review panel displayed directly on the tag's page */}
      {canReview && (pendingObs || showReviewPanel) && activeObsForReview && (
        <OfficerReviewCard
          obs={activeObsForReview}
          rawPlant={rawPlant}
          plant={plant}
          speciesList={speciesList}
          reviewObservation={reviewObservation}
          setPlantSpecies={setPlantSpecies}
          setPlantLocationHidden={setPlantLocationHidden}
          notify={notify}
          onClose={() => setShowReviewPanel(false)}
        />
      )}

      <div className="tabs" role="tablist" aria-label="Plant sections">
        {tabs.map(([k, text, n]) => (
          <button key={k} role="tab" id={"tab-" + k} aria-selected={active === k} aria-controls="tabpanel" className={active === k ? "on" : ""} onClick={() => setTab(k)}>
            {text}{n != null && <span className="mute"> {n}</span>}
          </button>
        ))}
      </div>

      <div className="tagbody">
        <section id="tabpanel" role="tabpanel" aria-labelledby={"tab-" + active} className="tabpanel">
          {active === "overview" && (
            <div className="glass pad">
              <PhotoGallery key={plant.id} photos={plant.photos} canEdit={canEditPhotos} onEdit={() => setEditing(true)} />
              {role === "botanist" && pendingObs && (
                <p className="mute small" style={{ marginTop: 8 }}>
                  <Icon name="lock" size={14} /> Observation is pending an officer's review. Record and photo editing are locked until a decision is returned.
                </p>
              )}
              {plant.species?.description && <p className="gap-top-s">{plant.species.description}</p>}
              <dl className="gap-top-s">
                <dt>Family</dt><dd>{plant.species ? `${plant.species.family} · ${plant.species.genus}` : "Not confirmed yet"}</dd>
                <dt>Height</dt><dd>{height(plant.height_cm)}</dd>
                {plant.morphology && <><dt>Appearance</dt><dd>{plant.morphology}</dd></>}
                {plant.species?.cultural_significance && <><dt>Cultural note</dt><dd>{plant.species.cultural_significance}</dd></>}
              </dl>
            </div>
          )}

          {active === "visits" && (
            <Visits
              db={db}
              visits={visits}
              photos={plant.photos}
              rawPlant={rawPlant}
              canReview={canReview}
              speciesList={speciesList}
              reviewObservation={reviewObservation}
              setPlantSpecies={setPlantSpecies}
              notify={notify}
            />
          )}

          {active === "photos" && (
            plant.photos.length ? (
              <ul className="plain photogrid">
                {plant.photos.map((ph, i) => (
                  <li key={ph.id}>
                    <Img src={ph.url} alt={`Photo ${i + 1} of ${plant.qr_id}`} />
                    <small className="mute">{i === 0 ? "Primary · " : ""}{fmtDate(ph.created_at)}</small>
                  </li>
                ))}
              </ul>
            ) : <div className="glass pad"><Empty icon="camera">No photos yet.</Empty></div>
          )}

          {active === "sensor" && node && <Sensor db={db} node={node} />}

          {active === "discussion" && (
            <div className="glass pad">
              {!comments.length && <Empty icon="chat">No messages about this plant yet.</Empty>}
              <ul className="posts">
                {comments.map((c) => (
                  <li key={c.id} className="post">
                    <header><b>{nameOf(db, c.author_id)}</b><small className="mute">{fmtDateTime(c.created_at)}</small></header>
                    <p>{c.body}</p>
                  </li>
                ))}
              </ul>
              {can(role, "discuss") && visits[0] && <a className="btn ghost" href={"#/discussion/" + (comments.at(-1)?.observation_id || visits[0].id)}><Icon name="chat" size={16} /> Open in Discussion</a>}
            </div>
          )}
        </section>

        <aside className="tagside">
          <section className="glass pad">
            <h2>Location</h2>
            {coords ? (
              <>
                <MiniMap points={[{ p: plant, c: coords }]} height={150} highlight={plant.qr_id} label={`Location of ${plant.qr_id}`} />
                <p className="gap-top-s"><Mono>{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</Mono></p>
                {plant.location_reduced
                  ? <p className="mute small">Approximate area, about 1.1 km across. The exact spot is protected.</p>
                  : plant.gps_accuracy_m != null && <p className="mute small">GPS accuracy ±{plant.gps_accuracy_m} m</p>}
                {canReview && (
                  <label className="check hidespot gap-top-s">
                    <input
                      type="checkbox"
                      checked={plant.endangered}
                      disabled={hideLocationRule(plant.species?.conservation_status).locked}
                      onChange={(e) => setPlantLocationHidden(plant.id, e.target.checked)}
                    />
                    <span>
                      {HIDE_LOCATION_LABEL}
                      <small className="mute block">{hideLocationRule(plant.species?.conservation_status).hint}</small>
                    </span>
                  </label>
                )}
              </>
            ) : (
              <p className="mute">{plant.lat == null ? "Location not captured when this plant was recorded." : "Hidden to protect this plant."}</p>
            )}
          </section>
          {staff && (
            <section className="glass pad">
              <h2>QR tag</h2>
              <div className="qrbox">
                <div className="qrwhite"><QRCodeSVG value={tagUrl(plant.qr_id)} size={76} /></div>
                <p className="mute small">Scanning this tag opens this page.</p>
              </div>
            </section>
          )}
          {plant.species && (
            <section className="glass pad">
              <h2>Same species</h2>
              <p className="mute">{siblings.length ? `${siblings.length} other tagged ${plant.name} ${siblings.length === 1 ? "plant" : "plants"} in the park.` : `This is the only tagged ${plant.name} so far.`}</p>
              <a className="textlink" href={"#/plants/" + plant.species.id}>About this species <Icon name="arrowR" size={16} /></a>
            </section>
          )}
          {staff && node && (
            <section className={"glass pad" + (node.status === "active" ? "" : " dashedcard")}>
              <h2>Sensor node</h2>
              <p className="mute">{node.name} is attached to this plant. {node.status === "active" ? `Last reading ${fmtDateTime(node.last_seen)}.` : `It has been ${node.status} since ${fmtDate(node.last_seen)}.`}</p>
            </section>
          )}
        </aside>
      </div>

      {editing && (
        <PhotoEditor
          photos={plant.photos}
          onClose={() => setEditing(false)}
          onSave={(list) => { setPlantPhotos(plant.id, list); setEditing(false); notify("Photos saved"); }}
        />
      )}
    </>
  );
}

// Inline review card on the tag's page for officers
function OfficerReviewCard({ obs, rawPlant, plant, speciesList, reviewObservation, setPlantSpecies, setPlantLocationHidden, notify, onClose }) {
  const [comment, setComment] = useState("");
  const [hideChoice, setHideChoice] = useState(null); // null until the officer changes it
  const isPending = obs.status === "synced";
  const hideRule = hideLocationRule(plant.species?.conservation_status, rawPlant?.endangered_override, hideChoice);

  const handleDecide = async (decision) => {
    if (decision !== "approve" && !comment.trim()) {
      return notify("Add a note so the botanist knows why");
    }
    if (decision === "approve" && !rawPlant?.species_id) {
      return notify("Confirm the species before approving");
    }
    if (decision === "approve" && !hideRule.locked && hideRule.on !== !!rawPlant.endangered_override) {
      if (!(await setPlantLocationHidden(rawPlant.id, hideRule.on))) return;
    }
    reviewObservation(obs.id, decision, comment.trim());
    notify(
      decision === "approve"
        ? "Record approved and published"
        : decision === "return"
        ? "Record returned to the botanist"
        : "Record rejected"
    );
    setComment("");
    if (onClose) onClose();
  };

  return (
    <section className="glass pad gap-bottom-s" style={{ border: "2px solid var(--acc)", borderRadius: "var(--r-card, 16px)", background: "var(--sunken)" }}>
      <div className="row between wrap gap-bottom-s" style={{ alignItems: "center" }}>
        <div className="row wrap" style={{ alignItems: "center", gap: 8 }}>
          <Icon name="clipboard" size={20} />
          <h2 style={{ margin: 0, fontSize: 18 }}>Officer Review · {plant.qr_id}</h2>
          <span className="mute small">(Observation v{obs.version || 1})</span>
        </div>
        <div className="row wrap" style={{ alignItems: "center", gap: 8 }}>
          <Chip value={obs.status} />
          {onClose && (
            <button className="ic" onClick={onClose} aria-label="Close review panel">
              <Icon name="x" size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="field gap-bottom-s">
        <label>
          Confirm species {isPending && <span className="hint">(confirm before approving)</span>}
          <select
            value={rawPlant?.species_id || ""}
            onChange={(e) => setPlantSpecies(rawPlant.id, e.target.value || null)}
          >
            <option value="">Not confirmed</option>
            {speciesList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.scientific_name}{s.common_name ? ` (${s.common_name})` : ""}
              </option>
            ))}
          </select>
        </label>
        {isPending && <NewSpeciesButton guess={rawPlant?.proposed_species} onCreated={(s) => setPlantSpecies(rawPlant.id, s.id)} />}
        {rawPlant?.proposed_species && (
          <div className="row wrap gap-top-xs" style={{ alignItems: "center" }}>
            <p className="mute small" style={{ margin: 0 }}>
              Botanist's guess: <Sci>{rawPlant.proposed_species}</Sci>
            </p>
            {!rawPlant?.species_id && (() => {
              const needle = rawPlant.proposed_species.trim().toLowerCase();
              const match = speciesList.find(
                (s) => s.scientific_name.toLowerCase() === needle ||
                       (s.common_name && s.common_name.toLowerCase() === needle) ||
                       needle.includes(s.scientific_name.toLowerCase()) ||
                       s.scientific_name.toLowerCase().includes(needle)
              );
              return match ? (
                <button
                  type="button"
                  className="btn ghost small-btn"
                  onClick={() => setPlantSpecies(rawPlant.id, match.id)}
                >
                  Use guess: {match.scientific_name}
                </button>
              ) : null;
            })()}
          </div>
        )}
      </div>

      {isPending && plant.lat != null && (
        <label className="check hidespot gap-bottom-s">
          <input type="checkbox" checked={hideRule.on} disabled={hideRule.locked} onChange={(e) => setHideChoice(e.target.checked)} />
          <span>
            <b>{HIDE_LOCATION_LABEL}</b>
            <small className="mute block">{hideRule.locked ? "" : "Saved when you approve. "}{hideRule.hint}</small>
          </span>
        </label>
      )}

      <div className="field gap-bottom-s">
        <label>
          Note to the botanist <span className="hint">(needed to return or reject)</span>
          <textarea
            rows="2"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What needs to change or reason for decision..."
          />
        </label>
      </div>

      <div className="decide row wrap">
        <button className="btn" type="button" onClick={() => handleDecide("approve")}>
          <Icon name="check" size={18} /> Approve &amp; publish
        </button>
        <button className="btn ghost" type="button" onClick={() => handleDecide("return")}>
          <Icon name="undo" size={18} /> Return for changes
        </button>
        <button className="btn danger" type="button" onClick={() => handleDecide("reject")}>
          <Icon name="x" size={18} /> Reject
        </button>
      </div>
    </section>
  );
}

// Height chart plus one card per visit (observation), newest first.
function Visits({ db, visits, photos, rawPlant, canReview, speciesList, reviewObservation, setPlantSpecies, notify }) {
  const [reviewingId, setReviewingId] = useState(null);
  const [commentsById, setCommentsById] = useState({});

  if (!visits.length) return <div className="glass pad"><Empty>No visits recorded yet.</Empty></div>;
  const withHeight = [...visits].reverse().filter((v) => v.height_cm != null);

  const handleVisitDecide = (obsId, decision) => {
    const comment = commentsById[obsId] || "";
    if (decision !== "approve" && !comment.trim()) {
      return notify("Add a note so the botanist knows why");
    }
    if (decision === "approve" && !rawPlant?.species_id) {
      return notify("Confirm the species before approving");
    }
    reviewObservation(obsId, decision, comment.trim());
    notify(
      decision === "approve"
        ? "Record approved and published"
        : decision === "return"
        ? "Record returned to the botanist"
        : "Record rejected"
    );
    setCommentsById({ ...commentsById, [obsId]: "" });
    setReviewingId(null);
  };

  return (
    <>
      {withHeight.length > 1 && <HeightChart visits={withHeight} />}
      <ol className="timeline">
        {visits.map((v) => {
          const review = db.reviews.filter((r) => r.observation_id === v.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
          const pics = photos.filter((p) => p.observation_id === v.id);
          const isReviewOpen = reviewingId === v.id || v.status === "synced";

          return (
            <li key={v.id} className={"tl-" + v.status}>
              <article className="glass pad">
                <header className="row between wrap">
                  <div>
                    <b className="block">{fmtDate(v.observed_at)}</b>
                    <small className="mute">{nameOf(db, v.recorded_by)} · height {height(v.height_cm)}</small>
                  </div>
                  <div className="row wrap" style={{ alignItems: "center", gap: 8 }}>
                    <Chip value={v.status} />
                    {canReview && v.status !== "synced" && (
                      <button
                        type="button"
                        className="btn ghost small-btn"
                        onClick={() => setReviewingId(reviewingId === v.id ? null : v.id)}
                      >
                        <Icon name="clipboard" size={14} /> {reviewingId === v.id ? "Cancel review" : "Review / Change"}
                      </button>
                    )}
                  </div>
                </header>
                {v.morphology && <p>{v.morphology}</p>}
                {v.notes && <p className="mute small">{v.notes}</p>}
                {pics.length > 0 && <div className="row wrap">{pics.map((p) => <Img key={p.id} className="mini" src={p.url} alt="" />)}</div>}
                
                <p className="mute small">
                  {review
                    ? `${label(review.decision === "approve" ? "approved" : review.decision === "return" ? "returned" : "rejected")} by ${nameOf(db, review.reviewer_id)} on ${fmtDate(review.created_at)}${review.comment ? ` · “${review.comment}”` : ""}`
                    : v.status === "queued" || v.status === "draft"
                      ? "Saved on the phone. It goes to review once it syncs."
                      : "Waiting for an officer to review."}
                </p>

                {/* Officer review actions right inside visit card */}
                {canReview && isReviewOpen && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                    <div className="field gap-bottom-s">
                      <label>
                        Confirm species
                        <select
                          value={rawPlant?.species_id || ""}
                          onChange={(e) => setPlantSpecies(rawPlant.id, e.target.value || null)}
                        >
                          <option value="">Not confirmed</option>
                          {speciesList.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.scientific_name}{s.common_name ? ` (${s.common_name})` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      {rawPlant?.proposed_species && (
                        <div className="row wrap gap-top-xs" style={{ alignItems: "center" }}>
                          <p className="mute small" style={{ margin: 0 }}>
                            Botanist's guess: <Sci>{rawPlant.proposed_species}</Sci>
                          </p>
                          {!rawPlant?.species_id && (() => {
                            const needle = rawPlant.proposed_species.trim().toLowerCase();
                            const match = speciesList.find(
                              (s) => s.scientific_name.toLowerCase() === needle ||
                                     (s.common_name && s.common_name.toLowerCase() === needle) ||
                                     needle.includes(s.scientific_name.toLowerCase()) ||
                                     s.scientific_name.toLowerCase().includes(needle)
                            );
                            return match ? (
                              <button
                                type="button"
                                className="btn ghost small-btn"
                                onClick={() => setPlantSpecies(rawPlant.id, match.id)}
                              >
                                Use guess: {match.scientific_name}
                              </button>
                            ) : null;
                          })()}
                        </div>
                      )}
                    </div>
                    <div className="field gap-bottom-s">
                      <label>
                        Note to the botanist <span className="hint">(needed to return or reject)</span>
                        <input
                          value={commentsById[v.id] || ""}
                          onChange={(e) => setCommentsById({ ...commentsById, [v.id]: e.target.value })}
                          placeholder="Note or reason..."
                        />
                      </label>
                      {rawPlant?.proposed_species && (
                        <div className="row wrap gap-top-xs" style={{ alignItems: "center" }}>
                          <p className="mute small" style={{ margin: 0 }}>
                            Botanist's guess: <Sci>{rawPlant.proposed_species}</Sci>
                          </p>
                          {!rawPlant?.species_id && (() => {
                            const needle = rawPlant.proposed_species.trim().toLowerCase();
                            const match = speciesList.find(
                              (s) => s.scientific_name.toLowerCase() === needle ||
                                     (s.common_name && s.common_name.toLowerCase() === needle) ||
                                     needle.includes(s.scientific_name.toLowerCase()) ||
                                     s.scientific_name.toLowerCase().includes(needle)
                            );
                            return match ? (
                              <button
                                type="button"
                                className="btn ghost small-btn"
                                onClick={() => setPlantSpecies(rawPlant.id, match.id)}
                              >
                                Use guess: {match.scientific_name}
                              </button>
                            ) : null;
                          })()}
                        </div>
                      )}
                    </div>
                    <div className="decide row wrap">
                      <button className="btn" type="button" onClick={() => handleVisitDecide(v.id, "approve")}>
                        <Icon name="check" size={16} /> Approve &amp; publish
                      </button>
                      <button className="btn ghost" type="button" onClick={() => handleVisitDecide(v.id, "return")}>
                        <Icon name="undo" size={16} /> Return
                      </button>
                      <button className="btn danger" type="button" onClick={() => handleVisitDecide(v.id, "reject")}>
                        <Icon name="x" size={16} /> Reject
                      </button>
                    </div>
                  </div>
                )}
              </article>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function HeightChart({ visits }) {
  const w = 600, h = 110, pad = 24;
  const vals = visits.map((v) => v.height_cm);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const x = (i) => pad + (i / (visits.length - 1)) * (w - pad * 2);
  const y = (v) => (hi === lo ? h / 2 : h - pad - ((v - lo) / (hi - lo)) * (h - pad * 2));
  return (
    <figure className="glass pad heightchart">
      <figcaption className="row between wrap"><b>Height over time</b><span className="mute small">{height(vals[0])} → {height(vals.at(-1))}</span></figcaption>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Height went from ${height(vals[0])} to ${height(vals.at(-1))} over ${visits.length} visits`}>
        <polyline points={visits.map((v, i) => `${x(i)},${y(v.height_cm)}`).join(" ")} className="spark-line" />
        {visits.map((v, i) => (
          <g key={v.id}>
            <circle cx={x(i)} cy={y(v.height_cm)} r="5" className="hc-dot" />
            <text x={x(i)} y={y(v.height_cm) - 10} textAnchor="middle" className="hc-label">{height(v.height_cm)}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

function Sensor({ db, node }) {
  const rows = db.telemetry[node.id] || [];
  const last = rows.at(-1);
  return (
    <div className="glass pad">
      <p className="row between wrap"><b>{node.name}</b><Chip value={node.status} /></p>
      {last ? (
        <p>Latest reading: <Mono>{last.temperature}°C</Mono> · soil moisture <Mono>{last.soil_moisture}%</Mono> <span className="mute small">({fmtDateTime(last.ts)})</span></p>
      ) : <p className="mute">No readings yet.</p>}
      <p className="mute small">Alert limits: {node.thresholds.temp_max}°C max, {node.thresholds.moisture_min}% soil moisture min.</p>
      <a className="btn ghost" href="#/monitoring"><Icon name="activity" size={16} /> Open Monitoring</a>
    </div>
  );
}
