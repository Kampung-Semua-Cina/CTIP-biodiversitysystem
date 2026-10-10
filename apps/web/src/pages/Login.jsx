// web/src/pages/Login.jsx
import { useState } from "react";
import { useStore } from "../store.js";
import { go } from "../useRoute.js";

// Staff login with email and password. There is no register button: an admin creates each account.
// The same page lets staff change their password with just their email and a new password.
// After a first sign-in with the default password, staff are asked to choose a new one.
export default function Login() {
  const { login, signIn, changePassword, notify } = useStore();
  const [mode, setMode] = useState("signin"); // signin | change | first
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pending, setPending] = useState(null); // user id waiting to choose a new password

  const switchTo = (next) => {
    setMode(next);
    setPw("");
    setNewPw("");
  };

  const submit = (e) => {
    e.preventDefault();
    const res = login(email, pw);
    if (!res.ok) return notify(res.message);
    if (res.first) {
      setPending(res.id);
      return setMode("first");
    }
    signIn(res.id);
    go("/dashboard");
  };

  // Used by both the "Change password" form and the first sign-in prompt.
  const change = (e) => {
    e.preventDefault();
    const res = changePassword(email, newPw);
    if (!res.ok) return notify(res.message);
    notify("Password changed");
    if (mode === "first") {
      signIn(pending);
      return go("/dashboard");
    }
    switchTo("signin");
  };

  const skip = () => {
    signIn(pending);
    go("/dashboard");
  };

  const newFields = (
    <>
      <label>New password<input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
      <p className="mute small">At least 8 characters.</p>
    </>
  );

  return (
    <section className="glass pad narrow">
      {mode === "signin" && (
        <form onSubmit={submit}>
          <h2>Staff login</h2>
          <p className="mute">
            For botanists, conservation officers and admins. Sign in with the email your admin registered for you.
          </p>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@sfc.my" autoComplete="username" required /></label>
          <label>Password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required /></label>
          <div className="row wrap">
            <button className="btn" type="submit">Sign in</button>
            <button className="btn ghost" type="button" onClick={() => switchTo("change")}>Change password</button>
          </div>
        </form>
      )}

      {mode === "change" && (
        <form onSubmit={change}>
          <h2>Change password</h2>
          <p className="mute">Enter your email and choose a new password.</p>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
          {newFields}
          <div className="row wrap">
            <button className="btn" type="submit">Save new password</button>
            <button className="btn ghost" type="button" onClick={() => switchTo("signin")}>Back to sign in</button>
          </div>
        </form>
      )}

      {mode === "first" && (
        <form onSubmit={change}>
          <h2>Set a new password</h2>
          <p className="mute">You signed in with the default password. Choose a new one now, or keep it for later.</p>
          {newFields}
          <div className="row wrap">
            <button className="btn" type="submit">Change password</button>
            <button className="btn ghost" type="button" onClick={skip}>Not now</button>
          </div>
        </form>
      )}
    </section>
  );
}
