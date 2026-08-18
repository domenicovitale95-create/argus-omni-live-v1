(() => {
  const STORAGE_KEY = 'argus-omni:last-valid-board:v1';
  const providers = window.ArgusProviders;
  if (!providers) return;

  function save(matches) {
    if (!Array.isArray(matches) || matches.length === 0) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        savedAt: new Date().toISOString(),
        matches: Array.from(matches),
        meta: matches.meta || null
      }));
    } catch (_) {}
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed?.matches) || parsed.matches.length === 0) return null;
      const matches = parsed.matches.slice();
      matches.meta = {
        ...(parsed.meta || {}),
        clientCache: true,
        persistentCache: true,
        cachedAt: parsed.savedAt || null
      };
      return matches;
    } catch (_) {
      return null;
    }
  }

  const originalLive = providers.live?.bind(providers);
  if (originalLive) {
    providers.live = async function persistentLive(options = {}) {
      try {
        const fresh = await originalLive(options);
        if (Array.isArray(fresh) && fresh.length > 0) {
          save(fresh);
          return fresh;
        }
        const cached = load();
        return cached || fresh;
      } catch (error) {
        const cached = load();
        if (cached) return cached;
        throw error;
      }
    };
  }

  const originalHealth = providers.health?.bind(providers);
  if (originalHealth) {
    providers.health = async function persistentHealth(...args) {
      try {
        const status = await originalHealth(...args);
        if (Array.isArray(status?.matches) && status.matches.length > 0) {
          const matches = status.matches.slice();
          matches.meta = status.meta || null;
          save(matches);
          return status;
        }
        const cached = load();
        if (cached) {
          return {
            ...status,
            cached: true,
            matches: Array.from(cached),
            meta: cached.meta
          };
        }
        return status;
      } catch (error) {
        const cached = load();
        if (cached) {
          return { cached: true, matches: Array.from(cached), meta: cached.meta, fallbackError: error.message };
        }
        throw error;
      }
    };
  }

  providers.lastPersistentBoard = load;

  // Remove the legacy dynamically injected report link. The real navigation
  // already contains the canonical COMPTE RENDU button.
  const removeLegacyReportLink = () => {
    const legacy = document.getElementById('predictionReportLink');
    if (legacy) legacy.remove();
  };
  removeLegacyReportLink();
  const navObserver = new MutationObserver(removeLegacyReportLink);
  navObserver.observe(document.documentElement, { childList: true, subtree: true });
})();
