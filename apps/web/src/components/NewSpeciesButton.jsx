// apps/web/src/components/NewSpeciesButton.jsx
import { useState } from "react";
import Icon from "./Icon.jsx";
import SpeciesForm from "./SpeciesForm.jsx";
import { BLANK_SPECIES } from "../../../shared/data.js";

// "The species is not in the list": creates it on the spot, starting from the
// botanist's guess, and hands it back so the record can be linked to it.
export default function NewSpeciesButton({ guess, onCreated }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn ghost small-btn gap-top-xs" onClick={() => setOpen(true)}>
        <Icon name="plus" size={16} /> Not in the list? Create a new species
      </button>
      {open && (
        <SpeciesForm
          species={{ ...BLANK_SPECIES, scientific_name: guess?.trim() || "", conservation_status: "not evaluated" }}
          offerPublish
          onClose={() => setOpen(false)}
          onSaved={(species) => {
            setOpen(false);
            onCreated(species);
          }}
        />
      )}
    </>
  );
}
