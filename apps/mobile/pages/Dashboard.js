// apps/mobile/pages/Dashboard.js
// The Plants tab: the species catalogue (everyone) and the tagged plants (staff).
// Both load in pages as you scroll (infinite scroll) and show a small loading line
// while the next page arrives.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '../../shared/store.js';
import { visiblePlants, nameOf, speciesCatalogue } from '../../shared/selectors.js';
import { isThreatened } from '../../shared/data.js';
import { useTheme, font } from '../components/Theme.js';
import {
  TitleBlock, SearchField, Pills, Segmented, SortBar, Row, Thumb, Sci, Mono, DotLabel, Txt, IconButton,
  SkeletonRow, LoadingMore, Empty, Notice, Button,
} from '../components/Bits.js';
import { shortDate } from '../components/format.js';
import { useSpeciesSearch } from '../hooks/useSpeciesSearch.js';
import { cleanTerm, isTagSearch } from '../../shared/speciesSearch.js';
import { can } from '../../shared/permissions.js';
import { fuzzyMatch } from '../../shared/fuzzy.js';
import { usePolling } from '../hooks/usePolling.js';

const PAGE_SIZE = 20; // same as the API's default `limit`
const ROW_HEIGHT = 77; // fixed row height lets the list jump straight to a letter
const LETTER_HEIGHT = 42;
const RAIL_MIN = 15; // shorter lists scroll quickly enough without the A–Z rail
const RAIL_SPACE = 16; // room kept right of the rows for the rail
const LIST_BOTTOM = 40; // clears the raised Add plant / Scan button in the tab bar

// Pages through `items` already in the store: page 1, 2, 3… of PAGE_SIZE.
// A botanist or visitor typing a species name searches the API instead
// (useSpeciesSearch, CTIP-26; see SpeciesList).
function usePaged(items, resetKey) {
  const [page, setPage] = useState({ key: resetKey, count: 0, loading: true });
  // A new search or filter starts again from page 1.
  if (page.key !== resetKey) setPage({ key: resetKey, count: 0, loading: true });

  useEffect(() => {
    if (!page.loading) return undefined;
    const timer = setTimeout(() => setPage((p) => ({ ...p, count: p.count + PAGE_SIZE, loading: false })), 450);
    return () => clearTimeout(timer);
  }, [page.loading, page.key]);

  const loadMore = () => {
    if (!page.loading && page.count < items.length) setPage((p) => ({ ...p, loading: true }));
  };

  return { shown: items.slice(0, page.count), loading: page.loading, loadMore, total: items.length, done: page.count >= items.length };
}

function ListHeader({ children }) {
  return <View style={{ gap: 14, paddingTop: 12, paddingBottom: 8 }}>{children}</View>;
}

// The Plants tab holds two lists, opened as `plants` (species first) or `tagged`
// (tagged plants first). Switching between them only changes this screen's
// params (nav.replace), not the screen, so the title and the switch stay exactly
// where they are, nothing slides in, and going back from a plant returns to the
// same list. Each role always sees the two options in the same order.
export function SpeciesList({ nav, params = {} }) {
  return <PlantsTab nav={nav} params={params} route="plants" start="species" />;
}

export function TaggedPlants({ nav, params = {} }) {
  return <PlantsTab nav={nav} params={params} route="tagged" start="tagged" />;
}

function PlantsTab({ nav, params, route, start }) {
  usePolling(5000);
  const view = params.view || start;
  const onView = (v) => nav.replace(route, { ...params, view: v });
  return view === 'species'
    ? <SpeciesCatalogue nav={nav} params={params} onView={onView} />
    : <TaggedList nav={nav} onView={onView} />;
}

// Title, count and the Species / Tagged plants switch, the same in both lists.
function PlantsHeader({ nav, view, onView, count, children }) {
  const { role } = useStore();
  const { c } = useTheme();
  const items = role === 'visitor'
    ? [{ key: 'species', label: 'Species' }, { key: 'tagged', label: 'Tagged plants' }]
    : [{ key: 'tagged', label: 'Tagged plants' }, { key: 'species', label: 'Species' }];
  return (
    <ListHeader>
      {nav.canGoBack ? <View style={{ marginLeft: -16, marginTop: -8 }}><IconButton name="chevL" label="Back" onPress={nav.back} /></View> : null}
      <TitleBlock title="Plants" right={<Txt v="small" color={c.ink2}>{count}</Txt>} />
      <Segmented value={view} onChange={(k) => k !== view && onView(k)} items={items} />
      {children}
    </ListHeader>
  );
}

