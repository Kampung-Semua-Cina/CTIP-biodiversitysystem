// apps/web/src/pages/Login.jsx
import { useState } from "react";
import { useStore } from "../../../shared/store.js";
import { go, useRoute } from "../useRoute.js";
import Icon from "../components/Icon.jsx";
import { PasswordInput } from "../components/Bits.jsx";
import { getStaffPageContent } from "../../../shared/publicContent.js";
import { PARK } from "../../../shared/site.js";

// Staff login with email and password, through the API (CTIP-114).
// "Forgot password" emails a reset link. The link opens #/login?reset=1 already
// signed in (StoreProvider reads the session from the address), where the
// person chooses a new password. #/login?expired=1: the link was used or too old.
// After a first sign-in with the default password, staff are asked to choose a new one.
// Shown at #/login and on the Staff area page (#/staff) for anyone signed out.
export default function Login() {
  const { login, signIn, changePassword, notify, apiStatus } = useStore();
  const { query } = useRoute();
  const staff = getStaffPageContent(PARK);
  const [busy, setBusy] = useState(false); // a sign-in is on its way: no second click
  const [mode, setMode] = useState(query.reset ? "reset" : query.expired ? "change" : "signin"); // signin | change | reset | first
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pending, setPending] = useState(null); // user id waiting to choose a new password

  const switchTo = (next) => {
    setMode(next);
    setPw("");
    setNewPw("");
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await login(email, pw);
    setBusy(false);
    if (!res.ok) return notify(res.message);
    if (res.first) {
      setPending(res.id);
      return setMode("first");
    }
    signIn(res.id);
    go("/dashboard");
  };

  // The reset-link form and the first sign-in prompt: set the new password.
  const change = async (e) => {
    e.preventDefault();
    const res = await changePassword(null, newPw);
    if (!res.ok) return notify(res.message);
    notify("Password changed");
    if (mode === "first") signIn(pending);
    go("/dashboard");
  };

  // "Forgot password": email a reset link.
  const sendLink = async (e) => {
    e.preventDefault();
    const res = await changePassword(email, null);
    notify(res.message);
    if (res.ok) switchTo("signin");
  };

  const skip = () => {
    signIn(pending);
    go("/dashboard");
  };

  const newFields = (
    <>
      <label>New password<PasswordInput value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
      <p className="mute small">At least 8 characters.</p>
    </>
  );

  return (
    <section className="glass pad narrow">
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <img src="/logo.svg" alt="Daun Sense" style={{ width: 56, height: 56, borderRadius: 14 }} />
      </div>
      {mode === "signin" && (
        <>
          <form onSubmit={submit}>
            <h1>Staff sign in</h1>
            <p className="mute">{staff.description}</p>
            {apiStatus === "offline" && (
              <div className="callout" role="status">
                <p><Icon name="wifiOff" size={16} /> The server is not answering right now. It can take up to a minute to wake up, so try again shortly.</p>
              </div>
            )}
            <label>Email or username<input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@sfc.my" autoComplete="username" required /></label>
            <label>Password<PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required /></label>
            <p className="login-forgot">
              <button type="button" className="textlink" onClick={() => switchTo("change")}>Forgot password?</button>
            </p>
            <button className="btn full" type="submit" disabled={busy}>
              <Icon name="user" size={18} /> {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {/* Visitors need no account: send them to the public pages. */}
          <div className="login-browse">
            <p><b>Just looking around?</b> <span className="mute">No account needed.</span></p>
            <p className="textlinks">
              <a href="#/plants"><Icon name="leaf" size={18} /> Browse the plant library</a>
              <a href="#/map"><Icon name="map" size={18} /> Open the plant map</a>
            </p>
          </div>
        </>
      )}

      {mode === "change" && (
        <form onSubmit={sendLink}>
          <h1>Reset your password</h1>
          <p className="mute">
            {query.expired
              ? "That reset link has expired or was already used. Ask for a new one below."
              : "Enter the email your account uses. We will send you a link to choose a new password."}
          </p>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
          <div className="row wrap gap-top">
            <button className="btn" type="submit"><Icon name="check" size={18} /> Email me a reset link</button>
            <button className="btn ghost" type="button" onClick={() => switchTo("signin")}><Icon name="chevL" size={18} /> Back to sign in</button>
          </div>
        </form>
      )}

      {mode === "reset" && (
        <form onSubmit={change}>
          <h1>Choose a new password</h1>
          <p className="mute">You opened a password reset link. Choose your new password.</p>
          {newFields}
          <div className="row wrap gap-top">
            <button className="btn" type="submit"><Icon name="check" size={18} /> Save new password</button>
          </div>
        </form>
      )}

      {mode === "first" && (
        <form onSubmit={change}>
          <h1>Set a new password</h1>
          <p className="mute">You signed in with the default password. Choose a new one now, or keep it for later.</p>
          {newFields}
          <div className="row wrap gap-top">
            <button className="btn" type="submit"><Icon name="check" size={18} /> Change password</button>
            <button className="btn ghost" type="button" onClick={skip}>Not now</button>
          </div>
        </form>
      )}
    </section>
  );
}
