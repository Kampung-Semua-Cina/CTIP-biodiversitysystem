import { useEffect, useState } from "react";
import Img from "../components/Img.jsx";
import MiniMap from "../components/MiniMap.jsx";
import PhotoGallery from "../components/PhotoGallery.jsx";
import Icon from "../components/Icon.jsx";
import PhotoEditor from "../components/PhotoEditor.jsx";
import { Chip, Empty, Mono } from "../components/Bits.jsx";
import { useStore } from "../../../shared/store.js";
import { can } from "../../../shared/permissions.js";
import { lastVisit, mappable, speciesCatalogue } from "../../../shared/selectors.js";
import { fmtDate } from "../../../shared/utils.js";

const MORE = 12;

// One species: what it is, where it grows, and every tagged plant of it.
export default function SpeciesPage({ id }) {
  const { db, role, setSpeciesMedia, notify, getBackendSpeciesById, apiStatus } = useStore();

  useEffect(() => {
    if (apiStatus === "connected" && id) {
      getBackendSpeciesById(id);
    }
  }, [id, apiStatus, getBackendSpeciesById]);
  const staff = can(role, "pending");
  const [limit, setLimit] = useState(MORE);
  const [editing, setEditing] = useState(false);

  const all = speciesCatalogue(db, role);
  const s = all.find((x) => x.id === id);
  if (!s) {
    return (
      <section className="glass pad prose narrow">
        <h1>Species not found</h1>
        <p>This species is not in the catalogue, or it has not been published yet.</p>
        <a className="btn" href="#/plants"><Icon name="chevL" size={18} /> Back to all plants</a>
      </section>
    );
  }

  // The species' own captioned photos. Until it has some, up to 3 photos from each tagged plant.
  const photos = s.media.length ? s.media : s.plants.flatMap((p) => p.photos.slice(0, 3)).slice(0, 12);
  const savePhotos = (list) => {
    const r = setSpeciesMedia(s.id, list);
    notify(r.ok ? "Photos saved" : r.message);
    if (r.ok) setEditing(false);
  };
  const points = mappable(s.plants, role);
  const related = all
    .filter((x) => x.id !== s.id && (x.genus === s.genus || x.family === s.family))
    .sort((a, b) => (b.genus === s.genus) - (a.genus === s.genus));

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href="#/plants">Plants</a> <span aria-hidden="true">›</span> <span>{s.family}</span> <span aria-hidden="true">›</span> <span aria-current="page">{s.name}</span>
      </nav>

      <section className="specieshero">
        <div className="speciesphotos">
          <PhotoGallery key={s.id} photos={photos} canEdit={can(role, "species")} onEdit={() => setEditing(true)} />
        </div>
        <div className="speciesinfo">
          <p className="eyebrow">{s.family} · {s.genus}</p>
          <h1>{s.name}</h1>
          <p className="sci sciname">{s.scientific_name}</p>
          {staff && (
            <p className="row wrap">
              <Chip value={s.conservation_status} />
              {!s.is_published && <Chip value="draft">Not published</Chip>}
            </p>
          )}
          {s.description && <p className="lede-s">{s.description}</p>}
          <dl>
            <dt>Family</dt><dd>{s.family}</dd>
            <dt>Genus</dt><dd>{s.genus}</dd>
            <dt>Tagged in Niah</dt><dd>{s.plants.length} {s.plants.length === 1 ? "plant" : "plants"}</dd>
            {s.cultural_significance && <><dt>Cultural note</dt><dd>{s.cultural_significance}</dd></>}
          </dl>
          {role === "officer" && <a className="btn ghost gap-top-s" href="#/species"><Icon name="pencil" size={18} /> Edit species</a>}
        </div>
      </section>

      <section className="glass pad gap-section-s" aria-labelledby="where">
        <div className="row between wrap">
          <h2 id="where">Where it grows</h2>
          {points.length > 0 && <a className="textlink" href={"#/map/" + points[0].p.qr_id}>Open on the full map <Icon name="arrowR" size={16} /></a>}
        </div>
        {points.length ? (
          <MiniMap points={points} label={`Map of tagged ${s.name} plants`} />
        ) : (
          <p className="mute">
            {s.plants.length && s.endangered ? "Locations of this species are hidden to protect it." : "No tagged plants of this species yet."}
          </p>
        )}
      </section>

      <section className="gap-section-s" aria-labelledby="tagged">
        <h2 id="tagged">Tagged plants of this species <span className="mute">· {s.plants.length}</span></h2>
        {!s.plants.length && <div className="glass pad"><Empty>No plants of this species have been tagged yet.</Empty></div>}
        <ul className="plain taggrid">
          {s.plants.slice(0, limit).map((p) => {
            const seen = lastVisit(db, p.id, role);
            return (
              <li key={p.id}>
                <a className="glass tagcard" href={"#/tag/" + p.qr_id}>
                  <Img src={p.photos[0]?.url} alt="" />
                  <span>
                    <Mono className="block"><b>{p.qr_id}</b></Mono>
                    <small className="mute block">{seen ? `Last visited ${fmtDate(seen)}` : "Not visited yet"}</small>
                    {staff && p.status !== "approved" && <Chip value={p.status} />}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
        {s.plants.length > limit && (
          <p className="row center gap-top-s"><button className="btn ghost" onClick={() => setLimit(limit + MORE)}>Show {Math.min(MORE, s.plants.length - limit)} more</button></p>
        )}
      </section>

      {editing && <PhotoEditor photos={s.media} captions min={0} onClose={() => setEditing(false)} onSave={savePhotos} />}

      {related.length > 0 && (
        <section className="gap-section-s" aria-labelledby="related">
          <h2 id="related">Related plants in Niah</h2>
          <div className="row wrap">
            {related.slice(0, 6).map((r) => (
              <a key={r.id} className="glass relpill" href={"#/plants/" + r.id}>
                <Img src={r.photo} alt="" />
                <span><b>{r.name}</b> <span className="mute">· {r.plants.length}</span></span>
              </a>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
