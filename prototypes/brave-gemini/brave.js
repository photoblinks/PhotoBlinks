// Brave Search client behind a per-location limiter. The cap is enforced HERE, on every
// search() call (cache hits included), so no caller can exceed it. No retries: a retry is a
// second billable search.
const cfg = require('./config');

const BRAVE_URL = 'https://api.search.brave.com/res/v1/web/search';

class SearchLimitError extends Error {
  constructor(max) {
    super(`Search limit reached: at most ${max} searches per location.`);
    this.name = 'SearchLimitError';
  }
}

async function braveSearch(query, { apiKey, fetchImpl = fetch, signal }) {
  const url = new URL(BRAVE_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(cfg.SEARCH_RESULTS_PER_QUERY));
  url.searchParams.set('country', 'IN');
  const res = await fetchImpl(url.href, {
    method: 'GET',
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
    redirect: 'error', // never forward the API key header to another host
    signal: AbortSignal.any([AbortSignal.timeout(cfg.SEARCH_TIMEOUT_MS), ...(signal ? [signal] : [])]),
  });
  if (!res.ok) {
    const err = new Error(`Brave Search HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return (data.web?.results || [])
    .filter(r => r && typeof r.url === 'string')
    .map(r => ({ title: String(r.title || ''), url: r.url, description: String(r.description || '') }));
}

function createSearcher({ apiKey, fetchImpl, cache, tracker, signal, maxSearches = cfg.MAX_SEARCHES_PER_LOCATION }) {
  // The option can only LOWER the cap.
  const cap = Math.min(maxSearches, cfg.MAX_SEARCHES_PER_LOCATION);
  const stats = { calls: 0, networkSearches: 0, cacheHits: 0 };

  return {
    stats,
    async search(query) {
      if (stats.calls >= cap) throw new SearchLimitError(cap);
      stats.calls++;

      const cached = cache.get('search', query);
      if (cached) {
        stats.cacheHits++;
        tracker.totals.cacheHits++;
        return { results: cached, cached: true };
      }

      const reservation = await tracker.reserveAsync('brave', tracker.braveCostInr); // reserved BEFORE the call; throws BudgetError
      stats.networkSearches++;
      tracker.totals.braveSearches++;
      try {
        const results = await braveSearch(query, { apiKey, fetchImpl, signal });
        cache.set('search', query, results);
        return { results, cached: false };
      } finally {
        // Assume billed even on failure or abort (conservative); confirmed right away.
        await tracker.settleAsync(reservation, tracker.braveCostInr);
      }
    },
  };
}

module.exports = { createSearcher, SearchLimitError, braveSearch };
