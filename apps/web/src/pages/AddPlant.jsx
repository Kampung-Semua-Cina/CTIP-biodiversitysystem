// web/src/pages/AddPlant.jsx
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Icon from "../components/Icon.jsx";
import Shell from "../components/Shell.jsx";
import { useStore } from "../store.js";
import { tagUrl } from "../selectors.js";
import { go } from "../useRoute.js";

// Botanist form. Step 1 binds a QR tag to the plant (scan, pick an unused tag, or generate a new one).
// Step 2 records what was seen. Location comes from the phone's GPS.
export default function AddPlant() {
  const { db, addPlant, generateTags, notify } = useStore();
  const [qr, setQr] = useState("");
  const [guess, setGuess] = useState("");
  const [morphology, setMorphology] = useState("");
  const [height, setHeight] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState([]);
  const [spot, setSpot] = useState({ lat: 3.8031, lng: 113.7762, acc: null });

  const unused = db.tags.filter((t) => t.status === "unused");

  // Demo scan: the next unused tag is used. Real scanning comes with the camera in the mobile app.
  const onScanFile = (e) => {
    if (!e.target.files.length) return;
    if (!unused.length) return notify("No unused tags left. Generate a new QR.");
    setQr(unused[0].qr_id);
    e.target.value = "";
  };

  const generate = () => {
    const [id] = generateTags(1, "field");
    setQr(id);
  };

  const locate = () => {
    if (!navigator.geolocation) return notify("This device cannot share its location");
    navigator.geolocation.getCurrentPosition(
      (pos) => setSpot({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) }),
      () => notify("Location is turned off. Using the last saved spot."),
    );
  };

  const onPhotos = (e) => {
    const added = [...e.target.files].map((f) => ({ url: URL.createObjectURL(f) }));
    setPhotos([...photos, ...added]);
    e.target.value = "";
  };

  const save = (e) => {
    e.preventDefault();
    if (!qr) return notify("Choose or generate a QR tag first");
    if (!photos.length) return notify("Add at least one photo");
    addPlant({
      qr_id: qr, proposed_species: guess, morphology, height_cm: height, notes, photos,
      lat: spot.lat, lng: spot.lng, gps_accuracy_m: spot.acc ?? 10,
    });
    notify("Plant sent for review");
    go("/records");
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
          <button type="button" className="btn ghost" onClick={generate}><Icon name="qr" size={18} /> Generate new QR</button>
          <select value={qr} onChange={(e) => setQr(e.target.value)} aria-label="Pick an unused tag">
            <option value="">Pick an unused tag</option>
            {unused.map((t) => <option key={t.qr_id} value={t.qr_id}>{t.qr_id}</option>)}
            {qr && !unused.some((t) => t.qr_id === qr) && <option value={qr}>{qr}</option>}
          </select>
        </div>
        {qr && (
          <div className="qrbox">
            <div className="qrwhite"><QRCodeSVG value={tagUrl(qr)} size={96} /></div>
            <div>
              <b>{qr}</b>
              <p className="mute small">This tag will be bound to the plant when you save.</p>
              <button type="button" className="btn ghost small-btn" onClick={() => window.print()}><Icon name="printer" size={16} /> Print tag</button>
            </div>
          </div>
        )}
        {qr && (
          <div className="printsheet print-only">
            <figure><QRCodeSVG value={tagUrl(qr)} size={160} /><figcaption>{qr}</figcaption></figure>
          </div>
        )}

        <h3 className="step"><span>2</span> Record what you see</h3>
        <label>Species guess<input value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="Your best guess. An officer confirms it." /></label>
        <label>Appearance<textarea rows="3" value={morphology} onChange={(e) => setMorphology(e.target.value)} placeholder="Leaves, flowers, trunk, pitchers..." /></label>
        <label>Height (cm)<input type="number" min="0" value={height} onChange={(e) => setHeight(e.target.value)} /></label>
        <label>Notes<textarea rows="2" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>

        <label>Photos</label>
        <div className="row wrap">
          {photos.map((p) => <img key={p.url} className="mini" src={p.url} alt="" />)}
          <label className="upl add"><Icon name="plus" /><span className="sr">Add photos</span><input type="file" accept="image/*" multiple hidden onChange={onPhotos} /></label>
        </div>

        <label>Location</label>
        <div className="row wrap">
          <button type="button" className="btn ghost" onClick={locate}><Icon name="pin" size={18} /> Use my location</button>
          <span className="mute">{spot.lat.toFixed(5)}, {spot.lng.toFixed(5)}{spot.acc ? ` (±${spot.acc} m)` : ""}</span>
        </div>

        <p><button className="btn" type="submit">Save plant</button></p>
      </form>
    </Shell>
  );
}
