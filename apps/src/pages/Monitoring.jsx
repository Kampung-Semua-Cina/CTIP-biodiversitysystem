import { useState } from "react";
import Shell from "../components/Shell.jsx";
import { Chip, Empty, Sparkline } from "../components/Bits.jsx";
import { useStore } from "../store.js";
import { nameOf, plantView } from "../selectors.js";
import { fmtDateTime, label } from "../utils.js";

// Sensor nodes, their readings, and the alerts they raise (officers and admins).
export default function Monitoring() {
  const { db, setThresholds, notify } = useStore();
  const [nodeId, setNodeId] = useState(db.nodes[0].id);
  const [tab, setTab] = useState("open");

  const node = db.nodes.find((n) => n.id === nodeId);
  const data = db.telemetry[node.id] || [];
  const plantOf = (n) => plantView(db, db.plants.find((p) => p.id === n.specimen_id));
  const alerts = db.alerts
    .filter((a) => tab === "all" || a.status === tab)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const openCount = db.alerts.filter((a) => a.status === "open").length;

  const saveLimits = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    setThresholds(node.id, { temp_max: Number(f.get("temp_max")), moisture_min: Number(f.get("moisture_min")) });
    notify("Limits saved");
  };

  return (
    <Shell seg="monitoring">
      <h2>Monitoring</h2>
      <p className="mute">{openCount} open alert{openCount === 1 ? "" : "s"} · {db.nodes.filter((n) => n.status !== "active").length} node offline or faulty</p>

      <div className="grid g3 gap">
        {db.nodes.map((n) => (
          <button key={n.id} className={"nodecard" + (n.id === node.id ? " on" : "")} onClick={() => setNodeId(n.id)}>
            <span className="row between"><b>{n.name}</b><Chip value={n.status} /></span>
            <small className="mute">{plantOf(n).name} · {plantOf(n).qr_id}</small>
            <small className="mute">Last seen {fmtDateTime(n.last_seen)}</small>
          </button>
        ))}
      </div>

      <div className="charts">
        <Sparkline title="Temperature" unit="°C" values={data.map((d) => d.temperature)} limit={node.thresholds.temp_max} />
        <Sparkline title="Soil moisture" unit="%" values={data.map((d) => d.soil_moisture)} limit={node.thresholds.moisture_min} />
      </div>
      <p className="mute small">Dashed line = alert limit for {node.name}. Last 24 hours.</p>

      <form key={node.id} className="row wrap" onSubmit={saveLimits}>
        <label>Temperature limit (°C)<input name="temp_max" type="number" step="0.5" defaultValue={node.thresholds.temp_max} /></label>
        <label>Soil moisture minimum (%)<input name="moisture_min" type="number" step="1" defaultValue={node.thresholds.moisture_min} /></label>
        <button className="btn ghost" type="submit">Save limits</button>
      </form>

      <h3 className="sub">Alerts</h3>
      <div className="row wrap gap-bottom">
        {["open", "acknowledged", "resolved", "all"].map((t) => (
          <button key={t} className={"pill" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>{label(t)}</button>
        ))}
      </div>
      {alerts.length === 0 && <Empty icon="shield">No {tab === "all" ? "" : tab} alerts.</Empty>}
      {alerts.map((a) => <AlertCard key={a.id} alert={a} />)}
    </Shell>
  );
}

function AlertCard({ alert }) {
  const { db, ackAlert, resolveAlert, assignAlert, addAlertNote, notify } = useStore();
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const node = db.nodes.find((n) => n.id === alert.node_id);
  const notes = db.alertNotes.filter((n) => n.alert_id === alert.id);
  const officers = db.profiles.filter((p) => p.role === "conservation_officer" && p.is_active);

  return (
    <article className={"record sev-" + alert.severity}>
      <header>
        <div>
          <b>{alert.type}</b>
          <small className="mute block">{node.name} · {fmtDateTime(alert.created_at)}</small>
        </div>
        <span className="row"><Chip value={alert.severity} /><Chip value={alert.status} /></span>
      </header>

      <p className="mute small">
        {Object.entries(alert.reading).map(([k, v]) => `${label(k)}: ${v}`).join(" · ")}
      </p>

      <div className="row wrap">
        <label className="inline">Assigned to
          <select value={alert.assigned_to || ""} onChange={(e) => { assignAlert(alert.id, e.target.value); notify("Alert assigned"); }}>
            {officers.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
          </select>
        </label>
        {alert.status === "open" && <button className="btn" onClick={() => { ackAlert(alert.id); notify("Alert acknowledged"); }}>Acknowledge</button>}
      </div>
      {alert.acknowledged_by && <p className="mute small">Acknowledged by {nameOf(db, alert.acknowledged_by)} · {fmtDateTime(alert.acknowledged_at)}</p>}

      <ul className="plain thread">
        {notes.map((n) => <li key={n.id}><b>{nameOf(db, n.author_id)}</b> {n.note}<small className="mute block">{fmtDateTime(n.created_at)}</small></li>)}
      </ul>

      {alert.status === "resolved" ? (
        <p className="mute">Outcome: {alert.outcome}</p>
      ) : (
        <>
          <div className="row">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an investigation note" aria-label="Investigation note" />
            <button className="btn ghost" onClick={() => { if (note.trim()) { addAlertNote(alert.id, note.trim()); setNote(""); } }}>Add note</button>
          </div>
          <div className="row gap-top-s">
            <input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="What was found? (needed to resolve)" aria-label="Outcome" />
            <button className="btn" onClick={() => { if (!outcome.trim()) return notify("Write what was found first"); resolveAlert(alert.id, outcome.trim()); notify("Alert resolved"); }}>Resolve</button>
          </div>
        </>
      )}
    </article>
  );
}
