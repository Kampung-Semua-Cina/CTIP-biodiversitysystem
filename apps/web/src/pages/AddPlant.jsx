// apps/web/src/pages/AddPlant.jsx
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Icon from "../components/Icon.jsx";
import Shell from "../components/Shell.jsx";
import { Mono, Sci } from "../components/Bits.jsx";
import TagPrint from "../components/TagPrint.jsx";
import LeafletMap from "../components/LeafletMap.jsx";
import { useStore } from "../../../shared/store.js";
import { tagUrl, unfinishedPlants } from "../../../shared/selectors.js";
import { can } from "../../../shared/permissions.js";
import { go, useRoute } from "../useRoute.js";
import { photoFileProblem } from "../../../shared/utils.js";

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
  // No made-up default: without a real fix the record is sent with no location and the officer is told.
  const [spot, setSpot] = useState(saved?.lat != null ? { lat: saved.lat, lng: saved.lng, acc: saved.gps_accuracy_m ?? null } : { lat: null, lng: null, acc: null });
  const hasSpot = spot.lat != null && spot.lng != null;
  const [typed, setTyped] = useState(null); // { lat, lng } as text while setting the location by hand, else null
  const [printing, setPrinting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const suggestRef = useRef(null);

  const unused = db.tags.filter((t) => t.status === "unused");
  // My plants saved without their record (an earlier send failed): sending again finishes them.
  const unfinished = unfinishedPlants(db, me?.id);
  const activeSpecies = (db.species || []).filter((s) => !s.is_deleted);

  const needle = guess.trim().toLowerCase();
  const exactMatch = activeSpecies.find(
    (s) => s.scientific_name?.toLowerCase() === needle || (s.common_name && s.common_name.toLowerCase() === needle)
  );

  const suggestions = needle.length >= 1 && !exactMatch
    ? activeSpecies
        .filter((s) => {
          const matchSci = s.scientific_name.toLowerCase().includes(needle);
          const matchCom = s.common_name && s.common_name.toLowerCase().includes(needle);
          const matchFam = s.family && s.family.toLowerCase().includes(needle);
          const matchGen = s.genus && s.genus.toLowerCase().includes(needle);
          return matchSci || matchCom || matchFam || matchGen;
        })
        .slice(0, 6)
    : [];

  const popularSuggestions = activeSpecies.slice(0, 4);

  // Close suggestion dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (suggestRef.current && !suggestRef.current.contains(e.target)) {
        setSuggestOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectSpecies = (sp) => {
    setGuess(sp.scientific_name);
    if (!morphology.trim() && (sp.description || sp.morphology)) {
      setMorphology(sp.description || sp.morphology);
    }
    setSuggestOpen(false);
  };

  // Demo scan: the next unused tag is used. Real scanning comes with the camera in the mobile app.
  const onScanFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Not a picture (e.g. a video renamed to .jpg): say so instead of guessing.
    const problem = await photoFileProblem(file);
    if (problem) {
      e.target.value = "";
      return notify(`${problem}.`);
    }
    try {
      if ("BarcodeDetector" in window) {
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
        const barcodes = await detector.detect(img);
        if (barcodes && barcodes.length > 0) {
          const raw = barcodes[0].rawValue;
          const match = String(raw || "").toUpperCase().match(/NIAH-\d{4}/);
          const foundTag = match ? match[0] : String(raw || "").trim().toUpperCase();
          if (foundTag) {
            setQr(foundTag);
            notify(`QR code ${foundTag} detected from image`);
            e.target.value = "";
            return;
          }
        }
      }
    } catch {
      // ignore
    }
    const nameMatch = file.name.toUpperCase().match(/NIAH-\d{4}/);
    if (nameMatch) {
      setQr(nameMatch[0]);
      notify(`Tag ${nameMatch[0]} found from filename`);
      e.target.value = "";
      return;
    }
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
      (pos) => {
        setSpot({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) });
        setTyped(null);
      },
      () => notify(hasSpot ? "Location is turned off. Keeping the spot captured earlier." : "Location is turned off. The record will be sent without a location."),
    );
  };

  // A location set by hand has no GPS accuracy. Half-typed or out-of-range numbers count as no location.
  const typeSpot = (next) => {
    setTyped(next);
    const lat = Number(next.lat);
    const lng = Number(next.lng);
    const valid = next.lat !== "" && next.lng !== "" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    setSpot(valid ? { lat, lng, acc: null } : { lat: null, lng: null, acc: null });
  };

  // Only real pictures: each file's contents are checked, so a video renamed to .jpg
  // is refused with the reason instead of showing as an empty box.
  const onPhotos = async (e) => {
    const input = e.target;
    const all = [...input.files];
    input.value = "";
    const found = await Promise.all(all.map(photoFileProblem));
    const problems = found.filter(Boolean);
    if (problems.length) notify(`${problems.join(". ")}.`);
    const files = all.filter((f, i) => !found[i]);
    const added = files.map((f) => ({
      file: f,
      url: URL.createObjectURL(f),
      name: f.name,
      type: f.type,
      size: f.size,
    }));
    setPhotos((current) => [...current, ...added]);
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
      lat: spot.lat, lng: spot.lng, gps_accuracy_m: hasSpot ? spot.acc : null,
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
          {/* No printed tag to hand: make one for this plant (CTIP-27). Botanists get one at a time. */}
          {(can(role, "add") || can(role, "tags")) && <button type="button" className="btn ghost" onClick={generate}><Icon name="qr" size={18} /> Generate new QR</button>}
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
        <label>
          Species guess
          <div className="species-suggest-box" ref={suggestRef}>
            <input
              list="species-datalist"
              value={guess}
              onChange={(e) => {
                setGuess(e.target.value);
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              placeholder="Start typing a botanical or common name..."
              autoComplete="off"
              aria-label="Species guess"
            />
            <datalist id="species-datalist">
              {activeSpecies.map((s) => (
                <option key={s.id} value={s.scientific_name}>
                  {s.common_name ? `${s.common_name} (${s.family})` : s.family}
                </option>
              ))}
            </datalist>

            {suggestOpen && suggestions.length > 0 && (
              <div className="species-dropdown" role="listbox" aria-label="Species suggestions">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    className="species-dropdown-item"
                    onClick={() => selectSpecies(s)}
                  >
                    <div className="species-item-main">
                      <span className="species-item-common">{s.common_name || s.scientific_name}</span>
                      <span className="species-item-sci"><Sci>{s.scientific_name}</Sci></span>
                    </div>
                    {s.family && <span className="chip subtle">{s.family}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </label>

        {exactMatch ? (
          <p className="success-hint">
            ✓ Recognized: <b>{exactMatch.common_name}</b> · <Sci>{exactMatch.scientific_name}</Sci> ({exactMatch.family})
          </p>
        ) : (
          <div className="species-pills-row">
            <span className="mute small">Common species:</span>
            {popularSuggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                className="species-pill-btn"
                onClick={() => selectSpecies(s)}
              >
                {s.common_name || s.scientific_name}
              </button>
            ))}
          </div>
        )}

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
          <button type="button" className="btn ghost" aria-expanded={!!typed}
            onClick={() => setTyped(typed ? null : { lat: hasSpot ? String(spot.lat) : "", lng: hasSpot ? String(spot.lng) : "" })}>
            <Icon name="map" size={18} /> {typed ? "Close map" : "Set it by hand"}
          </button>
          {hasSpot
            ? <span className="mute"><Mono>{spot.lat.toFixed(5)}, {spot.lng.toFixed(5)}</Mono>{spot.acc ? ` ±${spot.acc} m` : ""}</span>
            : <span className="mute">Not captured yet</span>}
        </div>
        {typed && (
          <div className="gap-top-s">
            <p className="mute small">Select the spot on the map, or type its latitude and longitude.</p>
            <div className="two gap-bottom-s">
              <label>Latitude<input type="number" step="any" min="-90" max="90" value={typed.lat} onChange={(e) => typeSpot({ ...typed, lat: e.target.value })} /></label>
              <label>Longitude<input type="number" step="any" min="-180" max="180" value={typed.lng} onChange={(e) => typeSpot({ ...typed, lng: e.target.value })} /></label>
            </div>
            <LeafletMap
              height={280}
              showControls={false}
              points={hasSpot ? [{ id: "spot", qr_id: qr, name: "This plant", lat: spot.lat, lng: spot.lng }] : []}
              onMapClick={(lat, lng) => typeSpot({ lat: lat.toFixed(6), lng: lng.toFixed(6) })}
            />
          </div>
        )}
        {!hasSpot && (
          <div className="callout gap-top-s" role="status">
            <p><b>No location.</b> Press "Use my location" next to the plant, or set it by hand. If you send without it, the record is saved with "location not captured", it stays off the map, and the officer is told.</p>
          </div>
        )}

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
