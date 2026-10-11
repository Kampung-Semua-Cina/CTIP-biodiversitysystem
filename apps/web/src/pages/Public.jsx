import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Icon from "../components/Icon.jsx";
import Img from "../components/Img.jsx";
import { useStore } from "../store.js";
import { tagUrl, visiblePlants } from "../selectors.js";
import { go } from "../useRoute.js";
import { SITE, PARK } from "../site.js";

export function Home() {
  const { db, notify } = useStore();
  const [q, setQ] = useState("");
  const plants = visiblePlants(db, "visitor");
  const latest = plants.slice(0, 3);

  // Search jumps straight to the best match: an exact tag ID opens that plant, a name opens the species.
  const search = (e) => {
    e.preventDefault();
    const t = q.trim().toLowerCase();
    if (!t) return go("/plants");
    const tag = plants.find((p) => p.qr_id.toLowerCase() === t);
    if (tag) return go("/tag/" + tag.qr_id);
    const hit = plants.find((p) => p.species && `${p.name} ${p.scientific} ${p.species.family}`.toLowerCase().includes(t));
    if (hit) go("/plants/" + hit.species.id);
    else notify(`No published plant matches "${q.trim()}"`);
  };

  return (
    <>
      <section className="hero2">
        <div className="hero2-text">
          <p className="eyebrow">{PARK} · Plant records</p>
          <h1>Know every plant in Niah</h1>
          <p className="lede">
            Browse plant records verified by park officers, see where each plant grows, and scan the tag on a plant in
            the forest to open its profile.
          </p>
          <form className="bigsearch" onSubmit={search} role="search">
            <label className="search">
              <Icon name="search" size={20} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a plant name or tag ID, e.g. NIAH-0001" aria-label="Search plants or tag ID" />
            </label>
            <button className="btn" type="submit">Search</button>
          </form>
          <p className="row wrap textlinks">
            <a href="#/plants">Browse all plants →</a>
            <a href="#/map">Open the plant map →</a>
          </p>
        </div>
        <aside className="glass pad scancard">
          <div className="qrwhite"><QRCodeSVG value={tagUrl("NIAH-0001")} size={92} aria-label="Example plant tag" /></div>
          <div>
            <h2>In the forest?</h2>
            <p className="mute">Every tagged plant carries a QR code. Scan it with your phone camera to open that plant's page here.</p>
          </div>
        </aside>
      </section>

      <section className="gap-section" aria-labelledby="how">
        <h2 id="how">How a plant gets here</h2>
        <ol className="steps3">
          {[
            ["Tagged in the field", "A botanist attaches a QR tag, takes photos and records the plant's GPS location on the field app."],
            ["Verified by an officer", "A park officer checks the species and photos, then approves the record or returns it for changes."],
            ["Published for everyone", "Approved plants appear in the library and on the map. Endangered plants never show an exact location."],
          ].map(([title, text], i) => (
            <li className="glass pad" key={title}>
              <span className="stepnum">{i + 1}</span>
              <h3>{title}</h3>
              <p className="mute">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {latest.length > 0 && (
        <section className="gap-section" aria-labelledby="recent">
          <div className="row between wrap">
            <h2 id="recent">Recently published</h2>
            <a className="textlink" href="#/plants">See all plants →</a>
          </div>
          <div className="grid g3 gap-top-s">
            {latest.map((p) => (
              <a className="glass plantcard2" key={p.id} href={"#/tag/" + p.qr_id}>
                <Img src={p.photos[0]?.url} alt="" />
                <div>
                  <b>{p.name}</b>
                  <small className="mute block"><i>{p.scientific}</i>{p.species?.family ? ` · ${p.species.family}` : ""}</small>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export function About() {
  return (
    <section className="glass pad prose">
      <h2>About {SITE}</h2>
      <p>
        {SITE} is a digital plant knowledge system for {PARK}, built with Sarawak Forestry Corporation. Botanists
        record each plant once with a permanent QR tag. Conservation officers check the records, and approved records
        are shared here for researchers, park guides and visitors.
      </p>
      <p>
        Field records work without a signal and sync when the phone is back online. Sensors near selected plants send
        readings to a monitoring page, so staff can respond quickly if something disturbs a protected plant.
      </p>
    </section>
  );
}

export function Contact() {
  return (
    <section className="glass pad prose">
      <h2>Contact</h2>
      <p>Email: info@daunsense.example</p>
      <p>Sarawak Forestry Corporation, Kuching, Sarawak.</p>
    </section>
  );
}

export function StaffPage() {
  const { role, me } = useStore();
  return (
    <section className="glass pad prose narrow">
      <h2>Staff area</h2>
      {me ? (
        <>
          <p>You are signed in as {me.full_name}.</p>
          <a className="btn" href="#/dashboard">Go to dashboard</a>
        </>
      ) : (
        <>
          <p>
            This area is for Sarawak Forestry Corporation botanists, conservation officers and admins who record and
            review plants in {PARK}. Accounts are created by an admin.
          </p>
          <a className="btn" href="#/login">Go to login</a>
        </>
      )}
      {role === "visitor" && <p className="mute">Just looking around? The plant library and map are open to everyone.</p>}
    </section>
  );
}

export function NoAccess() {
  const { role } = useStore();
  return (
    <section className="glass pad prose narrow">
      <h2>You can't open this page</h2>
      <p>
        {role === "visitor"
          ? "This page is for staff. Sign in to continue."
          : "Your role does not include this page. Use the menu to see what you can open."}
      </p>
      {role === "visitor" ? <a className="btn" href="#/login">Go to login</a> : <a className="btn" href="#/dashboard">Back to dashboard</a>}
    </section>
  );
}

export function NotFound() {
  return (
    <section className="glass pad prose narrow">
      <h2>Page not found</h2>
      <p>This page does not exist. Check the link, or start from the home page.</p>
      <a className="btn" href="#/">Home</a>
    </section>
  );
}
