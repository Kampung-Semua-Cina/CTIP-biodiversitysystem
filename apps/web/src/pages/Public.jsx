// apps/web/src/pages/Public.jsx
import Icon from "../components/Icon.jsx";
import Img from "../components/Img.jsx";
import { useStore } from "../store.js";
import { visiblePlants } from "../selectors.js";
import { SITE, PARK } from "../site.js";

// Single import for all shared copy
import {
  getAboutContent,
  getHomeContent,
  getContactContent,
  getStaffPageContent,
  getAccessContent,
} from "../../../shared/publicContent.js";

export function Home() {
  const { db } = useStore();
  const latest = visiblePlants(db, "visitor").slice(0, 3);
  const content = getHomeContent(PARK);

  return (
    <>
      <section className="glass hero">
        <img className="hero-logo" src="/logo.svg" alt="" />
        <h1>{content.heroTitle}</h1>
        <p>{content.heroSubtitle}</p>
        <div className="row center">
          <a className="btn" href="#/dashboard">
            Browse plants
          </a>
          <a className="btn ghost" href="#/map">
            Open map
          </a>
        </div>
      </section>

      <section className="grid g3 gap">
        {content.features.map((f) => (
          <article className="glass pad" key={f.title}>
            <Icon name={f.icon} size={26} />
            <h3>{f.title}</h3>
            <p className="mute">{f.text}</p>
          </article>
        ))}
      </section>

      {latest.length > 0 && (
        <section className="glass pad gap-top">
          <h2>{content.recentSectionTitle}</h2>
          <div className="grid g3">
            {latest.map((p) => (
              <a
                className="plantcard"
                key={p.id}
                href={"#/dashboard/" + p.qr_id}
              >
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
  const content = getAboutContent(SITE, PARK);
  return (
    <section className="glass pad prose">
      <h2>{content.title}</h2>
      {content.paragraphs.map((text, idx) => (
        <p key={idx}>{text}</p>
      ))}
    </section>
  );
}

export function Contact() {
  const content = getContactContent();
  return (
    <section className="glass pad prose">
      <h2>{content.title}</h2>
      <p>Email: {content.email}</p>
      <p>
        {content.organization}, {content.address}
      </p>
    </section>
  );
}

export function StaffPage() {
  const { role, me } = useStore();
  const content = getStaffPageContent(PARK);

  return (
    <section className="glass pad prose narrow">
      <h2>{content.title}</h2>
      {me ? (
        <>
          <p>You are signed in as {me.full_name}.</p>
          <a className="btn" href="#/dashboard">
            Go to dashboard
          </a>
        </>
      ) : (
        <>
          <p>{content.description}</p>
          <a className="btn" href="#/login">
            Go to login
          </a>
        </>
      )}
      {role === "visitor" && <p className="mute">{content.visitorHint}</p>}
    </section>
  );
}

export function NoAccess() {
  const { role } = useStore();
  const content = getAccessContent();

  return (
    <section className="glass pad prose narrow">
      <h2>{content.noAccessTitle}</h2>
      <p>{role === "visitor" ? content.visitorText : content.staffText}</p>
      {role === "visitor" ? (
        <a className="btn" href="#/login">
          Go to login
        </a>
      ) : (
        <a className="btn" href="#/dashboard">
          Back to dashboard
        </a>
      )}
    </section>
  );
}

export function NotFound() {
  const content = getAccessContent();
  return (
    <section className="glass pad prose narrow">
      <h2>{content.notFoundTitle}</h2>
      <p>{content.notFoundText}</p>
      <a className="btn" href="#/">
        Home
      </a>
    </section>
  );
}
