import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Icon from "../components/Icon.jsx";
import Img from "../components/Img.jsx";
import MiniMap from "../components/MiniMap.jsx";
import PhotoGallery from "../components/PhotoGallery.jsx";
import PhotoEditor from "../components/PhotoEditor.jsx";
import { Chip, Empty } from "../components/Bits.jsx";
import { useStore } from "../store.js";
import { can } from "../permissions.js";
import { nameOf, plantVisits, shownCoords, tagUrl, visiblePlants } from "../selectors.js";
import { fmtDate, fmtDateTime, label } from "../utils.js";

const height = (cm) => (cm == null ? "-" : cm >= 100 ? `${(cm / 100).toFixed(cm % 10 ? 2 : 1)} m` : `${cm} cm`);

// One tagged plant (a specimen): the page a QR tag opens.
// Tabs: Overview and Photos for everyone; Visits, Sensor and Discussion for staff.
export default function Specimen({ qr }) {
  const { db, role, setPlantPhotos, notify } = useStore();
  const staff = can(role, "pending");
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);

  const plant = visiblePlants(db, role).find((p) => p.qr_id === qr);
  if (!plant) {
    const exists = db.plants.some((p) => p.qr_id === qr && !p.is_deleted);
    return (
      <section className="glass pad prose narrow">
        <h2>{exists ? "This plant is not published yet" : "Tag not found"}</h2>
        <p>{exists ? `Tag ${qr} is still being checked by park officers. Its page will open here once it is approved.` : `There is no plant with tag ${qr}. Check the code on the tag.`}</p>
        <a className="btn" href="#/plants">Browse all plants</a>
      </section>
    );
  }

  const visits = plantVisits(db, plant.id, role);
  const first = visits[visits.length - 1];
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
  const active = tabs.some(([k]) => k === tab) ? tab : "overview"; // the tab list changes with the role

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href={staff ? "#/dashboard" : "#/plants"}>{staff ? "Tagged plants" : "Plants"}</a> <span aria-hidden="true">›</span>{" "}
        {plant.species ? <a href={"#/plants/" + plant.species.id}>{plant.name}</a> : <span>{plant.name}</span>} <span aria-hidden="true">›</span>{" "}
        <span aria-current="page">{plant.qr_id}</span>
      </nav>

      <section className="glass pad tagheader">
        <Img className="tagthumb" src={plant.photos[0]?.url} alt="" />
        <div className="grow">
          {staff && (
            <p className="row wrap">
              <Chip value={plant.status}>{plant.status === "approved" ? "Published" : undefined}</Chip>
              {plant.species && <Chip value={plant.conservation} />}
            </p>
          )}
          <h1 className="tagid">{plant.qr_id}</h1>
          <p className="lede-s">
            {plant.species ? <a className="textlink" href={"#/plants/" + plant.species.id}>{plant.name}</a> : <b>{plant.name}</b>}
            {plant.scientific && <span className="mute"> · <i>{plant.scientific}</i></span>}
          </p>
          <p className="mute small">
            {first ? `First recorded ${fmtDate(first.observed_at)} by ${nameOf(db, plant.registered_by)}` : `Tagged by ${nameOf(db, plant.registered_by)}`}
            {visits.length > 0 && ` · ${visits.length} ${visits.length === 1 ? "visit" : "visits"} · last visited ${fmtDate(visits[0].observed_at)}`}
          </p>
        </div>
        <div className="row wrap">
          {coords && <a className="btn ghost" href={"#/map/" + plant.qr_id}><Icon name="pin" size={16} /> Show on map</a>}
          {can(role, "tags") && <a className="btn ghost" href="#/tags"><Icon name="printer" size={16} /> Print tags</a>}
        </div>
      </section>

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
              <PhotoGallery key={plant.id} photos={plant.photos} canEdit={can(role, "editPhotos")} onEdit={() => setEditing(true)} />
              {plant.species?.description && <p className="gap-top-s">{plant.species.description}</p>}
              <dl className="gap-top-s">
                <dt>Family</dt><dd>{plant.species ? `${plant.species.family} · ${plant.species.genus}` : "Not confirmed yet"}</dd>
                <dt>Height</dt><dd>{height(plant.height_cm)}</dd>
                {plant.morphology && <><dt>Appearance</dt><dd>{plant.morphology}</dd></>}
                {plant.species?.cultural_significance && <><dt>Cultural note</dt><dd>{plant.species.cultural_significance}</dd></>}
              </dl>
            </div>
          )}

          {active === "visits" && <Visits db={db} visits={visits} photos={plant.photos} />}

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
                <p className="gap-top-s">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</p>
                <p className="mute small">GPS accuracy ±{plant.gps_accuracy_m} m</p>
              </>
            ) : (
              <p className="mute">Hidden to protect this plant.</p>
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
              <a className="textlink" href={"#/plants/" + plant.species.id}>About this species →</a>
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

// Height chart plus one card per visit (observation), newest first.
function Visits({ db, visits, photos }) {
  if (!visits.length) return <div className="glass pad"><Empty>No visits recorded yet.</Empty></div>;
  const withHeight = [...visits].reverse().filter((v) => v.height_cm != null);
  return (
    <>
      {withHeight.length > 1 && <HeightChart visits={withHeight} />}
      <ol className="timeline">
        {visits.map((v) => {
          const review = db.reviews.filter((r) => r.observation_id === v.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
          const pics = photos.filter((p) => p.observation_id === v.id);
          return (
            <li key={v.id} className={"tl-" + v.status}>
              <article className="glass pad">
                <header className="row between wrap">
                  <div>
                    <b className="block">{fmtDate(v.observed_at)}</b>
                    <small className="mute">{nameOf(db, v.recorded_by)} · height {height(v.height_cm)}</small>
                  </div>
                  <Chip value={v.status} />
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
        <p>Latest reading: <b>{last.temperature}°C</b> · soil moisture <b>{last.soil_moisture}%</b> <span className="mute small">({fmtDateTime(last.ts)})</span></p>
      ) : <p className="mute">No readings yet.</p>}
      <p className="mute small">Alert limits: {node.thresholds.temp_max}°C max, {node.thresholds.moisture_min}% soil moisture min.</p>
      <a className="btn ghost" href="#/monitoring"><Icon name="activity" size={16} /> Open Monitoring</a>
    </div>
  );
}