/* ---------- species catalogue ---------- */

const SORT_SPECIES = [
  { key: 'common', label: 'Common (A–Z)' },
  { key: 'scientific', label: 'Scientific (A–Z)' },
  { key: 'family', label: 'Family' },
  { key: 'endangered', label: 'Endangered' },
  { key: 'plants', label: 'Most tagged' },
];

function SpeciesCatalogue({ nav, params, onView }) {
  const { db, role } = useStore();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState(params.q || '');
  const [family, setFamily] = useState('all');
  const [sort, setSort] = useState('common');
  const list = useRef(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [headerH, setHeaderH] = useState(0);
  const staff = role !== 'visitor';

  // Published species only for visitors; staff also see unpublished ones.
  const species = speciesCatalogue(db, role);
  const families = [...new Set(species.map((s) => s.family).filter(Boolean))].sort();
  const plants = visiblePlants(db, role);

  const needle = q.trim().toLowerCase();
  const filtered = species
    .filter((s) => family === 'all' || s.family === family)
    .filter((s) => {
      if (!needle) return true;
      const tags = plants.filter((p) => p.species_id === s.id && p.qr_id).map((p) => String(p.qr_id).toLowerCase());
      const text = [s.common_name, s.scientific_name, s.family].filter(Boolean).join(' '); return fuzzyMatch(text, needle) || tags.some((t) => fuzzyMatch(t, needle));
    });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'scientific') return (a.scientific_name || '').localeCompare(b.scientific_name || '');
    if (sort === 'family') return (a.family || '').localeCompare(b.family || '') || (a.common_name || a.scientific_name).localeCompare(b.common_name || b.scientific_name);
    if (sort === 'endangered') {
      const ea = isThreatened(a.conservation_status) ? 1 : 0;
      const eb = isThreatened(b.conservation_status) ? 1 : 0;
      if (eb !== ea) return eb - ea;
      return (a.common_name || a.scientific_name).localeCompare(b.common_name || b.scientific_name);
    }
    if (sort === 'plants') {
      const ca = plants.filter((p) => p.species_id === a.id).length;
      const cb = plants.filter((p) => p.species_id === b.id).length;
      if (cb !== ca) return cb - ca;
      return (a.common_name || a.scientific_name).localeCompare(b.common_name || b.scientific_name);
    }
    return (a.common_name || a.scientific_name).localeCompare(b.common_name || b.scientific_name);
  });

  const local = usePaged(sorted, `${q}|${family}|${sort}`);

  // For botanists and visitors, typing a name searches published species through
  // the API, a page at a time (CTIP-26). They only ever see published species, so
  // the API returns the same set the list holds. Officers and admins keep searching
  // the loaded list, which also has unpublished species. A tag ID, whole or in part,
  // is always looked up among the plants already loaded, and browsing without a
  // search term keeps the full list with its sorts.
  const apiMode = !can(role, 'species') && !isTagSearch(q) && cleanTerm(q).length >= 2;
  const search = useSpeciesSearch({ q: apiMode ? q : '', family: apiMode ? family : undefined });
  const shown = apiMode ? search.items : local.shown;
  const loading = apiMode ? search.loading : local.loading;
  const loadMore = apiMode ? search.loadMore : local.loadMore;
  const total = apiMode ? (search.total ?? 0) : local.total;
  const done = apiMode ? !search.hasMore : local.done;

  // Insert a letter heading before the first species of each letter (when sorted alphabetically).
  const isAlphaSort = !apiMode && ['common', 'scientific'].includes(sort);
  const rows = [];
  let last = '';
  for (const s of shown) {
    if (isAlphaSort) {
      const name = sort === 'scientific' ? (s.scientific_name || s.common_name) : (s.common_name || s.scientific_name);
      const letter = (name || '?')[0].toUpperCase();
      if (letter !== last) rows.push({ type: 'letter', key: 'L' + letter, letter });
      last = letter;
    }
    rows.push({ type: 'species', key: s.id, s });
  }
  const offsets = [];
  rows.reduce((y, r) => {
    offsets.push(y);
    return y + (r.type === 'letter' ? LETTER_HEIGHT : ROW_HEIGHT);
  }, 0);
  const letters = rows.filter((r) => r.type === 'letter').map((r) => r.letter);
  const showRail = isAlphaSort && letters.length > 1 && total >= RAIL_MIN && headerH > 0;
  const jump = (letter) => {
    const i = rows.findIndex((r) => r.type === 'letter' && r.letter === letter);
    if (i >= 0) list.current?.scrollToOffset({ offset: offsets[i] + headerH, animated: true });
  };

  const header = (
    <View onLayout={(e) => { const h = e.nativeEvent.layout.height; if (h !== headerH) setHeaderH(h); }}>
      <PlantsHeader nav={nav} view="species" onView={onView} count={`${total} species`}>
        <SearchField value={q} onChangeText={setQ} placeholder="Search name or tag ID" />
        <Pills value={family} onChange={setFamily} items={[{ key: 'all', label: 'All families' }, ...families.map((f) => ({ key: f, label: f }))]} />
        {apiMode ? null : <SortBar items={SORT_SPECIES} value={sort} onChange={setSort} />}
        {apiMode && search.error ? (
          <View style={{ gap: 8 }}>
            <Notice tone="warning" icon="info" title="Species search unavailable" body={search.error} />
            <Button label="Try again" kind="secondary" height={44} size={15} onPress={search.retry} />
          </View>
        ) : null}
      </PlantsHeader>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top }}>
      <Animated.FlatList
        ref={list}
        data={rows}
        keyExtractor={(r) => r.key}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: LIST_BOTTOM }}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          // Only the rows make room for the rail; the header keeps the full width.
          <View style={{ paddingRight: showRail ? RAIL_SPACE : 0 }}>
            {item.type === 'letter' ? (
              <View style={{ height: LETTER_HEIGHT, justifyContent: 'flex-end', paddingBottom: 2 }}>
                <Text accessibilityRole="header" style={{ fontFamily: font('display', 700), fontSize: 18, color: c.accent }}>{item.letter}</Text>
              </View>
            ) : (
              <SpeciesRow s={item.s} plants={plants} staff={staff} onPress={() => nav.go('species', { id: item.s.id })} />
            )}
          </View>
        )}
        ListEmptyComponent={loading || (apiMode && search.error) ? null : <Empty icon="search">No species match. Try another name or family.</Empty>}
        ListFooterComponent={
          loading ? (
            <View>
              {shown.length === 0 ? [0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} />) : <SkeletonRow />}
              <LoadingMore />
            </View>
          ) : done && shown.length > PAGE_SIZE ? <Txt v="caption" color={c.ink3} style={{ textAlign: 'center', paddingVertical: 16 }}>That's every species.</Txt> : null
        }
      />
      {showRail ? (
        <LetterIndex
          letters={letters}
          onJump={jump}
          top={insets.top + 8}
          // Starts just below the header, then stays at the top once the header scrolls away.
          translateY={scrollY.interpolate({ inputRange: [0, headerH], outputRange: [headerH, 0], extrapolate: 'clamp' })}
        />
      ) : null}
    </View>
  );
}

