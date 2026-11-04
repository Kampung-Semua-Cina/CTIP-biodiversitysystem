// apps/web/src/pages/Admin.jsx
import { useState } from "react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import { Chip } from "../components/Bits.jsx";
import { useConfirm } from "../useConfirm.jsx";
import { useStore } from "../../../shared/store.js";
import { fuzzyMatch } from "../../../shared/fuzzy.js";
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
  const [ask, confirmDialog] = useConfirm();

  const filtered = (db.profiles || []).filter((u) => {
    return fuzzyMatch(`${u.full_name || ""} ${u.email || ""} ${u.role || ""}`, q);
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
    const ok = password
      ? await ask({ title: "Create account with a password", body: `This creates an account for ${email} as ${ROLE_LABEL[newRole]} with the temporary password you typed, so they can sign in straight away.`, confirmLabel: "Create account", word: "CREATE" })
      : await ask({ title: "Invite member", body: `Send an email invitation to ${email} as ${ROLE_LABEL[newRole]}?`, confirmLabel: "Send invitation" });
    if (!ok) return;
    const res = await addUser({ full_name: name.trim(), email, role: newRole, password: password || undefined });
    if (res === false || res?.ok === false) {
      return notify(res?.message || "This email already has an account");
    }
    setName("");
    setEmail("");
    setPassword("");
  };

  const changeRole = async (u, role) => {
    if (!(await ask({ title: "Change role", body: `Change ${u.full_name} from ${ROLE_LABEL[u.role]} to ${ROLE_LABEL[role]}? Their access changes straight away.`, confirmLabel: "Change role", word: "CHANGE" }))) return;
    updateUser(u.id, { role });
  };
  const toggleActive = async (u) => {
    const turnOff = u.is_active;
    const ok = await ask(turnOff
      ? { title: "Turn off account", body: `Turn off ${u.full_name}'s account? They will no longer be able to sign in.`, confirmLabel: "Turn off account", danger: true, word: "DEACTIVATE" }
      : { title: "Turn on account", body: `Turn ${u.full_name}'s account back on? They will be able to sign in again.`, confirmLabel: "Turn on account" });
    if (ok) updateUser(u.id, { is_active: !u.is_active });
  };

  return (
    <Shell seg="users">
      <h2>Users</h2>
      {confirmDialog}

      <form className="addform" onSubmit={add}>
        <h3><Icon name="users" size={18} /> Invite member</h3>
        <div className="row wrap">
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Temporary Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>
          <label>Role
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              {Object.entries(ROLE_LABEL).map(([r, text]) => <option key={r} value={r}>{text}</option>)}
            </select>
          </label>
          <button className="btn" type="submit"><Icon name="plus" size={18} /> Invite member</button>
        </div>
        <p className="mute small">Leave temporary password blank to send an email invitation, or specify one for immediate first-time sign in.</p>
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
                  <select value={u.role} disabled={u.id === me.id} onChange={(e) => changeRole(u, e.target.value)} aria-label={`Role for ${u.full_name}`}>
                    {Object.entries(ROLE_LABEL).map(([r, text]) => <option key={r} value={r}>{text}</option>)}
                  </select>
                </td>
                <td>
                  <button className={"switch" + (u.is_active ? " on" : "")} role="switch" aria-checked={u.is_active} disabled={u.id === me.id}
                    onClick={() => toggleActive(u)} aria-label={`Account active for ${u.full_name}`}><i /></button>
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
