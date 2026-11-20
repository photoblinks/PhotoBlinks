// The ONLY place that opens a connection to a page host.
//
// DNS-rebinding defence: the caller resolves the hostname once and validates every address;
// this transport then connects to exactly those addresses (pinnedLookup) and double-checks the
// connected socket's remote address. TLS hostname verification stays ON: the request keeps the
// real hostname, so SNI and certificate matching use it (rejectUnauthorized is never disabled).
const https = require('node:https');
const zlib = require('node:zlib');
const { pipeline } = require('node:stream');
const { pinnedLookup, normalizeIp } = require('./net-safety');

// Certificate checks can never be switched off or altered through the tls option.
function safeTls(tls) {
  // eslint-disable-next-line no-unused-vars
  const { rejectUnauthorized, checkServerIdentity, servername, lookup, host, hostname, agent, ...rest } = tls || {};
  return rest;
}

const DECODERS = {
  gzip: () => zlib.createGunzip(),
  'x-gzip': () => zlib.createGunzip(),
  deflate: () => zlib.createInflate(),
  br: () => zlib.createBrotliDecompress(),
};

// req: { hostname, port?, path, addresses: [{address, family}], headers, signal?, tls? }
// resolves { status, headers: { get(name) }, body: AsyncIterable<Buffer>, remoteAddress }
function httpsTransport(req) {
  return new Promise((resolve, reject) => {
    const allowed = new Set(req.addresses.map(a => normalizeIp(a.address)));
    const request = https.request({
      protocol: 'https:',
      hostname: req.hostname,        // real hostname: SNI + certificate verification
      port: req.port || 443,
      path: req.path,
      method: 'GET',
      headers: { ...req.headers, 'Accept-Encoding': 'gzip, deflate, br' },
      // Fresh, explicit agent: no pooling, and never a proxy. Proxy environment variables
      // (HTTPS_PROXY, NODE_USE_ENV_PROXY, ...) only reach the global agents, and a proxy would
      // resolve DNS itself, which would bypass pinning. Page connections are always direct.
      agent: new https.Agent({ keepAlive: false }),
      lookup: pinnedLookup(req.hostname, req.addresses),
      minVersion: 'TLSv1.2',
      signal: req.signal,
      ...safeTls(req.tls),           // test hook (e.g. a custom CA); verification options are stripped
    }, res => {
      const remote = res.socket?.remoteAddress && normalizeIp(res.socket.remoteAddress);
      if (!remote || !allowed.has(remote)) {
        res.destroy();
        return reject(Object.assign(new Error('connected to an address that was not validated'), { code: 'EUNVALIDATED' }));
      }
      const encoding = String(res.headers['content-encoding'] || 'identity').toLowerCase().trim();
      let body = res;
      if (encoding !== 'identity' && encoding !== '') {
        const make = DECODERS[encoding];
        if (!make) {
          res.destroy();
          return reject(Object.assign(new Error(`unsupported content-encoding ${encoding}`), { code: 'EENCODING' }));
        }
        const decoder = make();
        // pipeline() destroys the socket-backed response whenever the decoded body is destroyed
        // (size cap, abort, error); a bare pipe() would leave the connection open.
        pipeline(res, decoder, () => {});
        body = decoder;
      }
      resolve({
        status: res.statusCode,
        headers: { get: name => { const v = res.headers[String(name).toLowerCase()]; return Array.isArray(v) ? v[0] : (v ?? null); } },
        body,
        remoteAddress: remote,
      });
    });
    request.on('error', reject);
    request.end();
  });
}

module.exports = { httpsTransport };
