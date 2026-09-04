const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const fmtEur=n=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n)||0);
const fmtPct=n=>n==null?'—':(Number(n)>0?'+':'')+Number(n).toFixed(1)+'%';
const esc=v=>String(window.ARGUS_EN(v??'')).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const cls=s=>/ACCUMULATE|ATTRACTIVE|POSITIVE|ACCUMULA|INTERESSANTE|POSITIVE/.test(s||'')?'good':/RISK|DEFENSIVE|AVOID|RISCHIO|DIFENSIVO/.test(s||'')?'risk':/WATCH|CAUTION|WAIT|OSSERVA|PRUDENZA|WAIT/.test(s||'')?'watch':'neutral';
let DATA=null, CONFIG=null, TRACK=null, MODE='simple';
const RAW_BASE='https://raw.githubusercontent.com/domenicovitale95-create/argus-omni-live-v1/main/';
let refreshInFlight=false;

function it(v){return v??'—'}
function translateSentence(v){return String(v??'')}
async function loadJSON(path){
  const absolute=/^https?:\/\//.test(path)?path:RAW_BASE+path.replace(/^\//,'');
  const sep=absolute.includes('?')?'&':'?';
  const url=absolute+sep+'v='+Date.now();
  const r=await fetch(url,{cache:'no-store',headers:{'Cache-Control':'no-cache','Pragma':'no-cache'}});
  if(!r.ok) throw new Error(path+' '+r.status);
  return r.json();
}
function setText(id,v){const e=$(id);if(e)e.textContent=v??'—'}
function cardMove(x){
  const move=x.move!=null?fmtPct(x.move):x.move_pp!=null?((x.move_pp>0?'+':'')+x.move_pp.toFixed(2)+' pp'):'—';
  return '<div class="changed-item"><div class="move '+(String(move).startsWith('-')?'risk':'blue')+'">'+move+'</div><div><b>'+esc(translateSentence(x.event))+'</b><p>'+esc(translateSentence(x.why_it_matters))+'</p></div></div>'
}
function renderTop(){
  const g=DATA.global_market||{}, t=DATA.today||{}, q=DATA.data_quality||{};
  setText('#marketStatus',it(g.status)); $('#marketStatus').className='status-word '+cls(g.status);
  setText('#marketScore',g.score==null?'—':g.score+'/100');
  const ring=$('#scoreRing'); if(ring) ring.style.setProperty('--pct',(g.score||0)+'%');
  setText('#marketTrend',it(g.trend)); setText('#marketRegime',it(g.regime)); setText('#dataQuality',it(q.state)+' · '+(q.coverage_pct??0)+'%');
  const b=t.best_opportunity||{};
  setText('#bestAsset',translateSentence(it(b.asset||'DATA UNAVAILABLE')));
  setText('#bestScore',b.score==null?'—':b.score+'/100');
  setText('#bestStatus',it(b.status||'WAIT'));
  setText('#dailyAction',it(t.action||'WAIT / REVIEW'));
  const r=t.biggest_risk||{};
  setText('#riskTitle',translateSentence(r.title||'DATA UNAVAILABLE'));
  setText('#riskDetail',translateSentence(r.detail||'No verified risk summary available.'));
  $('#changed').innerHTML=(t.what_changed||[]).map(cardMove).join('')||'<div class="empty">No verified changes to show.</div>';
}
function renderRanking(){
  const rows=(DATA.ranking||[]).slice(0,8);
  $('#ranking').innerHTML=rows.map((r,i)=>'<div class="rank-row"><div class="rank-n">#'+(i+1)+'</div><div class="rank-label"><b>'+esc(it(r.label))+'</b><span>'+esc(it(r.status))+' · evidence '+esc(it(r.evidence))+'</span></div><div class="rank-score">'+r.score+'</div><span class="badge '+cls(r.status)+'">'+esc(it(r.status))+'</span></div>').join('')||'<div class="empty">INSUFFICIENT DATA</div>';
}
function renderIdeas(){
  const ideas=DATA.today?.top_ideas||[];
  $('#ideas').innerHTML=ideas.length?ideas.map((x,i)=>'<article class="panel idea"><div class="idea-top"><div><div class="label">#'+(i+1)+' · '+(x.ucits_candidate?'UCITS CANDIDATE '+esc(x.ucits_candidate):'ASSET')+'</div><h3>'+esc(it(x.asset))+'</h3><span class="badge '+cls(x.action)+'">'+esc(it(x.action))+'</span></div><div class="idea-score">'+x.score+'<span class="muted" style="font-size:10px">/100</span></div></div><ul>'+x.why.map(w=>'<li>'+esc(translateSentence(w))+'</li>').join('')+'</ul><div class="riskbox"><b>WHAT COULD GO WRONG?</b><p>'+x.risks.map(translateSentence).map(esc).join(' · ')+'</p></div><div class="raw" style="margin-top:10px"><p><b>Entry:</b> '+esc(translateSentence(x.entry_approach))+'</p><p><b>When the investment case changes:</b> '+esc(translateSentence(x.invalidation))+'</p><p><b>Evidence:</b> '+esc(it(x.evidence_quality))+' · '+esc(x.data_date)+'</p></div></article>').join(''):'<div class="empty">NO HIGH-CONVICTION OPPORTUNITY. WAITING OR HOLDING CASH MAY BE REASONABLE.</div>';
}
function renderPulse(){
  const ids=['global_equity','sp500','nasdaq','europe','emerging','gold','treasuries','corp_bonds'];
  $('#pulse').innerHTML=ids.map(id=>{const m=DATA.market?.[id]||{}; return '<div class="card"><div class="label">'+esc(it(m.label||id))+'</div><div class="value">'+(m.price??'—')+'</div><p>1D '+fmtPct(m.ret_1d)+' · 3M '+fmtPct(m.ret_3m)+'</p><p class="raw">200-day average '+fmtPct(m.distance_200dma)+' · Vol '+fmtPct(m.vol_20d_ann)+' · '+esc(m.data_type||'')+'</p></div>'}).join('');
  const mids=['vix','us10y','us2y','dollar','ecb_deposit','btc'];
  $('#macroPulse').innerHTML=mids.map(id=>{const m=DATA.macro?.[id]||{}; return '<div class="card"><div class="label">'+esc(it(m.label||id))+'</div><div class="value">'+(m.price??'—')+(m.unit==='%'?'%':'')+'</div><p>Updated: '+esc(m.last_update||'data unavailable')+'</p></div>'}).join('');
}
function renderETF(){
  const etfs=CONFIG?.etfs||[];
  $('#etfs').innerHTML=etfs.map(e=>'<div class="card"><div class="label">'+esc(e.tier_it||e.role_it||e.role)+'</div><h3>'+esc(e.ticker)+' · '+esc(e.name)+'</h3><p>'+esc(e.kind||'ETF')+' · '+esc(e.isin)+' · cost '+Number(e.ter).toFixed(2)+'% · '+esc(e.income||'')+'</p><p>'+esc(e.why_it||'')+'</p><p class="raw">'+esc(e.benchmark||'')+' · '+esc(e.replication||'')+' · verified '+esc(e.verified_on||'')+'</p></div>').join('');
}
function investmentCard(e){
  const tone=e.tier_it==='CORE'?'good':e.tier_it==='DIFESA'?'blue':e.tier_it==='CRESCITA'?'watch':'neutral';
  return '<article class="invest-card"><div class="invest-top"><span class="badge '+tone+'">'+esc(e.tier_it||'TO RESEARCH')+'</span><span class="kind">'+esc(e.kind||'ETF')+'</span></div><h3>'+esc(e.ticker)+' · '+esc(e.role_it||e.name)+'</h3><p class="product-name">'+esc(e.name)+'</p><div class="child-explain"><b>Why it is included</b><p>'+esc(e.why_it||'')+'</p></div><div class="riskbox mini-risk"><b>CAUTION</b><p>'+esc(e.risk_it||'Value can fall.')+'</p></div><div class="invest-meta"><span>Cost '+Number(e.ter).toFixed(2)+'%</span><span>'+esc(e.isin)+'</span></div></article>';
}
function renderInvestments(){
  const etfs=CONFIG?.etfs||[];
  const groups={
    CORE:etfs.filter(e=>e.tier_it==='CORE'),
    CRESCITA:etfs.filter(e=>e.tier_it==='CRESCITA'),
    DIFESA:etfs.filter(e=>e.tier_it==='DIFESA'),
    SATELLITE:etfs.filter(e=>e.tier_it==='SATELLITE')
  };
  const mount=(id,list)=>{const e=$(id);if(e)e.innerHTML=list.map(investmentCard).join('')||'<div class="empty">No verified candidate.</div>'};
  mount('#investCore',groups.CORE); mount('#investGrowth',groups.CRESCITA); mount('#investDefense',groups.DIFESA); mount('#investSatellite',groups.SATELLITE);

  const stocks=CONFIG?.stock_watchlist||[];
  const sw=$('#stockWatchlist');
  if(sw) sw.innerHTML=stocks.map(s=>'<article class="stock-watch"><div><span class="badge watch">TO RESEARCH</span><h3>'+esc(s.ticker)+' · '+esc(s.name)+'</h3><p>'+esc(s.theme_it)+'</p></div><div><b>Why it is interesting</b><p>'+esc(s.reason_it)+'</p><span class="stock-lock">🔒 '+esc(s.status_it)+'</span></div></article>').join('');

  runGuide();
}
function runGuide(){
  const cap=Math.max(1000,Number($('#guideCap')?.value)||10000);
  const blueprint=[
    ['55%','Global core ETF','VWCE or IWDA',.55,'Build the foundation first. You do not need both.'],
    ['15%','Global bonds','AGGH',.15,'Helps reduce reliance on equities alone.'],
    ['10%','Gold','SGLN',.10,'A defensive allocation without chasing prices.'],
    ['10%','Growth','EQQX or VVSM',.10,'One growth allocation is often simpler than several overlapping funds.'],
    ['5%','Resources / minerals','URNM, COPX, LITU or WSLV',.05,'Small satellite allocation: choose one or a few, not everything.'],
    ['5%','Cash','EUR',.05,'Leaves room for unexpected expenses and opportunities.']
  ];
  const root=$('#guideAllocation');
  if(root) root.innerHTML=blueprint.map(([pct,name,example,w,why])=>'<div class="guide-row"><div class="guide-pct">'+pct+'</div><div><b>'+esc(name)+'</b><span>'+esc(example)+'</span><p>'+esc(why)+'</p></div><strong>'+fmtEur(cap*w)+'</strong></div>').join('');
}
function renderSimpleAdvice(){
  const root=$('#advicePlan');
  if(!root) return;
  const cap=Math.max(1000,Number($('#adviceCap')?.value)||10000);
  const coverage=Number(DATA?.data_quality?.coverage_pct||0);
  const rawGlobal=DATA?.global_market?.score;
  const rawEurope=DATA?.scores?.europe?.score;
  const rawSemis=DATA?.scores?.semis?.score;
  const globalScore=rawGlobal==null?null:Number(rawGlobal);
  const europeScore=rawEurope==null?null:Number(rawEurope);
  const semisScore=rawSemis==null?null:Number(rawSemis);
  const best=DATA?.today?.best_opportunity||{};
  const products={
    core:(CONFIG?.etfs||[]).find(x=>x.id==='vwce'),
    bonds:(CONFIG?.etfs||[]).find(x=>x.id==='aggh'),
    gold:(CONFIG?.etfs||[]).find(x=>x.id==='sgln')
  };

  let action='WAIT';
  let subtitle='First, check that the data is good enough.';
  let weights={core:0,bonds:0,gold:0,cash:100};
  if(coverage>=70 && Number.isFinite(globalScore)){
    if(globalScore>=72){
      action='INVEST GRADUALLY';
      subtitle='The data is adequate, but you do not need to invest everything in one day.';
      weights={core:60,bonds:15,gold:10,cash:15};
    }else if(globalScore>=58){
      action='INVEST A PORTION, NOT EVERYTHING';
      subtitle='Conditions are reasonable, but ARGUS does not see a strong enough signal to invest everything.';
      weights={core:40,bonds:15,gold:10,cash:35};
    }else{
      action='INVEST A LITTLE AND KEEP MORE CASH';
      subtitle='The market is not strong enough: caution is appropriate.';
      weights={core:20,bonds:15,gold:10,cash:55};
    }
  }

  setText('#adviceAction',action);
  setText('#adviceSubtitle',subtitle);

  const rows=[
    {key:'core',name:'GLOBAL ETF',product:products.core?.ticker||'VWCE',verb:weights.core?'BUY IN SMALL STEPS':'DO NOT BUY NOW',why:'The foundation: many companies and countries in one instrument.'},
    {key:'bonds',name:'BONDS',product:products.bonds?.ticker||'AGGH',verb:weights.bonds?'ADD BALANCE':'WAIT',why:'Helps reduce reliance on equities alone.'},
    {key:'gold',name:'GOLD',product:products.gold?.ticker||'SGLN',verb:weights.gold?'SMALL ALLOCATION':'WAIT',why:'Intended as a diversifier, not the main growth driver.'},
    {key:'cash',name:'CASH',product:'EUR',verb:'SET ASIDE',why:'Keeps money available if better prices emerge.'}
  ];
  root.innerHTML=rows.map(r=>{
    const pct=weights[r.key]||0, amount=cap*pct/100;
    return '<div class="advice-row"><div class="advice-pct">'+pct+'%</div><div class="advice-copy"><b>'+esc(r.name)+' · '+esc(r.product)+'</b><span>'+esc(r.verb)+'</span><p>'+esc(r.why)+'</p></div><strong>'+fmtEur(amount)+'</strong></div>';
  }).join('');

  let why='ARGUS favours a simple, diversified portfolio.';
  if(Number.isFinite(europeScore) && europeScore>=72){
    why='Today European equities are the most attractive area ('+europeScore+'/100), but the foundation remains global: avoid relying on one country.';
  }else if(best.asset){
    why='The strongest opportunity detected is '+translateSentence(it(best.asset))+', but the portfolio stays diversified to reduce risk.';
  }
  setText('#adviceWhy',why);

  let avoid='Do not invest everything at once or buy five ETFs holding almost the same companies.';
  if(Number.isFinite(semisScore) && semisScore<72){
    avoid='I would not chase semiconductors and AI themes now: score '+semisScore+'/100. The core comes first.';
  }
  setText('#adviceAvoid',avoid);
}

