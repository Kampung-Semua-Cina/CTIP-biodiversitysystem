// apps/web/src/pages/Account.jsx
import { useState } from "react";
import Icon from "../components/Icon.jsx";
import { Avatar, Chip, PasswordInput } from "../components/Bits.jsx";
import { useConfirm } from "../useConfirm.jsx";
import { useStore } from "../../../shared/store.js";
import { ROLE_LABEL } from "../../../shared/permissions.js";
import { PHOTO_TYPES, fmtDate } from "../../../shared/utils.js";
import { prepareAvatar } from "../avatarImage.js";

// Staff edit their own account here: photo, name, username, phone and password.
// Email and role are set by an admin, so they are shown but not editable.
export default function Account() {
  const { me } = useStore();
  if (me.loading) return <div className="glass pad"><p className="mute">Loading your account…</p></div>;
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Account settings</h1>
          <p className="mute">Your profile and sign-in details.</p>
        </div>
      </div>
      <div className="settings">
        <PhotoCard me={me} />
        <ProfileCard key={me.id} me={me} />
        <PasswordCard />
        <DetailsCard me={me} />
      </div>
    </>
  );
}

function PhotoCard({ me }) {
  const { updateProfile, notify } = useStore();
  const [ask, confirmDialog] = useConfirm();

  const removePhoto = async () => {
    if (!(await ask({ title: "Remove profile photo", body: "Remove your profile photo? Your initials will be shown instead.", confirmLabel: "Remove photo", danger: true }))) return;
    updateProfile({ avatar_url: null });
  };

  const [busy, setBusy] = useState(false);

  // Any photo is fine: it is rotated upright, cropped to a centred square and shrunk to
  // 256 px before it is saved, so a big phone photo never hits the API's size limit.
  const pick = async (e) => {
    const file = e.target.files[0];
    e.target.value = ""; // so picking the same file again still fires
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) return notify("Choose a JPG, PNG or WebP image");
    setBusy(true);
    try {
      const avatar_url = await prepareAvatar(file);
      const res = await updateProfile({ avatar_url });
      notify(res.ok ? "Photo updated" : res.message || "Could not update photo");
    } catch (err) {
      notify(err.message || "Could not process the photo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass pad">
      <h2 className="cardtitle">Profile photo</h2>
      <div className="photorow">
        <Avatar user={me} large />
        <div>
          <div className="row wrap">
            <label className="btn ghost filebtn">
              <Icon name="upload" size={16} /> {busy ? "Processing…" : me.avatar_url ? "Change photo" : "Upload photo"}
              <input type="file" accept={PHOTO_TYPES.join(",")} onChange={pick} disabled={busy} hidden />
            </label>
            {me.avatar_url && (
              <button className="btn ghost" onClick={removePhoto}>
                <Icon name="trash" size={16} /> Remove
              </button>
            )}
          </div>
          <p className="mute small">JPG, PNG or WebP. It is cropped to a square and resized for you. Without a photo your initials are shown.</p>
        </div>
      </div>
      {confirmDialog}
    </section>
  );
}

function ProfileCard({ me }) {
  const { updateProfile, notify } = useStore();
  const [form, setForm] = useState({ full_name: me.full_name, username: me.username || "", phone: me.phone || "" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const dirty = form.full_name !== me.full_name || form.username !== (me.username || "") || form.phone !== (me.phone || "");

  const save = async (e) => {
    e.preventDefault();
    const res = await updateProfile(form);
    if (!res.ok) return notify(res.message);
    setForm({ full_name: form.full_name.trim().replace(/\s+/g, " "), username: form.username.trim().toLowerCase(), phone: form.phone.trim() });
  };

  return (
    <section className="glass pad">
      <h2 className="cardtitle">Profile</h2>
      <form onSubmit={save}>
        <label>Full name<input value={form.full_name} onChange={set("full_name")} autoComplete="name" maxLength={80} required /></label>
        <label>Username
          <span className="prefixed"><span aria-hidden="true">@</span>
            <input value={form.username} onChange={set("username")} autoComplete="username" minLength={3} maxLength={20}
              pattern="[A-Za-z0-9._]{3,20}" title="3-20 letters, numbers, dots or underscores" required />
          </span>
        </label>
        <p className="mute small">3-20 letters, numbers, dots or underscores. You can sign in with it instead of your email.</p>
        <label>Phone <span className="small">(optional)</span><input type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" placeholder="+60 12-345 6789" /></label>
        <div className="row wrap formend">
          <button className="btn" type="submit" disabled={!dirty}>Save changes</button>
          {dirty && (
            <button className="btn ghost" type="button" onClick={() => setForm({ full_name: me.full_name, username: me.username || "", phone: me.phone || "" })}>Cancel</button>
          )}
        </div>
      </form>
    </section>
  );
}

function PasswordCard() {
  const { changeMyPassword, notify } = useStore();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [ask, confirmDialog] = useConfirm();

  const save = async (e) => {
    e.preventDefault();
    if (next !== again) return notify("The new passwords do not match");
    if (next === current) return notify("Choose a password different from your current one");
    if (!(await ask({ title: "Change password", body: "You are about to change the password you sign in with. Use the new one from now on.", confirmLabel: "Change password", word: "CHANGE" }))) return;
    const res = await changeMyPassword(current, next);
    if (!res.ok) return notify(res.message);
    setCurrent("");
    setNext("");
    setAgain("");
    notify("Password changed");
  };

  return (
    <section className="glass pad">
      <h2 className="cardtitle">Password</h2>
      <form onSubmit={save}>
        <label>Current password<PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required /></label>
        <label>New password<PasswordInput value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
        <label>Confirm new password<PasswordInput value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
        <p className="mute small">At least 8 characters.</p>
        <div className="row wrap formend">
          <button className="btn" type="submit">Change password</button>
        </div>
      </form>
      {confirmDialog}
    </section>
  );
}

function DetailsCard({ me }) {
  return (
    <section className="glass pad">
      <h2 className="cardtitle">Account details</h2>
      <dl>
        <dt>Email</dt><dd>{me.email}</dd>
        <dt>Role</dt><dd>{ROLE_LABEL[me.role]}</dd>
        <dt>Status</dt><dd><Chip value={me.is_active ? "active" : "inactive"}>{me.is_active ? "Active" : "Turned off"}</Chip></dd>
        <dt>Member since</dt><dd>{fmtDate(me.created_at)}</dd>
      </dl>
      <p className="mute small"><Icon name="lock" size={14} /> Your email and role are managed by an admin. Ask them if either needs to change.</p>
    </section>
  );
}
