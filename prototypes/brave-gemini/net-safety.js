// SSRF guards, DNS pinning and a minimal robots.txt parser. Pure functions, no network.
const net = require('node:net');

function ipv4ToInts(ip) {
  const p = ip.split('.').map(Number);
  return p.length === 4 && p.every(n => Number.isInteger(n) && n >= 0 && n <= 255) ? p : null;
}

function isPrivateIpv4(ip) {
  const p = ipv4ToInts(ip);
  if (!p) return true; // unparseable: refuse
  const [a, b, c] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||                 // CGNAT
    (a === 169 && b === 254) ||                           // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||                             // 192.0.0.0/24 and TEST-NET-1
    (a === 198 && (b === 18 || b === 19)) ||              // benchmarking
    (a === 198 && b === 51 && c === 100) ||               // TEST-NET-2
    (a === 203 && b === 0 && c === 113) ||                // TEST-NET-3
    a >= 224                                              // multicast / reserved
  );
}

// "::ffff:1.2.3.4" and "::ffff:102:304" -> "1.2.3.4"; anything else unchanged (lower-cased).
function normalizeIp(ip) {
  const v = String(ip).toLowerCase();
  const dotted = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];
  const hex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return v;
}

function isPrivateIp(ip) {
  const v = normalizeIp(ip);
  const family = net.isIP(v);
  if (family === 4) return isPrivateIpv4(v);
  if (family === 6) {
    if (v === '::' || v === '::1') return true;
    return (
      /^f[cd]/.test(v) ||            // unique local
      /^fe[89ab]/.test(v) ||         // link-local
      v.startsWith('ff') ||          // multicast
      v.startsWith('2001:db8') ||    // documentation
      v.startsWith('64:ff9b') ||     // NAT64: embeds an IPv4 address
      v.startsWith('2002:')          // 6to4: embeds an IPv4 address
    );
  }
  return true; // not an IP: refuse
}

// A dns.lookup replacement that can only ever answer with the already-validated addresses,
// so the socket connects to exactly the IP we checked (no second, possibly different, DNS
// answer: DNS rebinding). TLS still verifies the certificate against the real hostname,
// because the https request keeps `hostname` and only the address resolution is pinned.
function pinnedLookup(expectedHostname, addresses) {
  const pinned = addresses.map(a => ({ address: a.address, family: a.family || net.isIP(a.address) }));
  return function lookup(hostname, options, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }
    if (String(hostname).toLowerCase() !== expectedHostname.toLowerCase()) {
      return process.nextTick(callback, Object.assign(new Error(`pinned lookup refused host ${hostname}`), { code: 'EPINNED' }));
    }
    const family = options?.family;
    const usable = family === 4 || family === 6 ? pinned.filter(a => a.family === family) : pinned;
    if (usable.length === 0) return process.nextTick(callback, Object.assign(new Error('no pinned address for requested family'), { code: 'EPINNED' }));
    if (options?.all) return process.nextTick(callback, null, usable.map(a => ({ ...a })));
    return process.nextTick(callback, null, usable[0].address, usable[0].family);
  };
}

// robots.txt: group for our token, else "*". Longest matching rule wins; Allow wins ties.
function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && current) {
      lastWasAgent = false;
      if (value) current.rules.push({ allow: key === 'allow', path: value });
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function robotsAllows(groups, userAgent, urlPath) {
  const token = userAgent.split('/')[0].toLowerCase();
  const group = groups.find(g => g.agents.some(a => a !== '*' && token.includes(a))) || groups.find(g => g.agents.includes('*'));
  if (!group) return true;
  let best = null;
  for (const rule of group.rules) {
    const pattern = rule.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
    if (new RegExp('^' + pattern).test(urlPath)) {
      if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) best = rule;
    }
  }
  return best ? best.allow : true;
}

module.exports = { isPrivateIp, normalizeIp, pinnedLookup, parseRobots, robotsAllows };
