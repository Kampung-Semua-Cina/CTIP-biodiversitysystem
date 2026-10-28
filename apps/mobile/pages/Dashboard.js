// apps/mobile/pages/Dashboard.js
// The two long lists: the species catalogue (everyone) and the tagged plants (staff).
// Both load in pages as you scroll (infinite scroll) and show a small loading line
// while the next page arrives.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '../../shared/store.js';
import { visiblePlants, nameOf } from '../../shared/selectors.js';
import { useTheme, font } from '../components/Theme.js';
import {
  TitleBlock, SearchField, Pills, Segmented, Row, Thumb, Sci, Mono, DotLabel, Txt, IconButton,
  SkeletonRow, LoadingMore, Empty,
} from '../components/Bits.js';
import { shortDate } from '../components/format.js';

const PAGE_SIZE = 20; // same as the API's default `limit`
const ROW_HEIGHT = 77; // fixed row height lets the list jump straight to a letter
const LETTER_HEIGHT = 42;

// Pages through `items` the way the API will: page 1, 2, 3… of PAGE_SIZE.
// Swap the setTimeout for `GET /public/species?page=&limit=` (or /plants) when the
// apps are connected to the API (CTIP-26, CTIP-87). `total` comes from the response meta.
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

/* ---------- species catalogue ---------- */

export function SpeciesList({ nav, params = {} }) {
  const { db, role } = useStore();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState(params.q || '');
  const [family, setFamily] = useState('all');
  const list = useRef(null);
  const staff = role !== 'visitor';

  // Published species only for visitors; staff also see unpublished ones.
  const species = db.species.filter((s) => !s.is_deleted && (staff || s.is_published));
  const families = [...new Set(species.map((s) => s.family).filter(Boolean))].sort();
  const plants = visiblePlants(db, role);

  const needle = q.trim().toLowerCase();
  const filtered = species
      .filter((s) => family === 'all' || s.family === family)
      .filter((s) => {
        if (!needle) return true;
        const tags = plants.filter((p) => p.species_id === s.id && p.qr_id).map((p) => String(p.qr_id).toLowerCase());
        return [s.common_name, s.scientific_name, s.family].filter(Boolean).join(' ').toLowerCase().includes(needle) || tags.some((t) => t.includes(needle));
      })
      .sort((a, b) => (a.common_name || a.scientific_name).localeCompare(b.common_name || b.scientific_name));

  const { shown, loading, loadMore, total, done } = usePaged(filtered, `${q}|${family}`);

  // Insert a letter heading before the first species of each letter.
  const rows = [];
  let last = '';
  for (const s of shown) {
    const letter = (s.common_name || s.scientific_name)[0].toUpperCase();
    if (letter !== last) rows.push({ type: 'letter', key: 'L' + letter, letter });
    last = letter;
    rows.push({ type: 'species', key: s.id, s });
  }
  const offsets = [];
  rows.reduce((y, r) => {
    offsets.push(y);
    return y + (r.type === 'letter' ? LETTER_HEIGHT : ROW_HEIGHT);
  }, 0);
  const letters = rows.filter((r) => r.type === 'letter').map((r) => r.letter);
  const headerHeight = useRef(0);
  const jump = (letter) => {
    const i = rows.findIndex((r) => r.type === 'letter' && r.letter === letter);
    if (i >= 0) list.current?.scrollToOffset({ offset: offsets[i] + headerHeight.current, animated: true });
  };

  const header = (
    <View onLayout={(e) => (headerHeight.current = e.nativeEvent.layout.height)}>
      <ListHeader>
        {nav.canGoBack ? <View style={{ marginLeft: -16, marginTop: -8 }}><IconButton name="chevL" label="Back" onPress={nav.back} /></View> : null}
        <TitleBlock title={staff ? 'Species' : 'Plants'} right={<Txt v="small" color={c.ink2}>{total} species</Txt>} />
        <SearchField value={q} onChangeText={setQ} placeholder="Search name or tag ID" />
        <Pills value={family} onChange={setFamily} items={[{ key: 'all', label: 'All families' }, ...families.map((f) => ({ key: f, label: f }))]} />
      </ListHeader>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top }}>
      <FlatList
        ref={list}
        data={rows}
        keyExtractor={(r) => r.key}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingLeft: 20, paddingRight: 36, paddingBottom: 24 }}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) =>
          item.type === 'letter' ? (
            <View style={{ height: LETTER_HEIGHT, justifyContent: 'flex-end', paddingBottom: 2 }}>
              <Text accessibilityRole="header" style={{ fontFamily: font('display', 700), fontSize: 18, color: c.accent }}>{item.letter}</Text>
            </View>
          ) : (
            <SpeciesRow s={item.s} plants={plants} staff={staff} onPress={() => nav.go('species', { id: item.s.id })} />
          )
        }
        ListEmptyComponent={loading ? null : <Empty icon="search">No species match. Try another name or family.</Empty>}
        ListFooterComponent={
          loading ? (
            <View>
              {shown.length === 0 ? [0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} />) : <SkeletonRow />}
              <LoadingMore />
            </View>
          ) : done && shown.length > PAGE_SIZE ? <Txt v="caption" color={c.ink3} style={{ textAlign: 'center', paddingVertical: 16 }}>That's every species.</Txt> : null
        }
      />
      {letters.length > 1 ? <LetterIndex letters={letters} onJump={jump} /> : null}
    </View>
  );
}

