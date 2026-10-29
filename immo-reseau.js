(()=>{
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safe=v=>{try{const u=new URL(v,location.origin);return u.protocol==='https:'||(u.origin===location.origin&&u.protocol==='http:')?u.href:''}catch{return ''}};
  const fold=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
  const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)?v.split('-').reverse().join('/'):'Date non renseignée';
  const kinds={agency:'Agence immobilière',network:'Réseau immobilier',management:'Gestion immobilière',association:'Association',unidentified:'Interlocuteur à compléter',platform:'Plateforme de recherche'};
  const statuses=['À contacter','Contacté','À relancer','Relation établie'];
  const $=id=>document.getElementById(id);
  let rows=[],saved={};
  try{const value=JSON.parse(localStorage.getItem('argus-network-v1')||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))saved=value}catch{}
  const missing=r=>!r.phones.length||!r.emails.length;
  const phone=p=>{const value=String(p).replace(/[^+0-9]/g,'');return /^\+?\d{8,15}$/.test(value)?'<a href="tel:'+esc(value)+'">'+esc(p)+'</a>':''};
  const email=e=>/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(e)?'<a href="mailto:'+esc(e)+'">'+esc(e)+'</a>':'';
  const link=(u,label)=>{const href=safe(u);return href?'<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>':esc(label)};
  function matches(r){
    const q=fold($('search').value).trim(),f=$('filter').value;
    const hay=fold([r.name,...r.people,...r.phones,...r.emails,...r.properties.map(x=>x.id+' '+x.name),...r.history.map(x=>x.text)].join(' '));
    return (!q||hay.includes(q))&&(f==='all'||f==='contacted'&&r.status==='contacted'||f==='unconfirmed'&&r.status!=='contacted'||f==='missing'&&missing(r)||f==='agency'&&r.kind==='agency'||f==='other'&&r.kind!=='agency');
  }
  function contactCell(r){
    const persons=r.personContacts||[];
    const direct=persons.map(p=>'<div class="contact-person"><b>'+esc(p.name)+'</b>'+phone(p.phone)+email(p.email)+'<span class="person-proof">'+esc(p.proof)+'</span></div>').join('');
    const usedP=new Set(persons.map(p=>p.phone.replace(/[^0-9]/g,''))),usedE=new Set(persons.map(p=>p.email.toLowerCase()));
    const ps=r.phones.filter(p=>!usedP.has(p.replace(/[^0-9]/g,''))),es=r.emails.filter(e=>!usedE.has(e.toLowerCase()));
    return direct+'<div class="agency-coordinates">'+(direct&&(ps.length||es.length)?'<b>Autres coordonnées de l’agence</b>':'')+ps.map(phone).join('')+es.map(email).join('')+(!r.phones.length?'<p class="missing-text">Téléphone à compléter</p>':'')+(!r.emails.length?'<p class="missing-text">E-mail à compléter · utiliser le site source</p>':'')+'</div>';
  }
  function details(r){
    const sources=r.sources.map(s=>'<li>'+link(s.url,s.label)+'</li>').join('');
    const properties=r.properties.map(p=>'<li>'+link(p.url,p.id+' · '+p.name)+(p.stage?' · '+esc(p.stage):'')+'</li>').join('');
    const history=r.history.map(h=>'<li><b>'+esc(date(h.date))+'</b> · '+esc(h.text)+'</li>').join('');
    const follow=r.emails.map(e=>'<label>'+esc(e)+'<br><select data-contact="'+esc(e)+'" aria-label="Suivi personnel pour '+esc(e)+'"><option value="">Non renseigné</option>'+statuses.map(s=>'<option value="'+esc(s)+'"'+(saved[e]===s?' selected':'')+'>'+esc(s)+'</option>').join('')+'</select></label>').join('<br>');
    return '<details class="agency-details"><summary>Historique, biens associés et sources'+(r.properties.length?' · '+r.properties.length+' dossier'+(r.properties.length>1?'s':''):'')+'</summary><div class="detail-grid"><div><h3>Historique retrouvé</h3><ul>'+history+'</ul>'+(properties?'<h3>Biens associés</h3><ul>'+properties+'</ul>':'')+(r.notes.length?'<h3>Précisions</h3><ul>'+r.notes.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul>':'')+'</div><div><h3>Sources</h3><ul>'+sources+'</ul>'+(follow?'<h3>Votre suivi personnel</h3><p class="muted-text">Sauvegardé sur ce navigateur. Distinct de l’historique confirmé ci-contre.</p>'+follow:'')+'</div></div></details>';
  }
  function render(){
    const filtered=rows.filter(matches);
    $('status').textContent=filtered.length+' fiche'+(filtered.length>1?'s':'')+' affichée'+(filtered.length>1?'s':'')+' sur '+rows.length+' · mise à jour du 29/10/2026';
    if(!filtered.length){$('contacts').innerHTML='<div class="empty">Aucun contact ne correspond à ces filtres.<br><button type="button" id="reset">Afficher tout le répertoire</button></div>';return}
    $('contacts').innerHTML='<div class="directory-heading" aria-hidden="true"><span>AGENCE / INTERLOCUTEUR</span><span>TÉLÉPHONE & E-MAIL</span><span>CE QUI A DÉJÀ ÉTÉ FAIT</span></div>'+filtered.map(r=>{
      const confirmed=r.status==='contacted';const h=[...r.history].reverse().find(x=>x.date)||r.history[0];
      return '<article class="agency-row'+(confirmed?' is-contacted':'')+'" id="contact-'+esc(r.id)+'"><div><span class="kind">'+esc(kinds[r.kind]||'Contact immobilier')+'</span><h2>'+esc(r.name)+'</h2>'+(r.people.length?'<p class="contact-names">'+esc(r.people.join(' · '))+'</p>':'<p class="muted-text">Personne à identifier</p>')+'<span class="tag'+(confirmed?' confirmed':'')+'">'+(confirmed?'✓ Contact confirmé':'Contact non confirmé')+'</span>'+(missing(r)?' <span class="tag missing">À compléter</span>':'')+'</div><div>'+contactCell(r)+'</div><div>'+(h.date?'<span class="latest-date">'+esc(date(h.date))+'</span>':'')+'<p>'+esc(h.text)+'</p>'+(r.properties.length?'<p class="muted-text">'+esc(r.properties.slice(0,2).map(p=>p.name).join(' · '))+(r.properties.length>2?' · +'+(r.properties.length-2)+' autres':'')+'</p>':'')+'</div>'+details(r)+'</article>';
    }).join('');
  }
  $('filters').addEventListener('submit',e=>e.preventDefault());
  $('search').addEventListener('input',render);$('filter').addEventListener('change',render);
  $('contacts').addEventListener('click',e=>{if(e.target.id==='reset'){$('search').value='';$('filter').value='all';render();$('search').focus()}});
  $('contacts').addEventListener('change',e=>{
    const key=e.target.dataset.contact;if(!key)return;
    if(e.target.value&&!statuses.includes(e.target.value))return;
    saved[key]=e.target.value;
    try{localStorage.setItem('argus-network-v1',JSON.stringify(saved))}catch{$('status').textContent='Le navigateur ne permet pas de sauvegarder le suivi personnel.'}
  });
  fetch('/data/immo-network.json?v=20261029',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('load');return r.json()}).then(data=>{
    if(!Array.isArray(data.contacts))throw Error('format');rows=data.contacts;
    rows.sort((a,b)=>(a.status!=='contacted')-(b.status!=='contacted')||a.name.localeCompare(b.name,'fr'));
    $('summary').innerHTML='<div><b>'+rows.length+'</b><span>fiches au répertoire</span></div><div><b>'+rows.filter(r=>r.status==='contacted').length+'</b><span>contacts confirmés</span></div><div><b>'+rows.filter(missing).length+'</b><span>fiches à compléter</span></div>';
    render();
  }).catch(()=>{$('status').textContent='Le répertoire n’a pas pu être chargé. Rechargez la page pour réessayer.'});
})();
