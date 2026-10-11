import { useState } from "react";
import Icon from "../components/Icon.jsx";
import Img from "../components/Img.jsx";
import { Chip, Empty } from "../components/Bits.jsx";
import { useStore } from "../store.js";
import { can } from "../permissions.js";
import { speciesCatalogue } from "../selectors.js";
import { CONSERVATION } from "../data.js";
import { label } from "../utils.js";

const PAGE = 12;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Species catalogue: one card per species (not one per tagged plant), with filters and pages.
// Everyone can open it. Visitors only get published species and never see conservation status.
export default function Catalogue() {
  const { db, role } = useStore();
  const staff = can(role, "pending");
  const [q, setQ] = useState("");
  const [families, setFamilies] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [sort, setSort] = useState("name");
  const [view, setView] = useState("grid");
  const [page, setPage] = useState(1);

  const all = speciesCatalogue(db, role);
  const tagged = all.reduce((n, s) => n + s.plants.length, 0);
  const text = (s) => `${s.name} ${s.scientific_name} ${s.family} ${s.genus}`.toLowerCase();
  const searched = all.filter((s) => text(s).includes(q.trim().toLowerCase()));
  const shown = searched
    .filter((s) => !families.length || families.includes(s.family))
    .filter((s) => !statuses.length || statuses.includes(s.conservation_status))
    .sort((a, b) => (sort === "tagged" ? b.plants.length - a.plants.length : 0) || a.name.localeCompare(b.name));

  // Counts next to each filter come from the searched list, so they match what you'd get.
  const familyCounts = Object.entries(
    searched.reduce((m, s) => ({ ...m, [s.family]: (m[s.family] || 0) + 1 }), {}),
  ).sort(([a], [b]) => a.localeCompare(b));
  const statusCounts = CONSERVATION.map((c) => [c, searched.filter((s) => s.conservation_status === c).length]).filter(([, n]) => n);

  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const cur = Math.min(page, pages); // filters can shrink the page count
  const slice = shown.slice((cur - 1) * PAGE, cur * PAGE);
  const toggle = (list, set, v) => { set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]); setPage(1); };
  const clear = () => { setFamilies([]); setStatuses([]); setQ(""); setPage(1); };

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Plants of Niah</h1>
          <p className="mute">{plural(all.length, "species", "species")} · {plural(tagged, "tagged plant", "tagged plants")} across the park</p>
        </div>
        <a className="btn ghost" href="#/map"><Icon name="map" size={18} /> Show plants on the map</a>
      </div>

      <div className="toolbar">
        <label className="search grow">
          <Icon name="search" size={20} />
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search by common name, scientific name or family" aria-label="Search species" />
        </label>
        <label className="inline">Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">Name A–Z</option>
            <option value="tagged">Most tagged</option>
          </select>
        </label>
        <div className="seg" role="group" aria-label="View">
          <button className={view === "grid" ? "on" : ""} aria-pressed={view === "grid"} onClick={() => setView("grid")} aria-label="Grid view"><Icon name="dashboard" size={18} /></button>
          <button className={view === "list" ? "on" : ""} aria-pressed={view === "list"} onClick={() => setView("list")} aria-label="List view"><Icon name="file" size={18} /></button>
        </div>
      </div>

      <div className="catalogue">
        <aside className="facets" aria-label="Filters">
          <fieldset>
            <legend>Family</legend>
            {familyCounts.map(([f, n]) => (
              <label key={f} className="check"><input type="checkbox" checked={families.includes(f)} onChange={() => toggle(families, setFamilies, f)} /><span className="grow">{f}</span><small className="mute">{n}</small></label>
            ))}
          </fieldset>
          {staff && (
            <fieldset>
              <legend>Conservation status</legend>
              {statusCounts.map(([c, n]) => (
                <label key={c} className="check"><input type="checkbox" checked={statuses.includes(c)} onChange={() => toggle(statuses, setStatuses, c)} /><span className="grow">{label(c)}</span><small className="mute">{n}</small></label>
              ))}
            </fieldset>
          )}
          {(families.length > 0 || statuses.length > 0 || q) && <button className="btn ghost small-btn" onClick={clear}>Clear filters</button>}
        </aside>

        <section className="results">
          <p className="mute small" aria-live="polite">
            {shown.length ? `Showing ${(cur - 1) * PAGE + 1}–${(cur - 1) * PAGE + slice.length} of ${plural(shown.length, "species", "species")}` : "No species match these filters."}
          </p>
          {!shown.length && <Empty icon="search">Try a different name, or clear the filters.</Empty>}
          <ul className={"plain " + (view === "grid" ? "speciesgrid" : "specieslist")}>
            {slice.map((s) => (
              <li key={s.id}>
                <a className="glass speciescard" href={"#/plants/" + s.id}>
                  {s.photo ? <Img src={s.photo} alt="" /> : <span className="nophoto" aria-hidden="true"><Icon name="leaf" size={32} /></span>}
                  <div>
                    <span className="eyebrow small">{s.family}</span>
                    <b className="block">{s.name}</b>
                    <i className="mute small">{s.scientific_name}</i>
                    <span className="cardfoot mute small">
                      {plural(s.plants.length, "tagged plant", "tagged plants")}
                      {!staff && s.endangered && s.plants.length > 0 && " · locations hidden"}
                    </span>
                    {staff && (
                      <span className="row wrap">
                        <Chip value={s.conservation_status} />
                        {!s.is_published && <Chip value="draft">Not published</Chip>}
                      </span>
                    )}
                  </div>
                </a>
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <nav className="pager" aria-label="Pages">
              <button className="btn ghost" disabled={cur === 1} onClick={() => setPage(cur - 1)} aria-label="Previous page"><Icon name="chevL" size={18} /></button>
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <button key={n} className={"btn " + (n === cur ? "" : "ghost")} aria-current={n === cur ? "page" : undefined} onClick={() => setPage(n)}>{n}</button>
              ))}
              <button className="btn ghost" disabled={cur === pages} onClick={() => setPage(cur + 1)} aria-label="Next page"><Icon name="chevR" size={18} /></button>
            </nav>
          )}
        </section>
      </div>
    </>
  );
}
