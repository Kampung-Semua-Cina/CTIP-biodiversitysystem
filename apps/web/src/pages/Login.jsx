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
export default function Login() {
  const { login, signIn, changePassword, notify, loginWithToken, apiStatus, addUser } = useStore();
  const { query } = useRoute();
  const [tokenInput, setTokenInput] = useState("");
  const [isTokenBusy, setIsTokenBusy] = useState(false);
  const [mode, setMode] = useState(query.reset ? "reset" : query.expired ? "change" : "signin"); // signin | change | reset | first | token | register
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pending, setPending] = useState(null); // user id waiting to choose a new password

  // Register form state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPw, setRegPw] = useState("");
  const [regRole, setRegRole] = useState("botanist");
  const [isRegistering, setIsRegistering] = useState(false);

  const switchTo = (next) => {
    setMode(next);
    setPw("");
    setNewPw("");
  };

  const submit = async (e) => {
    e.preventDefault();
    const res = await login(email, pw);
    if (!res.ok) return notify(res.message);
    if (res.first) {
      setPending(res.id);
      return setMode("first");
    }
    signIn(res.id);
    go("/dashboard");
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    if (regPw.length < 8) return notify("Use at least 8 characters for the password");
    setIsRegistering(true);
    const res = await addUser({
      full_name: regName.trim(),
      email: regEmail.trim(),
      role: regRole,
      password: regPw,
    });
    setIsRegistering(false);
    if (!res || res.ok === false) {
      return notify(res?.message || "Failed to create account");
    }
    notify(`Account created for ${regEmail}! You can now sign in.`);
    setEmail(regEmail);
    setPw(regPw);
    switchTo("signin");
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
            For botanists, conservation officers and admins. Sign in with the email your admin registered for you, or your username.
          </p>
          <label>Email or username<input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@sfc.my" autoComplete="username" required /></label>
          <label>Password<PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required /></label>
          <div className="row wrap gap-top">
            <button className="btn" type="submit"><Icon name="user" size={18} /> Sign in</button>
            <button className="btn ghost" type="button" onClick={() => switchTo("register")}><Icon name="plus" size={18} /> Create account</button>
            <button className="btn ghost" type="button" onClick={() => switchTo("token")}><Icon name="shield" size={18} /> Sign in with API token</button>
            <button className="btn ghost" type="button" onClick={() => switchTo("change")}><Icon name="key" size={18} /> Forgot password</button>
          </div>
          <p className="mute small" style={{ marginTop: 12 }}>
            Backend API: <span className={`api-badge ${apiStatus === "connected" ? "on" : "off"}`}>{apiStatus === "connected" ? "Online (/v1)" : "Offline (Sample Mode)"}</span>
          </p>
        </form>
      )}

      {mode === "register" && (
        <form onSubmit={submitRegister}>
          <h1>Create staff account</h1>
          <p className="mute">
            Add a botanist, conservation officer, or administrator account.
          </p>
          <label>Full name<input value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Dr. Jane Doe" required /></label>
          <label>Email<input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="name@sfc.my" autoComplete="email" required /></label>
          <label>Password<PasswordInput value={regPw} onChange={(e) => setRegPw(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
          <p className="mute small">At least 8 characters.</p>
          <label>Role
            <select value={regRole} onChange={(e) => setRegRole(e.target.value)}>
              <option value="botanist">Botanist</option>
              <option value="officer">Conservation Officer</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          <div className="row wrap gap-top">
            <button className="btn" type="submit" disabled={isRegistering}>
              <Icon name="plus" size={18} /> {isRegistering ? "Creating account..." : "Create account"}
            </button>
            <button className="btn ghost" type="button" onClick={() => switchTo("signin")}>
              <Icon name="chevL" size={18} /> Back to sign in
            </button>
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
