import Icon from "../components/Icon.jsx";
import PlantCard from "../components/PlantCard.jsx";
import { Chip, Empty, Pills } from "../components/Bits.jsx";
import { useStore } from "../../../shared/store.js";
import { can } from "../../../shared/permissions.js";
import { speciesCatalogue } from "../../../shared/selectors.js";
import { fuzzyMatch } from "../../../shared/fuzzy.js";
import { CONSERVATION } from "../../../shared/data.js";
import { label } from "../../../shared/utils.js";
import { setQuery, useRoute } from "../useRoute.js";

const PAGE = 12;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Species catalogue: one card per species (not one per tagged plant), with filters and pages.
// Everyone can open it. Visitors only get published species. Conservation status shows on every
// card (Daun design language); only staff get the conservation filter.
// Every filter, the sort, the page and the view are kept in the URL
// (#/plants?q=…&family=…&genus=…&status=…&sort=…&page=…&view=…), so a search can be shared.
export default function Catalogue() {
  const { db, role, apiStatus, isSyncing, refreshFromBackend, backendSpeciesCount } = useStore();
  const staff = can(role, "pending");
  const { query } = useRoute();
  const q = query.q || "";
  const family = query.family || "all";
  const genus = query.genus || "all";
  const status = staff && query.status ? query.status : "all"; // visitors never filter by status
  const sort = ["scientific", "family", "endangered", "tagged"].includes(query.sort) ? query.sort : "name";
  const view = query.view === "list" ? "list" : "grid";
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  // A new filter starts again at page 1. "all" is the default, so it is left out of the URL.
  const filter = (key) => (v) => setQuery({ [key]: v === "all" ? null : v, page: null });
  const setPage = (n) => setQuery({ page: n > 1 ? n : null });

  const all = speciesCatalogue(db, role);
  const tagged = all.reduce((n, s) => n + s.plants.length, 0);
  const text = (s) => `${s.name} ${s.scientific_name} ${s.family} ${s.genus}`.toLowerCase();
  const searched = all.filter((s) => fuzzyMatch(text(s), q));
  const shown = searched
    .filter((s) => family === "all" || s.family === family)
    .filter((s) => genus === "all" || s.genus === genus)
    .filter((s) => status === "all" || s.conservation_status === status)
    .sort((a, b) => {
      if (sort === "scientific") return (a.scientific_name || "").localeCompare(b.scientific_name || "");
      if (sort === "family") return (a.family || "").localeCompare(b.family || "") || a.name.localeCompare(b.name);
      if (sort === "endangered") {
        const ea = a.conservation_status === "endangered" ? 1 : 0;
        const eb = b.conservation_status === "endangered" ? 1 : 0;
        return eb - ea || a.name.localeCompare(b.name);
      }
      if (sort === "tagged") return b.plants.length - a.plants.length || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });

  // Counts next to each filter come from the searched list, so they match what you'd get.
  const familyCounts = Object.entries(
    searched.reduce((m, s) => ({ ...m, [s.family]: (m[s.family] || 0) + 1 }), {}),
  ).sort(([a], [b]) => a.localeCompare(b));
  // Genera of the chosen family (or of every family), from the searched list.
  const genera = [...new Set(searched.filter((s) => family === "all" || s.family === family).map((s) => s.genus).filter(Boolean))].sort();
  const statusCounts = CONSERVATION.map((c) => [c, searched.filter((s) => s.conservation_status === c).length]).filter(([, n]) => n);

  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const cur = Math.min(page, pages); // filters can shrink the page count
  const slice = shown.slice((cur - 1) * PAGE, cur * PAGE);
  const filtered = q || family !== "all" || genus !== "all" || status !== "all";

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Plants of Niah</h1>
          <p className="mute">
            {plural(all.length, "species", "species")} · {plural(tagged, "tagged plant", "tagged plants")} across the park
            {apiStatus === "connected" && (
              <span className="api-badge on" style={{ marginLeft: 8 }} title="Synchronized with GET /v1/public/species">
                <Icon name="cloud" size={12} /> {backendSpeciesCount > 0 ? `${backendSpeciesCount} from API` : "Live API"}
              </span>
            )}
          </p>
        </div>
        <div className="row wrap gap-s">
          <button className="btn ghost" onClick={refreshFromBackend} disabled={isSyncing} title="Sync species catalogue with API">
            <Icon name="refresh" size={16} /> {isSyncing ? "Syncing..." : "Sync API"}
          </button>
          <a className="btn ghost" href="#/map"><Icon name="map" size={18} /> Show plants on the map</a>
        </div>
      </div>

      <div className="toolbar">
        <label className="search grow">
          <Icon name="search" size={20} />
          <input type="search" value={q} onChange={(e) => setQuery({ q: e.target.value, page: null })} placeholder="Search by common name, scientific name, family or genus" aria-label="Search species" />
        </label>
        <label className="inline">Sort
          <select value={sort} onChange={(e) => setQuery({ sort: e.target.value === "name" ? null : e.target.value })}>
            <option value="name">Common name A–Z</option>
            <option value="scientific">Scientific name A–Z</option>
            <option value="family">Family A–Z</option>
            <option value="endangered">Endangered first</option>
            <option value="tagged">Most tagged</option>
          </select>
        </label>
        <div className="seg" role="group" aria-label="View">
          <button className={view === "grid" ? "on" : ""} aria-pressed={view === "grid"} onClick={() => setQuery({ view: null })} aria-label="Grid view"><Icon name="dashboard" size={18} /></button>
          <button className={view === "list" ? "on" : ""} aria-pressed={view === "list"} onClick={() => setQuery({ view: "list" })} aria-label="List view"><Icon name="file" size={18} /></button>
        </div>
      </div>

      <div className="filters">
        <div>
          <p className="overline">Family</p>
          <Pills label="Family" value={family} onChange={(v) => setQuery({ family: v === "all" ? null : v, genus: null, page: null })}
            items={[{ key: "all", label: "All families", count: searched.length }, ...familyCounts.map(([f, n]) => ({ key: f, label: f, count: n }))]} />
        </div>
        {genera.length > 0 && (
          <label className="inline">Genus
            <select value={genus} onChange={(e) => filter("genus")(e.target.value)}>
              <option value="all">All genera</option>
              {genera.map((g) => <option key={g} value={g}>{g}</option>)}
              {genus !== "all" && !genera.includes(genus) && <option value={genus}>{genus}</option>}
            </select>
          </label>
        )}
        {staff && (
          <div>
            <p className="overline">Conservation status</p>
            <Pills label="Conservation status" value={status} onChange={filter("status")}
              items={[{ key: "all", label: "Any status" }, ...statusCounts.map(([c, n]) => ({ key: c, label: label(c), count: n }))]} />
          </div>
        )}
      </div>

      <section className="results">
          <p className="mute small" aria-live="polite">
            {shown.length ? `Showing ${(cur - 1) * PAGE + 1}–${(cur - 1) * PAGE + slice.length} of ${plural(shown.length, "species", "species")}` : "No species match these filters."}
          </p>
          {filtered && <button className="btn ghost small-btn" onClick={() => setQuery({ q: null, family: null, genus: null, status: null, page: null })}>Clear filters</button>}
          {!shown.length && <Empty icon="search">Try a different name, or pick another family.</Empty>}
          <ul className={"plain " + (view === "grid" ? "speciesgrid" : "specieslist")}>
            {slice.map((s) => (
              <li key={s.id}>
                <PlantCard href={"#/plants/" + s.id} photo={s.photo} family={s.family} name={s.name} scientific={s.scientific_name}
                  conservation={s.conservation_status}
                  foot={plural(s.plants.length, "tagged plant", "tagged plants") + (!staff && s.endangered ? " · locations hidden" : "")}>
                  {staff && !s.is_published && <Chip value="draft">Not published</Chip>}
                </PlantCard>
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
    </>
  );
}
