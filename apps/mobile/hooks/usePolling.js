// apps/mobile/hooks/usePolling.js
// Custom hook that polls the backend API at a regular interval (default 5000ms)
// for live updates while the screen is active, automatically pausing when the app is backgrounded.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useStore } from '../../shared/store.js';

export function usePolling(intervalMs = 5000, enabled = true) {
  const { pollFromBackend, loadFromApi, authToken, apiStatus } = useStore();
  const pollFn = pollFromBackend || (loadFromApi ? () => loadFromApi(true) : null);
  const isPollingRef = useRef(false);

  useEffect(() => {
    if (!enabled || !pollFn) return undefined;

    let timer = null;

    const executePoll = async () => {
      if (isPollingRef.current) return;
      isPollingRef.current = true;
      try {
        await pollFn(true);
      } catch (err) {
        // Silent catch for live polling errors to avoid disrupting UI
      } finally {
        isPollingRef.current = false;
      }
    };

    const startTimer = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (AppState.currentState === 'active') {
          executePoll();
        }
      }, intervalMs);
    };

    // Immediate background fetch on screen load
    executePoll();
    startTimer();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        executePoll();
        startTimer();
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    });

    return () => {
      if (timer) clearInterval(timer);
      subscription?.remove?.();
    };
  }, [pollFn, intervalMs, enabled, authToken]);
}
