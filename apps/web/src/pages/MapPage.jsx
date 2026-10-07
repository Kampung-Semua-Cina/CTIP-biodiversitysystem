import { useState } from "react";
import Icon from "../components/Icon.jsx";
import Img from "../components/Img.jsx";
import { Chip } from "../components/Bits.jsx";
import { useStore } from "../store.js";
import { can } from "../permissions.js";
import { shownCoords, visiblePlants } from "../selectors.js";

// Schematic map: pins are placed from lat/lng inside the bounds of the recorded plants.
// Replace the background with Leaflet + OpenStreetMap later; the pin data stays the same.
export default function MapPage({ arg }) {
  const { db, role } = useStore();
  const [picked, setPicked] = useState(null);
  const plants = visiblePlants(db, role);
  const staff = can(role, "pending");

  const pts = plants.map((p) => ({ p, c: shownCoords(p, role) }));
  const lats = pts.map((x) => x.c.lat);
  const lngs = pts.map((x) => x.c.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const pad = 0.14;
  const place = (c) => ({
    left: `${(((c.lng - minLng) / (maxLng - minLng || 0.01)) * (1 - 2 * pad) + pad) * 100}%`,
    top: `${(((maxLat - c.lat) / (maxLat - minLat || 0.01)) * (1 - 2 * pad) + pad) * 100}%`,
  });

  const selId = picked || arg;
  const sel = pts.find((x) => x.p.qr_id === selId);

  return (
    <section className="glass pad">
      <h2>Plant map</h2>
      <p className="mute">Select a pin to see the plant. Exact locations of endangered plants are hidden from visitors.</p>

      <div className="map" role="group" aria-label="Map of tagged plants">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 72 Q22 56 44 68 T100 52" className="river" />
          <path d="M0 30 Q30 40 55 24 T100 34" className="river thin" />
          <path d="M10 100 Q30 70 60 80 T100 96" className="contour" />
          <path d="M0 52 Q35 46 62 56 T100 70" className="contour" />
          <path d="M20 0 Q40 22 70 14 T100 8" className="contour" />
        </svg>
        <span className="north">N</span>
        {pts.map(({ p, c }) => (
          <span key={p.id}>
            {!c.exact && <span className="area" style={place(c)} aria-hidden="true" />}
            <button
              className={"pin " + (staff ? p.status : "approved") + (p.qr_id === selId ? " on" : "")}
              style={place(c)}
              onClick={() => setPicked(p.qr_id)}
              aria-label={`${p.name}${c.exact ? "" : ", approximate location"}`}
            >
              <Icon name="pin" size={30} />
            </button>
          </span>
        ))}
      </div>

      {staff && (
        <p className="legend">
          <Chip value="approved" /> <Chip value="synced">Waiting for review</Chip> <Chip value="returned" />
        </p>
      )}

      {sel && (
        <div className="item on card-row">
          <Img src={sel.p.photos[0]?.url} />
          <span>
            <b>{sel.p.name}</b>
            <small className="sci">{sel.p.scientific || sel.p.qr_id}</small>
            <small className="mute block">
              {sel.c.exact ? `${sel.c.lat.toFixed(5)}, ${sel.c.lng.toFixed(5)}` : "Approximate area only"}
            </small>
          </span>
          <a className="btn" href={"#/dashboard/" + sel.p.qr_id}>View plant</a>
        </div>
      )}
    </section>
  );
}
