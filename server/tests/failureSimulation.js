/**
 * VNR Wall — Phase 4, Step 5: Failure Simulation test runner
 * Run with: node tests/failureSimulation.js
 *
 * Tests:
 *  1. Invalid input (empty message, bad URL)
 *  2. Large payload
 *  3. System-status endpoint (shows Mongo/AI health live)
 *
 * Note: Simulating "MongoDB OFF" and "Slow AI" requires environment-level control
 * (stop mongod, or set GROQ_API_KEY to invalid). This script documents expected
 * behaviour and tests what IS controllable from code.
 */
'use strict';

const http = require('http');

const BASE = 'http://localhost:6105';

// ANSI colours for pass/fail
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET  = '\x1b[0m';

let passed = 0;
let failed = 0;

async function post(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: 'localhost',
      port: 6105,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 15000,
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: (() => { try { return JSON.parse(data); } catch { return data; } })() }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.write(payload);
    req.end();
  });
}

async function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE}${path}`, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: (() => { try { return JSON.parse(data); } catch { return data; } })() }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('GET timed out')); });
  });
}

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`${GREEN}✅ PASS${RESET} — ${label}`);
    passed++;
  } else {
    console.log(`${RED}❌ FAIL${RESET} — ${label}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

async function run() {
  console.log(`\n${YELLOW}╔═══════════════════════════════════════════════════╗${RESET}`);
  console.log(`${YELLOW}║  VNR Wall — Phase 4 Step 5: Failure Simulation     ║${RESET}`);
  console.log(`${YELLOW}╚═══════════════════════════════════════════════════╝${RESET}\n`);

  // ─── Test 0: Server reachability ─────────────────────────────────────────
  console.log('─── 0. Server Reachability ───────────────────────────────');
  try {
    const r = await get('/debug/system-status');
    assert('GET /debug/system-status returns 200', r.status === 200, JSON.stringify(r.body?.mongoConnected));
    assert('System status contains mongoConnected',  typeof r.body?.mongoConnected === 'boolean');
    assert('System status contains sqliteActive',    r.body?.sqliteActive === true);
    assert('System status contains aiStatus',        typeof r.body?.aiStatus === 'string');
    assert('System status contains writeSuccessRate', typeof r.body?.writeSuccessRate === 'string');
    console.log(`   ${YELLOW}→ Mongo: ${r.body?.mongoConnected}, AI: ${r.body?.aiStatus}, DB rows: ${r.body?.totalSubmissions}${RESET}\n`);
  } catch (e) {
    assert('GET /debug/system-status reachable', false, e.message);
    console.log(`${RED}⛔ Cannot reach server at ${BASE}. Start the server first.${RESET}\n`);
    process.exit(1);
  }

  // ─── Test 1: Empty message (invalid input) ────────────────────────────────
  console.log('─── 1. Invalid Input: Empty Message ─────────────────────');
  try {
    const r = await post('/api/user-check-data', {
      dateReceived: '2026-03-19',
      personalDetails: 'No',
      message: '',
      userEmail: 'sim@test.com',
      send_email_notification: false,
    });
    // The API should either succeed (message stored) or return a structured error
    assert('Empty message → no server crash (status 2xx or 4xx)', r.status < 500, `Got ${r.status}`);
    console.log(`   → Response: ${JSON.stringify(r.body)}\n`);
  } catch (e) {
    assert('Empty message → no crash', false, e.message);
  }

  // ─── Test 2: Bad URL (invalid input, not a real URL) ──────────────────────
  console.log('─── 2. Invalid Input: Garbage URL ───────────────────────');
  try {
    const r = await post('/api/user-check-data', {
      dateReceived: '2026-03-19',
      personalDetails: 'No',
      message: 'Visit: http://!!not_a_real_url!!.xyz/win_prize',
      userEmail: 'sim_bad_url@test.com',
      send_email_notification: false,
    });
    assert('Bad URL → no server crash (status 2xx)', r.status === 200, `Got ${r.status}`);
    assert('Bad URL → returns success:true or id', r.body?.id || r.body?.success);
    console.log(`   → ID assigned: ${r.body?.id}\n`);
  } catch (e) {
    assert('Bad URL → no crash', false, e.message);
  }

  // ─── Test 3: Large payload ────────────────────────────────────────────────
  console.log('─── 3. Large Payload (5 KB message) ─────────────────────');
  try {
    const bigMessage = `${'A'.repeat(4000)} — end of large payload — visit http://bigmessage.example.com for prize`;
    const r = await post('/api/user-check-data', {
      dateReceived: '2026-03-19',
      personalDetails: 'No',
      message: bigMessage,
      userEmail: 'sim_large@test.com',
      send_email_notification: false,
    });
    assert('Large payload (5KB) → no server crash (status 2xx)', r.status === 200, `Got ${r.status}`);
    assert('Large payload → returns id', typeof r.body?.id === 'number');
    console.log(`   → ID assigned: ${r.body?.id}\n`);
  } catch (e) {
    assert('Large payload → no crash', false, e.message);
  }

  // ─── Test 4: Missing required fields ─────────────────────────────────────
  console.log('─── 4. Missing Required Fields ──────────────────────────');
  try {
    const r = await post('/api/user-check-data', { userEmail: 'sim_missing@test.com' });
    // message is null/undefined — should not crash server
    assert('Missing fields → no server crash (status < 500)', r.status < 500, `Got ${r.status}`);
    console.log(`   → Status: ${r.status}, Body: ${JSON.stringify(r.body)}\n`);
  } catch (e) {
    assert('Missing fields → no crash', false, e.message);
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log(`${GREEN}Passed: ${passed}${RESET}  |  ${RED}Failed: ${failed}${RESET}`);
  console.log('');
  console.log(`${YELLOW}Manual steps for full Phase 4 Step 5 validation:${RESET}`);
  console.log('  • MongoDB OFF : stop mongod → restart server → re-run → verify no crash');
  console.log('  • Slow AI     : set GROQ_API_KEY to invalid → restart server → submit → verify fallback returned');
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error('Fatal error:', e.message); process.exit(1); });
