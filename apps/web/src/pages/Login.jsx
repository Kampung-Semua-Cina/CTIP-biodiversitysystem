// apps/web/src/pages/Login.jsx
import { useState } from "react";
import { useStore } from "../../../shared/store.js";
import { go, useRoute } from "../useRoute.js";
import Icon from "../components/Icon.jsx";
import { PasswordInput } from "../components/Bits.jsx";

// Staff login with email and password, through the API (CTIP-114).
// "Forgot password" emails a reset link. The link opens #/login?reset=1 already
// signed in (StoreProvider reads the session from the address), where the
// person chooses a new password. #/login?expired=1: the link was used or too old.
// After a first sign-in with the default password, staff are asked to choose a new one.
// Two-step sign-in (VA-70): after the password, every staff member types the
// 6-digit code from their authenticator app ("mfa"). The first time, they scan
// a QR code to set the app up ("mfa-setup").
export default function Login() {
  const { login, signIn, changePassword, notify, loginWithToken, apiStatus, mfaEnroll, mfaVerify, mfaCancel } = useStore();
  const { query } = useRoute();
  const [tokenInput, setTokenInput] = useState("");
  const [isTokenBusy, setIsTokenBusy] = useState(false);
  const [mode, setMode] = useState(query.reset ? "reset" : query.expired ? "change" : "signin"); // signin | change | reset | first | token | mfa | mfa-setup
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pending, setPending] = useState(null); // user id waiting to choose a new password
  const [code, setCode] = useState(""); // the 6-digit code (VA-70)
  const [setup, setSetup] = useState(null); // { qr, secret } while setting up the app
  const [busy, setBusy] = useState(false);

  const switchTo = (next) => {
    setMode(next);
    setPw("");
    setNewPw("");
  };

  const submit = async (e) => {
    e.preventDefault();
    const res = await login(email, pw);
    if (!res.ok) return notify(res.message);
    if (res.mfa === "verify") {
      setCode("");
      return setMode("mfa");
    }
    if (res.mfa === "setup") {
      const en = await mfaEnroll();
      if (!en.ok) return notify(en.message);
      setSetup(en);
      setCode("");
      return setMode("mfa-setup");
    }
    if (res.first) {
      setPending(res.id);
      return setMode("first");
    }
    signIn(res.id);
    go("/dashboard");
  };

  // VA-70: check the 6-digit code, then carry on as after a normal sign-in.
  const checkCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await mfaVerify(code);
    setBusy(false);
    if (!res.ok) return notify(res.message);
    setSetup(null);
    if (mode === "mfa-setup") notify("Two-step sign-in is set up");
    signIn(res.id);
    go("/dashboard");
  };

  const cancelCode = async () => {
    await mfaCancel();
    setSetup(null);
    switchTo("signin");
  };

  const codeField = (
    <label>
      6-digit code
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        placeholder="123456"
        required
        autoFocus
        style={{ letterSpacing: "0.3em", fontSize: 20 }}
      />
    </label>
  );

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
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <img src="/logo.svg" alt="Daun Sense" style={{ width: 56, height: 56, borderRadius: 14 }} />
      </div>
      {mode === "signin" && (
        <form onSubmit={submit}>
          <h1>Staff sign in</h1>
          <p className="mute">
            For botanists, conservation officers and admins. Accounts are created by administrator invitation only. Sign in with your registered email or username.
          </p>
          <label>Email or username<input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@sfc.my" autoComplete="username" required /></label>
          <label>Password<PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required /></label>
          <div className="row wrap gap-top">
            <button className="btn" type="submit"><Icon name="user" size={18} /> Sign in</button>

            <button className="btn ghost" type="button" onClick={() => switchTo("token")}><Icon name="shield" size={18} /> Sign in with API token</button>
            <button className="btn ghost" type="button" onClick={() => switchTo("change")}><Icon name="key" size={18} /> Forgot password</button>
          </div>
          <p className="mute small" style={{ marginTop: 12 }}>
            Backend API: <span className={`api-badge ${apiStatus === "connected" ? "on" : "off"}`}>{apiStatus === "connected" ? "Online (/v1)" : "Offline (Sample Mode)"}</span>
          </p>
          {/* Visitors need no account: point them to the public pages. */}
          <p className="mute" style={{ marginTop: 16 }}>
            Just looking around? Browse the <a href="#/plants">plant library</a> or the <a href="#/map">plant map</a>, no account needed.
          </p>
        </form>
      )}

      {mode === "mfa" && (
        <form onSubmit={checkCode}>
          <h1>Enter your code</h1>
          <p className="mute">Open your authenticator app (for example Google Authenticator) and type the 6-digit code for Daun Sense.</p>
          {codeField}
          <div className="row wrap gap-top">
            <button className="btn" type="submit" disabled={busy || code.length !== 6}><Icon name="check" size={18} /> {busy ? "Checking..." : "Verify"}</button>
            <button className="btn ghost" type="button" onClick={cancelCode}><Icon name="chevL" size={18} /> Back to sign in</button>
          </div>
          <p className="mute small" style={{ marginTop: 12 }}>Lost your phone? Ask an admin to reset your two-step sign-in.</p>
        </form>
      )}

      {mode === "mfa-setup" && setup && (
        <form onSubmit={checkCode}>
          <h1>Set up two-step sign-in</h1>
          <p className="mute">
            Every staff account needs a 6-digit code as well as its password. Install an authenticator app on your phone
            (for example Google Authenticator or Microsoft Authenticator), then scan this code with it.
          </p>
          <div style={{ display: "flex", justifyContent: "center", margin: "12px 0" }}>
            <img src={setup.qr} alt="QR code to scan with your authenticator app" width={200} height={200} style={{ background: "#fff", padding: 8, borderRadius: 8 }} />
          </div>
          <p className="mute small">Can't scan it? Type this key into the app instead: <code style={{ wordBreak: "break-all" }}>{setup.secret}</code></p>
          <p className="mute">Then type the 6-digit code the app shows.</p>
          {codeField}
          <div className="row wrap gap-top">
            <button className="btn" type="submit" disabled={busy || code.length !== 6}><Icon name="check" size={18} /> {busy ? "Checking..." : "Finish set-up"}</button>
            <button className="btn ghost" type="button" onClick={cancelCode}><Icon name="chevL" size={18} /> Cancel</button>
          </div>
        </form>
      )}

      {mode === "token" && (
        <form onSubmit={submitToken}>
          <h1>API Token Sign In</h1>
          <p className="mute">
            Sign in with an access token you already have. Your identity and permissions will be verified via <code>GET /v1/me</code>.
          </p>
          <label>
            Access token (JWT)
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
