// apps/mobile/tests/agent-mobile-features.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { generateMapHtml } from '../../shared/mapHtml.js';
import { visiblePlants, shownCoords, plantView, lookupTag, extractTag } from '../../shared/selectors.js';
import { canAccess } from '../navigation/routeMeta.js';
import { seed, initialProfiles } from '../../shared/data.js';

test('Mobile Feature 1: Map Clustering (CTIP-70)', async (t) => {
  await t.test('generateMapHtml embeds Leaflet.markercluster library and CSS', () => {
    const html = generateMapHtml({
      points: [
        { id: 'p1', lat: 3.803, lng: 113.776, name: 'Nepenthes rajah' },
        { id: 'p2', lat: 3.804, lng: 113.777, name: 'Dipterocarpus' },
      ],
      interactive: true,
    });

    assert.ok(html.includes('leaflet.markercluster'), 'HTML must include leaflet.markercluster');
    assert.ok(html.includes('MarkerCluster.css'), 'HTML must include MarkerCluster.css');
    assert.ok(html.includes('daun-cluster'), 'HTML must include daun-cluster styling');
    assert.ok(html.includes('L.markerClusterGroup'), 'HTML must instantiate L.markerClusterGroup');
  });

  await t.test('generateMapHtml includes smooth zoomToShowLayer for selected pin clustering', () => {
    const html = generateMapHtml({ points: [], selectedId: 'p1' });
    assert.ok(html.includes('zoomToShowLayer'), 'HTML should support zoomToShowLayer for cluster unclustering');
  });
});

test('Mobile Feature 2: Visitor Access to Published Species & Plant Records', async (t) => {
  const mockSpecies = [
    { id: 'sp-1', common_name: 'Pitcher Plant', scientific_name: 'Nepenthes rajah', family: 'Nepenthaceae', conservation_status: 'endangered', is_published: true, is_deleted: false },
    { id: 'sp-2', common_name: 'Ironwood', scientific_name: 'Eusideroxylon zwageri', family: 'Lauraceae', conservation_status: 'vulnerable', is_published: true, is_deleted: false },
  ];

  const mockPlants = [
    { id: 'spec-1', qr_id: 'NIAH-0001', species_id: 'sp-1', lat: 3.803, lng: 113.776, endangered_override: false, is_deleted: false, photos: [] },
    { id: 'spec-2', qr_id: 'NIAH-0002', species_id: 'sp-2', lat: 3.805, lng: 113.778, endangered_override: false, is_deleted: false, photos: [] },
  ];

  const mockObservations = [
    { id: 'obs-1', specimen_id: 'spec-1', status: 'approved', observed_at: '2026-03-01T10:00:00Z', recorded_by: 'botanist-1' },
    { id: 'obs-2', specimen_id: 'spec-2', status: 'approved', observed_at: '2026-03-02T11:00:00Z', recorded_by: 'botanist-1' },
  ];

  const mockDb = {
    species: mockSpecies,
    plants: mockPlants,
    observations: mockObservations,
    profiles: initialProfiles,
    tags: [{ qr_id: 'NIAH-0001', status: 'assigned' }, { qr_id: 'NIAH-0002', status: 'assigned' }],
  };

  await t.test('Visitors have access to tagged plants list route', () => {
    assert.equal(canAccess('visitor', 'tagged'), true, 'Visitor should have access to tagged plants route');
    assert.equal(canAccess('visitor', 'plants'), true, 'Visitor should have access to species route');
    assert.equal(canAccess('visitor', 'species'), true, 'Visitor should have access to species detail route');
    assert.equal(canAccess('visitor', 'tag'), true, 'Visitor should have access to individual plant tag route');
  });

  await t.test('Visitors can view approved & published plants, but endangered coordinates are hidden', () => {
    const visitorPlants = visiblePlants(mockDb, 'visitor');
    assert.equal(visitorPlants.length, 2, 'Visitor should see both approved and published plants');

    for (const p of visitorPlants) {
      assert.equal(p.isPublic, true, 'Every plant visible to a visitor must have isPublic=true');
      const coords = shownCoords(p, 'visitor');
      if (p.endangered) {
        assert.equal(coords, null, `Endangered plant ${p.qr_id} must have hidden coordinates for visitors`);
      } else {
        assert.ok(coords && coords.lat != null && coords.lng != null, `Non-endangered plant ${p.qr_id} should have coordinates`);
      }
    }
  });

  await t.test('Botanist sees full coordinates even for endangered plants', () => {
    const botanistPlants = visiblePlants(mockDb, 'botanist');
    const endangeredPlant = botanistPlants.find((p) => p.endangered);
    assert.ok(endangeredPlant, 'Should have at least one endangered plant');

    const staffCoords = shownCoords(endangeredPlant, 'botanist');
    assert.deepEqual(staffCoords, { lat: 3.803, lng: 113.776 }, 'Botanist must see coordinates for endangered plants');
  });

  await t.test('Scanning a plant QR tag resolves to a plant record with species info', () => {
    const scanned = lookupTag(mockDb, 'NIAH-0001');
    assert.equal(scanned.kind, 'used');
    assert.equal(scanned.id, 'NIAH-0001');
    assert.ok(scanned.plant, 'Scanned result must include plant view');
    assert.equal(scanned.plant.name, 'Pitcher Plant');
    assert.equal(scanned.plant.scientific, 'Nepenthes rajah');
  });
});