function SpeciesRow({ s, plants, staff, onPress }) {
  const photo = plants.find((p) => p.species_id === s.id && p.photos.length)?.photos[0]?.url;
  return (
    <View style={{ height: ROW_HEIGHT }}>
      <Row
        left={<Thumb uri={photo} />}
        title={s.common_name || s.scientific_name}
        sub={
          <>
            <Sci size={14}>{s.scientific_name}</Sci>
            {s.conservation_status === 'endangered' ? <DotLabel status="endangered" /> : null}
            {staff && !s.is_published ? <DotLabel tone="neutral" label="Not published" /> : null}
          </>
        }
        onPress={onPress}
        right={null}
      />
    </View>
  );
}

// A–Z strip down the right edge. Letters that have species are green and tappable.
function LetterIndex({ letters, onJump }) {
  const { c } = useTheme();
  const all = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  return (
    <View accessibilityLabel="Jump to letter" style={{ position: 'absolute', right: 4, top: 200, bottom: 16, width: 24, justifyContent: 'space-between', alignItems: 'center' }}>
      {all.map((l) => {
        const has = letters.includes(l);
        return (
          <Pressable key={l} disabled={!has} onPress={() => onJump(l)} accessibilityRole="button" accessibilityLabel={`Jump to ${l}`} hitSlop={{ left: 12, right: 4 }}>
            <Text style={{ fontFamily: font('text', 800), fontSize: 11, color: has ? c.accent : c.ink3 }}>{l}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- tagged plants (staff) ---------- */

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'Recorded by me' },
  { key: 'synced', label: 'Needs review' },
  { key: 'returned', label: 'Returned' },
  { key: 'endangered', label: 'Endangered' },
];

export function TaggedPlants({ nav }) {
  const { db, role, me } = useStore();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');

  const lastVisit = (id) => db.observations.filter((o) => o.specimen_id === id).map((o) => o.observed_at).sort().pop();
  const all = visiblePlants(db, role)
    .map((p) => ({ ...p, seen: lastVisit(p.id), by: nameOf(db, p.registered_by) }))
    .sort((a, b) => (b.seen || '').localeCompare(a.seen || ''));
  const needle = q.trim().toLowerCase();
  const filtered = all
    .filter((p) => (filter === 'all' ? true : filter === 'mine' ? p.registered_by === me?.id : filter === 'endangered' ? p.endangered : p.status === filter))
    .filter((p) => !needle || [p.qr_id, p.name, p.scientific, p.by].filter(Boolean).join(' ').toLowerCase().includes(needle));
  const { shown, loading, loadMore } = usePaged(filtered, `${q}|${filter}|${db.plants.length}`);
  const filters = role === 'botanist' ? FILTERS : FILTERS.filter((f) => f.key !== 'mine');

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top }}>
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <ListHeader>
            <TitleBlock title="Plants" right={<Txt v="small" color={c.ink2}>{all.length} tagged</Txt>} />
            <Segmented value="tagged" onChange={(k) => k === 'species' && nav.go('plants')} items={[{ key: 'tagged', label: 'Tagged plants' }, { key: 'species', label: 'Species' }]} />
            <SearchField value={q} onChangeText={setQ} placeholder="Tag ID, species or botanist" />
            <Pills value={filter} onChange={setFilter} items={filters} />
          </ListHeader>
        }
        renderItem={({ item: p, index }) => (
          <Row
            left={<Thumb uri={p.photos[0]?.url} />}
            title={p.name}
            sub={
              <>
                <Mono size={13}>{p.qr_id}</Mono>
                <Txt v="small" color={c.ink2} style={{ fontSize: 13 }}>· {p.by} · {shortDate(p.seen)}</Txt>
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
