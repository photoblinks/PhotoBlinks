// DNS-rebinding defence: validate once, connect to exactly the validated addresses, keep TLS
// hostname verification. The TLS tests run a real local HTTPS server with a throwaway
// certificate generated at test time (skipped if the openssl binary is unavailable).
const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const { pinnedLookup } = require('../net-safety');
const { httpsTransport } = require('../transport');
const { safeGet, fetchPage } = require('../page-fetch');

const res = (body, { status = 200, type = 'text/html', location } = {}) => ({
  status,
  headers: { get: n => ({ 'content-type': type, location }[String(n).toLowerCase()] ?? null) },
  body: Readable.from(body === null ? [] : [Buffer.from(body)]),
});
const LONG = '<p>' + 'Entry fee is ₹40 for visitors to the monument. '.repeat(3) + '</p>';

// ---- pinnedLookup ----

const callLookup = (lookup, host, opts) => new Promise((resolve, reject) => lookup(host, opts, (err, a, f) => (err ? reject(err) : resolve([a, f]))));

test('pinnedLookup answers only with the validated addresses, only for the expected host', async () => {
  const lookup = pinnedLookup('asi.nic.in', [{ address: '93.184.216.34', family: 4 }, { address: '2606:2800:220:1::1', family: 6 }]);
  assert.deepEqual(await callLookup(lookup, 'asi.nic.in', {}), ['93.184.216.34', 4]);
  assert.deepEqual(await callLookup(lookup, 'ASI.nic.in', { family: 6 }), ['2606:2800:220:1::1', 6]);
  const [all] = await callLookup(lookup, 'asi.nic.in', { all: true });
  assert.deepEqual(all.map(a => a.address), ['93.184.216.34', '2606:2800:220:1::1']);
  await assert.rejects(callLookup(lookup, 'evil.example.com', {}), /pinned lookup refused/);
  const v4only = pinnedLookup('asi.nic.in', [{ address: '93.184.216.34', family: 4 }]);
  await assert.rejects(callLookup(v4only, 'asi.nic.in', { family: 6 }), /no pinned address/);
  // callback-as-second-argument form used by some callers
  const direct = await new Promise(resolve => lookup('asi.nic.in', (err, a) => resolve(a)));
  assert.equal(direct, '93.184.216.34');
});

// ---- rebinding at the safeGet level ----

test('DNS change after validation cannot redirect the connection: transport gets the validated addresses, DNS is asked once per hop', async () => {
  let lookups = 0;
  const lookup = async () => {
    lookups++;
    // 1st answer public; any LATER answer would be an internal address (the rebinding attack).
    return lookups === 1 ? [{ address: '93.184.216.34', family: 4 }] : [{ address: '169.254.169.254', family: 4 }];
  };
  const requests = [];
  const transport = async req => { requests.push(req); return res(LONG); };
  const r = await safeGet('https://asi.nic.in/page', { lookup, transport });
  assert.equal(r.status, 200);
  assert.equal(lookups, 1);
  assert.deepEqual(requests[0].addresses.map(a => a.address), ['93.184.216.34']);
  assert.equal(requests[0].hostname, 'asi.nic.in'); // hostname kept for SNI / certificate verification
});

test('DNS flips to a private address between robots.txt and the page: the page hop is validated on its own and refused', async () => {
  let lookups = 0;
  const lookup = async () => (++lookups === 1 ? [{ address: '93.184.216.34', family: 4 }] : [{ address: '10.0.0.7', family: 4 }]);
  const transport = async req => (req.path === '/robots.txt' ? res('User-agent: *\nDisallow:', { type: 'text/plain' }) : res(LONG));
  const r = await fetchPage('https://asi.nic.in/page', { lookup, transport });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'private_address');
});

test('DNS flips between redirect hops: each hop is re-resolved and a private answer on hop 2 is refused', async () => {
  const answers = { 'asi.nic.in': [{ address: '93.184.216.34', family: 4 }], 'dgca.gov.in': [{ address: '127.0.0.1', family: 4 }] };
  const transport = async req => (req.path === '/robots.txt' ? res('', { type: 'text/plain' }) : res(null, { status: 302, location: 'https://dgca.gov.in/x' }));
  const r = await fetchPage('https://asi.nic.in/a', { lookup: async h => answers[h], transport });
  assert.equal(r.reason, 'private_address');
});

// ---- real TLS: pinned connection + hostname verification ----

function makeCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-tls-'));
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '2',
    '-subj', '/CN=asi.nic.in', '-addext', 'subjectAltName=DNS:asi.nic.in'], { stdio: 'ignore' });
  return { key: fs.readFileSync(key, 'utf8'), cert: fs.readFileSync(cert, 'utf8') };
}

let creds = null;
try { creds = makeCert(); } catch { /* openssl unavailable: TLS tests are skipped */ }
const tlsTest = (name, fn) => test(name, { skip: creds ? false : 'openssl binary not available' }, fn);

function withServer(handler, fn) {
  return async () => {
    const server = https.createServer({ key: creds.key, cert: creds.cert }, handler);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try { await fn(server.address().port); } finally { await new Promise(r => server.close(r)); }
  };
}

const readAll = async body => { const parts = []; for await (const c of body) parts.push(Buffer.from(c)); return Buffer.concat(parts).toString('utf8'); };
const baseReq = port => ({ hostname: 'asi.nic.in', port, path: '/x', addresses: [{ address: '127.0.0.1', family: 4 }], headers: { 'User-Agent': 't' }, tls: { ca: creds.cert } });

