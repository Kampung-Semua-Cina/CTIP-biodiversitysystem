// apps/web/src/components/PlantWindow.jsx
import Icon from "./Icon.jsx";
import PhotoGallery from "./PhotoGallery.jsx";
import { Chip, Modal, Mono, Sci } from "./Bits.jsx";
import { useStore } from "../../../shared/store.js";
import { can } from "../../../shared/permissions.js";
import { familyOf, lastUpdated, nameOf, plantView, plantVisits } from "../../../shared/selectors.js";
import { fmtDate } from "../../../shared/utils.js";
import { REDUCED_LOCATION_NOTE } from "../../../shared/data.js";

// The window a map pin opens: every plant at that spot, with photos and details.
// `entries` is a list of { p, c } from the map page, c being the coordinates this role may see.
export default function PlantWindow({ entries, onClose }) {
  const title = entries.length === 1 ? "Plant at this spot" : `${entries.length} plants at this spot`;
  return (
    <Modal title={title} onClose={onClose} wide="xl">
      <div className="plantwin">
        {entries.map(({ p, c }) => <PlantDetails key={p.id} point={p} coords={c} />)}
      </div>
    </Modal>
  );
}

function PlantDetails({ point, coords }) {
  const { db, role, notify } = useStore();
  const staff = can(role, "pending");
  const raw = db.plants.find((x) => x.id === point.id);
  // The map's point keeps the coordinates and flags: they are already reduced for this role.
  const plant = raw ? { ...plantView(db, raw), location_reduced: point.location_reduced ?? raw.location_reduced } : point;
  const visit = raw ? plantVisits(db, raw.id, role)[0] : null;
  const updated = raw ? lastUpdated(db, plant, role) : null;
  const text = `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      notify("Coordinates copied");
    } catch {
      notify("Could not copy. Select the coordinates and copy them instead.");
    }
  };

  return (
    <article aria-label={`Plant ${plant.qr_id}`}>
      <PhotoGallery photos={plant.photos} auto={false} />
      <div>
        <h4>{plant.name}</h4>
        <Sci block>{plant.scientific}</Sci>
        {staff && (
          <p className="row wrap gap-top-xs">
            {plant.status && <Chip value={plant.status} />}
            {plant.species && <Chip value={plant.species.conservation_status} />}
          </p>
        )}
        <dl>
          <dt>Tag</dt><dd><Mono>{plant.qr_id}</Mono></dd>
          <dt>Family</dt><dd>{familyOf(plant)}</dd>
          <dt>Location</dt>
          <dd>
            <span className="coords">
              <Mono>{text}</Mono>
              <button type="button" className="btn ghost small-btn" onClick={copy}>Copy</button>
              {/* Never hand a protected plant's spot to an outside site. */}
              {!plant.endangered && !plant.location_reduced && (
                <a className="textlink" href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`} target="_blank" rel="noreferrer">Google Maps</a>
              )}
            </span>
            <small className="mute block">
              {plant.location_reduced
                ? REDUCED_LOCATION_NOTE
                : plant.gps_accuracy_m != null ? `GPS accuracy ±${plant.gps_accuracy_m} m` : "GPS accuracy not recorded"}
            </small>
          </dd>
          {visit?.height_cm != null && <><dt>Height</dt><dd>{visit.height_cm} cm</dd></>}
          {visit?.morphology && <><dt>Appearance</dt><dd>{visit.morphology}</dd></>}
          {staff && visit?.notes && <><dt>Notes</dt><dd>{visit.notes}</dd></>}
          {staff && raw && <><dt>Recorded by</dt><dd>{nameOf(db, raw.registered_by)}</dd></>}
          {visit && <><dt>Last visit</dt><dd>{fmtDate(visit.observed_at)}</dd></>}
          {updated && <><dt>Last updated</dt><dd>{fmtDate(updated)}</dd></>}
        </dl>
        <a className="btn ghost" href={"#/tag/" + plant.qr_id}>View full page <Icon name="arrowR" size={18} /></a>
      </div>
    </article>
  );
}
