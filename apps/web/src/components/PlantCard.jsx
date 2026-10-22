// apps/web/src/components/PlantCard.jsx
// Plant card from the Daun design language: photo, family, name, scientific name,
// conservation status. Used on the home page and in the species catalogue.
import Icon from "./Icon.jsx";
import Img from "./Img.jsx";
import { Chip, Sci } from "./Bits.jsx";

export default function PlantCard({ href, photo, family, name, scientific, conservation, foot, children }) {
  return (
    <a className="glass plantcard" href={href}>
      {photo ? <Img src={photo} alt="" /> : <span className="nophoto" aria-hidden="true"><Icon name="leaf" size={32} /></span>}
      <span className="body">
        {family && <span className="overline">{family}</span>}
        <span className="name">{name}</span>
        <Sci className="small">{scientific}</Sci>
        {(conservation || children) && (
          <span className="chips">
            {conservation && conservation !== "unknown" && <Chip value={conservation} />}
            {children}
          </span>
        )}
        {foot && <span className="cardfoot">{foot}</span>}
      </span>
    </a>
  );
}
