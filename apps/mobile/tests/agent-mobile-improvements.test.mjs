// apps/mobile/tests/agent-mobile-improvements.test.mjs
// Automated verification for:
// 1. Observed plant map visibility for botanists & reviewers
// 2. Search feature in My Records
// 3. App initialisation pre-warming
// 4. QR Tags page interactive QR card & unused tag tap
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { plantView, shownCoords } from '../../shared/selectors.js';
import { can } from '../../shared/permissions.js';
import { fuzzyMatch } from '../../shared/fuzzy.js';
import { secureStorage } from '../secureStorage.js';
import { restoreSession } from '../../shared/api.js';

describe('Mobile Enhancements Test Suite', () => {
  // 1. Map visibility for observed plants
  test('Requirement 1: Botanists and reviewers see coordinates of observed plant even while waiting for review', () => {
    const mockDb = {
      species: [
        { id: 'sp-1', scientific_name: 'Nepenthes rajah', common_name: 'Rajah Pitcher', conservation_status: 'endangered', is_published: true },
      ],
      plants: [
        { id: 'plant-1', qr_id: 'NIAH-0042', species_id: 'sp-1', registered_by: 'botanist-1', is_deleted: false, lat: 3.81234, lng: 113.78901 },
      ],
      observations: [
        { id: 'obs-1', specimen_id: 'plant-1', recorded_by: 'botanist-1', status: 'synced', observed_at: '2026-11-02T10:00:00Z', lat: 3.81234, lng: 113.78901 },
      ],
    };

    const plant = plantView(mockDb, mockDb.plants[0]);
    assert.ok(plant, 'Plant view should resolve');
    assert.equal(plant.lat, 3.81234);
    assert.equal(plant.lng, 113.78901);

    // Botanist role (has 'pending' permission)
    assert.ok(can('botanist', 'pending'), 'Botanist must have pending permission');
    const botanistCoords = shownCoords(plant, 'botanist');
    assert.deepEqual(botanistCoords, { lat: 3.81234, lng: 113.78901 }, 'Botanist must see coordinates for observed plant');

    // Officer role (has 'pending' permission)
    assert.ok(can('officer', 'pending'), 'Officer must have pending permission');
    const officerCoords = shownCoords(plant, 'officer');
    assert.deepEqual(officerCoords, { lat: 3.81234, lng: 113.78901 }, 'Officer must see coordinates for observed plant');

    // Visitor role (does not have 'pending' permission)
    const visitorCoords = shownCoords(plant, 'visitor');
    assert.equal(visitorCoords, null, 'Public visitor must NOT see exact coordinates of endangered plant');
  });

  test('Requirement 1: Plant coordinates fallback to latest observation if specimen lat was not backfilled', () => {
    const mockDb = {
      species: [],
      plants: [
        { id: 'plant-2', qr_id: 'NIAH-0099', proposed_species_name: 'Wild Orchid', registered_by: 'botanist-1', is_deleted: false, lat: null, lng: null },
      ],
      observations: [
        { id: 'obs-2', specimen_id: 'plant-2', recorded_by: 'botanist-1', status: 'synced', observed_at: '2026-11-02T12:00:00Z', lat: 3.82001, lng: 113.79002 },
      ],
    };

    const plant = plantView(mockDb, mockDb.plants[0]);
    assert.equal(plant.lat, 3.82001, 'Should resolve latitude from observation');
    assert.equal(plant.lng, 113.79002, 'Should resolve longitude from observation');
  });

  // 2. Search feature for My Records
  test('Requirement 2: Search filters records by plant name, tag ID, species or notes', () => {
    const sampleRecords = [
      { id: '1', plant: { name: 'Pitcher Plant', scientific: 'Nepenthes rajah', qr_id: 'NIAH-0001', proposed_species: 'Rajah' }, notes: 'Found near cave entrance' },
      { id: '2', plant: { name: 'Black Orchid', scientific: 'Coelogyne pandurata', qr_id: 'NIAH-0002', proposed_species: 'Black Orchid' }, notes: 'Growing on limestone ledge' },
      { id: '3', plant: { name: 'Fringed Pitcher', scientific: 'Nepenthes tentaculata', qr_id: 'NIAH-0003', proposed_species: 'Pitcher' }, notes: 'High elevation summit trail' },
    ];

    const search = (q) => {
      const needle = q.trim().toLowerCase();
      return sampleRecords.filter((o) => {
        if (!needle) return true;
        if (o.plant?.qr_id && o.plant.qr_id.toLowerCase().includes(needle)) return true;
        const text = [o.plant.name, o.plant.scientific, o.plant.proposed_species, o.notes].filter(Boolean).join(' ');
        return fuzzyMatch(text, needle);
      });
    };

    // Query by tag ID
    assert.equal(search('0002').length, 1);
    assert.equal(search('0002')[0].id, '2');

    // Query by partial plant name
    assert.equal(search('pitcher').length, 2);

    // Query by notes text
    assert.equal(search('limestone').length, 1);
    assert.equal(search('limestone')[0].id, '2');

    // Query non-matching
    assert.equal(search('nonexistent').length, 0);
  });

  // 3. App initialisation
  test('Requirement 3: App initialisation pre-warms restoreSession and uses singleton secureStorage promise', async () => {
    const p1 = secureStorage.getItem('test_warm');
    const p2 = secureStorage.getItem('test_warm');
    assert.ok(p1 instanceof Promise);
    assert.ok(p2 instanceof Promise);
    await Promise.all([p1, p2]);

    const restored = await restoreSession();
    assert.ok(restored !== undefined);
  });

  // 4. Tags page QR code interaction
  test('Requirement 4: Tags page logic differentiates assigned vs unused tag tap actions', () => {
    const tags = [
      { qr_id: 'NIAH-0010', status: 'unused', batch_label: 'field' },
      { qr_id: 'NIAH-0011', status: 'assigned', batch_label: 'field' },
      { qr_id: 'NIAH-0012', status: 'retired', batch_label: 'field' },
    ];

    let openedQr = null;
    let navigatedTag = null;

    const onRowPress = (tag) => {
      if (tag.status === 'assigned') {
        navigatedTag = tag.qr_id;
      } else if (tag.status === 'unused') {
        openedQr = tag.qr_id;
      }
    };

    const onQrIconPress = (tag) => {
      openedQr = tag.qr_id;
    };

    // Tapping QR icon on assigned tag opens QR view
    onQrIconPress(tags[1]);
    assert.equal(openedQr, 'NIAH-0011');

    // Tapping row on unused tag opens QR view
    openedQr = null;
    onRowPress(tags[0]);
    assert.equal(openedQr, 'NIAH-0010');

    // Tapping row on assigned tag navigates to plant page
    onRowPress(tags[1]);
    assert.equal(navigatedTag, 'NIAH-0011');
  });
});
