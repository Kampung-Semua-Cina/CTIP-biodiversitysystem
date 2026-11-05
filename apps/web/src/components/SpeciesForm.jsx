// apps/web/src/components/SpeciesForm.jsx
import { useState } from "react";
import Icon from "./Icon.jsx";
import { Modal } from "./Bits.jsx";
import { useConfirm } from "../useConfirm.jsx";
import { useStore } from "../../../shared/store.js";
import { CONSERVATION, statusKey } from "../../../shared/data.js";
import { label } from "../../../shared/utils.js";

// Add or edit one species in a popup: used by the Species page and by the review
// screens, so an officer can add a species without leaving the record.
// `offerPublish` adds a tick box to publish a new species as it is created.
export default function SpeciesForm({ species, onClose, onSaved, onManagePhotos, offerPublish }) {
  const { db, saveSpecies, setSpeciesPublished, notify } = useStore();
  // The status in its usual form ("Endangered" -> "endangered"), so the list shows
  // the real one. Before, a capitalised status matched no option, the list showed
  // "Least concern", and saving could turn an endangered species into least concern
  // and make its plants' exact locations public.
  const [form, setForm] = useState(() => ({ ...species, conservation_status: statusKey(species.conservation_status) || "" }));
  const knownStatus = CONSERVATION.includes(form.conservation_status);
  const [startStatus] = useState(form.conservation_status);
  const [publish, setPublish] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ask, confirmDialog] = useConfirm();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    const name = form.scientific_name.trim();
    if (!name) return notify("Enter the scientific name");
    if (!knownStatus) return notify("Choose a conservation status from the list");
    if (db.species.some((s) => !s.is_deleted && s.id !== form.id && s.scientific_name.toLowerCase() === name.toLowerCase())) {
      return notify("This species is already in the list");
    }
    if (offerPublish && publish && !(await ask({ title: "Make species public", body: <p>Publish <i className="sci">{name}</i> in the public catalogue? Everyone will be able to see it.</p>, confirmLabel: "Save & make public", word: "PUBLISH" }))) return;
    setSaving(true);
    const r = await saveSpecies({ ...form, scientific_name: name, conservation_status: form.conservation_status });
    if (r.ok && offerPublish && publish) await setSpeciesPublished(r.species.id, true);
    setSaving(false);
    if (r.ok) onSaved(r.species); // on failure the form stays open with what was typed
  };

  return (
    <Modal title={form.id ? "Edit species" : "Add species"} onClose={onClose}>
      {confirmDialog}
      <form onSubmit={save}>
        <label>Scientific name<input value={form.scientific_name} onChange={set("scientific_name")} required autoFocus={!form.id} /></label>
        <label>Common name<input value={form.common_name || ""} onChange={set("common_name")} /></label>
        <div className="two">
          <label>Family<input value={form.family || ""} onChange={set("family")} /></label>
          <label>Genus<input value={form.genus || ""} onChange={set("genus")} /></label>
        </div>
        <label>Conservation status
          <select value={form.conservation_status} onChange={set("conservation_status")} aria-invalid={knownStatus ? undefined : "true"}>
            {/* Never fall back to the first option: an unknown or missing status must be chosen. */}
            {!knownStatus && <option value={form.conservation_status} disabled>{startStatus ? `"${startStatus}" is not a known status. Choose one` : "Choose a status"}</option>}
            {CONSERVATION.map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </select>
          {!knownStatus && <small className="fielderr" role="alert">Choose the species' conservation status before saving.</small>}
        </label>
        <label>Description<textarea rows="3" value={form.description || ""} onChange={set("description")} /></label>
        <label>Cultural significance<textarea rows="2" value={form.cultural_significance || ""} onChange={set("cultural_significance")} /></label>
        {offerPublish && (
          <label className="check hidespot gap-top-s">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            <span>Publish it in the public catalogue</span>
          </label>
        )}
        <div className="row wrap gap-top" style={{ alignItems: "center" }}>
          <button className="btn" type="submit" disabled={saving}><Icon name="check" size={18} /> {saving ? "Saving…" : "Save species"}</button>
          {onManagePhotos && (
            <button type="button" className="btn ghost" onClick={onManagePhotos}>
              <Icon name="camera" size={18} /> Manage species &amp; observation photos
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
