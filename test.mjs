// Smallest check that fails if auth or the save path breaks.
//   node server.js   (in one terminal)
//   node test.mjs    (in another)
import assert from 'node:assert/strict';
import 'dotenv/config';

const BASE = process.env.TEST_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const KEY = process.env.ADMIN_PASSWORD;
const hit = (p, o = {}) =>
  fetch(BASE + p, { ...o, headers: { 'content-type': 'application/json', ...o.headers } });

const content = await (await hit('/api/content')).json();
assert.ok(content.profile?.name, 'GET /api/content returns a profile');
assert.ok(Array.isArray(content.sections), 'content has sections');

assert.equal((await hit('/api/auth', { method: 'POST' })).status, 401, 'no key is rejected');
assert.equal(
  (await hit('/api/auth', { method: 'POST', headers: { 'x-admin-key': KEY + 'x' } })).status,
  401, 'wrong key is rejected');
assert.equal(
  (await hit('/api/auth', { method: 'POST', headers: { 'x-admin-key': KEY } })).status,
  200, 'right key is accepted');

assert.equal(
  (await hit('/api/content', { method: 'PUT', body: JSON.stringify(content) })).status,
  401, 'unauthenticated write is rejected');
assert.equal(
  (await hit('/api/content', {
    method: 'PUT', headers: { 'x-admin-key': KEY }, body: JSON.stringify({ junk: true }),
  })).status, 400, 'malformed content is rejected');

// round-trip an edit, then put the original back
const probe = 'probe-' + Date.now();
const edited = structuredClone(content);
edited.meta = { ...edited.meta, tagline: probe };
assert.equal(
  (await hit('/api/content', { method: 'PUT', headers: { 'x-admin-key': KEY }, body: JSON.stringify(edited) })).status,
  200, 'authenticated write succeeds');
assert.equal((await (await hit('/api/content')).json()).meta.tagline, probe, 'edit persisted');

await hit('/api/content', { method: 'PUT', headers: { 'x-admin-key': KEY }, body: JSON.stringify(content) });
assert.equal((await (await hit('/api/content')).json()).meta.tagline, content.meta.tagline, 'restored');

assert.equal((await hit('/')).status, 200, 'public page renders');
assert.equal((await hit('/admin')).status, 200, 'admin page renders');

console.log('all checks passed');
