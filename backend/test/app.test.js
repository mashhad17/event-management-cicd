// Unit tests run by the Jenkins "Unit Tests" stage. They need no database:
// the pool points at a closed port, so database calls fail fast.
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '1';
process.env.APP_VERSION = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, pool } = require('../app');
const { validateEvent, validateRegistration } = require('../validation');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

const post = (path, body) =>
  fetch(baseUrl + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('accepts a valid event', () => {
  const r = validateEvent({ title: ' DevOps Talk ', venue: 'Hall A', event_date: '2026-11-15', capacity: '50' });
  assert.deepEqual(r.value, { title: 'DevOps Talk', venue: 'Hall A', event_date: '2026-11-15', capacity: 50 });
});

test('rejects an event with missing fields', () => {
  assert.match(validateEvent({ title: 'Talk' }).error, /required/);
});

test('rejects an invalid date and capacity', () => {
  assert.match(validateEvent({ title: 'T', venue: 'V', event_date: '15/11/2026', capacity: 5 }).error, /Date/);
  assert.match(validateEvent({ title: 'T', venue: 'V', event_date: '2026-11-15', capacity: 0 }).error, /Capacity/);
});

test('rejects a registration with an invalid email', () => {
  assert.match(validateRegistration({ attendee_name: 'Ali', email: 'not-an-email' }).error, /valid email/);
  assert.equal(validateRegistration({ attendee_name: 'Ali', email: 'Ali@Example.com' }).value.email, 'ali@example.com');
});

test('POST /api/events returns 400 for invalid input', async () => {
  const res = await post('/api/events', { title: '', venue: 'Hall', event_date: '2026-11-15', capacity: 10 });
  assert.equal(res.status, 400);
});

test('POST /api/events/:id/register returns 400 for a non-numeric id', async () => {
  const res = await post('/api/events/abc/register', { attendee_name: 'Ali', email: 'ali@example.com' });
  assert.equal(res.status, 400);
});

test('health check reports 503 when the database is unreachable', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.database, 'disconnected');
  assert.equal(body.version, 'test');
});
