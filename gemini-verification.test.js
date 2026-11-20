const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('./gemini-verification');

const src = (url, text) => ({ url, text, isRedirect: false });
const REDIRECT = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC123';

test('isVertexRedirect', () => {
  assert.equal(v.isVertexRedirect(REDIRECT), true);
  assert.equal(v.isVertexRedirect('https://asi.nic.in/'), false);
  assert.equal(v.isVertexRedirect('not a url'), false);
});

test('isImageUrl ignores query string, case-insensitive, only images', () => {
  assert.equal(v.isImageUrl('https://keralatourism.org/a/b.JPG?w=100'), true);
  assert.equal(v.isImageUrl('https://keralatourism.org/pic.webp'), true);
  assert.equal(v.isImageUrl('https://keralatourism.org/destination/fort-kochi'), false);
  assert.equal(v.isImageUrl('https://keralatourism.org/page.html?img=a.png'), false);
});

test('isUsableSource: only real pages on official/reputable domains', () => {
  assert.equal(v.isUsableSource('https://www.keralatourism.org/destination/fort-kochi-beach/'), true);
  assert.equal(v.isUsableSource('https://www.thehindu.com/news/x.ece'), true);
  assert.equal(v.isUsableSource('https://coorg.nic.in/'), true);
  assert.equal(v.isUsableSource(REDIRECT), false);
  assert.equal(v.isUsableSource('https://keralatourism.org/hero.png'), false);
  assert.equal(v.isUsableSource('https://weddingblog.example.com/post'), false);
  assert.equal(v.isUsableSource('https://evilkeralatourism.org/'), false);
  assert.equal(v.isUsableSource('https://keralatourism.org.evil.com/'), false);
  assert.equal(v.isUsableSource('javascript:alert(1)'), false);
  assert.equal(v.isUsableSource(undefined), false);
});

test('filterSources drops redirects, images, unknown sites; model sources must match a grounded URL', () => {
  const grounded = [
    { url: 'https://asi.nic.in/ticket', isRedirect: false },
    { url: REDIRECT, isRedirect: true },
    { url: 'https://asi.nic.in/map.png', isRedirect: false },
    { url: 'https://travelblog.example.com/hampi', isRedirect: false },
  ];
  const model = [
    { url: 'https://asi.nic.in/ticket', field: 'entry_fee' },
    { url: 'https://www.thehindu.com/made-up', field: 'entry_fee' }, // trusted but not grounded
    { url: REDIRECT },
  ];
  const kept = v.filterSources(grounded, model);
  assert.deepEqual(kept.grounded.map(s => s.url), ['https://asi.nic.in/ticket']);
  assert.deepEqual(kept.model.map(s => s.url), ['https://asi.nic.in/ticket']);
});

test('groundedSourcesForField excludes unusable sources and keys by segment field', () => {
  const good = src('https://asi.nic.in/t', '"entry_fee": "₹40"');
  const blog = src('https://blog.example.com', '"entry_fee": "₹40"');
  const img = src('https://asi.nic.in/t.png', '"entry_fee": "₹40"');
  const other = src('https://asi.nic.in/d', '"drone_status": "restricted"');
  assert.deepEqual(v.groundedSourcesForField('entry_fee', [good, blog, img, other]), [good]);
  assert.deepEqual(v.groundedSourcesForField('shoot_permit_fee', [good]), []);
});

test('isFieldVerified: fee amount must appear in evidence; unknown never verified', () => {
  const s = [src('https://asi.nic.in/t', 'Entry fee is Rs 40 for Indians')];
  assert.equal(v.isFieldVerified('entry_fee', '₹40', s), true);
  assert.equal(v.isFieldVerified('entry_fee', '₹999', s), false);
  assert.equal(v.isFieldVerified('entry_fee', 'unknown', s), false);
  assert.equal(v.isFieldVerified('entry_fee', '₹40', []), false);
  assert.equal(v.isFieldVerified('drone_status', 'made_up', s), false);
  assert.equal(v.isFieldVerified('drone_status', 'restricted', s), true);
  assert.equal(v.isFieldVerified('entry_fee', 'free', [src('https://asi.nic.in/t', 'free entry for all')]), true);
});

