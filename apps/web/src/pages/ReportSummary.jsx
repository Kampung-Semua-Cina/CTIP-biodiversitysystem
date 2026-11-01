// apps/web/src/pages/ReportSummary.jsx
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import { Chip, Empty, Mono, Pills } from "../components/Bits.jsx";
import { useStore } from "../../../shared/store.js";
import { visiblePlants } from "../../../shared/selectors.js";
import { CONSERVATION } from "../../../shared/data.js";
import { download, fmtDate, label, toCsv } from "../../../shared/utils.js";
import { STATUS_TEXT } from "../../../shared/tokens.js";
import { setQuery, useRoute } from "../useRoute.js";

const PAGE = 25;
const RECORD_STATUSES = ["approved", "synced", "returned", "rejected", "draft", "queued"];
const NO_ZONE = "none"; // plants saved without a GPS fix have no zone
const SORTS = {
  tag: { label: "Tag", by: (a, b) => (a.qr_id || "").localeCompare(b.qr_id || "") }, // a plant may have no tag
  name: { label: "Name A–Z", by: (a, b) => a.name.localeCompare(b.name) },
  recent: { label: "Last recorded, newest", by: (a, b) => (b.lastSeen || "").localeCompare(a.lastSeen || "") },
  height: { label: "Tallest", by: (a, b) => (b.height_cm ?? -1) - (a.height_cm ?? -1) },
};

