// apps/web/src/pages/SensorOverview.jsx
import { useState } from "react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import { Chip, Empty, Mono, Pills, Sparkline } from "../components/Bits.jsx";
import { useConfirm } from "../useConfirm.jsx";
import { useStore } from "../../../shared/store.js";
import { nameOf, plantView } from "../../../shared/selectors.js";
import { fmtDateTime, label } from "../../../shared/utils.js";

const latest = (rows) => rows[rows.length - 1];

// Sensor nodes, their readings, and the alerts they raise (officers and admins).
// Order on the page: summary, open alerts, nodes, readings for the chosen node, alert history.
export default function SensorOverview() {
    const { db, role, setThresholds, notify } = useStore();
  const [nodeId, setNodeId] = useState(db.nodes?.[0]?.id || null);
  const [tab, setTab] = useState("acknowledged");
  const [ask, confirmDialog] = useConfirm();

  const node = db.nodes?.find((n) => n.id === nodeId) || db.nodes?.[0] || null;
  const data = node ? db.telemetry[node.id] || [] : [];
  // A node can be unassigned, or its plant not visible to this role: show a placeholder, never crash.
  const plantOf = (n) => plantView(db, db.plants.find((p) => p.id === n.specimen_id)) || { name: "No plant assigned", qr_id: "-" };
  const byNewest = (a, b) => b.created_at.localeCompare(a.created_at);
  const open = db.alerts.filter((a) => a.status === "open").sort(byNewest);
  const history = db.alerts.filter((a) => a.status !== "open" && (tab === "all" || a.status === tab)).sort(byNewest);
  const online = (db.nodes || []).filter((n) => n.status === "active").length;

  const saveLimits = async (e) => {
    e.preventDefault();
    if (!node) return;
    const f = new FormData(e.target);
    if (!(await ask({ title: "Change alert limits", body: `Change the alert limits for ${node.name} to ${Number(f.get("temp_max"))}°C max and ${Number(f.get("moisture_min"))}% soil moisture min? New alerts will use these limits.`, confirmLabel: "Save limits" }))) return;
    setThresholds(node.id, { temp_max: Number(f.get("temp_max")), moisture_min: Number(f.get("moisture_min")) });
    notify("Limits saved");
  };

  return (
    <Shell seg="monitoring" plain>
      {confirmDialog}
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
        {db.nodes.length === 0 ? (
          <div className="glass pad"><Empty icon="shield">No sensor nodes have been registered yet.</Empty></div>
        ) : (
          <div className="grid g3">
            {db.nodes.map((n) => {
              const last = latest(db.telemetry[n.id] || []);
              const up = n.status === "active";
              return (
                <button key={n.id} className={"glass nodecard" + (n.id === node?.id ? " on" : "") + (up ? "" : " down")} aria-pressed={n.id === node?.id} onClick={() => setNodeId(n.id)}>
                  <span className="row between"><b>{n.name}</b><span className={"dotstatus " + (up ? "up" : "off")}>{up ? "Online" : label(n.status)}</span></span>
                  <small className="mute">{plantOf(n).name} · <Mono>{plantOf(n).qr_id}</Mono></small>
                  {up && last ? (
                    <span className="row"><span><Mono>{last.temperature}°C</Mono> temp</span><span><Mono>{last.soil_moisture}%</Mono> soil</span></span>
                  ) : (
                    <span className="warntext"><b>{n.last_seen ? `No data since ${fmtDateTime(n.last_seen)}` : "No data yet"}</b></span>
                  )}
                  <small className="mute">{up ? (n.last_seen ? `Updated ${fmtDateTime(n.last_seen)}` : "Waiting for the first reading") : "Check the node's battery or Wi-Fi"}</small>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {node && (
        <section className="glass pad gap-section-s" aria-labelledby="readings">
          <div className="row between wrap">
            <h2 id="readings">{node.name} readings</h2>
            <span className="mute small row"><svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" className="spark-limit" /></svg> alert limit</span>
          </div>
          <div className="charts">
            <Sparkline title="Temperature" unit="°C" values={data.map((d) => d.temperature)} limit={node.thresholds?.temp_max} />
            <Sparkline title="Soil moisture" unit="%" values={data.map((d) => d.soil_moisture)} limit={node.thresholds?.moisture_min} />
          </div>

          {node.thresholds && (
            <details className="limits">
              <summary>Alert limits for {node.name} · {node.thresholds.temp_max}°C max, {node.thresholds.moisture_min}% soil min</summary>
                            {role === "admin" ? (<form key={node.id} className="row wrap" onSubmit={saveLimits}>
                <label>Temperature max (°C)<input name="temp_max" type="number" step="0.5" defaultValue={node.thresholds.temp_max} /></label>
                <label>Soil moisture min (%)<input name="moisture_min" type="number" step="1" defaultValue={node.thresholds.moisture_min} /></label>
                <button className="btn ghost" type="submit"><Icon name="check" size={18} /> Save limits</button>
                            </form>) : <p className="mute small">Only an admin can change these limits.</p>}
            </details>
          )}
        </section>
      )}

      <section className="gap-section-s" aria-labelledby="history">
        <h2 id="history">Alert history</h2>
        <div className="row wrap gap-bottom">
          <Pills label="Alert history" value={tab} onChange={setTab} items={["acknowledged", "resolved", "all"].map((t) => ({ key: t, label: label(t) }))} />
        </div>
        {history.length === 0 && <div className="glass pad"><Empty icon="shield">No {tab === "all" ? "" : tab} alerts.</Empty></div>}
        {history.map((a) => <AlertCard key={a.id} alert={a} />)}
      </section>
    </Shell>
  );
}

// Assign -> Acknowledge -> Resolve, so everyone can see where an alert is.
// Officers read alerts only; admins assign, acknowledge, add notes and resolve.
const STEPS = ["Assign", "Acknowledge", "Resolve"];
function stepOf(alert) {
  if (alert.status === "resolved") return 3;
  if (alert.status === "acknowledged") return 2;
  return alert.assigned_to ? 1 : 0;
}

function AlertCard({ alert }) {
  const { db, role, ackAlert, resolveAlert, assignAlert, addAlertNote, notify } = useStore();
  const canAct = role === "admin";
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [ask, confirmDialog] = useConfirm();
  const node = db.nodes.find((n) => n.id === alert.node_id);

  const resolve = async () => {
    if (!outcome.trim()) return notify("Write what was found first");
    if (!(await ask({ title: "Resolve alert", body: `Mark this ${alert.type} alert as resolved? It will leave the open list and its outcome (“${outcome.trim()}”) is recorded.`, confirmLabel: "Resolve alert" }))) return;
    resolveAlert(alert.id, outcome.trim());
    notify("Alert resolved");
  };
  const notes = db.alertNotes.filter((n) => n.alert_id === alert.id);
  const officers = db.profiles.filter((p) => p.role === "officer" && p.is_active);

  return (
    <article className={"glass record sev-" + alert.severity}>
      {confirmDialog}
      <header>
        <div>
          <b>{alert.type}</b>
          <small className="mute block">{node?.name || "Unknown node"} · {fmtDateTime(alert.created_at)}</small>
        </div>
        <span className="row"><Chip value={alert.severity} /><Chip value={alert.status} /></span>
      </header>

      <p className="mute small">
        {node?.name || "Unknown node"}'s reading: {Object.entries(alert.reading || {}).map(([k, v], i) => <span key={k}>{i > 0 && " · "}{label(k)} <Mono>{v}</Mono></span>)}
      </p>

      <ol className="progress" aria-label="Alert progress">
        {STEPS.map((s, i) => (
          <li key={s} className={i < stepOf(alert) ? "done" : i === stepOf(alert) ? "now" : ""}>{i + 1} · {s}</li>
        ))}
      </ol>

      {canAct ? (
      <div className="row wrap">
        <label className="inline">Assigned to
          <select value={alert.assigned_to || ""} onChange={(e) => { assignAlert(alert.id, e.target.value); notify("Alert assigned"); }}>
            {officers.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
          </select>
        </label>
        {alert.status === "open" && <button className="btn" onClick={() => { ackAlert(alert.id); notify("Alert acknowledged"); }}><Icon name="check" size={18} /> Acknowledge</button>}
      </div>
      ) : (
        <p className="mute small">Assigned to {alert.assigned_to ? nameOf(db, alert.assigned_to) : "nobody yet"}</p>
      )}
      {alert.acknowledged_by && <p className="mute small">Acknowledged by {nameOf(db, alert.acknowledged_by)} · {fmtDateTime(alert.acknowledged_at)}</p>}

      <ul className="plain thread">
        {notes.map((n) => <li key={n.id}><b>{nameOf(db, n.author_id)}</b>{n.note}<small className="mute block">{fmtDateTime(n.created_at)}</small></li>)}
      </ul>

      {alert.status === "resolved" ? (
        <p className="mute">Outcome: {alert.outcome}</p>
      ) : !canAct ? (
        <p className="mute small">Only an admin can act on alerts.</p>
      ) : (
        <>
          <div className="row">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an investigation note" aria-label="Investigation note" />
            <button className="btn ghost" onClick={() => { if (note.trim()) { addAlertNote(alert.id, note.trim()); setNote(""); } }}><Icon name="plus" size={18} /> Add note</button>
          </div>
          <div className="row gap-top-s">
            <input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="What was found? (needed to resolve)" aria-label="Outcome" />
            <button className="btn" onClick={resolve}><Icon name="shield" size={18} /> Resolve</button>
          </div>
        </>
      )}
    </article>
  );
}
