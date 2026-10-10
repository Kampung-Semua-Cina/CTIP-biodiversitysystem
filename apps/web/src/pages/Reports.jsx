// web/src/pages/Reports.jsx
import { useState } from "react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import { Chip, Empty } from "../components/Bits.jsx";
import { useStore } from "../store.js";
import { visiblePlants } from "../selectors.js";
import { CONSERVATION } from "../data.js";
import { download, label, toCsv } from "../utils.js";

// Officer reports: counts, a filterable table, and a CSV export of what is on screen.
export default function Reports() {
  const { db, role } = useStore();
  const [conservation, setConservation] = useState("all");
  const [status, setStatus] = useState("all");

  const all = visiblePlants(db, role);
  const rows = all.filter(
    (p) => (conservation === "all" || p.conservation === conservation) && (status === "all" || p.status === status),
  );
  const count = (fn) => all.filter(fn).length;
  const max = Math.max(1, ...CONSERVATION.map((c) => count((p) => p.conservation === c)));

  const exportCsv = () => {
    const head = ["Tag", "Name", "Scientific name", "Family", "Conservation status", "Record status", "Height (cm)", "Latitude", "Longitude", "GPS accuracy (m)"];
    const body = rows.map((p) => [p.qr_id, p.name, p.scientific, p.species?.family, p.conservation, p.status, p.height_cm, p.lat, p.lng, p.gps_accuracy_m]);
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

      <div className="row wrap gap-top-s">
        <select value={conservation} onChange={(e) => setConservation(e.target.value)} aria-label="Conservation status">
          <option value="all">All conservation status</option>
          {CONSERVATION.map((c) => <option key={c} value={c}>{label(c)}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Record status">
          <option value="all">All record status</option>
          {["approved", "synced", "returned", "rejected", "draft", "queued"].map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
      </div>

      {rows.length === 0 ? (
        <Empty icon="chart">No plants match these filters.</Empty>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>Tag</th><th>Plant</th><th>Family</th><th>Conservation</th><th>Record</th><th>Height</th><th>Location</th></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{p.qr_id}</td>
                  <td><a href={"#/dashboard/" + p.qr_id}>{p.name}</a><small className="sci block">{p.scientific}</small></td>
                  <td>{p.species?.family || "-"}</td>
                  <td>{p.species ? <Chip value={p.conservation} /> : "-"}</td>
                  <td><Chip value={p.status} /></td>
                  <td>{p.height_cm != null ? `${p.height_cm} cm` : "-"}</td>
                  <td>{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
