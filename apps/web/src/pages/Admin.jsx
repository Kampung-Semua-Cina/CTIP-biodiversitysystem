// web/src/pages/Admin.jsx
import { useState } from "react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import { Chip } from "../components/Bits.jsx";
import { useStore } from "../store.js";
import { ROLE_LABEL } from "../permissions.js";
import { DEFAULT_PW } from "../data.js";
import { fmtDate, fmtDateTime } from "../utils.js";

// Admin page for accounts. Botanists and officers are registered here, not by themselves.
export function Users() {
  const { db, me, addUser, updateUser, notify } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState("botanist");

  const add = (e) => {
    e.preventDefault();
    if (!addUser({ full_name: name.trim(), email, role: newRole })) return notify("This email already has an account");
    setName("");
    setEmail("");
    notify("Account added");
  };

  return (
    <Shell seg="users">
      <h2>Users</h2>

      <form className="addform" onSubmit={add}>
        <h3 className="sub"><Icon name="plus" size={18} /> Add botanist or officer</h3>
        <div className="row wrap">
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Role
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              {Object.entries(ROLE_LABEL).map(([r, text]) => <option key={r} value={r}>{text}</option>)}
            </select>
          </label>
          <button className="btn" type="submit">Add account</button>
        </div>
        <p className="mute small">Default password: <b>{DEFAULT_PW}</b>. Give it to them yourself; they are asked to change it the first time they sign in, and can change it later from the login page.</p>
      </form>

      <div className="tablewrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Added</th></tr></thead>
          <tbody>
            {db.profiles.map((u) => (
              <tr key={u.id}>
                <td><b>{u.full_name}</b>{u.id === me.id && <small className="mute"> (you)</small>}</td>
                <td>{u.email}</td>
                <td>
                  <select value={u.role} disabled={u.id === me.id} onChange={(e) => updateUser(u.id, { role: e.target.value })} aria-label={`Role for ${u.full_name}`}>
                    {Object.entries(ROLE_LABEL).map(([r, text]) => <option key={r} value={r}>{text}</option>)}
                  </select>
                </td>
                <td>
                  <button className={"switch" + (u.is_active ? " on" : "")} role="switch" aria-checked={u.is_active} disabled={u.id === me.id}
                    onClick={() => updateUser(u.id, { is_active: !u.is_active })} aria-label={`Account active for ${u.full_name}`}><i /></button>
                </td>
                <td>{fmtDate(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

// Every change recorded by the actions (audit_logs table), newest first.
export function Audit() {
  const { db } = useStore();
  return (
    <Shell seg="audit">
      <h2>Audit log</h2>
      <p className="mute">Who changed what. Entries cannot be edited.</p>
      <div className="tablewrap">
        <table>
          <thead><tr><th>When</th><th>Who</th><th>Table</th><th>Action</th><th>Change</th></tr></thead>
          <tbody>
            {db.audit.map((a) => (
              <tr key={a.id}>
                <td>{fmtDateTime(a.changed_at)}</td>
                <td>{db.profiles.find((p) => p.id === a.changed_by)?.full_name || "System"}</td>
                <td>{a.table_name}</td>
                <td><Chip value={a.action} /></td>
                <td className="code">{a.old_value ? JSON.stringify(a.old_value) + " → " : ""}{JSON.stringify(a.new_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mute small">Showing {db.audit.length} entries.</p>
    </Shell>
  );
}
