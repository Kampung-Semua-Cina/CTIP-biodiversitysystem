// apps/web/src/pages/Admin.jsx
import { useState } from "react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import { Chip } from "../components/Bits.jsx";
import { useStore } from "../../../shared/store.js";
import { ROLE_LABEL } from "../../../shared/permissions.js";
import { fmtDate, fmtDateTime } from "../../../shared/utils.js";

// Admin page for accounts. Botanists and officers are registered here, not by themselves.
export function Users() {
  const { db, me, addUser, updateUser, notify } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState("botanist");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("active");

  const filtered = (db.profiles || []).filter((u) => {
    const text = `${u.full_name || ""} ${u.email || ""} ${u.role || ""}`.toLowerCase();
    return text.includes(q.trim().toLowerCase());
  });

  const sortedUsers = [...filtered].sort((a, b) => {
    if (sort === "name") return (a.full_name || "").localeCompare(b.full_name || "");
    if (sort === "role") return (a.role || "").localeCompare(b.role || "");
    if (sort === "email") return (a.email || "").localeCompare(b.email || "");
    const aa = a.is_active ? 1 : 0;
    const ab = b.is_active ? 1 : 0;
    return ab - aa || (a.full_name || "").localeCompare(b.full_name || "");
  });

  const add = async (e) => {
    e.preventDefault();
    const res = await addUser({ full_name: name.trim(), email, role: newRole, password: password || undefined });
    if (res === false || res?.ok === false) {
      return notify(res?.message || "This email already has an account");
    }
    setName("");
    setEmail("");
    setPassword("");
    notify("Account added");
  };

  return (
    <Shell seg="users">
      <h2>Users</h2>

      <form className="addform" onSubmit={add}>
        <h3><Icon name="users" size={18} /> Add botanist or officer</h3>
        <div className="row wrap">
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Temporary Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>
          <label>Role
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              {Object.entries(ROLE_LABEL).map(([r, text]) => <option key={r} value={r}>{text}</option>)}
            </select>
          </label>
          <button className="btn" type="submit"><Icon name="plus" size={18} /> Add account</button>
        </div>
        <p className="mute small">Staff sign in with this email and password, and can reset their password from the sign-in page.</p>
      </form>

      <div className="toolbar" style={{ display: "flex", gap: 12, alignItems: "center", margin: "20px 0 14px", flexWrap: "wrap" }}>
        <label className="search grow" style={{ flex: 1, minWidth: 220 }}>
          <Icon name="search" size={18} />
          <input placeholder="Search users by name, email or role" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        </label>
        <label className="inline" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort users">
            <option value="active">Active first</option>
            <option value="name">Name A–Z</option>
            <option value="role">Role</option>
            <option value="email">Email A–Z</option>
          </select>
        </label>
      </div>

      <div className="tablewrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Added</th></tr></thead>
          <tbody>
            {sortedUsers.map((u) => (
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