function SpeciesRow({ s, plants, staff, onPress }) {
  const photo = s.photo || s.primary_image_url || s.media?.[0]?.url || plants.find((p) => p.species_id === s.id && p.photos?.length)?.photos[0]?.url;
  return (
    <View style={{ height: ROW_HEIGHT }}>
      <Row
        left={<Thumb uri={photo} />}
        title={s.common_name || s.scientific_name}
        sub={
          <>
            <Sci size={14}>{s.scientific_name}</Sci>
            {isThreatened(s.conservation_status) ? <DotLabel status="endangered" /> : null}
            {staff && s.is_published === false ? <DotLabel tone="neutral" label="Not published" /> : null}
          </>
        }
        onPress={onPress}
        right={null}
      />
    </View>
  );
}

// Letter strip down the right edge, beside the rows (never over the header). Only
// letters that have species are listed.
function LetterIndex({ letters, onJump, top, translateY }) {
  const { c } = useTheme();
  return (
    <Animated.View accessibilityLabel="Jump to letter" style={{ position: 'absolute', right: 2, top, width: 28, alignItems: 'center', transform: [{ translateY }] }}>
      {letters.map((l) => (
        <Pressable key={l} onPress={() => onJump(l)} accessibilityRole="button" accessibilityLabel={`Jump to ${l}`} hitSlop={{ left: 12, right: 4 }}
          style={{ height: 20, justifyContent: 'center' }}>
          <Text style={{ fontFamily: font('text', 800), fontSize: 11, color: c.accent }}>{l}</Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}

/* ---------- tagged plants (staff & visitors) ---------- */

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'Recorded by me' },
  { key: 'synced', label: 'Needs review' },
  { key: 'returned', label: 'Returned' },
  { key: 'endangered', label: 'Endangered' },
];

const SORT_TAGGED = [
  { key: 'recent', label: 'Recent visit' },
  { key: 'name', label: 'Name (A–Z)' },
  { key: 'tag', label: 'Tag ID' },
  { key: 'status', label: 'Status' },
];

function TaggedList({ nav, onView }) {
  const { db, role, me } = useStore();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');

  const lastVisit = (id) => db.observations.filter((o) => o.specimen_id === id).map((o) => o.observed_at).sort().pop();
  const all = visiblePlants(db, role)
    .map((p) => ({ ...p, seen: lastVisit(p.id), by: nameOf(db, p.registered_by) }));

  const needle = q.trim().toLowerCase();
  const filtered = all
    .filter((p) => (filter === 'all' ? true : filter === 'mine' ? p.registered_by === me?.id : filter === 'endangered' ? p.endangered : p.status === filter))
    .filter((p) => !needle || fuzzyMatch([p.qr_id, p.name, p.scientific, p.by].filter(Boolean).join(' '), needle));

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
    if (sort === 'tag') return (a.qr_id || '').localeCompare(b.qr_id || '');
    if (sort === 'status') return (a.status || '').localeCompare(b.status || '') || (b.seen || '').localeCompare(a.seen || '');
    return (b.seen || '').localeCompare(a.seen || '');
  });

  const { shown, loading, loadMore } = usePaged(sorted, `${q}|${filter}|${sort}|${db.plants.length}`);
  const filters = role === 'visitor'
    ? [{ key: 'all', label: 'All' }, { key: 'endangered', label: 'Endangered' }]
    : role === 'botanist'
    ? FILTERS
    : FILTERS.filter((f) => f.key !== 'mine');

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top }}>
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: LIST_BOTTOM }}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <PlantsHeader nav={nav} view="tagged" onView={onView} count={`${all.length} tagged`}>
            <SearchField value={q} onChangeText={setQ} placeholder={role === 'visitor' ? 'Tag ID or species' : 'Tag ID, species or botanist'} />
            <Pills value={filter} onChange={setFilter} items={filters} />
            <SortBar items={SORT_TAGGED} value={sort} onChange={setSort} />
          </PlantsHeader>
        }
        renderItem={({ item: p, index }) => (
          <Row
            left={<Thumb uri={p.photos[0]?.url} />}
            title={p.name}
            sub={
              <>
                <Mono size={13}>{p.qr_id}</Mono>
                {/* One piece of text, so a wrapped line never starts with a dot. */}
                <Txt v="small" color={c.ink2} style={{ fontSize: 13 }}>{[role !== 'visitor' ? p.by : null, shortDate(p.seen)].filter(Boolean).join(' · ')}</Txt>
              </>
            }
            right={<DotLabel status={p.status} />}
            onPress={() => nav.go('tag', { qr: p.qr_id })}
            last={index === shown.length - 1 && !loading}
          />
        )}
        ListEmptyComponent={loading ? null : <Empty icon="search">No tagged plants match.</Empty>}
        ListFooterComponent={loading ? <View>{shown.length === 0 ? [0, 1, 2, 3].map((i) => <SkeletonRow key={i} />) : null}<LoadingMore /></View> : null}
      />
    </View>
  );
}
