// Tier 2: Event Management REST API between the website (frontend) and PostgreSQL (database).
// Kept separate from server.js so the routes can be unit tested without starting the server.
const express = require('express');
const os = require('os');
const { Pool } = require('pg');
const { validateEvent, validateRegistration } = require('./validation');

const pool = new Pool({
  host: process.env.DB_HOST || 'database',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  connectionTimeoutMillis: 3000,
});

const app = express();
app.use(express.json());

// Waits for the database tier, then creates the tables and sample events on first start.
async function initDatabase() {
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS events (
          id         SERIAL PRIMARY KEY,
          title      TEXT NOT NULL,
          venue      TEXT NOT NULL,
          event_date DATE NOT NULL,
          capacity   INTEGER NOT NULL CHECK (capacity > 0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS registrations (
          id            SERIAL PRIMARY KEY,
          event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          attendee_name TEXT NOT NULL,
          email         TEXT NOT NULL,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (event_id, email)
        )`);
      const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM events');
      if (rows[0].n === 0) {
        await pool.query(`
          INSERT INTO events (title, venue, event_date, capacity) VALUES
            ('DevOps Tech Talk',          'COMSATS Auditorium', CURRENT_DATE + 7,  100),
            ('Cloud Computing Workshop',  'CS Lab 3',           CURRENT_DATE + 14, 30),
            ('Annual Sports Gala',        'University Ground',  CURRENT_DATE + 21, 500)`);
      }
      console.log('Database ready');
      return;
    } catch (err) {
      console.log(`Waiting for database (attempt ${attempt}): ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  throw new Error('Database not reachable');
}

const isId = (value) => /^\d+$/.test(value);

// Shows which pod and build answered, so each Jenkins deployment is visible on the website.
app.get('/api/health', async (req, res) => {
  const info = { backendPod: os.hostname(), version: process.env.APP_VERSION || 'dev' };
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', ...info });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'disconnected', ...info, error: err.message });
  }
});

app.get('/api/events', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT e.*, COUNT(r.id)::int AS registered
    FROM events e LEFT JOIN registrations r ON r.event_id = e.id
    GROUP BY e.id ORDER BY e.event_date, e.id`);
  res.json(rows);
});

app.post('/api/events', async (req, res) => {
  const result = validateEvent(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  const { title, venue, event_date, capacity } = result.value;
  const { rows } = await pool.query(
    'INSERT INTO events (title, venue, event_date, capacity) VALUES ($1, $2, $3, $4) RETURNING *',
    [title, venue, event_date, capacity]
  );
  res.status(201).json({ ...rows[0], registered: 0 });
});

app.delete('/api/events/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid event id' });
  await pool.query('DELETE FROM events WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

app.get('/api/events/:id/attendees', async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid event id' });
  const { rows } = await pool.query(
    'SELECT id, attendee_name, email, created_at FROM registrations WHERE event_id = $1 ORDER BY id',
    [req.params.id]
  );
  res.json(rows);
});

// Registers an attendee unless the event is full; the row lock stops two people taking the last seat.
app.post('/api/events/:id/register', async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid event id' });
  const result = validateRegistration(req.body);
  if (result.error) return res.status(400).json({ error: result.error });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const event = await client.query('SELECT capacity FROM events WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (event.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Event not found' });
    }
    const taken = await client.query('SELECT COUNT(*)::int AS n FROM registrations WHERE event_id = $1', [req.params.id]);
    if (taken.rows[0].n >= event.rows[0].capacity) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This event is full' });
    }
    const { rows } = await client.query(
      'INSERT INTO registrations (event_id, attendee_name, email) VALUES ($1, $2, $3) RETURNING *',
      [req.params.id, result.value.attendee_name, result.value.email]
    );
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ error: 'This email is already registered for the event' });
    throw err;
  } finally {
    client.release();
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = { app, pool, initDatabase };
