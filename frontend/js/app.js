const $ = (id) => document.getElementById(id);

let events = [];
let currentEvent = null;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderEvents() {
  const term = $('search').value.trim().toLowerCase();
  const visible = events.filter((e) => [e.title, e.venue].some((f) => f.toLowerCase().includes(term)));
  $('event-grid').innerHTML = visible.map((e) => {
    const left = e.capacity - e.registered;
    const pct = Math.min(100, Math.round((e.registered / e.capacity) * 100));
    return `
      <article class="event">
        <h3>${escapeHtml(e.title)}</h3>
        <div class="meta">📍 ${escapeHtml(e.venue)}</div>
        <div class="meta">📅 ${new Date(e.event_date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
        <div class="seats"><div style="width:${pct}%"></div></div>
        <div class="meta">${e.registered} / ${e.capacity} registered &middot; <strong>${left > 0 ? left + ' seats left' : 'Full'}</strong></div>
        <div class="event-actions">
          <button class="btn" data-register="${e.id}" ${left > 0 ? '' : 'disabled'}>Register</button>
          <button class="link-btn" data-delete="${e.id}">Delete</button>
        </div>
      </article>`;
  }).join('');
  $('empty').classList.toggle('hidden', visible.length > 0);
  $('stat-events').textContent = events.length;
  $('stat-registrations').textContent = events.reduce((sum, e) => sum + e.registered, 0);
}

async function loadEvents() {
  const res = await fetch('/api/events');
  events = await res.json();
  renderEvents();
}

// version.json is written at image build time with the Jenkins build tag (e.g. 7-a1b2c3d).
async function loadVersion() {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    $('stat-build').textContent = '#' + (await res.json()).version.split('-')[0];
  } catch {
    $('stat-build').textContent = '?';
  }
}

async function loadStatus() {
  try {
    const res = await fetch('/api/health');
    $('frontend-pod').textContent = 'pod: ' + (res.headers.get('X-Frontend-Pod') || 'unknown');
    const health = await res.json();
    $('backend-pod').textContent = `pod: ${health.backendPod} | build: ${health.version}`;
    $('database-status').innerHTML = health.database === 'connected'
      ? '<span class="ok">connected</span>'
      : '<span class="error">disconnected</span>';
  } catch {
    $('backend-pod').innerHTML = '<span class="error">unreachable</span>';
    $('database-status').innerHTML = '<span class="error">unknown</span>';
  }
}

function showMessage(id, text, type) {
  $(id).textContent = text;
  $(id).className = 'message ' + type;
}

async function openRegister(id) {
  currentEvent = events.find((e) => String(e.id) === String(id));
  $('register-title').textContent = 'Register for ' + currentEvent.title;
  $('register-form').reset();
  showMessage('register-message', '', '');
  const res = await fetch(`/api/events/${id}/attendees`);
  const attendees = await res.json();
  $('attendee-list').innerHTML = attendees.length
    ? attendees.map((a) => `<li>${escapeHtml(a.attendee_name)}</li>`).join('')
    : '<li>No one yet. Be the first!</li>';
  $('register-dialog').showModal();
}

$('event-grid').addEventListener('click', async (event) => {
  const { register, delete: del } = event.target.dataset;
  if (register) return openRegister(register);
  if (del && confirm('Delete this event and its registrations?')) {
    await fetch(`/api/events/${del}`, { method: 'DELETE' });
    await loadEvents();
  }
});

$('register-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const res = await fetch(`/api/events/${currentEvent.id}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (res.ok) {
    $('register-dialog').close();
    await loadEvents();
  } else {
    const body = await res.json().catch(() => ({}));
    showMessage('register-message', body.error || 'Registration failed.', 'error');
  }
});

$('register-cancel').addEventListener('click', () => $('register-dialog').close());

$('event-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const res = await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (res.ok) {
    showMessage('event-message', `"${data.title}" created.`, 'ok');
    event.target.reset();
    await loadEvents();
  } else {
    const body = await res.json().catch(() => ({}));
    showMessage('event-message', body.error || 'Could not create the event.', 'error');
  }
});

$('search').addEventListener('input', renderEvents);

loadEvents();
loadVersion();
loadStatus();
