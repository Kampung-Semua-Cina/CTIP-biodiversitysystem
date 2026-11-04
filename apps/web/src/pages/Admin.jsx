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
import { emailProblem, passwordProblem, nameProblem } from "../../../shared/accountRules.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_DAYS = 30; // DELETE_GRACE_DAYS in services/api/src/staff.js
const removeDate = (u) => new Date(new Date(u.deleted_at).getTime() + GRACE_DAYS * DAY_MS);
const daysLeft = (u) => Math.max(0, Math.ceil((removeDate(u) - Date.now()) / DAY_MS));

// Admin page for accounts. Botanists and officers are registered here, not by themselves.
// Two tables: accounts that can sign in, and ones that cannot (turned off, or
// deleted and waiting out the 30 days in which they can still be restored).
export function Users() {
  const { db, me, addUser, updateUser, deleteUser, restoreUser, notify } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState("botanist");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("name");
  const [ask, confirmDialog] = useConfirm();
  // Why each field cannot be used, shown under it: { name, email, password }.
  const [errors, setErrors] = useState({});
  const checks = {
    name: () => nameProblem(name),
    email: () => emailProblem(email),
    password: () => (password ? passwordProblem(password) : null), // blank: send an invitation
  };
  const setError = (field, message) => setErrors((prev) => ({ ...prev, [field]: message || undefined }));
  const checkField = (field) => setError(field, checks[field]());
  // While a field shows a reason, re-check it as it is fixed.
  const edit = (field, setter) => (e) => {
    setter(e.target.value);
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };
  const fieldProps = (field) => ({
    "aria-invalid": errors[field] ? "true" : undefined,
    "aria-describedby": errors[field] ? `invite-${field}-error` : undefined,
    onBlur: () => { if ((field === "password" ? password : field === "name" ? name : email)) checkField(field); },
  });
  const fieldError = (field) => (errors[field] ? <small id={`invite-${field}-error`} className="fielderr" role="alert">{errors[field]}</small> : null);

  const filtered = (db.profiles || []).filter((u) => {
    return fuzzyMatch(`${u.full_name || ""} ${u.email || ""} ${u.role || ""}`, q);
  });

  const sortedUsers = [...filtered].sort((a, b) => {
    if (sort === "name") return (a.full_name || "").localeCompare(b.full_name || "");
    if (sort === "role") return (a.role || "").localeCompare(b.role || "");
    if (sort === "email") return (a.email || "").localeCompare(b.email || "");
    if (sort === "added") return (b.created_at || "").localeCompare(a.created_at || "");
    return (a.full_name || "").localeCompare(b.full_name || "");
  });
  const activeUsers = sortedUsers.filter((u) => u.is_active && !u.deleted_at);
  // Deleted ones first, soonest to be removed at the top.
  const inactiveUsers = sortedUsers.filter((u) => !u.is_active || u.deleted_at)
    .sort((a, b) => (!!b.deleted_at - !!a.deleted_at) || (a.deleted_at && b.deleted_at ? a.deleted_at.localeCompare(b.deleted_at) : 0));

  const add = async (e) => {
    e.preventDefault();
    // Say what is wrong before anything is sent (no email is used on a bad address).
    const found = Object.fromEntries(Object.keys(checks).map((f) => [f, checks[f]()]).filter(([, m]) => m));
    setErrors(found);
    const first = Object.keys(checks).find((f) => found[f]);
    if (first) {
      document.getElementById(`invite-${first}`)?.focus();
      return notify(found[first]);
    }
    const ok = password
      ? await ask({ title: "Create account with a password", body: `This creates an account for ${email} as ${ROLE_LABEL[newRole]} with the temporary password you typed, so they can sign in straight away.`, confirmLabel: "Create account", word: "CREATE" })
      : await ask({ title: "Invite member", body: `Send an email invitation to ${email} as ${ROLE_LABEL[newRole]}?`, confirmLabel: "Send invitation" });
    if (!ok) return;
    const res = await addUser({ full_name: name.trim(), email, role: newRole, password: password || undefined });
    if (res === false || res?.ok === false) {
      // The API's reasons go under their fields; EMAIL_RATE_LIMIT's message says how long to wait.
      const byField = {};
      for (const f of res?.fields || []) {
        const field = f.path === "full_name" ? "name" : f.path;
        if (checks[field] && !byField[field]) byField[field] = f.message;
      }
      if (["EMAIL_TAKEN", "INVALID_EMAIL"].includes(res?.code)) byField.email = res.message;
      if (res?.code === "WEAK_PASSWORD") byField.password = res.message;
      setErrors(byField);
      return notify(res?.message || "This email already has an account");
    }
    setErrors({});
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
  const remove = async (u) => {
    const until = new Date(Date.now() + GRACE_DAYS * DAY_MS).toLocaleDateString();
    const ok = await ask({
      title: "Delete user",
      body: (
        <>
          <p><b>{u.full_name || u.email}</b> is turned off straight away and can no longer sign in.</p>
          <p>You can restore the account from <b>Not active</b> until <b>{until}</b>. After that it is removed for good:
            their plants, visits, photos and reviews stay, shown as by a former member, and discussion threads they started are removed.</p>
        </>
      ),
      confirmLabel: "Delete user",
      danger: true,
      word: "DELETE",
    });
    if (ok) deleteUser(u.id);
  };
  const restore = async (u) => {
    const ok = await ask({
      title: "Restore user",
      body: `Restore ${u.full_name || u.email}? The account comes back turned off; switch it on when they should sign in again.`,
      confirmLabel: "Restore",
    });
    if (ok) restoreUser(u.id);
  };

  return (
    <Shell seg="users">
      <h2>Users</h2>
      {confirmDialog}

      {/* noValidate: our own checks say why a value is wrong, instead of the browser's bubble */}
      <form className="addform" onSubmit={add} noValidate>
        <h3><Icon name="users" size={18} /> Invite member</h3>
        <div className="row wrap invite">
          <label>Name<input id="invite-name" value={name} onChange={edit("name", setName)} autoComplete="off" {...fieldProps("name")} />{fieldError("name")}</label>
          <label>Email<input id="invite-email" type="email" value={email} onChange={edit("email", setEmail)} autoComplete="off" {...fieldProps("email")} />{fieldError("email")}</label>
          <label>Temporary Password<input id="invite-password" type="password" value={password} onChange={edit("password", setPassword)} placeholder="At least 8 characters" autoComplete="new-password" {...fieldProps("password")} />{fieldError("password")}</label>
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
            <option value="name">Name A–Z</option>
            <option value="added">Newest first</option>
            <option value="role">Role</option>
            <option value="email">Email A–Z</option>
          </select>
        </label>
      </div>

      <h3 className="sub"><Icon name="users" size={18} /> Active <span className="mute">({activeUsers.length})</span></h3>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Added</th><th><span className="sr">Delete</span></th></tr></thead>
          <tbody>
            {activeUsers.map((u) => (
              <tr key={u.id}>
                <td><b>{u.full_name}</b>{u.id === me.id && <small className="mute"> (you)</small>}</td>
                <td>{u.email}</td>
                <td>
                  <select value={u.role} disabled={u.id === me.id} onChange={(e) => changeRole(u, e.target.value)} aria-label={`Role for ${u.full_name}`}>
                    {Object.entries(ROLE_LABEL).map(([r, text]) => <option key={r} value={r}>{text}</option>)}
                  </select>
                </td>
                <td>
                  <button className="switch on" role="switch" aria-checked="true" disabled={u.id === me.id}
                    onClick={() => toggleActive(u)} aria-label={`Account active for ${u.full_name}`}><i /></button>
                </td>
                <td>{fmtDate(u.created_at)}</td>
                <td>
                  {u.id !== me.id && <button className="ic" onClick={() => remove(u)} aria-label={`Delete ${u.full_name || u.email}`} title="Delete user"><Icon name="trash" size={18} /></button>}
                </td>
              </tr>
            ))}
            {!activeUsers.length && <tr><td colSpan="6" className="mute">{q ? "No active users match your search." : "No active users."}</td></tr>}
          </tbody>
        </table>
      </div>

      <h3 className="sub gap-top"><Icon name="lock" size={18} /> Not active <span className="mute">({inactiveUsers.length})</span></h3>
      <p className="mute small">Turned-off accounts cannot sign in. Deleted accounts can be restored until the date shown, then they are removed for good.</p>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Added</th><th><span className="sr">Actions</span></th></tr></thead>
          <tbody>
            {inactiveUsers.map((u) => (
              <tr key={u.id}>
                <td><b>{u.full_name || "No name"}</b></td>
                <td>{u.email}</td>
                <td>{ROLE_LABEL[u.role] || u.role}</td>
                <td>
                  {u.deleted_at
                    ? <><Chip value="delete">Deleted</Chip> <small className="mute block">Removed for good on {fmtDate(removeDate(u).toISOString())} · {daysLeft(u)} {daysLeft(u) === 1 ? "day" : "days"} left</small></>
                    : <Chip value="retired">Turned off</Chip>}
                </td>
                <td>{fmtDate(u.created_at)}</td>
                <td>
                  {u.deleted_at ? (
                    <button className="btn ghost small-btn" onClick={() => restore(u)}><Icon name="undo" size={16} /> Restore</button>
                  ) : (
                    <span className="row">
                      <button className="switch" role="switch" aria-checked="false" onClick={() => toggleActive(u)} aria-label={`Account active for ${u.full_name}`}><i /></button>
                      <button className="ic" onClick={() => remove(u)} aria-label={`Delete ${u.full_name || u.email}`} title="Delete user"><Icon name="trash" size={18} /></button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!inactiveUsers.length && <tr><td colSpan="6" className="mute">{q ? "No inactive users match your search." : "Every account is active."}</td></tr>}
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
