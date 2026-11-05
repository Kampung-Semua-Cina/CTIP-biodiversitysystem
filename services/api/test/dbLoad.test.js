import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { record, dbLoad, resetDbLoad, BASE_POLL_MS, MAX_POLL_MS } from '../src/dbLoad.js';

// The poll delay the apps are told: fast while the database answers quickly,
// slower while it is busy, back to fast once it recovers.
beforeEach(() => resetDbLoad());

test('no measurements yet: poll at the normal rate', () => {
  assert.equal(dbLoad().poll_after_ms, BASE_POLL_MS);
  assert.equal(dbLoad().state, 'free');
});

test('fast answers keep the normal rate', () => {
  for (let i = 0; i < 10; i += 1) record(150);
  assert.equal(dbLoad().poll_after_ms, BASE_POLL_MS);
});

test('slow answers slow the polling down, up to a minute', () => {
  for (let i = 0; i < 20; i += 1) record(1500);
  assert.equal(dbLoad().state, 'busy');
  assert.equal(dbLoad().poll_after_ms, 20000);
  for (let i = 0; i < 30; i += 1) record(9000);
  assert.equal(dbLoad().poll_after_ms, MAX_POLL_MS);
});

test('once the database is quick again, polling speeds back up', () => {
  for (let i = 0; i < 30; i += 1) record(9000);
  for (let i = 0; i < 40; i += 1) record(100);
  assert.equal(dbLoad().poll_after_ms, BASE_POLL_MS);
});

test('one slow query does not slow everyone down', () => {
  for (let i = 0; i < 10; i += 1) record(150);
  record(6000);
  assert.ok(dbLoad().poll_after_ms <= 10000);
});

test('measurements older than a minute are ignored', () => {
  const long = Date.now() - 120000;
  for (let i = 0; i < 10; i += 1) record(9000, long);
  assert.equal(dbLoad().poll_after_ms, BASE_POLL_MS);
});
