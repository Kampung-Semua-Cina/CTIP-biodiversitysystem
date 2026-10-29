// apps/mobile/tests/agent-photo-upload.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { uuidv4, isValidUuid, decodeBase64ToArrayBuffer, uid } from '../../shared/utils.js';

test('UUID Generator & Validator (RFC 4122 v4)', async (t) => {
  await t.test('uuidv4 generates unique valid RFC 4122 v4 UUID strings', () => {
    const ids = new Set();
    for (let i = 0; i < 50; i++) {
      const id = uuidv4();
      assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      assert.equal(isValidUuid(id), true);
      ids.add(id);
    }
    assert.equal(ids.size, 50, 'All generated UUIDs must be distinct');
  });

  await t.test('isValidUuid correctly rejects invalid or non-UUID strings', () => {
    assert.equal(isValidUuid(''), false);
    assert.equal(isValidUuid(null), false);
    assert.equal(isValidUuid(undefined), false);
    assert.equal(isValidUuid('1730123456789abc'), false);
    assert.equal(isValidUuid('photo_12345.jpg'), false);
    assert.equal(isValidUuid('file:///data/user/0/cache/photo.jpg'), false);
    assert.equal(isValidUuid('invalid-dummy-ref-string'), false);
  });

  await t.test('uid alias returns valid RFC 4122 v4 UUID', () => {
    const id = uid();
    assert.equal(isValidUuid(id), true);
  });
});

test('decodeBase64ToArrayBuffer binary decoding', async (t) => {
  await t.test('decodes plain base64 string to ArrayBuffer', () => {
    // "Hello World" in base64 is "SGVsbG8gV29ybGQ="
    const base64 = 'SGVsbG8gV29ybGQ=';
    const buffer = decodeBase64ToArrayBuffer(base64);
    assert.ok(buffer instanceof ArrayBuffer);
    const text = Buffer.from(buffer).toString('utf-8');
    assert.equal(text, 'Hello World');
  });

  await t.test('decodes data URL prefixed base64 string', () => {
    const dataUrl = 'data:image/jpeg;base64,SGVsbG8gV29ybGQ=';
    const buffer = decodeBase64ToArrayBuffer(dataUrl);
    assert.ok(buffer instanceof ArrayBuffer);
    const text = Buffer.from(buffer).toString('utf-8');
    assert.equal(text, 'Hello World');
  });

  await t.test('handles empty or non-string inputs safely without throwing', () => {
    const emptyBuf = decodeBase64ToArrayBuffer('');
    assert.equal(emptyBuf.byteLength, 0);

    const nullBuf = decodeBase64ToArrayBuffer(null);
    assert.equal(nullBuf.byteLength, 0);
  });
});

test('filePart and photo upload compatibility', async (t) => {
  const { filePart } = await import('../../shared/api.js');

  await t.test('converts photo with base64 to Blob with byte support', async () => {
    const photo = {
      id: 'photo-1',
      name: 'pitcher.jpg',
      type: 'image/jpeg',
      base64: 'SGVsbG8gV29ybGQ=',
      url: 'file:///data/user/0/cache/photo.jpg',
    };
    const part = await filePart(photo);
    assert.ok(part);
    assert.equal(part.name, 'pitcher.jpg');
    assert.equal(part.type, 'image/jpeg');
    assert.equal(typeof part.bytes, 'function');
    const bytes = await part.bytes();
    assert.ok(bytes instanceof Uint8Array);
    assert.equal(bytes.byteLength, 11);
    assert.ok(part instanceof Blob);
  });

  await t.test('converts data URL photo to Blob with byte support', async () => {
    const photo = {
      id: 'photo-2',
      name: 'leaf.png',
      type: 'image/png',
      url: 'data:image/png;base64,SGVsbG8gV29ybGQ=',
    };
    const part = await filePart(photo);
    assert.ok(part);
    assert.equal(part.name, 'leaf.png');
    assert.equal(part.type, 'image/png');
    assert.equal(typeof part.bytes, 'function');
    const bytes = await part.bytes();
    assert.equal(bytes.byteLength, 11);
    assert.ok(part instanceof Blob);
  });
});