function renderAIPortfolios(){
  const root=$('#aiPortfolioGrid');
  if(!root) return;
  const items=CONFIG?.ai_portfolios||[];
  root.innerHTML=items.map(p=>{
    const verified=!!p.verified;
    const stats=verified
      ? '<div class="ai-stats"><div><span>SINCE INCEPTION</span><b>'+fmtPct(p.since_inception_net_pct)+'</b></div><div><span>MAXIMUM DRAWDOWN</span><b>'+fmtPct(p.max_drawdown_pct)+'</b></div><div><span>VOLATILITY</span><b>'+Number(p.annualized_volatility_pct).toFixed(1)+'%</b></div><div><span>DAYS LIVE</span><b>'+esc(p.days_live)+'</b></div></div>'
      : '<div class="ai-no-data">NO VERIFIED LIVE TRACK RECORD CONNECTED</div>';
    const holdings=verified && (p.top_holdings||[]).length
      ? '<div class="ai-holdings"><span>LARGEST HOLDINGS</span>'+p.top_holdings.slice(0,5).map(h=>'<b>'+esc(h.ticker)+' '+Number(h.weight_pct).toFixed(1)+'%</b>').join('')+'</div>'
      : '';
    const source=verified && p.source_url
      ? '<a class="ai-source" href="'+esc(p.source_url)+'" target="_blank" rel="noopener">VIEW PUBLIC SOURCE ↗</a>'
      : '<span class="ai-source muted">ARGUS DOES NOT INVENT NUMBERS</span>';
    return '<article class="ai-card '+(verified?'verified':'pending')+'"><div class="ai-card-top"><div><span class="badge '+(verified?'good':'watch')+'">'+esc(p.status)+'</span><h3>'+esc(p.name)+'</h3><p>'+esc(p.model)+' · '+esc(p.company)+'</p></div><div class="ai-mark">'+esc((p.model||'AI').slice(0,2).toUpperCase())+'</div></div>'+stats+holdings+'<div class="child-explain"><b>In plain English</b><p>'+esc(p.simple_take_it||'')+'</p></div><div class="ai-foot"><span>'+esc(p.data_as_of?'Data as of '+p.data_as_of:(p.maturity_it||'Under review'))+'</span>'+source+'</div></article>';
  }).join('')||'<div class="empty">No verified AI portfolio connected.</div>';
}

