// apps/web/src/pages/Login.jsx
import { useState } from "react";
import { useStore } from "../../../shared/store.js";
import { go } from "../useRoute.js";
import Icon from "../components/Icon.jsx";
import { PasswordInput } from "../components/Bits.jsx";

// Staff login with email and password. There is no register button: an admin creates each account.
// The same page lets staff change their password with just their email and a new password.
// After a first sign-in with the default password, staff are asked to choose a new one.
export default function Login() {
  const { login, signIn, changePassword, notify, loginWithToken, apiStatus } = useStore();
  const [tokenInput, setTokenInput] = useState("");
  const [isTokenBusy, setIsTokenBusy] = useState(false);
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

  const submitToken = async (e) => {
    e.preventDefault();
    setIsTokenBusy(true);
    const res = await loginWithToken(tokenInput);
    setIsTokenBusy(false);
    if (res.ok) {
      go("/dashboard");
    }
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
      {mode === "signin" && (
        <form onSubmit={submit}>
          <h1>Staff sign in</h1>
          <p className="mute">
            For botanists, conservation officers and admins. Sign in with the email your admin registered for you, or your username.
          </p>
          <label>Email or username<input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@sfc.my" autoComplete="username" required /></label>
          <label>Password<PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required /></label>
          <div className="row wrap gap-top">
            <button className="btn" type="submit"><Icon name="user" size={18} /> Sign in</button>
            <button className="btn ghost" type="button" onClick={() => switchTo("token")}><Icon name="shield" size={18} /> Sign in with API token</button>
            <button className="btn ghost" type="button" onClick={() => switchTo("change")}><Icon name="key" size={18} /> Change password</button>
          </div>
          <p className="mute small" style={{ marginTop: 12 }}>
            Backend API: <span className={`api-badge ${apiStatus === "connected" ? "on" : "off"}`}>{apiStatus === "connected" ? "Online (/v1)" : "Offline (Sample Mode)"}</span>
          </p>
        </form>
      )}

      {mode === "token" && (
        <form onSubmit={submitToken}>
          <h1>API Token Sign In</h1>
          <p className="mute">
            Authenticate directly with your Supabase Bearer token. Your identity and permissions will be verified via <code>GET /v1/me</code>.
          </p>
          <label>
            Supabase Access Token (JWT)
            <textarea
              rows={4}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="eyJhbGciOi..."
              required
              style={{ fontFamily: "monospace", fontSize: 13, resize: "vertical" }}
            />
          </label>
          <p className="mute small">
            Endpoint: <code>/v1/me</code> · Header: <code>Authorization: Bearer &lt;token&gt;</code>
          </p>
          <div className="row wrap gap-top">
            <button className="btn" type="submit" disabled={isTokenBusy}>
              <Icon name="check" size={18} /> {isTokenBusy ? "Verifying token..." : "Verify & Sign In"}
            </button>
            <button className="btn ghost" type="button" onClick={() => switchTo("signin")}>
              <Icon name="chevL" size={18} /> Back to email sign in
            </button>
          </div>
        </form>
      )}

      {mode === "change" && (
        <form onSubmit={change}>
          <h1>Change password</h1>
          <p className="mute">Enter your email and choose a new password.</p>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
          {newFields}
          <div className="row wrap gap-top">
            <button className="btn" type="submit"><Icon name="check" size={18} /> Save new password</button>
            <button className="btn ghost" type="button" onClick={() => switchTo("signin")}><Icon name="chevL" size={18} /> Back to sign in</button>
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
