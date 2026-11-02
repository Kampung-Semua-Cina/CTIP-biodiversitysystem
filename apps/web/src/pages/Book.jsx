// apps/web/src/pages/Book.jsx
import { useState } from "react";
import Icon from "../components/Icon.jsx";
import { Chip, Empty, Sci } from "../components/Bits.jsx";
import { usePlantBook } from "../../../shared/plantBook.js";
import { bookLetters, bookName } from "../../../shared/selectors.js";
import { fuzzyMatch } from "../../../shared/fuzzy.js";
import { fmtDate } from "../../../shared/utils.js";

// Every published species, A to Z, like a small dictionary. A website cannot open without
// a connection, so "Print or save as PDF" is how to take it into the field.
export default function Book() {
  const { entries, offline, savedAt } = usePlantBook();
  const [q, setQ] = useState("");
  const shown = entries.filter((e) => fuzzyMatch(`${bookName(e)} ${e.scientific_name} ${e.family || ""} ${e.genus || ""}`.toLowerCase(), q));

  return (
    <section className="plantbook">
      <div className="pagehead">
        <div>
          <h1>Plant book</h1>
          <p className="mute">
            {entries.length} species from A to Z.
            {offline && (savedAt ? ` Not connected: showing the copy saved on ${fmtDate(savedAt)}.` : " Not connected, and no copy is saved on this device yet.")}
          </p>
        </div>
        <div className="row wrap gap-s noprint">
          <button className="btn ghost" onClick={() => window.print()}><Icon name="printer" size={18} /> Print or save as PDF</button>
          <a className="btn ghost" href="#/plants"><Icon name="leaf" size={18} /> Plants with photos</a>
        </div>
      </div>
      <label className="search noprint">
        <Icon name="search" size={20} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the plant book" aria-label="Search the plant book" />
      </label>
      {shown.length === 0 && <Empty icon="book">{entries.length ? "No species match." : "The plant book is empty for now."}</Empty>}
      {bookLetters(shown).map(({ letter, entries: list }) => (
        <div key={letter}>
          <h2>{letter}</h2>
          {list.map((e) => (
            <article key={e.id}>
              <h3><a href={"#/plants/" + e.id}>{bookName(e)}</a></h3>
              <Sci block>{e.scientific_name}</Sci>
              <p className="row wrap gap-s" style={{ alignItems: "center" }}>
                {e.family && <span className="mute">{e.family}{e.genus ? ` · ${e.genus}` : ""}</span>}
                {e.conservation_status && <Chip value={e.conservation_status} />}
              </p>
              {e.description && <p>{e.description}</p>}
              {e.cultural_significance && <p><b>Cultural note:</b> {e.cultural_significance}</p>}
              {e.updated_at && <p className="mute small">Last updated {fmtDate(e.updated_at)}</p>}
            </article>
          ))}
        </div>
      ))}
    </section>
  );
}