function renderSources(){
  const src=DATA.sources||{};
  const sourceNames={market:'MARKETS',macro:'MACRO',etf_metadata:'ETF METADATA'};
  const sourceDesc={
    'Stooq daily market data (proxy instruments)':'Stooq — daily market data through proxy instruments',
    'Stooq daily market data with Yahoo Finance chart fallback (proxy instruments)':'Stooq + Yahoo Finance — daily market data through proxy instruments',
    'FRED public CSV series; underlying source varies by series':'FRED — public series; underlying source varies by series',
    'Issuer pages / verified static config':'Official issuer websites / verified configuration'
  };
  $('#sources').innerHTML=Object.entries(src).map(([k,v])=>'<div class="source"><div><b>'+esc(sourceNames[k]||k.toUpperCase())+'</b><span>'+esc(sourceDesc[v]||v)+'</span></div><span>'+esc(DATA.generated_at?.slice(0,16).replace('T',' ')||'—')+' UTC</span></div>').join('');
  const q=DATA.data_quality||{};
  const rules=(q.rules||[]).map(r=>({
    'No synthetic price fabrication':'No invented prices',
    'Stale fallback explicitly labelled':'Stale data is always labelled',
    'Scores suppressed when core data coverage is insufficient':'Scores are blocked when core data is insufficient',
    'Valuation omitted until a verified valuation feed is connected':'Valuation is not invented without a verified source'
  }[r]||r));
  setText('#qualityRules',rules.join(' · '));
  if(TRACK){setText('#trackEvaluated',TRACK.evaluated_signals??0);setText('#trackHit',TRACK.hit_rate_positive_pct==null?'—':TRACK.hit_rate_positive_pct+'%');setText('#trackAvg',TRACK.average_return_to_latest_pct==null?'—':fmtPct(TRACK.average_return_to_latest_pct))}
}
function fv(cap,monthly,years,annual){
  const r=Math.pow(1+annual/100,1/12)-1,n=Math.round(years*12);
  return cap*Math.pow(1+r,n)+(r===0?monthly*n:monthly*((Math.pow(1+r,n)-1)/r));
}
function runSim(){
  const cap=+$('#simCap').value||0, mon=+$('#simMonthly').value||0, yrs=Math.max(1,+$('#simYears').value||1), base=+$('#simReturn').value||0, infl=+$('#simInfl').value||0, fee=+$('#simFee').value||0;
  const rates=[Math.max(-20,base-4)-fee,base-fee,base+4-fee], names=['CONSERVATIVE','BASE','OPTIMISTIC'];
  $('#simResults').innerHTML=rates.map((r,i)=>{const nominal=fv(cap,mon,yrs,r), real=nominal/Math.pow(1+infl/100,yrs);return '<div class="scenario"><b>'+names[i]+'</b><strong>'+fmtEur(nominal)+'</strong><span>assumption '+r.toFixed(1)+'% net/year · inflation-adjusted value '+fmtEur(real)+'</span></div>'}).join('');
  const crashes=[10,20,30,40,50];
  $('#crashGrid').innerHTML=crashes.map(x=>{const v=cap*(1-x/100),rec=(1/(1-x/100)-1)*100;return '<div class="crash"><b>-'+x+'%</b><span>'+fmtEur(v)+'</span><span>needs +'+rec.toFixed(1)+'% to recover</span></div>'}).join('');
}
function holdings(){try{return JSON.parse(localStorage.getItem('argusCapitalHoldings')||'[]')}catch{return []}}
function saveHoldings(x){localStorage.setItem('argusCapitalHoldings',JSON.stringify(x));renderPortfolio()}
function addHolding(){const x=holdings();x.push({id:(CONFIG?.etfs?.[0]?.id||'vwce'),amount:1000});saveHoldings(x)}
function renderPortfolio(){
  const x=holdings(), etfs=CONFIG?.etfs||[], total=x.reduce((a,b)=>a+(+b.amount||0),0);
  $('#holdingList').innerHTML=x.map((h,i)=>'<div class="holding"><select data-i="'+i+'" class="h-id">'+etfs.map(e=>'<option value="'+esc(e.id)+'" '+(e.id===h.id?'selected':'')+'>'+esc(e.ticker)+' · '+esc(e.role_it||e.role)+'</option>').join('')+'</select><input data-i="'+i+'" class="h-amount" type="number" value="'+Number(h.amount||0)+'" min="0"><button data-i="'+i+'" class="h-del">×</button></div>').join('')||'<div class="empty">Add your investments manually. They stay in this browser only.</div>';
  $$('.h-id').forEach(e=>e.onchange=()=>{x[+e.dataset.i].id=e.value;saveHoldings(x)});
  $$('.h-amount').forEach(e=>e.onchange=()=>{x[+e.dataset.i].amount=+e.value;saveHoldings(x)});
  $$('.h-del').forEach(e=>e.onclick=()=>{x.splice(+e.dataset.i,1);saveHoldings(x)});
  const weights=x.map(h=>(+h.amount||0)/(total||1)); const hhi=weights.reduce((a,w)=>a+w*w,0); const maxW=Math.max(0,...weights)*100;
  let fee=0,known=0; x.forEach(h=>{const e=etfs.find(z=>z.id===h.id);if(e){fee+=(+h.amount||0)*Number(e.ter||0);known+=(+h.amount||0)}});fee=known?fee/known:null;
  const ids=x.map(h=>h.id); const overlap=(ids.includes('vwce')||ids.includes('iwda'))&&(ids.includes('sxr8')||ids.includes('eqqx')||ids.includes('vvsm')||ids.includes('wtai')||ids.includes('ispy'));
  setText('#pTotal',fmtEur(total));setText('#pMax',maxW?maxW.toFixed(0)+'%':'—');setText('#pFee',fee==null?'—':fee.toFixed(2)+'%');setText('#pDivers',x.length?Math.round((1-hhi)*100)+'/100':'—');
  $('#pWarning').innerHTML=overlap?'<strong>Overlap detected.</strong> A global ETF combined with S&P 500, Nasdaq or specific themes can substantially increase exposure to the same large companies.':'No obvious structural overlap under the current partial rules.';
}
function setMode(m){MODE=m;document.body.classList.toggle('pro',m==='pro');$$('.mode button').forEach(b=>b.classList.toggle('active',b.dataset.mode===m))}
function renderAll(){
  renderSimpleAdvice();renderTop();renderRanking();renderIdeas();renderPulse();renderETF();renderInvestments();renderAIPortfolios();renderSources();renderPortfolio();runSim();
  window.ARGUS_CAPITAL_LAB?.render({data:DATA,config:CONFIG,track:TRACK});
  if(DATA?.generated_at) setText('#lastUpdate',new Date(DATA.generated_at).toLocaleString('en-GB'));
}
async function refreshLiveData(forceConfig=false){
  if(refreshInFlight) return;
  refreshInFlight=true;
  try{
    const previousStamp=DATA?.generated_at||null;
    const jobs=[
      loadJSON('capital/data/latest.json'),
      loadJSON('capital/data/track-record.json').catch(()=>TRACK)
    ];
    if(forceConfig||!CONFIG) jobs.push(loadJSON('capital/config.json'));
    const out=await Promise.all(jobs);
    DATA=out[0]; TRACK=out[1];
    if(out[2]) CONFIG=out[2];
    renderAll();
    const changed=previousStamp&&DATA?.generated_at&&previousStamp!==DATA.generated_at;
    setText('#autoRefresh',changed?'NEW DATA LOADED':'CHECKED JUST NOW');
    const dot=$('#autoRefreshDot'); if(dot) dot.classList.remove('stale');
  }catch(e){
    console.error('ARGUS auto-refresh failed',e);
    setText('#autoRefresh','RETRYING AUTOMATICALLY');
    const dot=$('#autoRefreshDot'); if(dot) dot.classList.add('stale');
  }finally{
    refreshInFlight=false;
  }
}
async function boot(){
  try{
    await refreshLiveData(true);
  }catch(e){
    console.error(e);
    setText('#marketStatus','DATA UNAVAILABLE');
    setText('#bestAsset','Data engine starting');
    $('#changed').innerHTML='<div class="empty">The data engine has not yet produced a verified snapshot. ARGUS does not invent numbers.</div>';
  }
  setInterval(()=>refreshLiveData(false),60000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible') refreshLiveData(false)});
  window.addEventListener('focus',()=>refreshLiveData(false));
}
$('#runSim').onclick=runSim;
$('#addHolding').onclick=addHolding;
$('#guideCap')?.addEventListener('input',runGuide);
$('#adviceCap')?.addEventListener('input',renderSimpleAdvice);
$$('.mode button').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
boot();


