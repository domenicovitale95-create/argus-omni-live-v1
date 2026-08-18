/* ARGUS OMNI — human-facing copy and interaction polish. Engine logic stays untouched. */
(() => {
  const replacements = new Map([
    ['BET THIS','Suggested bet'],
    ['ARGUS SUGGESTS','ARGUS suggests'],
    ['CONFIDENCE · HOW SURE?','Confidence'],
    ['VALUE ADVANTAGE','Price value'],
    ['WHY THIS PICK?','Why this pick?'],
    ['WHAT TO BET','Suggested bet'],
    ['ARGUS CONFIDENCE','Confidence'],
    ['BET SIGNAL','Worth considering'],
    ['WAIT','Wait'],
    ['SKIP','Skip'],
    ['NO DATA LOADED','Ready when you are'],
    ['NO BET RIGHT NOW','No strong opportunity right now'],
    ['CHECKING…','Reviewing matches…'],
    ['CONNECTED','Fresh data'],
    ['CACHED','Recent data'],
    ['CACHE READY','Recent data ready'],
    ['READY','Ready'],
    ['ERROR','Data unavailable']
  ]);

  const verdictCopy = (text) => {
    if (!text) return text;
    if (text.includes('PRIME · STRONGEST')) return text.replace('🟢 PRIME · STRONGEST','PRIME · Best opportunity');
    if (text.includes('VALUE · INTERESTING')) return text.replace('🔵 VALUE · INTERESTING','VALUE · Interesting price');
    if (text.includes('WATCH · WAIT')) return text.replace('🟠 WATCH · WAIT','WATCH · Worth monitoring');
    if (text.includes('NO BET · SKIP')) return text.replace('⚫ NO BET · SKIP','NO BET · Better to skip');
    return text;
  };

  function polishText(root=document) {
    root.querySelectorAll('span,strong,small,b,button,p').forEach(el => {
      if (el.children.length) return;
      const raw = (el.textContent || '').trim();
      if (!raw) return;
      if (replacements.has(raw)) el.textContent = replacements.get(raw);
      else {
        const refined = verdictCopy(raw);
        if (refined !== raw) el.textContent = refined;
      }
    });
  }

  function polishEmptyStates() {
    const grid = document.getElementById('matchGrid');
    if (!grid) return;
    const empty = grid.querySelector('.empty-state');
    if (!empty) return;
    const strong = empty.querySelector('strong');
    const span = empty.querySelector('span');
    if (strong?.textContent.trim() === 'Ready when you are' && span) {
      span.textContent = "ARGUS can review today's available matches and surface only the decisions worth your attention.";
    }
  }

  function markFreshness() {
    const update = document.getElementById('lastUpdate');
    if (!update) return;
    const t = update.textContent || '';
    update.classList.toggle('human-fresh', /^Updated /.test(t));
  }

  function run() {
    polishText();
    polishEmptyStates();
    markFreshness();
  }

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; run(); });
  });

  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  run();
})();
