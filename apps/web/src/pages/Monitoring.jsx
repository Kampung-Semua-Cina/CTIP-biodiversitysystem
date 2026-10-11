// apps/web/src/pages/Monitoring.jsx
import { useState } from "react";
import Shell from "../components/Shell.jsx";
import { Chip, Empty, Sparkline } from "../components/Bits.jsx";
import { useStore } from "../store.js";
import { nameOf, plantView } from "../selectors.js";
import { fmtDateTime, label } from "../utils.js";

const latest = (rows) => rows[rows.length - 1];

// Sensor nodes, their readings, and the alerts they raise (officers and admins).
// Order on the page: summary, open alerts, nodes, readings for the chosen node, alert history.
export default function Monitoring() {
  const { db, setThresholds, notify } = useStore();
  const [nodeId, setNodeId] = useState(db.nodes[0].id);
  const [tab, setTab] = useState("acknowledged");

  const node = db.nodes.find((n) => n.id === nodeId);
  const data = db.telemetry[node.id] || [];
  const plantOf = (n) => plantView(db, db.plants.find((p) => p.id === n.specimen_id));
  const byNewest = (a, b) => b.created_at.localeCompare(a.created_at);
  const open = db.alerts.filter((a) => a.status === "open").sort(byNewest);
  const history = db.alerts.filter((a) => a.status !== "open" && (tab === "all" || a.status === tab)).sort(byNewest);
  const online = db.nodes.filter((n) => n.status === "active").length;

  const saveLimits = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    setThresholds(node.id, { temp_max: Number(f.get("temp_max")), moisture_min: Number(f.get("moisture_min")) });
    notify("Limits saved");
  };

  return (
    <Shell seg="monitoring" plain>
      <div className="pagehead">
        <div>
          <h1>Monitoring</h1>
          <p className="mute">Sensor nodes protecting tagged plants · last 24 hours</p>
        </div>
      </div>

      <div className="tiles">
        <div className={"glass tile" + (open.length ? " tile-bad" : "")}><span className="mute">Open alerts</span><b>{open.length}</b></div>
        <div className="glass tile"><span className="mute">Nodes online</span><b>{online} <small className="mute">of {db.nodes.length}</small></b></div>
        <div className={"glass tile" + (db.nodes.length - online ? " tile-warn" : "")}><span className="mute">Offline or faulty</span><b>{db.nodes.length - online}</b></div>
      </div>

      <section className="gap-section-s" aria-labelledby="attn">
        <h2 id="attn">Needs attention</h2>
        {open.length === 0 ? (
          <div className="glass pad"><Empty icon="shield">No open alerts. All quiet.</Empty></div>
        ) : (
          open.map((a) => <AlertCard key={a.id} alert={a} />)
        )}
      </section>

      <section className="gap-section-s" aria-labelledby="nodes">
        <h2 id="nodes">Sensor nodes</h2>
        <div className="grid g3">
          {db.nodes.map((n) => {
            const last = latest(db.telemetry[n.id] || []);
            const up = n.status === "active";
            return (
              <button key={n.id} className={"glass nodecard" + (n.id === node.id ? " on" : "") + (up ? "" : " down")} aria-pressed={n.id === node.id} onClick={() => setNodeId(n.id)}>
                <span className="row between"><b>{n.name}</b><span className={"dotstatus " + (up ? "up" : "off")}>{up ? "Online" : label(n.status)}</span></span>
                <small className="mute">{plantOf(n).name} · {plantOf(n).qr_id}</small>
                {up && last ? (
                  <span className="row"><span><b>{last.temperature}°C</b> temp</span><span><b>{last.soil_moisture}%</b> soil</span></span>
                ) : (
                  <span className="warntext"><b>No data since {fmtDateTime(n.last_seen)}</b></span>
                )}
                <small className="mute">{up ? `Updated ${fmtDateTime(n.last_seen)}` : "Check the node's battery or Wi-Fi"}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="glass pad gap-section-s" aria-labelledby="readings">
        <div className="row between wrap">
          <h2 id="readings">{node.name} readings</h2>
          <span className="mute small row"><svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" className="spark-limit" /></svg> alert limit</span>
        </div>
        <div className="charts">
          <Sparkline title="Temperature" unit="°C" values={data.map((d) => d.temperature)} limit={node.thresholds.temp_max} />
          <Sparkline title="Soil moisture" unit="%" values={data.map((d) => d.soil_moisture)} limit={node.thresholds.moisture_min} />
        </div>

        <details className="limits">
          <summary>Alert limits for {node.name} · {node.thresholds.temp_max}°C max, {node.thresholds.moisture_min}% soil min</summary>
          <form key={node.id} className="row wrap" onSubmit={saveLimits}>
            <label>Temperature max (°C)<input name="temp_max" type="number" step="0.5" defaultValue={node.thresholds.temp_max} /></label>
            <label>Soil moisture min (%)<input name="moisture_min" type="number" step="1" defaultValue={node.thresholds.moisture_min} /></label>
            <button className="btn ghost" type="submit">Save limits</button>
          </form>
        </details>
      </section>

      <section className="gap-section-s" aria-labelledby="history">
        <h2 id="history">Alert history</h2>
        <div className="row wrap gap-bottom">
          {["acknowledged", "resolved", "all"].map((t) => (
            <button key={t} className={"pill" + (tab === t ? " on" : "")} aria-pressed={tab === t} onClick={() => setTab(t)}>{label(t)}</button>
          ))}
        </div>
        {history.length === 0 && <div className="glass pad"><Empty icon="shield">No {tab === "all" ? "" : tab} alerts.</Empty></div>}
        {history.map((a) => <AlertCard key={a.id} alert={a} />)}
      </section>
    </Shell>
  );
}

// Assign -> Acknowledge -> Resolve, so officers can see where an alert is.
const STEPS = ["Assign", "Acknowledge", "Resolve"];
function stepOf(alert) {
  if (alert.status === "resolved") return 3;
  if (alert.status === "acknowledged") return 2;
  return alert.assigned_to ? 1 : 0;
}

function AlertCard({ alert }) {
  const { db, ackAlert, resolveAlert, assignAlert, addAlertNote, notify } = useStore();
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const node = db.nodes.find((n) => n.id === alert.node_id);
  const notes = db.alertNotes.filter((n) => n.alert_id === alert.id);
  const officers = db.profiles.filter((p) => p.role === "officer" && p.is_active);

  return (
    <article className={"glass record sev-" + alert.severity}>
      <header>
        <div>
          <b>{alert.type}</b>
          <small className="mute block">{node.name} · {fmtDateTime(alert.created_at)}</small>
        </div>
        <span className="row"><Chip value={alert.severity} /><Chip value={alert.status} /></span>
      </header>

      <p className="mute small">
        {node.name}'s reading: {Object.entries(alert.reading).map(([k, v]) => `${label(k)} ${v}`).join(" · ")}
      </p>

      <ol className="progress" aria-label="Alert progress">
        {STEPS.map((s, i) => (
          <li key={s} className={i < stepOf(alert) ? "done" : i === stepOf(alert) ? "now" : ""}>{i + 1} · {s}</li>
        ))}
      </ol>

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
