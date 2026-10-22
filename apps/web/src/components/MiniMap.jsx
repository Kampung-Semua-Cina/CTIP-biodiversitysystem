import { MAP_BOUNDS } from "../../../shared/site.js";

// Small version of the plant map (same schematic background as MapPage).
// `points` is a list of { p, c } where c = { lat, lng }. Clicking a dot opens that plant.
export default function MiniMap({ points, label, height = 260, highlight }) {
  const { minLat, maxLat, minLng, maxLng } = MAP_BOUNDS;
  const pct = (v) => `${Math.min(96, Math.max(4, v * 100))}%`;
  return (
    <div className="map minimap" style={{ height }} role="group" aria-label={label}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 72 Q22 56 44 68 T100 52" className="river" />
        <path d="M0 30 Q30 40 55 24 T100 34" className="river thin" />
        <path d="M10 100 Q30 70 60 80 T100 96" className="contour" />
        <path d="M0 52 Q35 46 62 56 T100 70" className="contour" />
      </svg>
      <span className="north">N</span>
      {points.map(({ p, c }) => (
        <a
          key={p.id}
          href={"#/tag/" + p.qr_id}
          className={"plantdot" + (p.qr_id === highlight ? " on" : "")}
          style={{ left: pct((c.lng - minLng) / (maxLng - minLng)), top: pct((maxLat - c.lat) / (maxLat - minLat)), background: "var(--acc)" }}
          aria-label={`${p.qr_id}, ${p.name}`}
          title={p.qr_id}
        />
      ))}
    </div>
  );
}
