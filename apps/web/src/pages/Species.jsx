// web/src/pages/Species.jsx
import { useState } from "react";
import Shell from "../components/Shell.jsx";
import Icon from "../components/Icon.jsx";
import { Chip, Empty, Modal } from "../components/Bits.jsx";
import { useStore } from "../store.js";
import { CONSERVATION } from "../data.js";
import { label } from "../utils.js";

const BLANK = {
  scientific_name: "", common_name: "", family: "", genus: "", description: "",
  conservation_status: "least concern", cultural_significance: "",
};

// Officer page for the species encyclopedia: add, edit, publish, delete.
export default function Species() {
  const { db, saveSpecies, togglePublish, deleteSpecies, notify } = useStore();
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null); // species being edited, or BLANK for a new one
  const [removing, setRemoving] = useState(null);

  const list = db.species
    .filter((s) => !s.is_deleted)
    .filter((s) => `${s.scientific_name} ${s.common_name} ${s.family}`.toLowerCase().includes(q.toLowerCase()));

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

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const inUse = removing ? db.plants.filter((p) => p.species_id === removing.id).length : 0;

  return (
    <Shell seg="species">
      <div className="row between wrap">
        <h2>Species</h2>
        <button className="btn" onClick={() => setForm(BLANK)}><Icon name="plus" size={18} /> Add species</button>
      </div>
      <label className="search wide">
        <Icon name="search" size={18} />
        <input placeholder="Search by name or family" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search species" />
      </label>

      {list.length === 0 ? (
        <Empty>No species match your search.</Empty>
      ) : (
        <div className="tablewrap">
          <table>
            <thead><tr><th>Species</th><th>Family</th><th>Conservation</th><th>Public</th><th><span className="sr">Actions</span></th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.common_name || s.scientific_name}</b><small className="sci block">{s.scientific_name}</small></td>
                  <td>{s.family}</td>
                  <td><Chip value={s.conservation_status} /></td>
                  <td>
                    <button className={"switch" + (s.is_published ? " on" : "")} role="switch" aria-checked={s.is_published} onClick={() => togglePublish(s.id)} aria-label={`Publish ${s.scientific_name}`}><i /></button>
                  </td>
                  <td className="actions">
                    <button className="ic" onClick={() => setForm(s)} aria-label={`Edit ${s.scientific_name}`}><Icon name="pencil" size={18} /></button>
                    <button className="ic" onClick={() => setRemoving(s)} aria-label={`Delete ${s.scientific_name}`}><Icon name="trash" size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
            <p><button className="btn" type="submit">Save species</button></p>
          </form>
        </Modal>
      )}

      {removing && (
        <Modal title="Delete species" onClose={() => setRemoving(null)}>
          <p>Delete <b>{removing.scientific_name}</b>?{inUse > 0 && ` ${inUse} tagged plant${inUse > 1 ? "s use" : " uses"} it and will show as unconfirmed.`} Past records are kept.</p>
          <div className="row">
            <button className="btn danger" onClick={() => { deleteSpecies(removing.id); setRemoving(null); notify("Species deleted"); }}>Delete</button>
            <button className="btn ghost" onClick={() => setRemoving(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </Shell>
  );
}