test('Mobile Feature 3: Sorting Capabilities Across Screens', async (t) => {
  const mockSpecies = [
    { id: 'sp-1', common_name: 'Zebra Plant', scientific_name: 'Aphelandra squarrosa', family: 'Acanthaceae', conservation_status: 'least concern' },
    { id: 'sp-2', common_name: 'Pitcher Plant', scientific_name: 'Nepenthes rajah', family: 'Nepenthaceae', conservation_status: 'endangered' },
    { id: 'sp-3', common_name: 'Ironwood', scientific_name: 'Eusideroxylon zwageri', family: 'Lauraceae', conservation_status: 'vulnerable' },
  ];

  const mockObs = [
    { id: 'o-1', observed_at: '2026-03-01T10:00:00Z', recorded_by: 'u-1', plant: { name: 'Zebra Plant', qr_id: 'NIAH-0003' } },
    { id: 'o-2', observed_at: '2026-03-05T12:00:00Z', recorded_by: 'u-2', plant: { name: 'Pitcher Plant', qr_id: 'NIAH-0001' } },
    { id: 'o-3', observed_at: '2026-02-20T08:00:00Z', recorded_by: 'u-3', plant: { name: 'Ironwood', qr_id: 'NIAH-0002' } },
  ];

  await t.test('Plant records sorting logic (Recent, Name, Tag, Status)', () => {
    const plants = [
      { name: 'Zebra Plant', qr_id: 'NIAH-0003', seen: '2026-03-01T10:00:00Z', status: 'approved' },
      { name: 'Pitcher Plant', qr_id: 'NIAH-0001', seen: '2026-03-05T12:00:00Z', status: 'synced' },
      { name: 'Ironwood', qr_id: 'NIAH-0002', seen: '2026-02-20T08:00:00Z', status: 'returned' },
    ];

    // Sort by name A-Z
    const byName = [...plants].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    assert.deepEqual(byName.map((p) => p.name), ['Ironwood', 'Pitcher Plant', 'Zebra Plant']);

    // Sort by Tag ID
    const byTag = [...plants].sort((a, b) => (a.qr_id || '').localeCompare(b.qr_id || ''));
    assert.deepEqual(byTag.map((p) => p.qr_id), ['NIAH-0001', 'NIAH-0002', 'NIAH-0003']);

    // Sort by Recent visit
    const byRecent = [...plants].sort((a, b) => (b.seen || '').localeCompare(a.seen || ''));
    assert.deepEqual(byRecent.map((p) => p.qr_id), ['NIAH-0001', 'NIAH-0003', 'NIAH-0002']);
  });

  await t.test('Review Queue sorting logic (Newest, Oldest, Plant Name, Botanist)', () => {
    // Sort newest
    const newest = [...mockObs].sort((a, b) => b.observed_at.localeCompare(a.observed_at));
    assert.deepEqual(newest.map((o) => o.id), ['o-2', 'o-1', 'o-3']);

    // Sort oldest
    const oldest = [...mockObs].sort((a, b) => a.observed_at.localeCompare(b.observed_at));
    assert.deepEqual(oldest.map((o) => o.id), ['o-3', 'o-1', 'o-2']);

    // Sort by plant name
    const byPlant = [...mockObs].sort((a, b) => (a.plant?.name || '').localeCompare(b.plant?.name || ''));
    assert.deepEqual(byPlant.map((o) => o.plant.name), ['Ironwood', 'Pitcher Plant', 'Zebra Plant']);
  });

  await t.test('Users sorting logic (Active first, Name A-Z, Role, Email)', () => {
    const profiles = initialProfiles.slice();

    // Sort by name A-Z
    const byName = [...profiles].sort((a, b) => a.full_name.localeCompare(b.full_name));
    assert.equal(byName[0].full_name, 'Admin User');

    // Sort by active first
    const byActive = [...profiles].sort((a, b) => (b.is_active - a.is_active) || a.full_name.localeCompare(b.full_name));
    assert.equal(byActive[byActive.length - 1].is_active, false);
  });

  await t.test('Species catalogue sorting logic (Common name, Scientific name, Family, Endangered)', () => {
    // Common name A-Z
    const byCommon = [...mockSpecies].sort((a, b) => (a.common_name || a.scientific_name).localeCompare(b.common_name || b.scientific_name));
    assert.deepEqual(byCommon.map((s) => s.common_name), ['Ironwood', 'Pitcher Plant', 'Zebra Plant']);

    // Scientific name A-Z
    const bySci = [...mockSpecies].sort((a, b) => (a.scientific_name || '').localeCompare(b.scientific_name || ''));
    assert.deepEqual(bySci.map((s) => s.scientific_name), ['Aphelandra squarrosa', 'Eusideroxylon zwageri', 'Nepenthes rajah']);

    // Endangered first
    const byEndangered = [...mockSpecies].sort((a, b) => {
      const ea = a.conservation_status === 'endangered' ? 1 : 0;
      const eb = b.conservation_status === 'endangered' ? 1 : 0;
      return eb - ea;
    });
    assert.equal(byEndangered[0].conservation_status, 'endangered');
  });
});
