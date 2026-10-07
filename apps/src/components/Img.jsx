// Image that swaps to a local leaf picture if the real photo cannot load
// (offline, blocked, or a dead link), so the page never shows an empty box.
const FALLBACK = "/plant-fallback.svg";

export default function Img({ src, alt = "", className }) {
  return (
    <img
      className={className}
      src={src || FALLBACK}
      alt={alt}
      loading="lazy"
      onError={(e) => {
        if (!e.currentTarget.src.endsWith(FALLBACK)) e.currentTarget.src = FALLBACK;
      }}
    />
  );
}