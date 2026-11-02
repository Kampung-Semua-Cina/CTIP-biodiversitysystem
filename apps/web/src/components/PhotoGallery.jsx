// apps/web/src/components/PhotoGallery.jsx
import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import Img from "./Img.jsx";

// Slideshow with the primary photo first, arrows, and a numbered strip underneath.
// Photos with a caption (species catalogue) show it under the slide.
// Pass key={plant.id} from the parent so it starts again on photo 1 for each plant.
// `auto={false}` turns off the 5 second slideshow, for places that show several galleries at once.
export default function PhotoGallery({ photos, canEdit, onEdit, auto = true }) {
  const [i, setI] = useState(0);
  const n = photos.length;
  const cur = Math.min(i, Math.max(n - 1, 0));

  useEffect(() => {
    if (!auto || n < 2) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % n), 5000);
    return () => clearInterval(t);
  }, [auto, n, cur]);

  if (!n) {
    return (
      <div className="gallery">
        <div className="slide empty-slide">
          <Icon name="camera" size={30} />
          <p>No photos yet</p>
          {canEdit && <button className="edit" onClick={onEdit} aria-label="Edit photos"><Icon name="pencil" size={18} /></button>}
        </div>
      </div>
    );
  }

  const go = (d) => setI((cur + d + n) % n);

  return (
    <div className="gallery">
      <div className="slide">
        <Img key={photos[cur].id} src={photos[cur].url} alt={photos[cur].caption || `Plant photo ${cur + 1} of ${n}`} />
        {n > 1 && (
          <>
            <button className="nav" style={{ left: 8 }} onClick={() => go(-1)} aria-label="Previous photo"><Icon name="chevL" /></button>
            <button className="nav" style={{ right: 8 }} onClick={() => go(1)} aria-label="Next photo"><Icon name="chevR" /></button>
          </>
        )}
        {canEdit && <button className="edit" onClick={onEdit} aria-label="Edit photos"><Icon name="pencil" size={18} /></button>}
      </div>
      {photos[cur].caption && <p className="caption">{photos[cur].caption}</p>}
      {photos[cur].traits?.length > 0 && <p className="mute small">Shows: {photos[cur].traits.join(", ")}</p>}
      {n > 1 && (
        <div className="strip">
          {photos.map((p, k) => (
            <button key={p.id} className={"thumbnail" + (k === cur ? " on" : "")} onClick={() => setI(k)} aria-label={`Show photo ${k + 1}`}>
              <Img src={p.url} />
              <span>{k + 1}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
