// apps/shared/plantBook.js
// The plant book: a reference of every published species, like a small dictionary, kept
// on this device so it still opens with no connection. Words only: photos need a
// connection. Published species are public and have no plant locations, so nothing
// protected is stored.
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "./store.js";
import { getStorageAdapter } from "./api.js";
import { bookEntries } from "./selectors.js";

const BOOK_KEY = "daun_plant_book";

const storage = () => getStorageAdapter() || (typeof window !== "undefined" ? window.localStorage : null);

async function readBook() {
  try {
    const raw = await storage()?.getItem(BOOK_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeBook(book) {
  try {
    await storage()?.setItem(BOOK_KEY, JSON.stringify(book));
  } catch {
    // A full device keeps the copy it already has.
  }
}

// { entries, offline, savedAt }. Connected: the live list, saved for later. Not connected:
// the saved copy. A device that has never connected has nothing to show yet.
export function usePlantBook() {
  const { db, apiStatus } = useStore();
  const live = apiStatus === "connected";
  const liveEntries = useMemo(() => bookEntries(db.species), [db.species]);
  const [saved, setSaved] = useState(null);
  const written = useRef("");

  useEffect(() => {
    let current = true;
    readBook().then((book) => {
      if (current && book) setSaved(book);
    });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (!live || !liveEntries.length) return;
    const text = JSON.stringify(liveEntries);
    if (text === written.current) return;
    written.current = text;
    const book = { savedAt: new Date().toISOString(), entries: liveEntries };
    setSaved(book);
    writeBook(book);
  }, [live, liveEntries]);

  return {
    entries: live ? liveEntries : saved?.entries || liveEntries,
    offline: apiStatus === "offline",
    savedAt: saved?.savedAt || null,
  };
}
