// apps/mobile/hooks/usePolling.js
// Polls the API for live updates while the screen is open, and pauses while the
// app is in the background. Each poll fetches only what changed since the last
// one. The wait between polls comes from the API (nextPollDelay in the store):
// about 5 s while the database is quick, up to 60 s while it is busy.
// intervalMs is the shortest wait this screen wants.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useStore } from '../../shared/store.js';

export function usePolling(intervalMs = 5000, enabled = true) {
  const { pollFromBackend, loadFromApi, nextPollDelay, authToken } = useStore();
  // The store hands out new functions on every update. Keeping them in a ref
  // stops each update from restarting the timer and polling again at once.
  const fns = useRef({});
  fns.current = { poll: pollFromBackend || (loadFromApi ? () => loadFromApi(true) : null), nextPollDelay };

  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;
    let running = false;
    let stopped = false;

    const delay = () => Math.max(intervalMs, fns.current.nextPollDelay ? fns.current.nextPollDelay() : intervalMs);
    const schedule = () => {
      clearTimeout(timer);
      if (!stopped && AppState.currentState === 'active') timer = setTimeout(tick, delay());
    };
    const tick = async () => {
      if (running || stopped || !fns.current.poll) return;
      running = true;
      try {
        await fns.current.poll(true);
      } catch {
        // A failed poll is tried again after the next wait.
      } finally {
        running = false;
      }
      schedule();
    };

    tick(); // fresh data when the screen opens

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') tick();
      else clearTimeout(timer);
    });

    return () => {
      stopped = true;
      clearTimeout(timer);
      subscription?.remove?.();
    };
  }, [intervalMs, enabled, authToken]);
}
