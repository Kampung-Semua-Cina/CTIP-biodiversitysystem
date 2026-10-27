import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { detectImageType, stripMetadata } from '../src/images.js';

// A fake Supabase: fetch answers species lookups, Storage uploads and
// species_media inserts from memory, so tests run without the internet.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const users = { officer: crypto.randomUUID(), admin: crypto.randomUUID(), botanist: crypto.randomUUID() };
const verify = async (role) => ({ sub: users[role], user_role: role });
const app = createApp({ verify });
const as = (role) => ({ Authorization: `Bearer ${role}` });

const SPECIES = crypto.randomUUID();
const GPS = 'GPSLatitude 3.815372 N';

// Tiny but well-formed images, each with location metadata inside.
const app1 = Buffer.concat([Buffer.from('Exif\0\0'), Buffer.from(GPS)]);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  Buffer.from([0xff, 0xe1]), Buffer.from([0, app1.length + 2]), app1,             // APP1 (EXIF)
  Buffer.from([0xff, 0xdb, 0, 4, 0, 0]),                                          // DQT (kept)
  Buffer.from([0xff, 0xda, 0, 2]), Buffer.from('pixels'), Buffer.from([0xff, 0xd9]), // image data
]);
const pngChunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]); // CRC not checked here
};
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  pngChunk('IHDR', Buffer.alloc(13)), pngChunk('eXIf', Buffer.from(GPS)), pngChunk('IDAT', Buffer.from('pixels')),
  pngChunk('IEND', Buffer.alloc(0)),
]);
const webpChunk = (id, data) => {
  const size = Buffer.alloc(4); size.writeUInt32LE(data.length);
  return Buffer.concat([Buffer.from(id, 'latin1'), size, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
};
const webpBody = Buffer.concat([
  webpChunk('VP8X', Buffer.from([0x08, 0, 0, 0, 0, 0, 0, 0, 0, 0])), webpChunk('VP8 ', Buffer.from('pixels')),
  webpChunk('EXIF', Buffer.from(GPS)),
]);
const riffSize = Buffer.alloc(4); riffSize.writeUInt32LE(webpBody.length + 4);
const WEBP = Buffer.concat([Buffer.from('RIFF'), riffSize, Buffer.from('WEBP'), webpBody]);

let stored, media, calls;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach((t) => {
  stored = {}; media = []; calls = [];
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    calls.push(`${method} ${url.pathname}`);
    if (url.pathname.startsWith('/storage/v1/object/species-media/') && method === 'POST') {
      const key = decodeURIComponent(url.pathname.replace('/storage/v1/object/species-media/', ''));
      const body = init.body instanceof Blob ? Buffer.from(await init.body.arrayBuffer())
        : init.body instanceof FormData ? Buffer.from(await init.body.get('').arrayBuffer())
          : Buffer.from(init.body);
      stored[key] = body;
      return json(200, { Key: `species-media/${key}` });
    }
    if (url.pathname === '/storage/v1/object/species-media' && method === 'DELETE') {
      for (const key of JSON.parse(init.body).prefixes) delete stored[key];
      return json(200, []);
    }
    if (url.pathname === '/rest/v1/species') {
      const found = url.searchParams.get('id') === `eq.${SPECIES}` ? [{ id: SPECIES }] : [];
      return json(200, found);
    }
    if (url.pathname === '/rest/v1/species_media' && method === 'POST') {
      const row = { ...JSON.parse(init.body), created_at: new Date().toISOString() };
      media.push(row);
      const columns = url.searchParams.get('select').split(',').map((c) => c.trim());
      return json(201, Object.fromEntries(columns.map((c) => [c, row[c]])));
    }
    if (url.pathname === '/rest/v1/species_media' && method === 'PATCH') {
      const keepId = url.searchParams.get('id').replace('neq.', '');
      media.filter((m) => m.id !== keepId).forEach((m) => Object.assign(m, JSON.parse(init.body)));
      return json(200, []);
    }
    return json(404, { message: `unexpected ${method} ${url.pathname}` });
  });
});

