// apps/web/src/pages/Dashboard.jsx
import { useState } from "react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import Img from "../components/Img.jsx";
import { Chip, Empty } from "../components/Bits.jsx";
import { useStore } from "../store.js";
import { can } from "../permissions.js";
import { lastVisit, nameOf, visiblePlants } from "../selectors.js";
import { download, fmtDate, toCsv } from "../utils.js";
import Catalogue from "./Catalogue.jsx";
import Specimen from "./Specimen.jsx";

const DAY = 86400000;
const STATUS_TEXT = { approved: "Published", synced: "Needs review", returned: "Returned", queued: "Waiting to sync", draft: "Draft", rejected: "Rejected" };

// Saved views: each is a ready-made filter staff use often. `roles` limits who sees it.
const VIEWS = [
  { key: "all", name: "All tagged plants", hint: "Every tagged plant you can see.", test: () => true },
  { key: "review", name: "Needs review", hint: "Synced from the field and waiting for an officer.", test: (r) => r.status === "synced", roles: ["officer", "admin"] },
  { key: "mine", name: "My records", hint: "Plants you tagged.", test: (r, me) => r.registered_by === me?.id, roles: ["botanist"] },
  { key: "returned", name: "Returned to botanist", hint: "An officer asked for changes.", test: (r) => r.status === "returned" },
  { key: "stale", name: "Not visited in 6 months", hint: "Due for a field visit.", test: (r) => !r.seen || Date.now() - new Date(r.seen) > 182 * DAY },
  { key: "nophotos", name: "No photos yet", hint: "Records without a single photo.", test: (r) => r.photos.length === 0 },
  { key: "endangered", name: "Endangered species", hint: "Their locations are hidden from visitors.", test: (r) => r.endangered },
  { key: "sensor", name: "Has a sensor node", hint: "Plants protected by an IoT node.", test: (r) => r.hasNode },
];

const COLUMNS = [
  ["qr_id", "Tag"],
  ["name", "Species"],
  ["status", "Status"],
  ["by", "Recorded by"],
  ["seen", "Last visit"],
  ["nphotos", "Photos"],
];

// `#/dashboard` is the staff table of tagged plants. Visitors get the species catalogue instead.
// `#/dashboard/NIAH-0001` (the link printed on QR tags) opens that plant's page.
export default function Dashboard({ arg }) {
  const { role } = useStore();
  if (arg) return <Specimen qr={arg} />;
  if (!can(role, "pending")) return <Catalogue />;
  return <TaggedTable />;
}

