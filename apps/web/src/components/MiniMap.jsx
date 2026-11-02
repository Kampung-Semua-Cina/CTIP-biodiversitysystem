// apps/web/src/components/MiniMap.jsx
import LeafletMap from "./LeafletMap.jsx";
import { MAP_BOUNDS } from "../../../shared/site.js";
import { isExactProtected } from "../../../shared/mapConfig.js";

// Miniature plant map powered by Leaflet & OpenStreetMap.
// `points` is a list of { p, c } where c = { lat, lng }.
export default function MiniMap({ points = [], label, height = 240, highlight }) {
  const mapPoints = points
    .filter(({ c }) => c && c.lat != null && c.lng != null)
    .map(({ p, c }) => ({
      id: p.id,
      qr_id: p.qr_id,
      name: p.name,
      scientific: p.scientific || "",
      family: p.species?.family || "",
      color: "var(--acc, #10b981)",
      lat: c.lat,
      lng: c.lng,
      protect: isExactProtected(p),
    }));

  return (
    <div className="minimap" role="group" aria-label={label} style={{ borderRadius: "var(--r-card, 16px)", overflow: "hidden" }}>
      <LeafletMap
        points={mapPoints}
        selectedId={highlight}
        bounds={MAP_BOUNDS}
        height={height}
        showControls={false}
        interactive={true}
        onSelect={(id, qr_id) => {
          if (qr_id) window.location.hash = "#/tag/" + qr_id;
        }}
      />
    </div>
  );
}