const upload = (role, file, fields = {}, filename = 'photo.jpg') => {
  let req = request(app).post(`/v1/species/${SPECIES}/media`).set(as(role));
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  return file ? req.attach('file', file, filename) : req;
};

test('detects JPEG, PNG and WebP from their bytes', () => {
  assert.equal(detectImageType(JPEG), 'image/jpeg');
  assert.equal(detectImageType(PNG), 'image/png');
  assert.equal(detectImageType(WEBP), 'image/webp');
  assert.equal(detectImageType(Buffer.from('<svg onload=alert(1)>')), null);
});

test('removes location metadata from JPEG, PNG and WebP, keeping the picture', () => {
  for (const [type, img] of [['image/jpeg', JPEG], ['image/png', PNG], ['image/webp', WEBP]]) {
    const clean = stripMetadata(img, type);
    assert.ok(img.includes(GPS), `${type} fixture has GPS`);
    assert.ok(!clean.includes(GPS), `${type} GPS removed`);
    assert.ok(clean.includes(Buffer.from('pixels')), `${type} picture kept`);
    assert.equal(detectImageType(clean), type);
  }
  const webp = stripMetadata(WEBP, 'image/webp');
  assert.equal(webp.readUInt32LE(4), webp.length - 8, 'RIFF size matches');
});

test('officer uploads a photo with a caption: stored in species-media and recorded', async () => {
  const res = await upload('officer', JPEG, { caption: 'Lower pitcher', credit: 'SFC', is_primary: 'true' });
  assert.equal(res.status, 201);
  assert.equal(res.body.caption, 'Lower pitcher');
  assert.equal(res.body.is_primary, true);
  const [key] = Object.keys(stored);
  assert.equal(key, `${SPECIES}/${res.body.id}.jpg`);
  assert.equal(media[0].uploaded_by, users.officer);
  assert.equal(res.body.url, `https://test-project.supabase.co/storage/v1/object/public/species-media/${key}`);
  assert.ok(!('s3_key' in res.body));
});

test('the stored file has no location metadata', async () => {
  await upload('admin', JPEG);
  const [file] = Object.values(stored);
  assert.ok(file.includes(Buffer.from('pixels')), 'the picture was stored');
  assert.ok(!file.includes(GPS));
});

test('file type comes from the bytes, not the name: a renamed SVG gets 415', async () => {
  const res = await upload('officer', Buffer.from('<svg onload=alert(1)>'), {}, 'innocent.jpg');
  assert.equal(res.status, 415);
  assert.equal(res.body.code, 'UNSUPPORTED_FILE_TYPE');
  assert.deepEqual(stored, {});
});

test('files over 10 MB get 413', async () => {
  const big = Buffer.concat([JPEG, Buffer.alloc(10 * 1024 * 1024)]);
  const res = await upload('officer', big);
  assert.equal(res.status, 413);
  assert.equal(res.body.code, 'FILE_TOO_LARGE');
  assert.deepEqual(stored, {});
});

test('missing file or bad fields get 422', async () => {
  assert.equal((await upload('officer', null, { caption: 'x' })).status, 422);
  assert.equal((await upload('officer', JPEG, { sort_order: '-1' })).status, 422);
  assert.equal((await upload('officer', JPEG, { uploaded_by: users.admin })).status, 422);
  assert.deepEqual(stored, {});
});

test('unknown species gets 404 and nothing is stored', async () => {
  const res = await request(app).post(`/v1/species/${crypto.randomUUID()}/media`).set(as('officer')).attach('file', JPEG, 'a.jpg');
  assert.equal(res.status, 404);
  assert.deepEqual(stored, {});
});

test('only Officer and Admin can upload: botanist 403, visitor 401, before any file is read', async () => {
  assert.equal((await upload('botanist', JPEG)).status, 403);
  assert.equal((await request(app).post(`/v1/species/${SPECIES}/media`).attach('file', JPEG, 'a.jpg')).status, 401);
  assert.deepEqual(calls, []);
});

test('a new primary photo un-marks the old one', async () => {
  await upload('officer', JPEG, { is_primary: 'true' });
  await upload('officer', PNG, { is_primary: 'true' }, 'b.png');
  assert.deepEqual(media.map((m) => m.is_primary), [false, true]);
});
