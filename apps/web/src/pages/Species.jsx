// apps/web/src/pages/Species.jsx
import { useState } from "react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import PhotoEditor from "../components/PhotoEditor.jsx";
import { Chip, Empty, Modal } from "../components/Bits.jsx";
import { useStore } from "../../../shared/store.js";
import { CONSERVATION } from "../../../shared/data.js";
import { label } from "../../../shared/utils.js";
import { speciesMedia, speciesObservationPhotos } from "../../../shared/selectors.js";

const BLANK = {
  scientific_name: "", common_name: "", family: "", genus: "", description: "",
  conservation_status: "least concern", cultural_significance: "",
};

// Officer and admin page for the species encyclopedia: add, edit, photos, publish, delete, restore.
export default function Species() {
  const { db, saveSpecies, togglePublish, deleteSpecies, restoreSpecies, setSpeciesMedia, notify } = useStore();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("common");
  const [form, setForm] = useState(null); // species being edited, or BLANK for a new one
  const [removing, setRemoving] = useState(null);
  const [photosOf, setPhotosOf] = useState(null); // species whose photos are open in the editor

  const list = db.species
    .filter((s) => !s.is_deleted)
    .filter((s) => `${s.scientific_name} ${s.common_name} ${s.family}`.toLowerCase().includes(q.toLowerCase()));

  const sortedList = [...list].sort((a, b) => {
    if (sort === "scientific") return (a.scientific_name || "").localeCompare(b.scientific_name || "");
    if (sort === "family") return (a.family || "").localeCompare(b.family || "");
    if (sort === "endangered") {
      const ea = a.conservation_status === "endangered" ? 1 : 0;
      const eb = b.conservation_status === "endangered" ? 1 : 0;
      return eb - ea || (a.common_name || a.scientific_name || "").localeCompare(b.common_name || b.scientific_name || "");
    }
    if (sort === "plants") {
      const ca = db.plants.filter((p) => p.species_id === a.id).length;
      const cb = db.plants.filter((p) => p.species_id === b.id).length;
      return cb - ca || (a.common_name || a.scientific_name || "").localeCompare(b.common_name || b.scientific_name || "");
    }
    const na = a.common_name || a.scientific_name || "";
    const nb = b.common_name || b.scientific_name || "";
    return na.localeCompare(nb);
  });

  const deleted = db.species.filter((s) => s.is_deleted);

  const remove = () => {
    notify(deleteSpecies(removing.id) ? "Species deleted. You can restore it below." : "Only officers and admins can delete species");
    setRemoving(null);
  };
  const restore = (s) => {
    if (db.species.some((x) => !x.is_deleted && x.scientific_name.toLowerCase() === s.scientific_name.toLowerCase())) {
      return notify("A species with this name already exists");
    }
    notify(restoreSpecies(s.id) ? "Species restored" : "Only officers and admins can restore species");
  };

  const save = (e) => {
    e.preventDefault();
    const name = form.scientific_name.trim();
    if (!name) return notify("Enter the scientific name");
    if (db.species.some((s) => !s.is_deleted && s.id !== form.id && s.scientific_name.toLowerCase() === name.toLowerCase())) {
      return notify("This species is already in the list");
    }
    saveSpecies({ ...form, scientific_name: name });
    setForm(null);
    notify("Species saved");
  };

  const savePhotos = async (list) => {
    const r = await setSpeciesMedia(photosOf.id, list);
    notify(r?.ok ? "Photos saved" : (r?.message || "Failed to save photos"));
    if (r?.ok) setPhotosOf(null);
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const inUse = removing ? db.plants.filter((p) => p.species_id === removing.id).length : 0;

  return (
    <Shell seg="species">
      <div className="row between wrap">
        <h2>Species</h2>
        <button className="btn" onClick={() => setForm(BLANK)}><Icon name="plus" size={18} /> Add species</button>
      </div>
      <div className="toolbar" style={{ display: "flex", gap: 12, alignItems: "center", margin: "14px 0", flexWrap: "wrap" }}>
        <label className="search grow" style={{ flex: 1, minWidth: 220 }}>
        <Icon name="search" size={18} />
        <input placeholder="Search by name or family" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search species" />
        </label>
        <label className="inline" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort species">
            <option value="common">Common name A–Z</option>
            <option value="scientific">Scientific name A–Z</option>
            <option value="family">Family A–Z</option>
            <option value="endangered">Endangered first</option>
            <option value="plants">Most plants</option>
          </select>
        </label>
      </div>

      {sortedList.length === 0 ? (
        <Empty>No species match your search.</Empty>
      ) : (
        <div className="tablewrap">
          <table>
            <thead><tr><th>Species</th><th>Family</th><th>Conservation</th><th>Public</th><th><span className="sr">Actions</span></th></tr></thead>
            <tbody>
              {sortedList.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.common_name || s.scientific_name}</b><i className="sci small block">{s.scientific_name}</i></td>
                  <td>{s.family}</td>
                  <td><Chip value={s.conservation_status} /></td>
                  <td>
                    <button className={"switch" + (s.is_published ? " on" : "")} role="switch" aria-checked={s.is_published} onClick={() => togglePublish(s.id)} aria-label={`Publish ${s.scientific_name}`}><i /></button>
                  </td>
                  <td className="actions">
                    <button className="ic" onClick={() => setForm(s)} aria-label={`Edit ${s.scientific_name}`}><Icon name="pencil" size={18} /></button>
                    <button className="ic" onClick={() => setPhotosOf(s)} aria-label={`Photos of ${s.scientific_name}`} title={`${speciesMedia(db, s.id).length} photos`}><Icon name="camera" size={18} /></button>
                    <button className="ic" onClick={() => setRemoving(s)} aria-label={`Delete ${s.scientific_name}`}><Icon name="trash" size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleted.length > 0 && (
        <>
          <h3 className="sub"><Icon name="trash" size={18} /> Recently deleted</h3>
          <p className="mute small">Hidden from every list and the public pages. Restore one to bring it back as it was.</p>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Species</th><th>Family</th><th><span className="sr">Actions</span></th></tr></thead>
              <tbody>
                {deleted.map((s) => (
                  <tr key={s.id}>
                    <td><b>{s.common_name || s.scientific_name}</b><small className="sci block">{s.scientific_name}</small></td>
                    <td>{s.family}</td>
                    <td className="actions"><button className="btn ghost" onClick={() => restore(s)}>Restore</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {form && (
        <Modal title={form.id ? "Edit species" : "Add species"} onClose={() => setForm(null)}>
          <form onSubmit={save}>
            <label>Scientific name<input value={form.scientific_name} onChange={set("scientific_name")} required /></label>
            <label>Common name<input value={form.common_name} onChange={set("common_name")} /></label>
            <div className="two">
              <label>Family<input value={form.family} onChange={set("family")} /></label>
              <label>Genus<input value={form.genus} onChange={set("genus")} /></label>
            </div>
            <label>Conservation status
              <select value={form.conservation_status} onChange={set("conservation_status")}>
                {CONSERVATION.map((c) => <option key={c} value={c}>{label(c)}</option>)}
              </select>
            </label>
            <label>Description<textarea rows="3" value={form.description} onChange={set("description")} /></label>
            <label>Cultural significance<textarea rows="2" value={form.cultural_significance} onChange={set("cultural_significance")} /></label>
            <div className="row wrap gap-top" style={{ alignItems: "center" }}>
              <button className="btn" type="submit"><Icon name="check" size={18} /> Save species</button>
              {form.id && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    const target = form;
                    setForm(null);
                    setPhotosOf(target);
                  }}
                >
                  <Icon name="camera" size={18} /> Manage species &amp; observation photos
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}

      {photosOf && (
        <PhotoEditor
          photos={speciesMedia(db, photosOf.id) || []}
          observationPhotos={speciesObservationPhotos(db, photosOf.id)}
          captions
          min={0}
          onClose={() => setPhotosOf(null)}
          onSave={savePhotos}
        />
      )}

      {removing && (
        <Modal title="Delete species" onClose={() => setRemoving(null)}>
          <p>Delete <i className="sci">{removing.scientific_name}</i>?{inUse > 0 && ` ${inUse} tagged plant${inUse > 1 ? "s use" : " uses"} it and will show as unconfirmed.`} Past records are kept, and you can restore it later.</p>
          <div className="row">
            <button className="btn danger" onClick={remove}><Icon name="trash" size={18} /> Delete</button>
            <button className="btn ghost" onClick={() => setRemoving(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </Shell>
  );
}
