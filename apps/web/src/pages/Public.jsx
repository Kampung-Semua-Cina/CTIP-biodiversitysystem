// apps/web/src/pages/Public.jsx
import { useState } from "react";
import Icon from "../components/Icon.jsx";
import Img from "../components/Img.jsx";
import PlantCard from "../components/PlantCard.jsx";
import { useStore } from "../../../shared/store.js";
import { visiblePlants, speciesCatalogue } from "../../../shared/selectors.js";
import { go } from "../useRoute.js";
import { SITE, PARK } from "../../../shared/site.js";

// Single import for all shared copy
import {
  getAboutContent,
  getHomeContent,
  getContactContent,
  getStaffPageContent,
  getAccessContent,
} from "../../../shared/publicContent.js";

// Forest photo for the home page hero. Swap for a park photo from Supabase Storage later.
const HERO_PHOTO = "https://images.unsplash.com/photo-1470058869958-2a77ade41c02?auto=format&fit=crop&w=1400&q=70";

// Newest published plants first (the date an officer approved them or observed/created).
function recentPublishedPlants(db) {
  const approvedAt = (p) => {
    const obs = (db.observations || []).filter((o) => o.specimen_id === p.id && o.status === "approved");
    const rev = (db.reviews || []).filter((r) => obs.some((o) => o.id === r.observation_id));
    return rev.map((r) => r.created_at).sort().pop() || obs[0]?.observed_at || p.created_at || "";
  };
  return visiblePlants(db, "visitor").sort((a, b) => approvedAt(b).localeCompare(approvedAt(a)));
}

// Published species as fallback if no specimens are loaded
function recentPublishedSpecies(db) {
  return speciesCatalogue(db, "visitor").sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

export function Home() {
  const { db, notify } = useStore();
  const [q, setQ] = useState("");
  const plants = visiblePlants(db, "visitor");
  const recentPlants = recentPublishedPlants(db);
  const recentSpecies = recentPublishedSpecies(db);
  const content = getHomeContent(PARK); // same text as the mobile home screen

  // Search jumps straight to the best match: an exact tag ID opens that plant, a name opens the species.
  const search = (e) => {
    e.preventDefault();
    const t = q.trim().toLowerCase();
    if (!t) return go("/plants");
    const tag = plants.find((p) => p && p.qr_id && p.qr_id.toLowerCase() === t);
    if (tag) return go("/tag/" + tag.qr_id);
    const hit = plants.find((p) => p.species && `${p.name} ${p.scientific} ${p.species.family}`.toLowerCase().includes(t));
    if (hit) go("/plants/" + hit.species.id);
    else notify(`No published plant matches "${q.trim()}"`);
  };

  const showPlants = recentPlants.length > 0;
  const recentItems = showPlants ? recentPlants.slice(0, 6) : recentSpecies.slice(0, 6);

  return (
    <>
      <section className="homehero">
        <div className="homehero-text">
          <p className="eyebrow">{PARK} · Plant records</p>
          <h1>{content.heroTitle}</h1>
          <p className="lede">{content.heroSubtitle}</p>
          <form className="bigsearch" onSubmit={search} role="search">
            <label className="search">
              <Icon name="search" size={20} />
              <span className="sr">Search plants</span>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Plant name or tag ID, e.g. NIAH-0001" />
            </label>
            <button className="btn" type="submit">Search</button>
          </form>
          <p className="textlinks">
            <a href="#/plants">Browse all plants <Icon name="arrowR" size={16} /></a>
            <a href="#/map">Open the plant map <Icon name="arrowR" size={16} /></a>
          </p>
        </div>
        <div className="homehero-photo">
          <Img src={HERO_PHOTO} alt="Rainforest canopy" />
          <a className="scanbadge" href="#/scan" aria-label="Open plant QR tag scanner">
            <span className="scanicon"><Icon name="qr" size={32} /></span>
            <span>
              <b>In the forest?</b>
              <span>Scan the QR tag on any plant with your phone camera to open its page here.</span>
            </span>
          </a>
        </div>
      </section>

      <section className="gap-section" aria-labelledby="how">
        <h2 id="how">How a plant gets here</h2>
        <ol className="steps3">
          {[
            ["Tagged in the field", "A botanist attaches a QR tag, takes photos and records the plant's GPS location on the field app."],
            ["Verified by an officer", "A park officer checks the species and photos, then approves the record or returns it for changes."],
            ["Published for everyone", "Approved plants appear in the library and on the map. Endangered plants never show an exact location."],
          ].map(([title, text], i) => (
            <li className="stepcard" key={title}>
              <span className="stepnum" aria-hidden="true">{i + 1}</span>
              <h3>{title}</h3>
              <p className="mute">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="gap-section" aria-labelledby="recent">
        <div className="row between wrap">
          <h2 id="recent">{content.recentSectionTitle}</h2>
          <a className="textlink" href="#/plants">See all plants <Icon name="arrowR" size={16} /></a>
        </div>
        {recentItems.length === 0 ? (
          <p className="mute" style={{ margin: "16px 0" }}>No published plant records yet.</p>
        ) : (
          <div className="plantgrid">
            {recentItems.map((item) => (
              <PlantCard
                key={item.id}
                href={item.qr_id ? `#/tag/${item.qr_id}` : `#/plants/${item.id}`}
                photo={item.photo || item.photos?.[0]?.url}
                family={item.species?.family || item.family}
                name={item.name}
                scientific={item.scientific || item.scientific_name}
                conservation={item.conservation || item.conservation_status}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export function About() {
  const content = getAboutContent(SITE, PARK);
  return (
    <section className="glass pad prose">
      <h1>{content.title}</h1>
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
      <h1>{content.title}</h1>
      <p>
        Email: <a className="textlink" href={`mailto:${content.email}`}>{content.email}</a>
      </p>
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
      <h1>{content.title}</h1>
      {me ? (
        <>
          <p>You are signed in as {me.full_name}.</p>
          <a className="btn" href="#/dashboard"><Icon name="dashboard" size={18} /> Go to dashboard</a>
        </>
      ) : (
        <>
          <p>{content.description}</p>
          <a className="btn" href="#/login"><Icon name="user" size={18} /> Go to login</a>
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
      <h1>{content.noAccessTitle}</h1>
      <p>{role === "visitor" ? content.visitorText : content.staffText}</p>
      {role === "visitor" ? (
        <a className="btn" href="#/login"><Icon name="user" size={18} /> Go to login</a>
      ) : (
        <a className="btn" href="#/dashboard"><Icon name="chevL" size={18} /> Back to dashboard</a>
      )}
    </section>
  );
}

export function NotFound() {
  const content = getAccessContent();
  return (
    <section className="glass pad prose narrow">
      <h1>{content.notFoundTitle}</h1>
      <p>{content.notFoundText}</p>
      <a className="btn" href="#/"><Icon name="home" size={18} /> Home</a>
    </section>
  );
}