tlsTest('transport connects to the PINNED ip (not DNS) and verifies the certificate against the hostname', withServer(
  (req, res) => { res.setHeader('content-type', 'text/html'); res.end(`host=${req.headers.host}`); },
  async port => {
    // "asi.nic.in" does not resolve to 127.0.0.1; only pinning can make this connect.
    const r = await httpsTransport(baseReq(port));
    assert.equal(r.status, 200);
    assert.equal(r.remoteAddress, '127.0.0.1');
    assert.match(await readAll(r.body), /host=asi\.nic\.in:\d+/);
  },
));

tlsTest('TLS hostname verification is active: certificate for asi.nic.in is rejected for another hostname', withServer(
  (req, res) => res.end('x'),
  async port => {
    await assert.rejects(httpsTransport({ ...baseReq(port), hostname: 'dgca.gov.in' }), err => err.code === 'ERR_TLS_CERT_ALTNAME_INVALID');
  },
));

tlsTest('untrusted certificate is rejected, and the tls option cannot switch verification off', withServer(
  (req, res) => res.end('x'),
  async port => {
    const noCa = { ...baseReq(port), tls: undefined };
    await assert.rejects(httpsTransport(noCa), err => /SELF_SIGNED|UNABLE_TO_VERIFY|CERT/.test(err.code || ''));
    await assert.rejects(httpsTransport({ ...noCa, tls: { rejectUnauthorized: false } }), err => /SELF_SIGNED|UNABLE_TO_VERIFY|CERT/.test(err.code || ''));
    await assert.rejects(httpsTransport({ ...noCa, tls: { checkServerIdentity: () => undefined } }), err => /SELF_SIGNED|UNABLE_TO_VERIFY|CERT/.test(err.code || ''));
  },
));

tlsTest('a connection can only go to a pinned address: a different pinned address is not reachable via DNS fallback', withServer(
  (req, res) => res.end('x'),
  async port => {
    // Pinned to an address with no listener. If the transport fell back to real DNS for
    // "asi.nic.in" it would not hit 127.0.0.1 anyway; the point is it uses ONLY pinned answers.
    const bad = { ...baseReq(port), addresses: [{ address: '127.0.0.2', family: 4 }] };
    await assert.rejects(httpsTransport(bad), err => ['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'EACCES'].includes(err.code));
  },
));

tlsTest('gzip responses are decoded; unsupported encodings are refused', withServer(
  (req, res) => {
    if (req.url === '/gz') { res.setHeader('content-encoding', 'gzip'); res.end(zlib.gzipSync('compressed ok')); return; }
    res.setHeader('content-encoding', 'compress'); res.end('x');
  },
  async port => {
    const gz = await httpsTransport({ ...baseReq(port), path: '/gz' });
    assert.equal(await readAll(gz.body), 'compressed ok');
    await assert.rejects(httpsTransport({ ...baseReq(port), path: '/other' }), err => err.code === 'EENCODING');
  },
));

// ---- transport safety: proxies, stalled bodies, connection cleanup ----

tlsTest('proxy environment variables are ignored: page connections are always direct to the pinned address', withServer(
  (req, res) => res.end('direct'),
  async port => {
    const keys = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'NODE_USE_ENV_PROXY'];
    const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
    try {
      for (const k of keys) process.env[k] = k === 'NODE_USE_ENV_PROXY' ? '1' : 'http://127.0.0.1:9'; // dead proxy
      const r = await httpsTransport(baseReq(port));
      assert.equal(await readAll(r.body), 'direct');
      assert.equal(r.remoteAddress, '127.0.0.1');
    } finally {
      for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    }
  },
));

tlsTest('a body that stalls after the headers is aborted by the request signal', withServer(
  (req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.write('partial'); /* never ends */ },
  async port => {
    const started = Date.now();
    const r = await httpsTransport({ ...baseReq(port), signal: AbortSignal.timeout(400) });
    await assert.rejects(readAll(r.body));
    assert.ok(Date.now() - started < 3000);
  },
));

for (const encoding of ['identity', 'gzip']) {
  tlsTest(`destroying a ${encoding} body closes the underlying socket (no leaked connection)`, async () => {
    let serverSocketClosed;
    const closed = new Promise(r => { serverSocketClosed = r; });
    const server = https.createServer({ key: creds.key, cert: creds.cert }, (req, res) => {
      req.socket.on('close', serverSocketClosed);
      if (encoding === 'gzip') res.setHeader('content-encoding', 'gzip');
      res.writeHead(200, { 'content-type': 'text/html' });
      const gz = encoding === 'gzip' ? zlib.createGzip() : null;
      const out = gz || res;
      if (gz) gz.pipe(res);
      const timer = setInterval(() => out.write('x'.repeat(2000)), 20); // endless stream
      res.on('close', () => clearInterval(timer));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
      const r = await httpsTransport(baseReq(server.address().port));
      for await (const _chunk of r.body) break; // read one chunk, then stop like readCapped does
      r.body.destroy();
      const winner = await Promise.race([closed.then(() => 'closed'), new Promise(res => setTimeout(() => res('leaked'), 2000))]);
      assert.equal(winner, 'closed');
    } finally {
      server.closeAllConnections?.();
      await new Promise(r => server.close(r));
    }
  });
}
