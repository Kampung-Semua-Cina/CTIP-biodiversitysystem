import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import Img from "../components/Img.jsx";
import PhotoGallery from "../components/PhotoGallery.jsx";
import PhotoEditor from "../components/PhotoEditor.jsx";
import { Chip, Empty } from "../components/Bits.jsx";
import { useStore } from "../store.js";
import { can } from "../permissions.js";
import { shownCoords, tagUrl, visiblePlants } from "../selectors.js";
import { CONSERVATION } from "../data.js";
import { go } from "../useRoute.js";

const height = (cm) => (cm == null ? "-" : cm >= 100 ? `${(cm / 100).toFixed(1)} m` : `${cm} cm`);

// Plant library: selected plant on the left, searchable list on the right.
export default function Dashboard({ arg }) {
  const { db, role, setPlantPhotos, notify } = useStore();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(false);

  const plants = visiblePlants(db, role);
  const shown = plants.filter(
    (p) =>
      (filter === "all" || p.conservation === filter) &&
      `${p.name} ${p.scientific} ${p.qr_id}`.toLowerCase().includes(q.toLowerCase()),
  );
  const sel = plants.find((p) => p.qr_id === arg) || shown[0] || plants[0];
  const staff = can(role, "pending");

  return (
    <Shell seg="dashboard">
      {!sel ? (
        <Empty>No plants to show yet.</Empty>
      ) : (
        <div className="split">
          <article>
            <PhotoGallery key={sel.id} photos={sel.photos} canEdit={can(role, "editPhotos")} onEdit={() => setEditing(true)} />

            <h2 className="plant-title">
              {sel.name}
              {staff && <Chip value={sel.status} />}
            </h2>
            {sel.scientific && <p className="sci">{sel.scientific}</p>}
            {sel.species?.description && <p className="mute">{sel.species.description}</p>}

            <h3 className="sub">Details</h3>
            <PlantDetails plant={sel} role={role} />

            {staff && (
              <div className="qrbox">
                <div className="qrwhite"><QRCodeSVG value={tagUrl(sel.qr_id)} size={84} /></div>
                <div>
                  <b>{sel.qr_id}</b>
                  <p className="mute small">Scanning this tag opens this plant's page.</p>
                  {role === "officer" && <a className="small" href="#/species">Edit species details</a>}
                </div>
              </div>
            )}
          </article>

          <aside>
            <div className="searchrow">
              <label className="search">
                <Icon name="search" size={18} />
                <input placeholder="Search plants" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search plants" />
              </label>
              <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by conservation status">
                <option value="all">All status</option>
                {CONSERVATION.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div className="list">
              {shown.map((p) => (
                <button key={p.id} className={"item" + (p.id === sel.id ? " on" : "")} onClick={() => go("/dashboard/" + p.qr_id)}>
                  <Img src={p.photos[0]?.url} />
                  <span>
                    <b>{p.name}</b>
                    <small className="sci">{p.scientific || p.qr_id}</small>
                  </span>
                  {staff && p.status !== "approved" && <Chip value={p.status} />}
                </button>
              ))}
              {!shown.length && <Empty icon="search">No plants match your search.</Empty>}
            </div>
          </aside>
        </div>
      )}

      {editing && sel && (
        <PhotoEditor
          photos={sel.photos}
          onClose={() => setEditing(false)}
          onSave={(list) => {
            setPlantPhotos(sel.id, list);
            setEditing(false);
            notify("Photos saved");
          }}
        />
      )}
    </Shell>
  );
}

function PlantDetails({ plant, role }) {
  const c = shownCoords(plant, role);
  return (
    <dl>
      <dt>Family</dt><dd>{plant.species ? `${plant.species.family} · ${plant.species.genus}` : "Not confirmed yet"}</dd>
      <dt>Conservation</dt><dd>{plant.species ? <Chip value={plant.conservation} /> : "-"}</dd>
      <dt>Recorded location</dt>
      <dd>
        <a className="maplink" href={"#/map/" + plant.qr_id}><Icon name="pin" size={15} /> map link</a>
        <small className="mute block">
          {c.exact
            ? `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)} (±${plant.gps_accuracy_m} m)`
            : "Approximate area only. Exact location is hidden for this protected plant."}
        </small>
      </dd>
      <dt>ID</dt><dd>{plant.qr_id}</dd>
      <dt>Height</dt><dd>{height(plant.height_cm)}</dd>
      {plant.morphology && <><dt>Appearance</dt><dd>{plant.morphology}</dd></>}
      {plant.species?.cultural_significance && <><dt>Cultural note</dt><dd>{plant.species.cultural_significance}</dd></>}
    </dl>
  );
}
