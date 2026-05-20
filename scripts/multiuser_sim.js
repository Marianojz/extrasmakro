/*
Lightweight multi-client simulator for Firebase Realtime DB (staging).
Usage (env vars):
  FIREBASE_DB_URL - full DB URL, e.g. https://proj-staging.firebaseio.com
  TARGET_PATH - path to mutate, default: /c5_test/employees
  CONCURRENCY - number of parallel "clients" (default 10)
  ITERATIONS - number of updates per client (default 50)
  AUTH_TOKEN - optional bearer token for REST API (if needed)

Behavior:
- Each client issues PATCH requests to TARGET_PATH/{id} with small deltas.
- Retry policy: at most 1 retry per failed request (per design requirement).
- Burst mode: when BURST=true, all clients start without random delay.
- Emits telemetry JSON summary at the end: { successes, failures, retries, conflicts, timeMs }

NOTE: This script uses the Realtime Database REST API. It is intentionally minimal and requires
environment-provided credentials/URLs for staging. It should NOT be run against production.
*/

const https = require('https');
const { URL } = require('url');

const DB_URL = process.env.FIREBASE_DB_URL;
if (!DB_URL) {
  console.error('FIREBASE_DB_URL not set. Export FIREBASE_DB_URL and retry.');
  process.exit(1);
}

const TARGET_PATH = (process.env.TARGET_PATH || '/c5_test/employees').replace(/^\/+/, '');
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '10', 10);
const ITERATIONS = parseInt(process.env.ITERATIONS || '50', 10);
const AUTH_TOKEN = process.env.AUTH_TOKEN || null;
const BURST = (process.env.BURST === 'true');

const telemetry = {
  successes: 0,
  failures: 0,
  retries: 0,
  conflicts: 0,
  startedAt: Date.now()
};

function makeRequest(method, path, body, attempt = 0) {
  return new Promise((resolve) => {
    const url = new URL(DB_URL);
    url.pathname = `${path}.json`;
    if (AUTH_TOKEN) url.searchParams.set('auth', AUTH_TOKEN);

    const data = body ? JSON.stringify(body) : '';
    const opts = {
      method,
      hostname: url.hostname,
      path: url.pathname + (url.search || ''),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(opts, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        const code = res.statusCode || 0;
        if (code >= 200 && code < 300) return resolve({ ok: true, status: code, body: raw });
        // treat 412/409 like conflicts for our simulation
        if ((code === 412 || code === 409) && attempt === 0) {
          telemetry.conflicts++;
          // retry once
          telemetry.retries++;
          return resolve(makeRequest(method, path, body, attempt + 1));
        }
        return resolve({ ok: false, status: code, body: raw });
      });
    });
    req.on('error', (err) => {
      if (attempt === 0) {
        telemetry.retries++;
        return resolve(makeRequest(method, path, body, attempt + 1));
      }
      return resolve({ ok: false, error: err.message });
    });
    if (data) req.write(data);
    req.end();
  });
}

function randomDelay(maxMs) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * maxMs)));
}

async function clientWorker(clientId) {
  for (let i = 0; i < ITERATIONS; i++) {
    // In non-burst mode introduce jitter
    if (!BURST) await randomDelay(200);

    const id = `emp-${(clientId % 100) + 1}`; // collide on small set to provoke conflicts
    const path = `${TARGET_PATH}/${id}`;
    const delta = { lastUpdateBy: `sim-${clientId}`, lastUpdateAt: Date.now(), counter: i };
    // Use PATCH to avoid overwriting whole collection
    const res = await makeRequest('PATCH', path, delta);
    if (res && res.ok) telemetry.successes++;
    else telemetry.failures++;
  }
}

(async function main() {
  console.log('Starting multiuser simulation', { DB_URL, TARGET_PATH, CONCURRENCY, ITERATIONS, BURST });
  const workers = [];
  for (let c = 0; c < CONCURRENCY; c++) {
    // stagger start unless burst
    if (!BURST) await randomDelay(50);
    workers.push(clientWorker(c));
  }
  await Promise.all(workers);
  telemetry.endedAt = Date.now();
  telemetry.timeMs = telemetry.endedAt - telemetry.startedAt;
  console.log('SIMULATION COMPLETE. Telemetry:');
  console.log(JSON.stringify(telemetry, null, 2));
})();
