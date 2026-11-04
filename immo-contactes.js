/* Source-bound contact history. This view never marks an email as sent or certifies a legal unit. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const money = value => Number.isFinite(value) ? new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(value) : 'À confirmer';
  const safeUrl = value => {try {const u = new URL(value,location.origin);return ['https:','http:'].includes(u.protocol) ? u.href : '';}catch {return '';}};
  const link = (label,url) => {const target=safeUrl(url);return target ? `<a href="${esc(target)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : '';};
  let properties=[],visible=[],viewerProperty=null,photoIndex=0,photoTrigger=null;
  const hasDocuments = p => p.documents.length > 0 && !p.documents.every(d=>/non joints|signalés dans/i.test(d));
  const announcement = p => p.links.find(l=>!l.url.includes('mail.google.com')&&!/dossier|email|fiche argus/i.test(l.label));
  function renderStats() {
    const values=[[properties.length,'biens dans l’historique'],[properties.filter(hasDocuments).length,'dossiers ou pièces transmis'],[properties.filter(p=>p.photos.length).length,'biens avec photographies'],[properties.filter(p=>['sold','removed','option'].includes(p.marketStatus)).length,'vendus, retirés ou sous option']];
    $('stats').innerHTML=values.map(([n,label])=>`<div><strong>${n}</strong><span>${esc(label)}</span></div>`).join('');
  }
  function tags(p) {
    return `${p.bridgePriority?`<span class="priority">Sélection BRIDGE #${p.bridgePriority}</span>`:''}<span>${esc(p.commune)}</span><span class="${['sold','removed','option'].includes(p.marketStatus)?'amber':'purple'}">${esc(p.status)}</span>${p.criteriaNotes.length?'<span class="grey">Réserve / hors sélection principale</span>':''}`;
  }
  function fallback(p) {
    const src=announcement(p);
    return `<div class="no-photo"><strong>Photographie non récupérée</strong><small>Aucune image de remplacement n’est attribuée à ce bien.</small>${src?link('Voir les photos sur la source',src.url):'<small>Adresse ou annonce exacte à confirmer.</small>'}</div>`;
  }
  function photo(p,index,cover=false) {
    return `<button type="button" class="${cover?'cover-button':''}" data-gallery="${esc(p.id)}" data-photo="${index}" aria-label="Agrandir la photo ${index+1} de ${esc(p.address)}"><img src="${esc(p.photos[index])}" alt="Photographie de l’annonce : ${esc(p.address)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">${cover?`<span class="photo-count">${p.photos.length} photo${p.photos.length>1?'s':''} · Agrandir</span>`:`<span>${index+1}</span>`}</button>`;
  }
  const block=(heading,body,extra='')=>`<section class="block ${extra}"><h3>${esc(heading)}</h3>${body}</section>`;
  function card(p) {
    const phone=p.phones[0],email=p.emails[0],source=announcement(p);
    return `<article class="property" id="${esc(p.id)}" data-property-id="${esc(p.id)}"><div class="overview"><div class="media">${p.photos.length?photo(p,0,true):fallback(p)}</div><div class="topinfo"><div class="tags">${tags(p)}</div><h2><a href="#${esc(p.id)}">${esc(p.title)}</a></h2><div class="price">${money(p.price)}<small>Prix demandé ${p.price?'· source commerciale':'non confirmé'}</small></div><div class="facts"><div><small>Surface annoncée</small>${p.surface?`${p.surface} m²`:'Non confirmée'}</div><div><small>Unités</small>${p.unitsAnnounced===null?'À confirmer':`${p.unitsAnnounced} · à vérifier`}</div><div><small>PEB annoncé</small>${esc(p.peb||'Non confirmé')}</div></div><p class="response-excerpt">${esc(p.responseSummary)}</p><div class="contact-line"><strong>${esc(p.contactName)}</strong><span>${esc(p.contactDetails)}</span></div><div class="links">${phone?`<a class="primary" href="tel:${esc(phone.replace(/\s/g,''))}">Appeler</a>`:''}${email?`<a href="mailto:${esc(email)}">Écrire</a>`:''}${source?link('Annonce / source',source.url):''}<a href="#details-${esc(p.id)}" data-expand="${esc(p.id)}">Voir tous les détails ↓</a></div><p class="evidence">Réponse : ${esc(p.responseDates)} · Dossier revu le 04/11/2026</p>${p.marketStatus==='option'?'<p class="option-note"><strong>Sous option.</strong> Cette fiche conserve l’historique ; la disponibilité doit être reconfirmée.</p>':''}</div></div><div class="body"><details class="contact-details" id="details-${esc(p.id)}"><summary>Ouvrir le dossier complet · échanges, documents et analyse</summary><div data-detail-content="${esc(p.id)}"></div></details></div></article>`;
  }
  function details(p) {
    const docs=p.documents.length?`<ul class="document-list">${p.documents.map(d=>`<li>${esc(d)}</li>`).join('')}</ul><span class="doc-status">Pièces ou liens identifiés dans la réponse. « Reçu » ne signifie pas analysé ni conforme. Les originaux restent dans la messagerie ou le transfert d’origine.</span>`:'<p>Aucune pièce jointe identifiée dans cet échange.</p>';
    const rows=[['Prix demandé',money(p.price)],...(p.previousPrice?[['Ancien prix affiché',money(p.previousPrice)]]:[]),['Surface annoncée',p.surface?`${p.surface} m²`:'Non confirmée'],...(p.totalSurface?[['Surface totale annoncée',`${p.totalSurface} m²`]]:[]),...(p.askingPricePerM2?[['Prix demandé / surface annoncée',`${money(p.askingPricePerM2)} / m² (ratio indicatif)`]]:[]),['Unités annoncées / à vérifier',p.unitsAnnounced??'Non confirmé'],['Loyers mensuels annoncés',p.monthlyRentAnnounced?money(p.monthlyRentAnnounced):'Non communiqués / non vérifiés'],...(p.cadastralIncome?[['Revenu cadastral annoncé',money(p.cadastralIncome)]]:[]),...(p.propertyTax?[['Précompte annoncé',money(p.propertyTax)]]:[]),['Référence',p.reference||'Non identifiée'],['État / travaux',p.works],['Énergie',p.peb||'Non confirmé']];
    const finance=`<span class="evidence-label">Données annoncées, non auditées</span><table class="data-table">${rows.map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table><p class="small">Aucune marge nette ou valeur de revente n’est déduite de ces seuls chiffres. Frais, travaux et situation juridique restent à vérifier.</p>`;
    const missing=[...p.criteriaNotes,...(p.uncertainties||[]),...(p.availabilityNote?[p.availabilityNote]:[]),'Vérifier les RU, permis et plans autorisés avant de conclure sur les unités légales.','Confirmer les lots vendables séparément, l’acte de base et les baux.','Pour BRIDGE : accord vendeur sur option cessible/divisible, coûts complets et estimation de chaque sortie.'];
    const sourceLinks=p.links.map(l=>`${link(l.label,l.url)}<small>${esc((()=>{try{return new URL(l.url,location.origin).hostname;}catch{return '';}})())}</small>`).join('');
    const archive=p.archiveDetails.length?`<details class="archive-section"><summary>Informations supplémentaires des fiches Argus antérieures</summary><p>Archive à recouper avec les réponses les plus récentes. Elle ne remplace pas une pièce officielle.</p>${p.archiveDetails.map(s=>`<h4>${esc(s.title)}</h4><p>${esc(s.text)}</p>`).join('')}</details>`:'';
    return `${p.photos.length?`<div class="gallery" aria-label="Photographies de ${esc(p.address)}">${p.photos.map((_,i)=>photo(p,i)).join('')}</div><p class="photo-note">${esc(p.photoDisclosure||p.photoEvidence||'Photographies issues de la source indiquée ; droits et contenu restent ceux de l’annonceur.')}</p>`:''}<div class="detailgrid">${block('Composition et surfaces',`<span class="evidence-label">Présentation commerciale / échanges</span><p>${esc(p.composition)}</p>`)}${block('Urbanisme et division',`<span class="evidence-label">Points de preuve à contrôler</span><p>${esc(p.urbanism)}</p>`)}${block('Technique, énergie et travaux',`<p>${esc(p.technical)}</p>${p.sourceFacts?.length?`<ul>${p.sourceFacts.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>`:''}`)}${block('Occupation, baux et revenus',`<p>${esc(p.occupancy)}</p>`)}${block('Données financières et références',finance)}${block('Documents et dossier reçus',docs)}${block('Historique de l’échange',`<div class="history">${p.history.map(h=>`<time>${esc(h.date)}</time><p><strong>${esc(h.type)}</strong></p><p>${esc(h.text)}</p>`).join('')}</div>`)}${block('Contact et accès aux sources',`<p><strong>${esc(p.contactName)}</strong></p><p>${esc(p.contactDetails)}</p><div class="source-list">${sourceLinks}</div>`)}${block('Réserves et prochaine vérification',`<ul>${missing.map(m=>`<li>${esc(m)}</li>`).join('')}</ul>`,'wide warning-list')}</div>${archive}<section class="block followup"><label for="note-${esc(p.id)}">Ma prochaine action / note personnelle</label><textarea id="note-${esc(p.id)}" data-note="${esc(p.id)}" placeholder="Ex. : rappeler pour les RU actualisés, confirmer une visite…"></textarea><p class="muted">Note conservée uniquement dans ce navigateur. Elle n’envoie aucun message et ne modifie pas le statut de l’agence.</p><p class="note-status" id="note-status-${esc(p.id)}" aria-live="polite"></p></section>`;
  }
  function openDetails(p) {
    const node=$('details-'+p.id);if(!node)return;
    const target=node.querySelector('[data-detail-content]');
    if(!target.dataset.loaded){target.innerHTML=details(p);target.dataset.loaded='true';const note=$('note-'+p.id);try{note.value=localStorage.getItem('argus-contact-note:'+p.id)||'';}catch{/* Storage can be disabled. */}}
    node.open=true;
  }
  function render() {
    const q=normalize($('query').value.trim()),city=$('commune').value,filter=$('status-filter').value;
    visible=properties.filter(p=>(!q||normalize(JSON.stringify(p)).includes(q))&&(!city||p.commune===city)&&(!filter||({documents:()=>hasDocuments(p),option:()=>p.marketStatus==='option',closed:()=>['sold','removed'].includes(p.marketStatus),criteria:()=>p.criteriaNotes.length>0||p.status==='Hors critères',priority:()=>!!p.bridgePriority,photos:()=>p.photos.length>0}[filter]?.()??true)));
    const order=$('sort').value;
    if(order==='priority')visible.sort((a,b)=>(a.bridgePriority||99)-(b.bridgePriority||99));
    if(order==='price')visible.sort((a,b)=>(a.price??Infinity)-(b.price??Infinity));
    if(order==='price-desc')visible.sort((a,b)=>(b.price??-Infinity)-(a.price??-Infinity));
    if(order==='city')visible.sort((a,b)=>a.commune.localeCompare(b.commune,'fr'));
    $('list').innerHTML=visible.length?visible.map(card).join(''):'<div class="empty"><strong>Aucun bien pour ces filtres.</strong><p>Essayez une autre adresse ou réinitialisez la sélection.</p></div>';
    $('status').textContent=`${visible.length} bien${visible.length>1?'s':''} affiché${visible.length>1?'s':''} sur ${properties.length} · montants et statut à confirmer auprès du contact`;
    document.querySelectorAll('.contact-details').forEach(node=>node.addEventListener('toggle',()=>{if(node.open)openDetails(properties.find(p=>'details-'+p.id===node.id));}));
  }
  function handleHash() {
    const id=decodeURIComponent(location.hash.slice(1)),key=id.replace(/^details-/,'');
    const p=properties.find(p=>p.id===key);if(!p)return;
    if(!$(p.id)){$('query').value='';$('commune').value='';$('status-filter').value='';render();}
    openDetails(p);$(id||p.id)?.scrollIntoView({block:'start'});
  }
  function showPhoto() {
    const urls=viewerProperty.photos;photoIndex=(photoIndex+urls.length)%urls.length;
    $('photo-label').textContent=`${viewerProperty.title} · ${photoIndex+1} / ${urls.length}`;
    $('photo-error').hidden=true;$('photo-image').hidden=false;
    $('photo-image').src=urls[photoIndex];$('photo-image').alt=`Photo ${photoIndex+1} de ${viewerProperty.address}`;
    $('photo-original').href=urls[photoIndex];
    $('photo-disclosure').textContent=viewerProperty.photoDisclosure||'Photographie publiée par la source de l’annonce. Vérifier les finitions et l’état réel lors de la visite.';
  }
  document.addEventListener('click',event=>{
    const gallery=event.target.closest('[data-gallery]');
    if(gallery){viewerProperty=properties.find(p=>p.id===gallery.dataset.gallery);photoIndex=Number(gallery.dataset.photo)||0;photoTrigger=gallery;showPhoto();if(!$('photo-viewer').open)$('photo-viewer').showModal();return;}
    const expand=event.target.closest('[data-expand]');if(expand)openDetails(properties.find(p=>p.id===expand.dataset.expand));
  });
  document.addEventListener('error',event=>{
    if(event.target.id==='photo-image'){$('photo-error').hidden=false;$('photo-image').hidden=true;return;}
    const cover=event.target.closest?.('.cover-button');
    if(cover){const p=properties.find(p=>p.id===cover.dataset.gallery);cover.parentElement.innerHTML=fallback(p);}
    else if(event.target.matches?.('.gallery img')){event.target.alt='Photo non disponible';}
  },true);
  document.addEventListener('input',event=>{
    if(event.target.matches('[data-note]')){const id=event.target.dataset.note;try{localStorage.setItem('argus-contact-note:'+id,event.target.value);$('note-status-'+id).textContent='Note enregistrée dans ce navigateur.';}catch{$('note-status-'+id).textContent='Enregistrement local indisponible. Copiez votre note pour la conserver.';}}
  });
  $('filters').addEventListener('submit',event=>event.preventDefault());
  for(const id of ['query','commune','status-filter','sort'])$(id).addEventListener(id==='query'?'input':'change',render);
  $('reset').addEventListener('click',()=>{$('filters').reset();render();});
  $('photo-close').onclick=()=>$('photo-viewer').close();
  $('photo-viewer').addEventListener('close',()=>photoTrigger?.isConnected&&photoTrigger.focus());
  $('photo-prev').onclick=()=>{photoIndex--;showPhoto();};$('photo-next').onclick=()=>{photoIndex++;showPhoto();};
  $('photo-viewer').addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();photoIndex+=event.key==='ArrowLeft'?-1:1;showPhoto();}});
  $('export').onclick=()=>{
    const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),properties:visible},null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ARGUS_IMMO_Contactes_2026-11-04.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  window.addEventListener('hashchange',handleHash);
  async function load(){
    try{
      const r=await fetch('/data/immo-contactes.json',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);
      const data=await r.json();if(!Array.isArray(data.properties))throw Error('Format de données inattendu');
      properties=data.properties;
      $('commune').innerHTML='<option value="">Toutes les communes</option>'+[...new Set(properties.map(p=>p.commune))].sort((a,b)=>a.localeCompare(b,'fr')).map(city=>`<option value="${esc(city)}">${esc(city)}</option>`).join('');
      renderStats();render();$('export').disabled=false;handleHash();
    }catch(error){$('status').textContent='Les dossiers n’ont pas pu être chargés.';$('list').innerHTML='<div class="empty"><p>Le relevé est momentanément inaccessible. Aucun dossier n’a été supprimé.</p><button type="button" class="retry">Réessayer</button></div>';$('list').querySelector('.retry').onclick=load;}
  }
  load();
})();
