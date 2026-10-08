import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import Img from "./Img.jsx";

// Slideshow with the primary photo first, arrows, and a numbered strip underneath.
// Pass key={plant.id} from the parent so it starts again on photo 1 for each plant.
export default function PhotoGallery({ photos, canEdit, onEdit }) {
  const [i, setI] = useState(0);
  const n = photos.length;
  const cur = Math.min(i, Math.max(n - 1, 0));

  useEffect(() => {
    if (n < 2) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % n), 5000);
    return () => clearInterval(t);
  }, [n, cur]);

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
        <Img src={photos[cur].url} alt={`Plant photo ${cur + 1} of ${n}`} />
        {n > 1 && (
          <>
            <button className="nav" style={{ left: 8 }} onClick={() => go(-1)} aria-label="Previous photo"><Icon name="chevL" /></button>
            <button className="nav" style={{ right: 8 }} onClick={() => go(1)} aria-label="Next photo"><Icon name="chevR" /></button>
          </>
        )}
        {cur === 0 && <span className="primary-badge"><Icon name="star" size={13} /> Primary</span>}
        {canEdit && <button className="edit" onClick={onEdit} aria-label="Edit photos"><Icon name="pencil" size={18} /></button>}
      </div>
      {n > 1 && (
        <div className="strip">
          {photos.map((p, k) => (
            <button key={p.id} className={"thumbnail" + (k === cur ? " on" : "")} onClick={() => setI(k)} aria-label={`Show photo ${k + 1}`}>
              <Img src={p.url} />
              <span>{k + 1}</span>
              {k === 0 && <i className="dot-primary" title="Primary photo" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
