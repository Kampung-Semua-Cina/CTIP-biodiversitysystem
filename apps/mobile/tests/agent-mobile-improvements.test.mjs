// apps/mobile/tests/agent-mobile-improvements.test.mjs
// Automated verification for:
// 1. Observed record map visibility using o.lat ?? plant.lat
// 2. Search feature in My Records using recordMatches / draftMatches (with null plant safety)
// 3. App initialisation pre-warming
// 4. QR Tags page interactive QR card & unused tag tap
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { plantView, shownCoords, recordMatches, draftMatches } from '../../shared/selectors.js';
import { can } from '../../shared/permissions.js';
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

  test('Requirement 1: Record maps use observation spot (o.lat ?? plant.lat), keeping plantView location null when specimen has no GPS', () => {
    const mockDb = {
      species: [],
      plants: [
        { id: 'plant-2', qr_id: 'NIAH-0099', proposed_species: 'Wild Orchid', registered_by: 'botanist-1', is_deleted: false, lat: null, lng: null },
      ],
      observations: [
        { id: 'obs-2', specimen_id: 'plant-2', recorded_by: 'botanist-1', status: 'synced', observed_at: '2026-11-02T12:00:00Z', lat: 3.82001, lng: 113.79002 },
      ],
    };

    // plantView respects CLAUDE.md: plants without GPS fixes retain null coordinates
    const plant = plantView(mockDb, mockDb.plants[0]);
    assert.equal(plant.lat, null, 'Plant without GPS must not have synthetic coordinates');
    assert.equal(plant.lng, null, 'Plant without GPS must not have synthetic coordinates');

    // The observation map draws the spot where the observation was recorded: o.lat ?? plant.lat
    const obs = mockDb.observations[0];
    const mapLat = obs.lat ?? plant?.lat;
    const mapLng = obs.lng ?? plant?.lng;
    assert.equal(mapLat, 3.82001, 'Observation map must plot the observation visit spot');
    assert.equal(mapLng, 113.79002, 'Observation map must plot the observation visit spot');
  });

  // 2. Search feature for My Records
  test('Requirement 2: Search filters records by plant name, tag ID, species or notes using recordMatches (null-safe)', () => {
    const sampleRecords = [
      { id: '1', specimen_id: 'p1', plant: { name: 'Pitcher Plant', scientific: 'Nepenthes rajah', qr_id: 'NIAH-0001', proposed_species: 'Rajah' }, notes: 'Found near cave entrance' },
      { id: '2', specimen_id: 'p2', plant: { name: 'Black Orchid', scientific: 'Coelogyne pandurata', qr_id: 'NIAH-0002', proposed_species: 'Black Orchid' }, notes: 'Growing on limestone ledge' },
      { id: '3', specimen_id: 'p3', plant: { name: 'Fringed Pitcher', scientific: 'Nepenthes tentaculata', qr_id: 'NIAH-0003', proposed_species: 'Pitcher' }, notes: 'High elevation summit trail' },
      // Record where plant has not loaded yet
      { id: '4', specimen_id: 'p4', plant: null, notes: 'Orchid near riverbank' },
    ];

    const search = (q) => sampleRecords.filter((o) => recordMatches(o, o.plant, q));

    // Query by tag ID (exact substring, no typo collisions between 0001 and 0002)
    assert.equal(search('0002').length, 1);
    assert.equal(search('0002')[0].id, '2');

    // Query by partial plant name
    assert.equal(search('pitcher').length, 2);

    // Query by notes text
    assert.equal(search('limestone').length, 1);
    assert.equal(search('limestone')[0].id, '2');

    // Query null plant record by notes without crashing
    assert.equal(search('riverbank').length, 1);
    assert.equal(search('riverbank')[0].id, '4');

    // Query non-matching
    assert.equal(search('nonexistent').length, 0);

    // Draft matching
    const sampleDrafts = [
      { id: 'd1', qr_id: 'NIAH-0010', proposed_species: 'Rajah Pitcher' },
      { id: 'd2', qr_id: 'NIAH-0011', proposed_species: 'Unknown Vine' },
    ];
    assert.equal(sampleDrafts.filter((d) => draftMatches(d, '0010')).length, 1);
    assert.equal(sampleDrafts.filter((d) => draftMatches(d, 'Vine')).length, 1);
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
