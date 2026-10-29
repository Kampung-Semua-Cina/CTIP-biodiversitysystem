// apps/web/src/pages/AddPlant.jsx
import { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Icon from "../components/Icon.jsx";
import Shell from "../components/Shell.jsx";
import { Mono } from "../components/Bits.jsx";
import TagPrint from "../components/TagPrint.jsx";
import { useStore } from "../../../shared/store.js";
import { tagUrl, unfinishedPlants } from "../../../shared/selectors.js";
import { can } from "../../../shared/permissions.js";
import { go, useRoute } from "../useRoute.js";

// Botanist form. Step 1 binds a QR tag to the plant (scan, pick an unused tag, or generate a new one).
// Step 2 records what was seen. Location comes from the phone's GPS.
export default function AddPlant() {
  const { db, me, role, addPlant, generateTags, notify } = useStore();
  const { arg } = useRoute(); // #/add/NIAH-0001 starts with that tag
  const sending = useRef(false); // blocks a second submit before "saving" re-renders the button
  const [qr, setQr] = useState(arg || "");
  // Finishing a plant saved without its record: start from what was saved.
  const saved = arg ? db.plants.find((p) => p.qr_id === arg && p.registered_by === me?.id) : null;
  const [guess, setGuess] = useState(saved?.proposed_species || "");
  const [morphology, setMorphology] = useState("");
  const [height, setHeight] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState([]);
  const [spot, setSpot] = useState(saved?.lat != null ? { lat: saved.lat, lng: saved.lng, acc: saved.gps_accuracy_m ?? null } : { lat: 3.8031, lng: 113.7762, acc: null });
  const [printing, setPrinting] = useState(false);
  const [saving, setSaving] = useState(false);

  const unused = db.tags.filter((t) => t.status === "unused");
  // My plants saved without their record (an earlier send failed): sending again finishes them.
  const unfinished = unfinishedPlants(db, me?.id);

  // Demo scan: the next unused tag is used. Real scanning comes with the camera in the mobile app.
  const onScanFile = (e) => {
    if (!e.target.files.length) return;
    if (!unused.length) return notify("No unused tags left. Generate a new QR.");
    setQr(unused[0].qr_id);
    e.target.value = "";
  };

  const generate = async () => {
    try {
      const ids = await generateTags(1, "field");
      if (ids && ids.length > 0) {
        setQr(ids[0]);
      }
    } catch (err) {
      console.error("Failed to generate tag:", err);
    }
  };

  const locate = () => {
    if (!navigator.geolocation) return notify("This device cannot share its location");
    navigator.geolocation.getCurrentPosition(
      (pos) => setSpot({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) }),
      () => notify("Location is turned off. Using the last saved spot."),
    );
  };

  const onPhotos = (e) => {
    const files = [...e.target.files];
    const added = files.map((f) => ({
      file: f,
      url: URL.createObjectURL(f),
      name: f.name,
      type: f.type,
      size: f.size,
    }));
    setPhotos([...photos, ...added]);
    e.target.value = "";
  };

  // Changed their mind: drop the photo before sending, and free its preview.
  const removePhoto = (url) => {
    URL.revokeObjectURL(url);
    setPhotos(photos.filter((p) => p.url !== url));
  };

  const save = async (e) => {
    e.preventDefault();
    if (!qr) return notify("Choose or generate a QR tag first");
    if (!guess.trim()) return notify("Please select or enter a species before submitting");
    if (!photos.length) return notify("Add at least one photo");
    if (sending.current) return;
    sending.current = true;
    setSaving(true);
    const res = await addPlant({
      qr_id: qr, proposed_species: guess, morphology, height_cm: height, notes, photos,
      lat: spot.lat, lng: spot.lng, gps_accuracy_m: spot.acc ?? 10,
    });
    sending.current = false;
    setSaving(false);
    if (res?.ok) {
      notify("Plant sent for review");
      go("/records");
    } else if (res?.error?.code === "TAG_IN_USE") {
      setQr(""); // the tag turned out to be taken; make them pick another
    }
  };

  return (
    <Shell seg="add">
      <h2>Add plant</h2>
      <form onSubmit={save}>
        <h3 className="step"><span>1</span> Tag the plant</h3>
        <div className="row wrap">
          <label className="btn ghost filebtn">
            <Icon name="camera" size={18} /> Scan or upload QR
            <input type="file" accept="image/*" capture="environment" hidden onChange={onScanFile} />
          </label>
          {/* Only officers and admins may create tags (qr_tags RLS); botanists use printed ones. */}
          {can(role, "tags") && <button type="button" className="btn ghost" onClick={generate}><Icon name="qr" size={18} /> Generate new QR</button>}
          <select value={qr} onChange={(e) => setQr(e.target.value)} aria-label="Pick an unused tag">
            <option value="">Pick an unused tag</option>
            {unused.map((t) => <option key={t.qr_id} value={t.qr_id}>{t.qr_id}</option>)}
            {unfinished.map((p) => <option key={p.qr_id} value={p.qr_id}>{p.qr_id} (not sent yet)</option>)}
            {qr && !unused.some((t) => t.qr_id === qr) && !unfinished.some((p) => p.qr_id === qr) && <option value={qr}>{qr}</option>}
          </select>
        </div>
        {qr && (
          <div className="qrbox">
            <div className="qrwhite"><QRCodeSVG value={tagUrl(qr)} size={96} /></div>
            <div>
              <b className="tagid">{qr}</b>
              <p className="mute small">This tag will be bound to the plant when you save.</p>
              <button type="button" className="btn ghost small-btn" onClick={() => setPrinting(true)}><Icon name="printer" size={16} /> Print tag…</button>
            </div>
          </div>
        )}

        <h3 className="step"><span>2</span> Record what you see</h3>
        <label>Species guess<input value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="Your best guess. An officer confirms it." /></label>
        <label>Appearance<textarea rows="3" value={morphology} onChange={(e) => setMorphology(e.target.value)} placeholder="Leaves, flowers, trunk, pitchers..." /></label>
        <label>Height (cm)<input type="number" min="0" value={height} onChange={(e) => setHeight(e.target.value)} /></label>
        <label>Notes<textarea rows="2" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>

        <label>Photos</label>
        <div className="row wrap">
          {photos.map((p, i) => (
            <span key={p.url} className="minibox">
              <img className="mini" src={p.url} alt={`Photo ${i + 1}`} />
              <button type="button" className="miniremove" onClick={() => removePhoto(p.url)} disabled={saving}
                aria-label={`Remove photo ${i + 1}`} title="Remove this photo"><Icon name="x" size={14} /></button>
            </span>
          ))}
          <label className="upl add"><Icon name="plus" /><span className="sr">Add photos</span><input type="file" accept="image/*" multiple hidden onChange={onPhotos} /></label>
        </div>

        <label>Location</label>
        <div className="row wrap">
          <button type="button" className="btn ghost" onClick={locate}><Icon name="pin" size={18} /> Use my location</button>
          <span className="mute"><Mono>{spot.lat.toFixed(5)}, {spot.lng.toFixed(5)}</Mono>{spot.acc ? ` ±${spot.acc} m` : ""}</span>
        </div>

        <p className="gap-top">
          <button className="btn" type="submit" disabled={saving}>
            <Icon name={saving ? "refresh" : "send"} size={18} /> {saving ? "Uploading & saving..." : "Send for review"}
          </button>
        </p>
      </form>

      {/* Same print setup as the QR tags page (size, label or A4, copies), with only this tag in it. */}
      {printing && <TagPrint tags={db.tags.filter((t) => t.qr_id === qr)} initial={[qr]} onClose={() => setPrinting(false)} />}
    </Shell>
  );
}
