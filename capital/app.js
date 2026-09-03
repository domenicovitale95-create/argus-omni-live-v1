const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const fmtEur=n=>new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n||0);
const fmtPct=n=>n==null?'—':(n>0?'+':'')+Number(n).toFixed(1)+'%';
const cls=s=>/ACCUMULATE|ATTRACTIVE|POSITIVE/.test(s||'')?'good':/RISK|DEFENSIVE|AVOID/.test(s||'')?'risk':/WATCH|CAUTION|WAIT/.test(s||'')?'watch':'neutral';
let DATA=null, CONFIG=null, TRACK=null, MODE='simple';

async function loadJSON(path){
  const sep=path.includes('?')?'&':'?';
  const r=await fetch(path+sep+'v='+Date.now(),{cache:'no-store'});
  if(!r.ok) throw new Error(path+' '+r.status);
  return r.json();
}
function setText(id,v){const e=$(id);if(e)e.textContent=v??'—'}
function cardMove(x){
  const move=x.move!=null?fmtPct(x.move):x.move_pp!=null?((x.move_pp>0?'+':'')+x.move_pp.toFixed(2)+' pp'):'—';
  return '<div class="changed-item"><div class="move '+(String(move).startsWith('-')?'risk':'blue')+'">'+move+'</div><div><b>'+x.event+'</b><p>'+x.why_it_matters+'</p></div></div>'
}
function renderTop(){
  const g=DATA.global_market||{}, t=DATA.today||{}, q=DATA.data_quality||{};
  setText('#marketStatus',g.status); $('#marketStatus').className='status-word '+cls(g.status);
  setText('#marketScore',g.score==null?'—':g.score+'/100');
  const ring=$('#scoreRing'); if(ring) ring.style.setProperty('--pct',(g.score||0)+'%');
  setText('#marketTrend',g.trend); setText('#marketRegime',g.regime); setText('#dataQuality',q.state+' · '+q.coverage_pct+'%');
  const b=t.best_opportunity||{}; setText('#bestAsset',b.asset||'DATA UNAVAILABLE'); setText('#bestScore',b.score==null?'—':b.score+'/100'); setText('#bestStatus',b.status||'WAIT');
  setText('#dailyAction',t.action||'WAIT / REVIEW');
  const r=t.biggest_risk||{}; setText('#riskTitle',r.title||'DATA UNAVAILABLE'); setText('#riskDetail',r.detail||'No verified risk summary available.');
  $('#changed').innerHTML=(t.what_changed||[]).map(cardMove).join('')||'<div class="empty">DATA UNAVAILABLE</div>';
}
function renderRanking(){
  const rows=(DATA.ranking||[]).slice(0,8);
  $('#ranking').innerHTML=rows.map((r,i)=>'<div class="rank-row"><div class="rank-n">#'+(i+1)+'</div><div class="rank-label"><b>'+r.label+'</b><span>'+r.status+' · evidence '+r.evidence+'</span></div><div class="rank-score">'+r.score+'</div><span class="badge '+cls(r.status)+'">'+r.status+'</span></div>').join('')||'<div class="empty">DATA INSUFFICIENT</div>';
}
function renderIdeas(){
  const ideas=DATA.today?.top_ideas||[];
  $('#ideas').innerHTML=ideas.length?ideas.map((x,i)=>'<article class="panel idea"><div class="idea-top"><div><div class="label">#'+(i+1)+' · '+(x.ucits_candidate?'UCITS CANDIDATE '+x.ucits_candidate:'ASSET')+'</div><h3>'+x.asset+'</h3><span class="badge '+cls(x.action)+'">'+x.action+'</span></div><div class="idea-score">'+x.score+'<span class="muted" style="font-size:10px">/100</span></div></div><ul>'+x.why.map(w=>'<li>'+w+'</li>').join('')+'</ul><div class="riskbox"><b>WHAT COULD GO WRONG?</b><p>'+x.risks.join(' · ')+'</p></div><div class="raw" style="margin-top:10px"><p><b>Entry:</b> '+x.entry_approach+'</p><p><b>Invalidation:</b> '+x.invalidation+'</p><p><b>Evidence:</b> '+x.evidence_quality+' · '+x.data_date+'</p></div></article>').join(''):'<div class="empty">NO HIGH-CONVICTION OPPORTUNITY TODAY. WAIT / CASH CAN BE RATIONAL.</div>';
}
function renderPulse(){
  const ids=['global_equity','sp500','nasdaq','europe','emerging','gold','treasuries','corp_bonds'];
  $('#pulse').innerHTML=ids.map(id=>{const m=DATA.market?.[id]||{}; return '<div class="card"><div class="label">'+(m.label||id)+'</div><div class="value">'+(m.price??'—')+'</div><p>1D '+fmtPct(m.ret_1d)+' · 3M '+fmtPct(m.ret_3m)+'</p><p class="raw">200DMA '+fmtPct(m.distance_200dma)+' · Vol '+fmtPct(m.vol_20d_ann)+' · '+(m.data_type||'')+'</p></div>'}).join('');
  const mids=['vix','us10y','us2y','dollar','ecb_deposit','btc'];
  $('#macroPulse').innerHTML=mids.map(id=>{const m=DATA.macro?.[id]||{}; return '<div class="card"><div class="label">'+(m.label||id)+'</div><div class="value">'+(m.price??'—')+(m.unit==='%'?'%':'')+'</div><p>'+((m.last_update||'DATA UNAVAILABLE'))+'</p></div>'}).join('');
}
function renderETF(){
  const etfs=CONFIG?.etfs||[];
  $('#etfs').innerHTML=etfs.map(e=>'<div class="card"><div class="label">'+e.role+'</div><h3>'+e.ticker+' · '+e.name+'</h3><p>'+e.isin+' · TER '+e.ter.toFixed(2)+'% · '+e.income+' · '+e.domicile+'</p><p class="raw">'+e.benchmark+' · '+e.replication+' · verified '+e.verified_on+'</p></div>').join('');
}
function renderSources(){
  const src=DATA.sources||{};
  $('#sources').innerHTML=Object.entries(src).map(([k,v])=>'<div class="source"><div><b>'+k.toUpperCase()+'</b><span>'+v+'</span></div><span>'+DATA.generated_at?.slice(0,16).replace('T',' ')+' UTC</span></div>').join('');
  const q=DATA.data_quality||{}; setText('#qualityRules',(q.rules||[]).join(' · '));
  if(TRACK){setText('#trackEvaluated',TRACK.evaluated_signals??0);setText('#trackHit',TRACK.hit_rate_positive_pct==null?'—':TRACK.hit_rate_positive_pct+'%');setText('#trackAvg',TRACK.average_return_to_latest_pct==null?'—':fmtPct(TRACK.average_return_to_latest_pct))}
}
function fv(cap,monthly,years,annual){
  const r=Math.pow(1+annual/100,1/12)-1,n=Math.round(years*12);
  return cap*Math.pow(1+r,n)+(r===0?monthly*n:monthly*((Math.pow(1+r,n)-1)/r));
}
function runSim(){
  const cap=+$('#simCap').value||0, mon=+$('#simMonthly').value||0, yrs=Math.max(1,+$('#simYears').value||1), base=+$('#simReturn').value||0, infl=+$('#simInfl').value||0, fee=+$('#simFee').value||0;
  const rates=[Math.max(-20,base-4)-fee,base-fee,base+4-fee], names=['CONSERVATIVE','BASE','OPTIMISTIC'];
  $('#simResults').innerHTML=rates.map((r,i)=>{const nominal=fv(cap,mon,yrs,r), real=nominal/Math.pow(1+infl/100,yrs);return '<div class="scenario"><b>'+names[i]+'</b><strong>'+fmtEur(nominal)+'</strong><span>assumption '+r.toFixed(1)+'% net/yr · real '+fmtEur(real)+'</span></div>'}).join('');
  const crashes=[10,20,30,40,50]; $('#crashGrid').innerHTML=crashes.map(x=>{const v=cap*(1-x/100),rec=(1/(1-x/100)-1)*100;return '<div class="crash"><b>-'+x+'%</b><span>'+fmtEur(v)+'</span><span>recovery +'+rec.toFixed(1)+'%</span></div>'}).join('');
}
function holdings(){try{return JSON.parse(localStorage.getItem('argusCapitalHoldings')||'[]')}catch{return []}}
function saveHoldings(x){localStorage.setItem('argusCapitalHoldings',JSON.stringify(x));renderPortfolio()}
function addHolding(){const x=holdings();x.push({id:(CONFIG?.etfs?.[0]?.id||'vwce'),amount:1000});saveHoldings(x)}
function renderPortfolio(){
  const x=holdings(), etfs=CONFIG?.etfs||[], total=x.reduce((a,b)=>a+(+b.amount||0),0);
  $('#holdingList').innerHTML=x.map((h,i)=>'<div class="holding"><select data-i="'+i+'" class="h-id">'+etfs.map(e=>'<option value="'+e.id+'" '+(e.id===h.id?'selected':'')+'>'+e.ticker+' · '+e.role+'</option>').join('')+'</select><input data-i="'+i+'" class="h-amount" type="number" value="'+h.amount+'" min="0"><button data-i="'+i+'" class="h-del">×</button></div>').join('')||'<div class="empty">Ajoute tes positions manuellement. Elles restent uniquement dans ton navigateur.</div>';
  $$('.h-id').forEach(e=>e.onchange=()=>{x[+e.dataset.i].id=e.value;saveHoldings(x)}); $$('.h-amount').forEach(e=>e.onchange=()=>{x[+e.dataset.i].amount=+e.value;saveHoldings(x)}); $$('.h-del').forEach(e=>e.onclick=()=>{x.splice(+e.dataset.i,1);saveHoldings(x)});
  const weights=x.map(h=>(+h.amount||0)/(total||1)); const hhi=weights.reduce((a,w)=>a+w*w,0); const maxW=Math.max(0,...weights)*100;
  let fee=0,known=0; x.forEach(h=>{const e=etfs.find(z=>z.id===h.id);if(e){fee+=(+h.amount||0)*e.ter;known+=(+h.amount||0)}});fee=known?fee/known:null;
  const ids=x.map(h=>h.id); const overlap=(ids.includes('vwce')||ids.includes('iwda'))&&(ids.includes('sxr8')||ids.includes('eqqx')||ids.includes('vvsm')||ids.includes('wtai')||ids.includes('ispy'));
  setText('#pTotal',fmtEur(total));setText('#pMax',maxW?maxW.toFixed(0)+'%':'—');setText('#pFee',fee==null?'—':fee.toFixed(2)+'%');setText('#pDivers',x.length?Math.round((1-hhi)*100)+'/100':'—');
  $('#pWarning').innerHTML=overlap?'<strong>Overlap structurel détecté.</strong> Un ETF monde combiné à S&P 500/Nasdaq/thématiques peut augmenter la concentration sur les mêmes grandes entreprises. Le calcul holdings-level exact nécessite un feed de positions vérifié.':'Aucun overlap structurel évident détecté avec les règles partielles actuelles.';
}
function setMode(m){MODE=m;document.body.classList.toggle('pro',m==='pro');$$('.mode button').forEach(b=>b.classList.toggle('active',b.dataset.mode===m))}
async function boot(){
  try{
    [DATA,CONFIG,TRACK]=await Promise.all([
      loadJSON('capital/data/latest.json'),
      loadJSON('capital/config.json'),
      loadJSON('capital/data/track-record.json').catch(()=>null)
    ]);
    renderTop();renderRanking();renderIdeas();renderPulse();renderETF();renderSources();renderPortfolio();runSim();\n    window.ARGUS_CAPITAL_LAB?.render({data:DATA,config:CONFIG,track:TRACK});
    setText('#lastUpdate',new Date(DATA.generated_at).toLocaleString('fr-BE'));
  }catch(e){
    console.error(e); setText('#marketStatus','DATA UNAVAILABLE'); setText('#bestAsset','Data engine is warming up'); $('#changed').innerHTML='<div class="empty">Le moteur de données n’a pas encore produit son premier snapshot vérifié. Aucun chiffre n’est inventé.</div>';\n    window.ARGUS_CAPITAL_LAB?.render({data:DATA,config:CONFIG,track:TRACK});
  }
}
$('#runSim').onclick=runSim; $('#addHolding').onclick=addHolding;
$$('.mode button').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
boot();