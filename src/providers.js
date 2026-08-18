(function () {
  async function demo() {
    const response = await fetch('data/demo-matches.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Demo feed unavailable');
    return response.json();
  }

  async function live() {
    const endpoint = window.ARGUS_LIVE_ENDPOINT;
    if (!endpoint) throw new Error('No live endpoint configured');

    const response = await fetch(endpoint, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`Live endpoint error ${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload) ? payload : payload.matches || [];
  }

  window.ArgusProviders = { demo, live };
})();
