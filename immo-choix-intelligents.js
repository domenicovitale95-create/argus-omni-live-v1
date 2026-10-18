(() => {
  'use strict';
  const list = document.getElementById('smart-list');
  const status = document.getElementById('smart-status');
  const buttons = [...document.querySelectorAll('[data-filter]')];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money = value => new Intl.NumberFormat('fr-BE', {style:'currency', currency:'EUR', maximumFractionDigits:0}).format(value);
  const url = value => { try { const parsed = new URL(value); return parsed.protocol === 'https:' ? parsed.href : ''; } catch { return ''; } };
  let rows = [];
  let filter = 'all';
  function render() {
    const visible = rows.filter(row => filter !== 'priority' || row.priority);
    list.innerHTML = visible.map(row => `<article class="choice ${row.priority ? 'choice-priority' : ''}">
      <div class="choice-heading"><div class="choice-rank" aria-label="Rang ${row.rank}">${row.rank}</div><div class="choice-heading-main"><div class="tags"><span class="${row.rank > 6 ? 'reserve' : ''}">${escape(row.verdict)}</span></div><h2>${escape(row.name)}</h2><div class="choice-location">${escape(row.city)}</div></div><div class="choice-price"><small>${escape(row.pricePrefix || 'Prix affiché')}</small>${money(row.price)}</div></div>
      <p class="choice-reason">${escape(row.reason)}</p>
      <div class="choice-facts"><span>${escape(row.units)}</span><span>${escape(row.surface)}</span><span>PEB : ${escape(row.peb)}</span></div>
      <p class="choice-watch"><b>À vérifier :</b> ${escape(row.risk)}</p>
      <div class="choice-actions"><a class="choice-link" href="${escape(url(row.url))}" target="_blank" rel="noopener noreferrer">Voir l’annonce ↗</a><span class="muted" style="font-size:12px">Option : accord du vendeur à obtenir</span></div>
      <details><summary>Voir l’analyse du dossier</summary><div class="choice-detail"><div><h3>Composition</h3><p>${escape(row.composition)}</p></div><div><h3>Prochaine étape</h3><p>${escape(row.next)}</p></div></div>${row.additionalSource ? `<a class="choice-source" href="${escape(url(row.additionalSource))}" target="_blank" rel="noopener noreferrer">Consulter l’avis communal de 2019 ↗</a>` : ''}<a class="choice-source" href="${escape(url(row.url))}" target="_blank" rel="noopener noreferrer">Source : ${escape(new URL(row.url).hostname)} ↗</a></details>
    </article>`).join('');
    status.textContent = `${visible.length} dossier${visible.length > 1 ? 's' : ''} affiché${visible.length > 1 ? 's' : ''} · classement du 18/10/2026`;
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
  }
  buttons.forEach(button => button.addEventListener('click', () => {filter = button.dataset.filter; render();}));
  async function load() {
    try {
      const response = await fetch('/data/immo-smart-choices.json', {cache:'no-store'});
      if (!response.ok) throw new Error('Selection unavailable');
      const data = await response.json();
      if (!Array.isArray(data.listings) || data.listings.length !== 10) throw new Error('Invalid selection');
      rows = data.listings.slice().sort((a,b) => a.rank - b.rank);
      render();
    } catch {
      status.textContent = 'La sélection ne peut pas être chargée pour le moment.';
      list.innerHTML = '<div class="empty"><p>Réessayez de charger les dix dossiers.</p><button type="button" id="smart-retry">Réessayer</button></div>';
      document.getElementById('smart-retry').addEventListener('click', load);
    }
  }
  load();
})();
