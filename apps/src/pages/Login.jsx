import { useState } from "react";
import { useStore } from "../store.js";
import { go } from "../useRoute.js";
import { DEFAULT_PW } from "../data.js";

// Staff login. There is no register button: an admin creates each account.
// The first sign-in uses the default password, then the person can change it.
export default function Login() {
  const { login, signIn, notify } = useStore();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pending, setPending] = useState(null); // user id waiting to choose a new password

  const submit = (e) => {
    e.preventDefault();
    const res = login(email, pw);
    if (!res.ok) return notify(res.message);
    if (res.first) return setPending(res.id);
    signIn(res.id);
    go("/dashboard");
  };

  const finish = (changed) => {
    if (changed && newPw.length < 8) return notify("Use at least 8 characters");
    signIn(pending);
    if (changed) notify("Password changed");
    go("/dashboard");
  };

  return (
    <section className="glass pad narrow">
      {!pending ? (
        <form onSubmit={submit}>
          <h2>Staff login</h2>
          <p className="mute">
            For botanists, conservation officers and admins. Your account is created by an admin. The first time, sign
            in with the default password ({DEFAULT_PW}).
          </p>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="botanist@sfc.my" autoComplete="username" required /></label>
          <label>Password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required /></label>
          <p><button className="btn" type="submit">Sign in</button></p>
        </form>
      ) : (
        <div>
          <h2>Set a new password</h2>
          <p className="mute">You signed in with the default password. Choose a new one now, or keep it for later.</p>
          <label>New password<input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" /></label>
          <div className="row">
            <button className="btn" onClick={() => finish(true)}>Change password</button>
            <button className="btn ghost" onClick={() => finish(false)}>Not now</button>
          </div>
        </div>
      )}
    </section>
  );
}