test('fee fields are independent of each other', () => {
  assert.deepEqual(v.FEE_FIELDS, ['entry_fee', 'shoot_permit_fee']);
  // Evidence for entry_fee must not verify shoot_permit_fee.
  const entryOnly = [src('https://asi.nic.in/t', '"entry_fee": "₹40"')];
  assert.equal(v.isFieldVerified('shoot_permit_fee', '₹40', v.groundedSourcesForField('shoot_permit_fee', entryOnly)), false);
});

test('computeConfidence: 0 when nothing verified', () => {
  assert.equal(v.computeConfidence({}, {}), 0);
  assert.equal(v.computeConfidence({ entry_fee: false }, { entry_fee: [src('https://asi.nic.in', 'x')] }), 0);
});

test('computeConfidence: based on verified fields only, scaled by coverage', () => {
  const official = [src('https://asi.nic.in/a', 'x')];
  const news = [src('https://www.thehindu.com/a', 'x')];
  // 2 of 6 official -> 0.33 (not the old ~0.95)
  assert.equal(v.computeConfidence({ pre_wedding_shoot: true, drone_status: true }, { pre_wedding_shoot: official, drone_status: official }), 0.33);
  // news counts less than official
  assert.equal(v.computeConfidence({ entry_fee: true }, { entry_fee: news }), 0.13);
  // unverified fields with official evidence attached add nothing
  assert.equal(v.computeConfidence({ entry_fee: true, drone_status: false }, { entry_fee: official, drone_status: official }), 0.17);
});

test('computeConfidence: capped at 0.95 and monotonic in verified count', () => {
  const official = [src('https://asi.nic.in/a', 'x')];
  const all = Object.fromEntries(v.FIELD_NAMES.map(f => [f, true]));
  const ev = Object.fromEntries(v.FIELD_NAMES.map(f => [f, official]));
  assert.equal(v.computeConfidence(all, ev), 0.95);
  const four = { ...all, entry_fee: false, shoot_permit_fee: false };
  assert.ok(v.computeConfidence(four, ev) < v.computeConfidence(all, ev));
});

test('sourceRejectionReason', () => {
  assert.equal(v.sourceRejectionReason('https://asi.nic.in/x'), null);
  assert.equal(v.sourceRejectionReason(REDIRECT), 'redirect');
  assert.equal(v.sourceRejectionReason('https://asi.nic.in/x.png'), 'image');
  assert.equal(v.sourceRejectionReason('https://blog.example.com/x'), 'untrusted_domain');
  assert.equal(v.sourceRejectionReason('nope'), 'invalid_url');
});

test('isTransientError: only rate-limit/server/network failures', () => {
  assert.equal(v.isTransientError(Object.assign(new Error('x'), { status: 429 })), true);
  assert.equal(v.isTransientError(Object.assign(new Error('x'), { status: 503 })), true);
  assert.equal(v.isTransientError(Object.assign(new Error('x'), { status: 400 })), false);
  assert.equal(v.isTransientError(Object.assign(new Error('x'), { status: 403 })), false);
  assert.equal(v.isTransientError(Object.assign(new Error('x'), { code: 'ECONNRESET' })), true);
  assert.equal(v.isTransientError(new Error('parse failure')), false);
  assert.equal(v.isTransientError(null), false);
});

test('pickVerifiedField: first call that verifies the field wins, with its own evidence', () => {
  const a = { parsed: { entry_fee: 'unknown' }, grounded: [src('https://asi.nic.in/a', '"entry_fee": "unknown"')] };
  const b = { parsed: { entry_fee: '₹40' }, grounded: [src('https://asi.nic.in/b', '"entry_fee": "₹40"')] };
  const hit = v.pickVerifiedField('entry_fee', [a, b]);
  assert.equal(hit.verified, true);
  assert.equal(hit.value, '₹40');
  assert.equal(hit.callIndex, 1);
  assert.deepEqual(hit.evidence.map(s => s.url), ['https://asi.nic.in/b']);
  assert.deepEqual(v.pickVerifiedField('entry_fee', [a]), { verified: false, value: null, evidence: [], callIndex: -1 });
});
