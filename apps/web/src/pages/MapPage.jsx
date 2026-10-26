// apps/web/src/pages/MapPage.jsx
// Plant map: every plant this role may see as a pin on OpenStreetMap / Leaflet.
// Endangered plants have no pin for visitors (their location is protected, CTIP-71).
// Aligned to the Daun design language with Lucide line icons, search, and live user tracking.
import { useState, useMemo } from "react";
import Img from "../components/Img.jsx";
import Icon from "../components/Icon.jsx";
import { Mono, Sci } from "../components/Bits.jsx";
import LeafletMap from "../components/LeafletMap.jsx";
import { useStore } from "../../../shared/store.js";
import { can } from "../../../shared/permissions.js";
import { familyColors, familyOf, shownCoords, visiblePlants } from "../../../shared/selectors.js";
import { MAP_BOUNDS } from "../../../shared/mapConfig.js";

export default function MapPage({ arg }) {
  const { db, role } = useStore();
  const [picked, setPicked] = useState(null);
  const [only, setOnly] = useState(null); // family picked in the legend, or null for all
  const [q, setQ] = useState("");
  const staff = can(role, "pending");

  const plants = visiblePlants(db, role);
  const colors = useMemo(() => familyColors(db.species, plants), [db.species, plants]);
  const families = useMemo(
    () => [...new Set(plants.map((p) => p.species?.family).filter(Boolean))].sort(),
    [plants],
  );

  const needle = q.trim().toLowerCase();
  const { onMap, hidden } = useMemo(() => {
    const s = plants
      .filter((p) => !only || familyOf(p) === only)
      .filter((p) => !needle || [p.name, p.scientific, p.qr_id, familyOf(p)].join(" ").toLowerCase().includes(needle))
      .map((p) => ({ p, c: shownCoords(p, role) }));
    const m = s.filter((x) => x.c);
    return { onMap: m, hidden: s.length - m.length };
  }, [plants, only, needle, role]);

  const selId = picked || arg;
  const sel = onMap.find((x) => x.p.qr_id === selId || x.p.id === selId) || onMap[0];
  const count = (f) => onMap.filter((x) => familyOf(x.p) === f).length;

  const mapPoints = useMemo(() => {
    return onMap.map(({ p, c }) => ({
      id: p.id,
      qr_id: p.qr_id,
      name: p.name,
      scientific: p.scientific || p.species?.scientific || "",
      family: familyOf(p),
      color: colors[familyOf(p)] || "var(--acc)",
      lat: c.lat,
      lng: c.lng,
    }));
  }, [onMap, colors]);

  return (
    <section className="glass pad">
      <div className="pagehead">
        <div>
          <h1>Plant map</h1>
          <p className="mute">
            Each pin is one plant and its colour shows the plant family (see the legend). Select a pin to see the plant,
            or a family in the legend to show only that family. Switch between street map and satellite view at any time.
            {!staff && " Locations of endangered plants are not shown, to protect them."}
          </p>
        </div>
      </div>

      {/* Search Bar matching mobile styling and functionality */}
      <div className="row wrap between gap-bottom" style={{ alignItems: "center" }}>
        <label className="search" style={{ maxWidth: 360, width: "100%" }}>
          <Icon name="search" size={18} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the map"
            aria-label="Search the map"
          />
        </label>
        {q ? (
          <button className="btn ghost" onClick={() => setQ("")}>
            <Icon name="x" size={16} /> Clear search
          </button>
        ) : null}
      </div>

      <LeafletMap
        points={mapPoints}
        selectedId={selId}
        onSelect={(id, qr_id) => setPicked(qr_id || id)}
        bounds={MAP_BOUNDS}
        height={480}
      />

      <div className="maplegend" role="group" aria-labelledby="legend-title">
        <h3 id="legend-title">Legend</h3>
        <p className="mute small">
          <i className="dot" style={{ background: "var(--ink2)" }} /> One pin = one plant. Colour = plant family.
        </p>
        <div className="legend">
          <button
            className={"fam" + (!only ? " on" : "")}
            onClick={() => setOnly(null)}
            aria-pressed={!only}
          >
            All families ({onMap.length} {onMap.length === 1 ? "plant" : "plants"})
          </button>
          {families.map((f) => (
            <button
              key={f}
              className={"fam" + (only === f ? " on" : "")}
              onClick={() => setOnly(only === f ? null : f)}
              aria-pressed={only === f}
            >
              <i style={{ background: colors[f] }} /> {f} ({count(f)} {count(f) === 1 ? "plant" : "plants"})
            </button>
          ))}
        </div>
      </div>

      {hidden > 0 && (
        <div className="row gap-top-s" style={{ alignItems: "center", color: "var(--ink2)" }}>
          <Icon name="lock" size={16} />
          <small className="mute">
            {hidden} endangered plant{hidden === 1 ? " is" : "s are"} not shown on the map, to protect {hidden === 1 ? "it" : "them"}.
          </small>
        </div>
      )}

      {sel && (
        <div className="item on card-row gap-top">
          <Img src={sel.p.photos[0]?.url} />
          <span>
            <b>{sel.p.name}</b>
            {sel.p.scientific ? <Sci block className="small">{sel.p.scientific}</Sci> : <Mono className="block">{sel.p.qr_id}</Mono>}
            <small className="mute block">
              <i className="dot" style={{ background: colors[familyOf(sel.p)] }} /> {familyOf(sel.p)} · <Mono>{sel.c.lat.toFixed(5)}, {sel.c.lng.toFixed(5)}</Mono>
            </small>
          </span>
          <a className="btn" href={"#/tag/" + sel.p.qr_id}>
            View plant <Icon name="arrowR" size={18} />
          </a>
        </div>
      )}
    </section>
  );
}