// Officer reports: counts, a searchable and filterable table of plant records, and a
// CSV export of every matching record (not only the page on screen). Filters, sort and
// page are kept in the URL (#/reports?q=…&family=…&from=…), so a search can be shared.
export default function ReportSummary() {
  const { db, role } = useStore();
  const { query } = useRoute();
  const q = (query.q || "").trim().toLowerCase();
  const family = query.family || "all";
  const genus = query.genus || "all";
  const conservation = query.conservation || "all";
  const status = query.status || "all";
  const from = query.from || ""; // yyyy-mm-dd, last recorded on or after
  const to = query.to || "";     // yyyy-mm-dd, last recorded on or before
  const sort = SORTS[query.sort] ? query.sort : "tag";
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const filter = (key) => (v) => setQuery({ [key]: v === "all" ? null : v, page: null });

  // When each plant was last recorded (its newest visit), for the date filter and sort.
  const lastSeen = {};
  for (const o of db.observations) {
    if (!lastSeen[o.specimen_id] || o.observed_at > lastSeen[o.specimen_id]) lastSeen[o.specimen_id] = o.observed_at;
  }
  const all = visiblePlants(db, role).map((p) => ({ ...p, lastSeen: lastSeen[p.id] || null }));
  // Zones are squares of the 0.01° grid, set from each plant's GPS by the database (CTIP-109).
  // Only squares holding a plant are listed. An address with an unknown zone filters nothing.
  const zoneNames = Object.fromEntries((db.zones || []).filter((z) => all.some((p) => p.zone_id === z.id)).map((z) => [z.id, z.name]));
  const zone = query.zone === NO_ZONE || zoneNames[query.zone] ? query.zone : "all";
  const day = (iso) => (iso ? iso.slice(0, 10) : "");
  const text = (p) => `${p.qr_id || ""} ${p.name} ${p.scientific} ${p.proposed_species || ""} ${p.species?.family || ""} ${p.species?.genus || ""}`.toLowerCase();
  const rows = all
    .filter((p) => !q || text(p).includes(q))
    .filter((p) => family === "all" || p.species?.family === family)
    .filter((p) => genus === "all" || p.species?.genus === genus)
    .filter((p) => zone === "all" || (zone === NO_ZONE ? !p.zone_id : p.zone_id === zone))
    .filter((p) => conservation === "all" || p.conservation === conservation)
    .filter((p) => status === "all" || p.status === status)
    .filter((p) => !from || (p.lastSeen && day(p.lastSeen) >= from))
    .filter((p) => !to || (p.lastSeen && day(p.lastSeen) <= to))
    .sort((a, b) => SORTS[sort].by(a, b) || SORTS.tag.by(a, b));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages);
  const slice = rows.slice((cur - 1) * PAGE, cur * PAGE);
  const families = [...new Set(all.map((p) => p.species?.family).filter(Boolean))].sort();
  const genera = [...new Set(all.filter((p) => family === "all" || p.species?.family === family).map((p) => p.species?.genus).filter(Boolean))].sort();
  const filtered = q || family !== "all" || genus !== "all" || zone !== "all" || conservation !== "all" || status !== "all" || from || to;
  const count = (fn) => all.filter(fn).length;
  const max = Math.max(1, ...CONSERVATION.map((c) => count((p) => p.conservation === c)));

  const exportCsv = () => {
    const head = ["Tag", "Name", "Scientific name", "Family", "Genus", "Conservation status", "Record status", "Last recorded", "Height (cm)", "Zone", "Latitude", "Longitude", "GPS accuracy (m)"];
    const body = rows.map((p) => [p.qr_id, p.name, p.scientific, p.species?.family, p.species?.genus, p.conservation, p.status, day(p.lastSeen), p.height_cm, zoneNames[p.zone_id], p.lat, p.lng, p.gps_accuracy_m]);
    download("daun-sense-plants.csv", toCsv([head, ...body]));
  };

  return (
    <Shell seg="reports">
      <div className="row between wrap">
        <h2>Reports</h2>
        <div className="row">
          <button className="btn ghost" onClick={() => window.print()}><Icon name="printer" size={18} /> Print</button>
          <button className="btn" onClick={exportCsv}><Icon name="download" size={18} /> Export CSV</button>
        </div>
      </div>

      <div className="summary">
        <p><b>{all.length}</b> tagged plants</p>
        <p><b>{count((p) => p.isPublic)}</b> published</p>
        <p><b>{count((p) => p.endangered)}</b> endangered</p>
        <p><b>{count((p) => p.status === "synced")}</b> waiting for review</p>
      </div>

      <h3 className="sub">By conservation status</h3>
      <ul className="bars">
        {CONSERVATION.map((c) => {
          const n = count((p) => p.conservation === c);
          return (
            <li key={c}>
              <span>{label(c)}</span>
              <i style={{ width: `${(n / max) * 100}%` }} className={"bar chip-" + c.replaceAll(" ", "-")} />
              <b>{n}</b>
            </li>
          );
        })}
      </ul>

      <h3 className="sub">Plant records</h3>
      <div className="toolbar">
        <label className="search grow">
          <Icon name="search" size={20} />
          <input type="search" value={query.q || ""} onChange={(e) => setQuery({ q: e.target.value, page: null })}
            placeholder="Search by tag, common or scientific name, or the botanist's guess" aria-label="Search plant records" />
        </label>
        <label className="inline">Sort
          <select value={sort} onChange={(e) => setQuery({ sort: e.target.value === "tag" ? null : e.target.value })}>
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
      </div>
      <div className="row wrap gap-top-s">
        <label className="inline">Family
          <select value={family} onChange={(e) => setQuery({ family: e.target.value === "all" ? null : e.target.value, genus: null, page: null })}>
            <option value="all">All families</option>
            {families.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="inline">Genus
          <select value={genus} onChange={(e) => filter("genus")(e.target.value)}>
            <option value="all">All genera</option>
            {genera.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label className="inline" title="Each zone is a square about 1 km across, named after its south-west corner">Zone
          <select value={zone} onChange={(e) => filter("zone")(e.target.value)}>
            <option value="all">All zones</option>
            {Object.entries(zoneNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            <option value={NO_ZONE}>No GPS location</option>
          </select>
        </label>
        <label className="inline">Last recorded from
          <input type="date" value={from} max={to || undefined} onChange={(e) => setQuery({ from: e.target.value, page: null })} />
        </label>
        <label className="inline">to
          <input type="date" value={to} min={from || undefined} onChange={(e) => setQuery({ to: e.target.value, page: null })} />
        </label>
        {filtered && <button className="btn ghost small-btn" onClick={() => setQuery({ q: null, family: null, genus: null, zone: null, conservation: null, status: null, from: null, to: null, page: null })}>Clear filters</button>}
      </div>

      <div className="filters gap-top">
        <div>
          <p className="overline">Conservation status</p>
          <Pills label="Conservation status" value={conservation} onChange={filter("conservation")}
            items={[{ key: "all", label: "Any" }, ...CONSERVATION.map((c) => ({ key: c, label: label(c) }))]} />
        </div>
        <div>
          <p className="overline">Record status</p>
          <Pills label="Record status" value={status} onChange={filter("status")}
            items={[{ key: "all", label: "Any" }, ...RECORD_STATUSES.map((s) => ({ key: s, label: STATUS_TEXT[s] || label(s) }))]} />
        </div>
      </div>

      <p className="mute small" aria-live="polite">
        {rows.length ? `Showing ${(cur - 1) * PAGE + 1}–${(cur - 1) * PAGE + slice.length} of ${rows.length} records. Export CSV includes all ${rows.length}.` : ""}
      </p>
      {rows.length === 0 ? (
        <Empty icon="chart">No plants match these filters.</Empty>
      ) : (
        <>
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>Tag</th><th>Plant and family</th><th>Conservation</th><th>Record</th><th>Last recorded</th><th>Height</th><th>Zone</th><th>Location</th></tr>
            </thead>
            <tbody>
              {slice.map((p) => (
                <tr key={p.id}>
                  <td className="nowrap">{p.qr_id ? <Mono>{p.qr_id}</Mono> : "No tag"}</td>
                  <td>{p.qr_id ? <a href={"#/tag/" + p.qr_id}>{p.name}</a> : p.name}<small className="mute block">{p.scientific && <i className="sci">{p.scientific}</i>}{p.species?.family ? `${p.scientific ? " · " : ""}${p.species.family}` : ""}</small></td>
                  <td>{p.species ? <Chip value={p.conservation} /> : "-"}</td>
                  <td><Chip value={p.status} /></td>
                  <td className="nowrap">{p.lastSeen ? fmtDate(p.lastSeen) : "-"}</td>
                  <td className="nowrap">{p.height_cm != null ? `${p.height_cm} cm` : "-"}</td>
                  <td className="nowrap">{zoneNames[p.zone_id] || "-"}</td>
                  <td className="nowrap">{p.lat != null ? <Mono>{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</Mono> : "Not captured"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <nav className="pager" aria-label="Pages">
            <button className="btn ghost" disabled={cur === 1} onClick={() => setQuery({ page: cur - 1 > 1 ? cur - 1 : null })} aria-label="Previous page"><Icon name="chevL" size={18} /></button>
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <button key={n} className={"btn " + (n === cur ? "" : "ghost")} aria-current={n === cur ? "page" : undefined} onClick={() => setQuery({ page: n > 1 ? n : null })}>{n}</button>
            ))}
            <button className="btn ghost" disabled={cur === pages} onClick={() => setQuery({ page: cur + 1 })} aria-label="Next page"><Icon name="chevR" size={18} /></button>
          </nav>
        )}
        </>
      )}
    </Shell>
  );
}
