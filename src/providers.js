(function () {
  async function demo() {
    const response = await fetch('data/demo-matches.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Demo feed unavailable');
    return response.json();
  }

  async function live() {
    const endpoint = window.ARGUS_LIVE_ENDPOINT || '/api/live';
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Live endpoint error ${response.status}`);
    }

    const matches = Array.isArray(payload) ? payload : payload.matches || [];
    matches.meta = payload.meta || null;
    return matches;
  }

  async function health() {
    const endpoint = window.ARGUS_LIVE_ENDPOINT || '/api/live';
    try {
      const response = await fetch(endpoint, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) return { ready: false };
      const payload = await response.json();
      return { ready: true, meta: payload.meta || null, matches: payload.matches || [] };
    } catch (_) {
      return { ready: false };
    }
  }

  window.ArgusProviders = { demo, live, health };
})();
