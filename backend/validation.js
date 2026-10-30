// Input checks for the API, kept as plain functions so they're easy to unit test.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const text = (value) => (typeof value === 'string' ? value.trim() : '');

function validateEvent(body = {}) {
  const title = text(body.title);
  const venue = text(body.venue);
  const event_date = text(body.event_date);
  const capacity = Number(body.capacity);

  if (!title || !venue || !event_date) return { error: 'Title, venue and date are required' };
  if (title.length > 100) return { error: 'Title must be at most 100 characters' };
  if (!DATE.test(event_date) || Number.isNaN(Date.parse(event_date))) return { error: 'Date must be in YYYY-MM-DD format' };
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) return { error: 'Capacity must be a whole number from 1 to 10000' };
  return { value: { title, venue, event_date, capacity } };
}

function validateRegistration(body = {}) {
  const attendee_name = text(body.attendee_name);
  const email = text(body.email).toLowerCase();

  if (!attendee_name || !email) return { error: 'Name and email are required' };
  if (!EMAIL.test(email)) return { error: 'Please enter a valid email address' };
  return { value: { attendee_name, email } };
}

module.exports = { validateEvent, validateRegistration };
