import { fmtDate } from "../../../shared/utils.js";
import { useEffect, useState } from "react";
import Icon from "../components/Icon.jsx";
import MiniMap from "../components/MiniMap.jsx";
import PhotoGallery from "../components/PhotoGallery.jsx";
import { Chip, Mono, Sci } from "../components/Bits.jsx";
import { fetchPublicPlantByTag } from "../api.js";
import { orderedPhotos } from "../../../shared/selectors.js";

// The page a QR tag opens for a visitor (CTIP-33). Visitors get no plants in
// the start-up load, so the plant comes from GET /v1/public/tags/:qrId, which
// only answers for a published plant and reduces an endangered location
// on the server.
export default function PublicPlant({ qr }) {
  const [state, setState] = useState({ qr: null, status: "loading" });

  useEffect(() => {
    let current = true;
    fetchPublicPlantByTag(qr).then((res) => {
      if (!current) return;
      // The API always sends the species with the plant; anything else is shown as an error, not a crash.
      if (res.ok && res.data?.species) setState({ qr, status: "found", plant: res.data });
      else if (res.ok) setState({ qr, status: "error", message: "We could not load this plant right now. Please try again." });
      else if (res.status === 404) setState({ qr, status: "missing" });
      else setState({ qr, status: "error", message: res.status === 429 ? "Too many plants looked up from here. Wait a minute and try again." : "We could not load this plant right now. Please try again." });
    });
    return () => { current = false; };
  }, [qr]);

  // A new tag in the address starts from "loading", not the last tag's result.
  const { status, plant, message } = state.qr === qr ? state : { status: "loading" };

  if (status === "loading") {
    return <section className="glass pad prose narrow"><p className="mute">Looking up tag <Mono>{qr}</Mono>…</p></section>;
  }
  if (status !== "found") {
    return (
      <section className="glass pad prose narrow">
        <h1>{status === "missing" ? "Tag not found" : "Something went wrong"}</h1>
        <p>
          {status === "missing"
            ? <>There is no published plant on tag <Mono>{qr}</Mono> yet. Check the code on the tag, or come back later: new plants appear once park officers have checked them.</>
            : message}
        </p>
        <a className="btn" href="#/plants"><Icon name="leaf" size={18} /> Browse all plants</a>
      </section>
    );
  }

  const s = plant.species;
  const name = s.common_name || s.scientific_name;
  const where = plant.lat != null && plant.lng != null
    ? [{ p: { id: plant.qr_id, qr_id: plant.qr_id, name, scientific: s.scientific_name, species: s }, c: { lat: plant.lat, lng: plant.lng } }]
    : [];

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href="#/plants">Plants</a> <span aria-hidden="true">›</span>{" "}
        <a href={"#/plants/" + s.id}>{name}</a> <span aria-hidden="true">›</span>{" "}
        <Mono><span aria-current="page">{plant.qr_id}</span></Mono>
      </nav>

      <section className="specieshero">
        <div className="speciesphotos">
          <PhotoGallery key={s.id} photos={orderedPhotos(s.media)} />
        </div>
        <div className="speciesinfo">
          <p className="eyebrow">Tag <Mono>{plant.qr_id}</Mono>{s.family && <> · {s.family}</>}</p>
          <h1>{name}</h1>
          <Sci block className="sciname">{s.scientific_name}</Sci>
          {s.description && <p className="lede-s">{s.description}</p>}
          <dl>
            {s.family && <><dt>Family</dt><dd>{s.family}</dd></>}
            {s.genus && <><dt>Genus</dt><dd>{s.genus}</dd></>}
            {s.conservation_status && <><dt>Conservation status</dt><dd><Chip value={s.conservation_status} /></dd></>}
            {s.cultural_significance && <><dt>Cultural note</dt><dd>{s.cultural_significance}</dd></>}
            {s.updated_at && <><dt>Last updated</dt><dd>{fmtDate(s.updated_at)}</dd></>}
          </dl>
          <a className="btn ghost gap-top-s" href={"#/plants/" + s.id}><Icon name="leaf" size={18} /> More about this species</a>
        </div>
      </section>

      <section className="glass pad gap-section-s" aria-labelledby="where">
        <h2 id="where">Where it grows</h2>
        {where.length ? (
          <>
            <MiniMap points={where} label={`Map of where ${name} grows`} />
            {plant.location_reduced && <p className="mute small gap-top-s">This plant is protected, so the map only shows the area it grows in (within about a kilometre), not the plant itself.</p>}
          </>
        ) : (
          <p className="mute">No location was recorded for this plant.</p>
        )}
      </section>
    </>
  );
}
