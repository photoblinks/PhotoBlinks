// Static guard: the prototype must stay isolated. Scans its own source (not tests).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..');
const sources = fs.readdirSync(DIR).filter(f => f.endsWith('.js')).map(f => [f, fs.readFileSync(path.join(DIR, f), 'utf8')]);

// Comments are stripped so documenting a prohibition does not trip the guard.
const code = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"`])\/\/.*$/gm, '$1');

test('no database / Supabase / pg access in prototype code', () => {
  for (const [file, src] of sources) {
    assert.doesNotMatch(code(src), /require\(['"]pg['"]\)|supabase|DATABASE_URL|createClient|\.from\(['"]/i, file);
  }
});

test('no Gemini built-in search grounding in prototype code', () => {
  for (const [file, src] of sources) {
    assert.doesNotMatch(code(src), /google_?search|googleSearch|groundingMetadata|tools\s*:/i, file);
  }
});

test('no approval / publish / write-to-locations logic', () => {
  for (const [file, src] of sources) {
    assert.doesNotMatch(code(src), /ai_approve|is_published|\.publish\(|\bapprove\w*\s*\(|review_status\s*[:=]\s*['"]approved/i, file);
  }
});

test('only the shared pure helpers are imported from outside the prototype', () => {
  const allowed = new Set(['../../gemini-pricing']); // pure official price table, no grounding logic
  for (const [file, src] of sources) {
    for (const m of code(src).matchAll(/require\('(\.\.\/[^']+)'\)/g)) assert.ok(allowed.has(m[1]), `${file} requires ${m[1]}`);
  }
});

test('live mode requires the explicit --live flag; default is dry run', () => {
  const run = fs.readFileSync(path.join(DIR, 'run.js'), 'utf8');
  assert.match(run, /const LIVE = process\.argv\.includes\('--live'\)/);
  assert.match(run, /if \(!LIVE\) \{[\s\S]*createDryRunNetwork/);
});

test('TLS verification is never disabled anywhere in the prototype', () => {
  for (const [file, src] of sources) {
    assert.doesNotMatch(code(src), /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED|checkServerIdentity\s*:/i, file);
  }
});

test('page hosts are only ever contacted through the pinned transport (no global fetch for pages)', () => {
  const pageFetch = code(fs.readFileSync(path.join(DIR, 'page-fetch.js'), 'utf8'));
  assert.doesNotMatch(pageFetch, /\bfetch\(|fetchImpl/);
  assert.match(pageFetch, /transport = httpsTransport/);
});

test('no import of, or reference to, the legacy Gemini grounding pipeline', () => {
  for (const [file, src] of sources) {
    assert.doesNotMatch(code(src), /gemini-client|gemini-verification|gemini-controlled-test|run-pilot/, file);
  }
});

test('API-key requests never follow redirects (Brave and Gemini)', () => {
  for (const file of ['brave.js', 'gemini-lite.js']) {
    assert.match(code(fs.readFileSync(path.join(DIR, file), 'utf8')), /redirect:\s*'error'/, file);
  }
});
