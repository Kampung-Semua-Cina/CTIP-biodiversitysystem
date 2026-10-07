import Icon from "../components/Icon.jsx";
import Img from "../components/Img.jsx";
import { useStore } from "../store.js";
import { visiblePlants } from "../selectors.js";
import { SITE, PARK } from "../site.js";

export function Home() {
  const { db } = useStore();
  const latest = visiblePlants(db, "visitor").slice(0, 3);
  return (
    <>
      <section className="glass hero">
        <img className="hero-logo" src="/logo.svg" alt="" />
        <h1>Know every plant in Niah</h1>
        <p>
          Browse verified plant records from {PARK}, see where each plant grows, and scan the tag on a plant in the
          forest to open its profile.
        </p>
        <div className="row center">
          <a className="btn" href="#/dashboard">Browse plants</a>
          <a className="btn ghost" href="#/map">Open map</a>
        </div>
      </section>

      <section className="grid g3 gap">
        {[
          ["leaf", "Plant library", "Search plant profiles with photos, names, conservation status and where they grow."],
          ["qr", "One tag, one plant", "Every tagged plant keeps the same identity, so staff can follow it from visit to visit."],
          ["shield", "Protected species", "Exact locations of endangered plants stay hidden from the public."],
        ].map(([icon, title, text]) => (
          <article className="glass pad" key={title}>
            <Icon name={icon} size={26} />
            <h3>{title}</h3>
            <p className="mute">{text}</p>
          </article>
        ))}
      </section>

      {latest.length > 0 && (
        <section className="glass pad gap-top">
          <h2>Recently published</h2>
          <div className="grid g3">
            {latest.map((p) => (
              <a className="plantcard" key={p.id} href={"#/dashboard/" + p.qr_id}>
                <Img src={p.photos[0]?.url} alt="" />
                <div>
                  <b>{p.name}</b>
                  <small className="sci">{p.scientific}</small>
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