function TaggedTable() {
  const { db, role, me } = useStore();
  const [view, setView] = useState(role === "officer" ? "review" : "all");
  const [q, setQ] = useState("");
  const [speciesId, setSpeciesId] = useState("");
  const [by, setBy] = useState("");
  const [sort, setSort] = useState(["qr_id", 1]);
  const [perPage, setPerPage] = useState(25);
  const [page, setPage] = useState(1);

  const nodes = new Set(db.nodes.map((n) => n.specimen_id));
  const rows = visiblePlants(db, role).map((p) => ({
    ...p,
    by: nameOf(db, p.registered_by),
    seen: lastVisit(db, p.id, role),
    nphotos: p.photos.length,
    hasNode: nodes.has(p.id),
  }));

  const views = VIEWS.filter((v) => !v.roles || v.roles.includes(role)).map((v) => ({ ...v, count: rows.filter((r) => v.test(r, me)).length }));
  const cur = views.find((v) => v.key === view) || views[0];
  const t = q.trim().toLowerCase();
  const [col, dir] = sort;
  const shown = rows
    .filter((r) => cur.test(r, me))
    .filter((r) => !speciesId || r.species_id === speciesId)
    .filter((r) => !by || r.registered_by === by)
    .filter((r) => !t || `${r.qr_id} ${r.name} ${r.scientific} ${r.by}`.toLowerCase().includes(t))
    .sort((a, b) => dir * String(a[col] ?? "").localeCompare(String(b[col] ?? ""), undefined, { numeric: true }));

  const pages = Math.max(1, Math.ceil(shown.length / perPage));
  const pg = Math.min(page, pages);
  const slice = shown.slice((pg - 1) * perPage, pg * perPage);
  const pick = (k) => { setView(k); setPage(1); };
  const sortBy = (k) => setSort([k, col === k ? -dir : 1]);
  const speciesOptions = [...new Map(rows.filter((r) => r.species).map((r) => [r.species_id, r.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const people = [...new Map(rows.map((r) => [r.registered_by, r.by])).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const exportCsv = () =>
    download(
      `tagged-plants-${cur.key}.csv`,
      toCsv([["Tag", "Species", "Scientific name", "Status", "Recorded by", "Last visit", "Photos"], ...shown.map((r) => [r.qr_id, r.name, r.scientific, STATUS_TEXT[r.status] || r.status, r.by, r.seen ? fmtDate(r.seen) : "", r.nphotos])]),
    );

  return (
    <Shell seg="dashboard" plain>
      <section className="tablemain">
          <nav className="views" aria-label="Saved views">
            {views.map((v) => (
              <button key={v.key} className={"pill" + (v.key === cur.key ? " on" : "")} aria-pressed={v.key === cur.key} onClick={() => pick(v.key)}>
                {v.name} <span className="viewcount">{v.count}</span>
              </button>
            ))}
          </nav>

          <div className="pagehead">
            <div>
              <h1>{cur.name}</h1>
              <p className="mute">{cur.hint}</p>
            </div>
            <div className="row wrap">
              {cur.key === "review" && cur.count > 0 && <a className="btn" href="#/review">Open review queue</a>}
              {role === "botanist" && <a className="btn" href="#/add"><Icon name="plus" size={18} /> Add plant</a>}
              <button className="btn ghost" onClick={exportCsv} disabled={!shown.length}><Icon name="download" size={16} /> Export CSV</button>
            </div>
          </div>

          <div className="toolbar">
            <label className="search grow">
              <Icon name="search" size={18} />
              <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Tag ID, species or botanist" aria-label="Search tagged plants" />
            </label>
            <select value={speciesId} onChange={(e) => { setSpeciesId(e.target.value); setPage(1); }} aria-label="Filter by species">
              <option value="">All species</option>
              {speciesOptions.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
            <select value={by} onChange={(e) => { setBy(e.target.value); setPage(1); }} aria-label="Filter by who recorded it">
              <option value="">Recorded by anyone</option>
              {people.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
          </div>

          {!shown.length ? (
            <div className="glass pad"><Empty icon="leaf">Nothing in this view{q || speciesId || by ? " with these filters" : ""}.</Empty></div>
          ) : (
            <div className="glass tablewrap tablecard">
              <table>
                <thead>
                  <tr>
                    {COLUMNS.map(([k, text]) => (
                      <th key={k} scope="col" aria-sort={col === k ? (dir > 0 ? "ascending" : "descending") : undefined} className={k === "nphotos" ? "num" : ""}>
                        <button className="sortbtn" onClick={() => sortBy(k)}>
                          {text}{col === k && <span aria-hidden="true">{dir > 0 ? " ▲" : " ▼"}</span>}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slice.map((r) => (
                    <tr key={r.id}>
                      <td><a className="tagid textlink" href={"#/tag/" + r.qr_id}>{r.qr_id}</a></td>
                      <td>
                        <span className="cellplant">
                          <Img src={r.photos[0]?.url} alt="" />
                          <span>{r.name}{r.scientific && <i className="mute small block">{r.scientific}</i>}</span>
                        </span>
                      </td>
                      <td><Chip value={r.status}>{STATUS_TEXT[r.status]}</Chip></td>
                      <td>{r.by}</td>
                      <td className="nowrap mute">{r.seen ? fmtDate(r.seen) : "-"}</td>
                      <td className="num">{r.nphotos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {shown.length > 0 && (
            <div className="row between wrap mute pagerrow">
              <span>Showing {(pg - 1) * perPage + 1}–{(pg - 1) * perPage + slice.length} of {shown.length}</span>
              <span className="row">
                <label className="inline">Rows per page
                  <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
                    {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <button className="btn ghost" disabled={pg === 1} onClick={() => setPage(pg - 1)} aria-label="Previous page"><Icon name="chevL" size={18} /></button>
                <button className="btn ghost" disabled={pg === pages} onClick={() => setPage(pg + 1)} aria-label="Next page"><Icon name="chevR" size={18} /></button>
              </span>
            </div>
          )}
      </section>
    </Shell>
  );
}
