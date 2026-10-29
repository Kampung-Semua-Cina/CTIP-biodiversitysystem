// apps/mobile/hooks/useSpeciesSearch.js
// Searches published species through GET /v1/public/species (CTIP-26), a page at
// a time. The rules (what to send, which answers to keep) live in
// apps/shared/speciesSearch.js, where they are tested; this hook only adds the
// typing delay, the requests and React state.
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../api.js';
import {
  buildSpeciesQuery, initialSearchState, nextSearchState, failSearchState, hasMore as more,
} from '../../shared/speciesSearch.js';

const IDLE = { key: null, items: [], page: 0, total: null, loading: false, error: null };

export function useSpeciesSearch({ q, family, debounceMs = 300 }) {
  const first = buildSpeciesQuery({ q, family });
  const key = first ? JSON.stringify({ q: first.q, family: first.family }) : null;
  const [state, setState] = useState(IDLE);
  const latest = useRef(state);
  latest.current = state;

  // One page for the search named `forKey`. Late answers to an older search are
  // dropped by nextSearchState/failSearchState, because their key no longer matches.
  const fetchPage = useCallback((forKey, query) => {
    api.get('/public/species', { query })
      .then((res) => setState((s) => nextSearchState(s, { key: forKey, data: res?.data ?? [], meta: res?.meta })))
      .catch((error) => setState((s) => failSearchState(s, { key: forKey, error })));
  }, []);

  // A new search waits until typing pauses, then asks for page 1.
  useEffect(() => {
    if (!key) {
      setState(IDLE);
      return undefined;
    }
    setState(initialSearchState(key));
    const { q: term, family: fam } = JSON.parse(key);
    const timer = setTimeout(() => fetchPage(key, buildSpeciesQuery({ q: term, family: fam, page: 1 })), debounceMs);
    return () => clearTimeout(timer);
  }, [key, debounceMs, fetchPage]);

  const loadMore = useCallback(() => {
    const s = latest.current;
    if (!s.key || s.loading || s.error || !more(s)) return;
    const { q: term, family: fam } = JSON.parse(s.key);
    setState((prev) => ({ ...prev, loading: true }));
    fetchPage(s.key, buildSpeciesQuery({ q: term, family: fam, page: s.page + 1 }));
  }, [fetchPage]);

  // Asks again for the page that failed (page 1 if nothing was shown yet).
  const retry = useCallback(() => {
    const s = latest.current;
    if (!s.key || s.loading) return;
    const { q: term, family: fam } = JSON.parse(s.key);
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetchPage(s.key, buildSpeciesQuery({ q: term, family: fam, page: s.page + 1 }));
  }, [fetchPage]);

  return {
    active: Boolean(key),
    items: state.items,
    loading: state.loading,
    error: state.error,
    total: state.total,
    hasMore: more(state),
    loadMore,
    retry,
  };
}
