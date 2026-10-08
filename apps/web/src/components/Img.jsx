// Image that hides itself if the file cannot load, so the soft green
// background behind it shows instead of a broken-image icon.
export default function Img({ src, alt = "", className }) {
  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.visibility = "hidden";
      }}
    />
  );
}
