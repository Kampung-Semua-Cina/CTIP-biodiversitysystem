// apps/web/src/useLiveUpdates.js
import { useEffect, useRef } from "react";
import { useStore } from "../../shared/store.js";
import { can } from "../../shared/permissions.js";
import { nameOf, plantView } from "../../shared/selectors.js";

const POLL_MS = 5000;
const RETRY_MS = 15000; // gentler while the API is not answering
const PAGE_TITLE = document.title;

// Keeps a signed-in person's data fresh without a page refresh: a botanist's new
// record reaches the officer within about 5 seconds. Each load waits for the last
// one to finish, and a tab in the background does not load at all.
export function useLiveUpdates() {
  const { db, me, role, loadFromApi, notify } = useStore();
  const signedIn = !!me;

  useEffect(() => {
    if (!signedIn) return undefined;
    let stopped = false;
    let running = false;
    let timer = null;

    const tick = async () => {
      if (stopped || running) return;
      clearTimeout(timer);
      let wait = POLL_MS;
      if (document.visibilityState === "visible") {
        running = true;
        const res = await loadFromApi(true).catch(() => ({ ok: false }));
        running = false;
        if (!res.ok) wait = RETRY_MS;
      }
      if (!stopped) timer = setTimeout(tick, wait);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };

    timer = setTimeout(tick, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [signedIn, loadFromApi]);

  // Tell an officer when a new record arrives, wherever they are on the site.
  const known = useRef(null); // ids already waiting; null until the first load
  const reviews = can(role, "review");
  const profileLoaded = !!me && !me.loading;
  useEffect(() => {
    if (!reviews || !profileLoaded) {
      known.current = null;
      document.title = PAGE_TITLE;
      return;
    }
    const waiting = db.observations.filter((o) => o.status === "synced");
    const fresh = known.current ? waiting.filter((o) => !known.current.has(o.id)) : [];
    known.current = new Set(waiting.map((o) => o.id));
    document.title = waiting.length ? `(${waiting.length}) ${PAGE_TITLE}` : PAGE_TITLE;

    if (fresh.length === 1) {
      const plant = plantView(db, db.plants.find((p) => p.id === fresh[0].specimen_id));
      notify(`New record to review: ${plant?.qr_id || "plant"} · ${plant?.name || ""} · by ${nameOf(db, fresh[0].recorded_by)}`);
    } else if (fresh.length > 1) {
      notify(`${fresh.length} new records to review`);
    }
    // db.observations only: the rest of db is read to word the message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.observations, reviews, profileLoaded, notify]);
}
