// web/src/pages/Dashboard.jsx
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
import { familyOf, shownCoords, tagUrl, visiblePlants } from "../selectors.js";
import { CONSERVATION } from "../data.js";
import { go } from "../useRoute.js";

const height = (cm) => (cm == null ? "-" : cm >= 100 ? `${(cm / 100).toFixed(1)} m` : `${cm} cm`);

// Plant library: selected plant on the left, searchable list on the right.
export default function Dashboard({ arg }) {
  const { db, role, setPlantPhotos, notify } = useStore();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(false);

  const staff = can(role, "pending");
  const plants = visiblePlants(db, role);
  // Staff filter by conservation status. Visitors never see conservation status, so they filter by family.
  const options = staff ? CONSERVATION : [...new Set(plants.map(familyOf))].sort();
  const active = options.includes(filter) ? filter : "all"; // the filter list changes when the role changes
  const shown = plants.filter(
    (p) =>
      (active === "all" || (staff ? p.conservation : familyOf(p)) === active) &&
      `${p.name} ${p.scientific} ${p.qr_id}`.toLowerCase().includes(q.toLowerCase()),
  );
  const sel = plants.find((p) => p.qr_id === arg) || shown[0] || plants[0];

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
              <select value={active} onChange={(e) => setFilter(e.target.value)} aria-label={staff ? "Filter by conservation status" : "Filter by family"}>
                <option value="all">{staff ? "All status" : "All families"}</option>
                {options.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
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

// Conservation status is staff-only. Visitors get no location at all for endangered plants.
function PlantDetails({ plant, role }) {
  const c = shownCoords(plant, role);
  const staff = can(role, "pending");
  return (
    <dl>
      <dt>Family</dt><dd>{plant.species ? `${plant.species.family} · ${plant.species.genus}` : "Not confirmed yet"}</dd>
      {staff && <><dt>Conservation</dt><dd>{plant.species ? <Chip value={plant.conservation} /> : "-"}</dd></>}
      <dt>Recorded location</dt>
      <dd>
        {c ? (
          <>
            <a className="maplink" href={"#/map/" + plant.qr_id}><Icon name="pin" size={15} /> map link</a>
            <small className="mute block">{`${c.lat.toFixed(5)}, ${c.lng.toFixed(5)} (±${plant.gps_accuracy_m} m)`}</small>
          </>
        ) : (
          <small className="mute">Hidden to protect this plant.</small>
        )}
      </dd>
      <dt>ID</dt><dd>{plant.qr_id}</dd>
      <dt>Height</dt><dd>{height(plant.height_cm)}</dd>
      {plant.morphology && <><dt>Appearance</dt><dd>{plant.morphology}</dd></>}
      {plant.species?.cultural_significance && <><dt>Cultural note</dt><dd>{plant.species.cultural_significance}</dd></>}
    </dl>
  );
}
