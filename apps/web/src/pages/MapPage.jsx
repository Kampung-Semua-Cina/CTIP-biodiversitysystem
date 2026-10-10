// web/src/pages/MapPage.jsx
import { useState } from "react";
import Img from "../components/Img.jsx";
import { useStore } from "../store.js";
import { can } from "../permissions.js";
import { familyColors, familyOf, shownCoords, visiblePlants } from "../selectors.js";
import { MAP_BOUNDS } from "../site.js";

// Schematic map: dots are placed from lat/lng inside the fixed MAP_BOUNDS area (site.js).
// Replace the background with Leaflet + OpenStreetMap later; the pin data stays the same.
// Each dot is one plant and its colour is the plant's family. Conservation status is not shown on the map for anyone,
// and visitors get no dot at all for endangered plants.
export default function MapPage({ arg }) {
  const { db, role } = useStore();
  const [picked, setPicked] = useState(null);
  const [only, setOnly] = useState(null); // family picked in the legend, or null for all
  const staff = can(role, "pending");

  const all = visiblePlants(db, role)
    .map((p) => ({ p, c: shownCoords(p, role) }))
    .filter((x) => x.c);
  const colors = familyColors(db.species, all.map((x) => x.p));
  const pts = all.filter((x) => !only || familyOf(x.p) === only);

  // Fixed bounds (not the visible plants' bounds), so every role sees each plant in the same place.
  const { minLat, maxLat, minLng, maxLng } = MAP_BOUNDS;
  const pct = (v) => `${Math.min(97, Math.max(3, v * 100))}%`;
  const place = (c) => ({
    left: pct((c.lng - minLng) / (maxLng - minLng)),
    top: pct((maxLat - c.lat) / (maxLat - minLat)),
  });

  const selId = picked || arg;
  const sel = pts.find((x) => x.p.qr_id === selId);
  const count = (f) => all.filter((x) => familyOf(x.p) === f).length;

  return (
    <section className="glass pad">
      <h2>Plant map</h2>
      <p className="mute">
        Each dot is one plant and its colour shows the plant family (see the legend). Select a dot to see the plant,
        or a family in the legend to show only that family.
        {!staff && " Locations of endangered plants are not shown, to protect them."}
      </p>

      <div className="map" role="group" aria-label="Map of tagged plants by family">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 72 Q22 56 44 68 T100 52" className="river" />
          <path d="M0 30 Q30 40 55 24 T100 34" className="river thin" />
          <path d="M10 100 Q30 70 60 80 T100 96" className="contour" />
          <path d="M0 52 Q35 46 62 56 T100 70" className="contour" />
          <path d="M20 0 Q40 22 70 14 T100 8" className="contour" />
        </svg>
        <span className="north">N</span>
        {pts.map(({ p, c }) => (
          <button
            key={p.id}
            className={"plantdot" + (p.qr_id === selId ? " on" : "")}
            style={{ ...place(c), background: colors[familyOf(p)] }}
            onClick={() => setPicked(p.qr_id)}
            title={`${p.name} (${familyOf(p)})`}
            aria-label={`${p.name}, family ${familyOf(p)}`}
          />
        ))}
      </div>

      <div className="maplegend" role="group" aria-labelledby="legend-title">
        <h3 id="legend-title">Legend</h3>
        <p className="mute small"><i className="dot" style={{ background: "var(--mute)" }} /> One dot = one plant. Colour = plant family.</p>
        <div className="legend">
          <button className={"fam" + (!only ? " on" : "")} onClick={() => setOnly(null)} aria-pressed={!only}>All families ({all.length} plants)</button>
          {Object.entries(colors).map(([f, color]) => (
            <button key={f} className={"fam" + (only === f ? " on" : "")} onClick={() => setOnly(only === f ? null : f)} aria-pressed={only === f}>
              <i style={{ background: color }} /> {f} ({count(f)} {count(f) === 1 ? "plant" : "plants"})
            </button>
          ))}
        </div>
      </div>

      {sel && (
        <div className="item on card-row">
          <Img src={sel.p.photos[0]?.url} />
          <span>
            <b>{sel.p.name}</b>
            <small className="sci">{sel.p.scientific || sel.p.qr_id}</small>
            <small className="mute block">
              <i className="dot" style={{ background: colors[familyOf(sel.p)] }} /> {familyOf(sel.p)} · {sel.c.lat.toFixed(5)}, {sel.c.lng.toFixed(5)}
            </small>
          </span>
          <a className="btn" href={"#/dashboard/" + sel.p.qr_id}>View plant</a>
        </div>
      )}
    </section>
  );
}
