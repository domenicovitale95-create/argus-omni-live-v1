const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const fmtEur=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(n)||0);
const fmtPct=n=>n==null?'—':(Number(n)>0?'+':'')+Number(n).toFixed(1)+'%';
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const cls=s=>/ACCUMULATE|ATTRACTIVE|POSITIVE|ACCUMULA|INTERESSANTE|POSITIVO/.test(s||'')?'good':/RISK|DEFENSIVE|AVOID|RISCHIO|DIFENSIVO/.test(s||'')?'risk':/WATCH|CAUTION|WAIT|OSSERVA|PRUDENZA|ASPETTA/.test(s||'')?'watch':'neutral';
let DATA=null, CONFIG=null, TRACK=null, MODE='simple';

const STATUS_IT={
  'DATA UNAVAILABLE':'DATI NON DISPONIBILI','DATA INSUFFICIENT':'DATI INSUFFICIENTI',
  'WAIT':'ASPETTA','WAIT / REVIEW':'ASPETTA / CONTROLLA','WAIT / REDUCE TIMING RISK':'ASPETTA / RIDUCI IL RISCHIO DI ENTRATA',
  'ACCUMULATE':'ACCUMULA','ACCUMULATE GRADUALLY':'ACCUMULA GRADUALMENTE','ATTRACTIVE':'INTERESSANTE',
  'WATCH':'OSSERVA','NEUTRAL':'NEUTRALE','EXPENSIVE / RISK HIGH':'CARO / RISCHIO ALTO',
  'POSITIVE':'POSITIVO','CAUTION':'PRUDENZA','HIGH RISK':'RISCHIO ALTO','DEFENSIVE':'DIFENSIVO',
  'RISK-OFF':'AVVERSIONE AL RISCHIO','RISK-ON':'PROPENSIONE AL RISCHIO','CORRECTION':'CORREZIONE',
  'EARLY / MID BULL':'FASE RIALZISTA INIZIALE / INTERMEDIA','MIXED':'MISTO',
  'Strong':'Forte','Moderate':'Moderata','Weak':'Debole','High':'Alta','Medium':'Media','Low':'Bassa',
  'Stable →':'Stabile →','Improving ↑':'In miglioramento ↑','Deteriorating ↓':'In peggioramento ↓'
};
const LABEL_IT={
  'Global Equities':'Azioni globali','European Equities':'Azioni europee','Emerging Markets':'Mercati emergenti',
  'Semiconductors':'Semiconduttori','Gold':'Oro','US Treasuries 7-10Y':'Titoli di Stato USA 7-10 anni',
  'Investment Grade Bonds':'Obbligazioni investment grade','US T-Bills':'Titoli di Stato USA a breve',
  'Euro Cash':'Liquidità in euro','US 10Y Treasury Yield':'Rendimento Treasury USA 10 anni',
  'US 2Y Treasury Yield':'Rendimento Treasury USA 2 anni','Broad US Dollar Index':'Indice ampio del dollaro USA',
  'ECB Deposit Facility Rate':'Tasso sui depositi BCE','Bitcoin / USD':'Bitcoin / USD'
};
function it(v){return STATUS_IT[v]||LABEL_IT[v]||(v??'—')}
function translateSentence(v){
  let s=String(v??'');
  const exact={
    'Global equities moved':'Le azioni globali si sono mosse',
    'S&P 500 moved':"L'S&P 500 si è mosso",
    'Nasdaq moved':'Il Nasdaq si è mosso',
    'Europe moved':'Le azioni europee si sono mosse',
    'Emerging markets moved':'I mercati emergenti si sono mossi',
    'Gold moved':"L'oro si è mosso",
    'Treasuries moved':'I Treasury si sono mossi',
    'VIX changed':'Il VIX è cambiato',
    'US 10Y yield changed':'Il rendimento USA a 10 anni è cambiato',
    'Broad risk appetite changed across global stocks.':'È cambiata la propensione al rischio sulle azioni globali.',
    'US large caps shifted, affecting many global UCITS portfolios.':'Le grandi società USA si sono mosse, con impatto su molti portafogli UCITS globali.',
    'Growth and duration-sensitive equities changed materially.':'Le azioni growth e sensibili ai tassi hanno registrato un movimento rilevante.',
    'European equity risk/reward shifted relative to the US.':'Il rapporto rischio/rendimento delle azioni europee è cambiato rispetto agli USA.',
    'EM risk appetite and global growth sensitivity changed.':'È cambiato il quadro dei mercati emergenti e della crescita globale.',
    'Safe-haven demand, real-rate expectations or USD dynamics may be shifting.':'Potrebbero essere cambiati domanda di beni rifugio, tassi reali o dinamica del dollaro.',
    'Rate expectations and duration pricing changed.':'Sono cambiate le attese sui tassi e la valutazione della duration.',
    'Equity option-implied volatility changed, altering the short-term risk backdrop.':'È cambiata la volatilità implicita delle opzioni azionarie e quindi il rischio di breve periodo.',
    'Discount rates moved, affecting bonds and equity valuations.':'I tassi di sconto si sono mossi, con effetti su obbligazioni e valutazioni azionarie.',
    'Elevated volatility':'Volatilità elevata',
    'Rates repricing higher':'Rialzo delle aspettative sui tassi',
    'Growth concentration / extension':'Concentrazione eccessiva sulla crescita',
    'No single dominant systemic risk':'Nessun singolo rischio sistemico dominante',
    'Data quality gate active':'Filtro qualità dati attivo',
    'Data engine warming up':'Motore dati in avvio',
    'Patience / cash remains rational':'Pazienza e liquidità restano razionali'
  };
  if(exact[s]) return exact[s];
  const vixMatch=s.match(/^VIX is ([0-9.]+); short-term market stress is elevated\.$/);
  if(vixMatch) return 'Il VIX è a '+vixMatch[1]+': lo stress di breve periodo è elevato.';
  const yieldMatch=s.match(/^US 10Y yield rose ([0-9.]+) pp over ~1 month, a headwind for duration-sensitive assets\.$/);
  if(yieldMatch) return 'Il rendimento USA a 10 anni è salito di '+yieldMatch[1]+' punti percentuali in circa un mese: pressione per gli asset sensibili ai tassi.';
  if(s==='Nasdaq is materially above its 200-day average; entry risk is less attractive even if trend is strong.') return 'Il Nasdaq è molto sopra la media a 200 giorni: il trend può essere forte, ma il punto di entrata è meno favorevole.';
  if(s==='Risk remains distributed across rates, valuation, growth and geopolitics; monitor catalysts rather than forcing a single narrative.') return 'Il rischio è distribuito tra tassi, valutazioni, crescita e geopolitica: meglio monitorare gli eventi senza forzare una sola storia.';
  if(s==='ARGUS will not publish a market recommendation until the first verified data snapshot passes validation.') return 'ARGUS non pubblica indicazioni di mercato finché il primo snapshot verificato non supera i controlli.';
  s=s.replace('3-month momentum:','Momentum a 3 mesi:')
     .replace('Distance vs 200-day average:','Distanza dalla media a 200 giorni:')
     .replace('20-day annualised volatility:','Volatilità annualizzata a 20 giorni:')
     .replace('Entry is extended versus the 200-day trend.','Il prezzo è molto esteso rispetto al trend a 200 giorni.')
     .replace('Earnings, rates or risk-premium shocks can cause material drawdowns.','Utili, tassi o premio per il rischio possono causare forti ribassi.')
     .replace('Higher real yields and a stronger USD can pressure gold.','Tassi reali più alti e un dollaro forte possono penalizzare l’oro.')
     .replace('Duration losses remain possible if yields rise further.','Le obbligazioni possono perdere se i rendimenti salgono ancora.')
     .replace('Market conditions can change faster than historical indicators.','Il mercato può cambiare più velocemente degli indicatori storici.')
     .replace('Gradual accumulation is more robust than a single all-in entry when timing uncertainty is meaningful.','Entrare gradualmente è più robusto di investire tutto in una volta quando il timing è incerto.')
     .replace('Trend deterioration below the long-term average, worsening macro risk, or materially weaker evidence would reduce conviction.','Un peggioramento del trend, del quadro macro o della qualità dei dati ridurrebbe la convinzione.');
  return s;
}

async function loadJSON(path){
  const sep=path.includes('?')?'&':'?';
  const r=await fetch(path+sep+'v='+Date.now(),{cache:'no-store'});
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
  setText('#riskTitle',translateSentence(r.title||'DATI NON DISPONIBILI'));
  setText('#riskDetail',translateSentence(r.detail||'Nessun riepilogo del rischio verificato disponibile.'));
  $('#changed').innerHTML=(t.what_changed||[]).map(cardMove).join('')||'<div class="empty">Nessun cambiamento verificato da mostrare.</div>';
}
function renderRanking(){
  const rows=(DATA.ranking||[]).slice(0,8);
  $('#ranking').innerHTML=rows.map((r,i)=>'<div class="rank-row"><div class="rank-n">#'+(i+1)+'</div><div class="rank-label"><b>'+esc(it(r.label))+'</b><span>'+esc(it(r.status))+' · evidenza '+esc(it(r.evidence))+'</span></div><div class="rank-score">'+r.score+'</div><span class="badge '+cls(r.status)+'">'+esc(it(r.status))+'</span></div>').join('')||'<div class="empty">DATI INSUFFICIENTI</div>';
}
function renderIdeas(){
  const ideas=DATA.today?.top_ideas||[];
  $('#ideas').innerHTML=ideas.length?ideas.map((x,i)=>'<article class="panel idea"><div class="idea-top"><div><div class="label">#'+(i+1)+' · '+(x.ucits_candidate?'CANDIDATO UCITS '+esc(x.ucits_candidate):'ASSET')+'</div><h3>'+esc(it(x.asset))+'</h3><span class="badge '+cls(x.action)+'">'+esc(it(x.action))+'</span></div><div class="idea-score">'+x.score+'<span class="muted" style="font-size:10px">/100</span></div></div><ul>'+x.why.map(w=>'<li>'+esc(translateSentence(w))+'</li>').join('')+'</ul><div class="riskbox"><b>COSA POTREBBE ANDARE STORTO?</b><p>'+x.risks.map(translateSentence).map(esc).join(' · ')+'</p></div><div class="raw" style="margin-top:10px"><p><b>Entrata:</b> '+esc(translateSentence(x.entry_approach))+'</p><p><b>Quando cambia la tesi:</b> '+esc(translateSentence(x.invalidation))+'</p><p><b>Evidenza:</b> '+esc(it(x.evidence_quality))+' · '+esc(x.data_date)+'</p></div></article>').join(''):'<div class="empty">NESSUNA OPPORTUNITÀ AD ALTA CONVINZIONE. ASPETTARE O TENERE LIQUIDITÀ PUÒ ESSERE RAZIONALE.</div>';
}
function renderPulse(){
  const ids=['global_equity','sp500','nasdaq','europe','emerging','gold','treasuries','corp_bonds'];
  $('#pulse').innerHTML=ids.map(id=>{const m=DATA.market?.[id]||{}; return '<div class="card"><div class="label">'+esc(it(m.label||id))+'</div><div class="value">'+(m.price??'—')+'</div><p>1G '+fmtPct(m.ret_1d)+' · 3M '+fmtPct(m.ret_3m)+'</p><p class="raw">Media 200g '+fmtPct(m.distance_200dma)+' · Vol '+fmtPct(m.vol_20d_ann)+' · '+esc(m.data_type||'')+'</p></div>'}).join('');
  const mids=['vix','us10y','us2y','dollar','ecb_deposit','btc'];
  $('#macroPulse').innerHTML=mids.map(id=>{const m=DATA.macro?.[id]||{}; return '<div class="card"><div class="label">'+esc(it(m.label||id))+'</div><div class="value">'+(m.price??'—')+(m.unit==='%'?'%':'')+'</div><p>Aggiornato: '+esc(m.last_update||'dato non disponibile')+'</p></div>'}).join('');
}
function renderETF(){
  const etfs=CONFIG?.etfs||[];
  $('#etfs').innerHTML=etfs.map(e=>'<div class="card"><div class="label">'+esc(e.tier_it||e.role_it||e.role)+'</div><h3>'+esc(e.ticker)+' · '+esc(e.name)+'</h3><p>'+esc(e.kind||'ETF')+' · '+esc(e.isin)+' · costo '+Number(e.ter).toFixed(2)+'% · '+esc(e.income||'')+'</p><p>'+esc(e.why_it||'')+'</p><p class="raw">'+esc(e.benchmark||'')+' · '+esc(e.replication||'')+' · verificato '+esc(e.verified_on||'')+'</p></div>').join('');
}
function investmentCard(e){
  const tone=e.tier_it==='CORE'?'good':e.tier_it==='DIFESA'?'blue':e.tier_it==='CRESCITA'?'watch':'neutral';
  return '<article class="invest-card"><div class="invest-top"><span class="badge '+tone+'">'+esc(e.tier_it||'DA STUDIARE')+'</span><span class="kind">'+esc(e.kind||'ETF')+'</span></div><h3>'+esc(e.ticker)+' · '+esc(e.role_it||e.name)+'</h3><p class="product-name">'+esc(e.name)+'</p><div class="child-explain"><b>Perché mi piace</b><p>'+esc(e.why_it||'')+'</p></div><div class="riskbox mini-risk"><b>ATTENZIONE</b><p>'+esc(e.risk_it||'Il valore può scendere.')+'</p></div><div class="invest-meta"><span>Costo '+Number(e.ter).toFixed(2)+'%</span><span>'+esc(e.isin)+'</span></div></article>';
}
function renderInvestments(){
  const etfs=CONFIG?.etfs||[];
  const groups={
    CORE:etfs.filter(e=>e.tier_it==='CORE'),
    CRESCITA:etfs.filter(e=>e.tier_it==='CRESCITA'),
    DIFESA:etfs.filter(e=>e.tier_it==='DIFESA'),
    SATELLITE:etfs.filter(e=>e.tier_it==='SATELLITE')
  };
  const mount=(id,list)=>{const e=$(id);if(e)e.innerHTML=list.map(investmentCard).join('')||'<div class="empty">Nessun candidato verificato.</div>'};
  mount('#investCore',groups.CORE); mount('#investGrowth',groups.CRESCITA); mount('#investDefense',groups.DIFESA); mount('#investSatellite',groups.SATELLITE);

  const stocks=CONFIG?.stock_watchlist||[];
  const sw=$('#stockWatchlist');
  if(sw) sw.innerHTML=stocks.map(s=>'<article class="stock-watch"><div><span class="badge watch">DA STUDIARE</span><h3>'+esc(s.ticker)+' · '+esc(s.name)+'</h3><p>'+esc(s.theme_it)+'</p></div><div><b>Perché è interessante</b><p>'+esc(s.reason_it)+'</p><span class="stock-lock">🔒 '+esc(s.status_it)+'</span></div></article>').join('');

  runGuide();
}
function runGuide(){
  const cap=Math.max(1000,Number($('#guideCap')?.value)||10000);
  const blueprint=[
    ['55%','ETF globale core','VWCE oppure IWDA',.55,'Prima costruisci le fondamenta. Non serve possedere entrambi.'],
    ['15%','Obbligazioni globali','AGGH',.15,'Serve a ridurre la dipendenza dalle sole azioni.'],
    ['10%','Oro','SGLN',.10,'Una parte difensiva, senza inseguire il prezzo.'],
    ['10%','Crescita','EQQX oppure VVSM',.10,'Una sola spinta growth è spesso più semplice di molte sovrapposizioni.'],
    ['5%','Risorse / minerali','URNM, COPX, LITU o WSLV',.05,'Satellite piccolo: scegline uno o pochi, non tutto insieme.'],
    ['5%','Liquidità','EUR',.05,'Ti lascia margine per imprevisti e opportunità.']
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

  let action='ASPETTA';
  let subtitle='Prima controllo che i dati siano abbastanza buoni.';
  let weights={core:0,bonds:0,gold:0,cash:100};
  if(coverage>=70 && Number.isFinite(globalScore)){
    if(globalScore>=72){
      action='INVESTI GRADUALMENTE';
      subtitle='I dati sono abbastanza buoni, ma non serve investire tutto in un solo giorno.';
      weights={core:60,bonds:15,gold:10,cash:15};
    }else if(globalScore>=58){
      action='INVESTI UNA PARTE, NON TUTTO';
      subtitle='Il mercato è discreto, ma ARGUS non vede un segnale abbastanza forte per entrare con tutto.';
      weights={core:40,bonds:15,gold:10,cash:35};
    }else{
      action='INVESTI POCO E TIENI MOLTA LIQUIDITÀ';
      subtitle='Il mercato non è abbastanza forte: meglio essere prudenti.';
      weights={core:20,bonds:15,gold:10,cash:55};
    }
  }

  setText('#adviceAction',action);
  setText('#adviceSubtitle',subtitle);

  const rows=[
    {key:'core',name:'ETF GLOBALE',product:products.core?.ticker||'VWCE',verb:weights.core?'COMPRA A PICCOLI PASSI':'NON COMPRARE ORA',why:'È la base: tante aziende e tanti Paesi in un solo strumento.'},
    {key:'bonds',name:'OBBLIGAZIONI',product:products.bonds?.ticker||'AGGH',verb:weights.bonds?'AGGIUNGI DIFESA':'ASPETTA',why:'Servono a non dipendere solo dalle azioni.'},
    {key:'gold',name:'ORO',product:products.gold?.ticker||'SGLN',verb:weights.gold?'PICCOLA QUOTA':'ASPETTA',why:'È una cintura di sicurezza, non il motore principale.'},
    {key:'cash',name:'LIQUIDITÀ',product:'EUR',verb:'TIENI DA PARTE',why:'Ti lascia soldi pronti se arrivano prezzi migliori.'}
  ];
  root.innerHTML=rows.map(r=>{
    const pct=weights[r.key]||0, amount=cap*pct/100;
    return '<div class="advice-row"><div class="advice-pct">'+pct+'%</div><div class="advice-copy"><b>'+esc(r.name)+' · '+esc(r.product)+'</b><span>'+esc(r.verb)+'</span><p>'+esc(r.why)+'</p></div><strong>'+fmtEur(amount)+'</strong></div>';
  }).join('');

  let why='ARGUS preferisce un portafoglio semplice e diversificato.';
  if(Number.isFinite(europeScore) && europeScore>=72){
    why='Oggi le azioni europee sono la zona più interessante ('+europeScore+'/100), ma la base resta globale: niente scommesse su un solo Paese.';
  }else if(best.asset){
    why='La migliore opportunità rilevata è '+translateSentence(it(best.asset))+', ma il portafoglio resta diviso per ridurre il rischio.';
  }
  setText('#adviceWhy',why);

  let avoid='Non investire tutto in una volta e non comprare cinque ETF che contengono quasi le stesse aziende.';
  if(Number.isFinite(semisScore) && semisScore<72){
    avoid='Non inseguirei semiconduttori e temi AI adesso: score '+semisScore+'/100. Prima viene il core.';
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
      ? '<div class="ai-stats"><div><span>DA INIZIO</span><b>'+fmtPct(p.since_inception_net_pct)+'</b></div><div><span>PEGGIOR CALO</span><b>'+fmtPct(p.max_drawdown_pct)+'</b></div><div><span>VOLATILITÀ</span><b>'+Number(p.annualized_volatility_pct).toFixed(1)+'%</b></div><div><span>GIORNI LIVE</span><b>'+esc(p.days_live)+'</b></div></div>'
      : '<div class="ai-no-data">NESSUN TRACK RECORD LIVE VERIFICATO COLLEGATO</div>';
    const holdings=verified && (p.top_holdings||[]).length
      ? '<div class="ai-holdings"><span>POSIZIONI PIÙ GRANDI</span>'+p.top_holdings.slice(0,5).map(h=>'<b>'+esc(h.ticker)+' '+Number(h.weight_pct).toFixed(1)+'%</b>').join('')+'</div>'
      : '';
    const source=verified && p.source_url
      ? '<a class="ai-source" href="'+esc(p.source_url)+'" target="_blank" rel="noopener">VEDI FONTE PUBBLICA ↗</a>'
      : '<span class="ai-source muted">ARGUS NON INVENTA NUMERI</span>';
    return '<article class="ai-card '+(verified?'verified':'pending')+'"><div class="ai-card-top"><div><span class="badge '+(verified?'good':'watch')+'">'+esc(p.status)+'</span><h3>'+esc(p.name)+'</h3><p>'+esc(p.model)+' · '+esc(p.company)+'</p></div><div class="ai-mark">'+esc((p.model||'AI').slice(0,2).toUpperCase())+'</div></div>'+stats+holdings+'<div class="child-explain"><b>In parole semplici</b><p>'+esc(p.simple_take_it||'')+'</p></div><div class="ai-foot"><span>'+esc(p.data_as_of?'Dati '+p.data_as_of:(p.maturity_it||'In ricerca'))+'</span>'+source+'</div></article>';
  }).join('')||'<div class="empty">Nessun portafoglio AI verificato collegato.</div>';
}

function renderSources(){
  const src=DATA.sources||{};
  const sourceNames={market:'MERCATI',macro:'MACRO',etf_metadata:'METADATI ETF'};
  const sourceDesc={
    'Stooq daily market data (proxy instruments)':'Stooq — dati giornalieri di mercato tramite strumenti proxy',
    'Stooq daily market data with Yahoo Finance chart fallback (proxy instruments)':'Stooq + Yahoo Finance — dati giornalieri di mercato tramite strumenti proxy',
    'FRED public CSV series; underlying source varies by series':'FRED — serie pubbliche; la fonte sottostante varia per serie',
    'Issuer pages / verified static config':'Siti ufficiali degli emittenti / configurazione verificata'
  };
  $('#sources').innerHTML=Object.entries(src).map(([k,v])=>'<div class="source"><div><b>'+esc(sourceNames[k]||k.toUpperCase())+'</b><span>'+esc(sourceDesc[v]||v)+'</span></div><span>'+esc(DATA.generated_at?.slice(0,16).replace('T',' ')||'—')+' UTC</span></div>').join('');
  const q=DATA.data_quality||{};
  const rules=(q.rules||[]).map(r=>({
    'No synthetic price fabrication':'Nessun prezzo inventato',
    'Stale fallback explicitly labelled':'I dati vecchi sono sempre segnalati',
    'Scores suppressed when core data coverage is insufficient':'Gli score vengono bloccati se i dati essenziali non bastano',
    'Valuation omitted until a verified valuation feed is connected':'La valutazione non viene inventata se manca una fonte verificata'
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
  const rates=[Math.max(-20,base-4)-fee,base-fee,base+4-fee], names=['PRUDENTE','BASE','OTTIMISTA'];
  $('#simResults').innerHTML=rates.map((r,i)=>{const nominal=fv(cap,mon,yrs,r), real=nominal/Math.pow(1+infl/100,yrs);return '<div class="scenario"><b>'+names[i]+'</b><strong>'+fmtEur(nominal)+'</strong><span>ipotesi '+r.toFixed(1)+'% netto/anno · valore reale '+fmtEur(real)+'</span></div>'}).join('');
  const crashes=[10,20,30,40,50];
  $('#crashGrid').innerHTML=crashes.map(x=>{const v=cap*(1-x/100),rec=(1/(1-x/100)-1)*100;return '<div class="crash"><b>-'+x+'%</b><span>'+fmtEur(v)+'</span><span>serve +'+rec.toFixed(1)+'% per recuperare</span></div>'}).join('');
}
function holdings(){try{return JSON.parse(localStorage.getItem('argusCapitalHoldings')||'[]')}catch{return []}}
function saveHoldings(x){localStorage.setItem('argusCapitalHoldings',JSON.stringify(x));renderPortfolio()}
function addHolding(){const x=holdings();x.push({id:(CONFIG?.etfs?.[0]?.id||'vwce'),amount:1000});saveHoldings(x)}
function renderPortfolio(){
  const x=holdings(), etfs=CONFIG?.etfs||[], total=x.reduce((a,b)=>a+(+b.amount||0),0);
  $('#holdingList').innerHTML=x.map((h,i)=>'<div class="holding"><select data-i="'+i+'" class="h-id">'+etfs.map(e=>'<option value="'+esc(e.id)+'" '+(e.id===h.id?'selected':'')+'>'+esc(e.ticker)+' · '+esc(e.role_it||e.role)+'</option>').join('')+'</select><input data-i="'+i+'" class="h-amount" type="number" value="'+Number(h.amount||0)+'" min="0"><button data-i="'+i+'" class="h-del">×</button></div>').join('')||'<div class="empty">Aggiungi manualmente i tuoi investimenti. Restano solo in questo browser.</div>';
  $$('.h-id').forEach(e=>e.onchange=()=>{x[+e.dataset.i].id=e.value;saveHoldings(x)});
  $$('.h-amount').forEach(e=>e.onchange=()=>{x[+e.dataset.i].amount=+e.value;saveHoldings(x)});
  $$('.h-del').forEach(e=>e.onclick=()=>{x.splice(+e.dataset.i,1);saveHoldings(x)});
  const weights=x.map(h=>(+h.amount||0)/(total||1)); const hhi=weights.reduce((a,w)=>a+w*w,0); const maxW=Math.max(0,...weights)*100;
  let fee=0,known=0; x.forEach(h=>{const e=etfs.find(z=>z.id===h.id);if(e){fee+=(+h.amount||0)*Number(e.ter||0);known+=(+h.amount||0)}});fee=known?fee/known:null;
  const ids=x.map(h=>h.id); const overlap=(ids.includes('vwce')||ids.includes('iwda'))&&(ids.includes('sxr8')||ids.includes('eqqx')||ids.includes('vvsm')||ids.includes('wtai')||ids.includes('ispy'));
  setText('#pTotal',fmtEur(total));setText('#pMax',maxW?maxW.toFixed(0)+'%':'—');setText('#pFee',fee==null?'—':fee.toFixed(2)+'%');setText('#pDivers',x.length?Math.round((1-hhi)*100)+'/100':'—');
  $('#pWarning').innerHTML=overlap?'<strong>Sovrapposizione rilevata.</strong> Un ETF mondiale insieme a S&P 500, Nasdaq o temi specifici può aumentare molto il peso delle stesse grandi società.':'Nessuna sovrapposizione strutturale evidente con le regole parziali attuali.';
}
function setMode(m){MODE=m;document.body.classList.toggle('pro',m==='pro');$$('.mode button').forEach(b=>b.classList.toggle('active',b.dataset.mode===m))}
async function boot(){
  try{
    [DATA,CONFIG,TRACK]=await Promise.all([
      loadJSON('capital/data/latest.json'),
      loadJSON('capital/config.json'),
      loadJSON('capital/data/track-record.json').catch(()=>null)
    ]);
    renderSimpleAdvice();renderTop();renderRanking();renderIdeas();renderPulse();renderETF();renderInvestments();renderAIPortfolios();renderSources();renderPortfolio();runSim();
    window.ARGUS_CAPITAL_LAB?.render({data:DATA,config:CONFIG,track:TRACK});
    setText('#lastUpdate',new Date(DATA.generated_at).toLocaleString('it-IT'));
  }catch(e){
    console.error(e);
    setText('#marketStatus','DATI NON DISPONIBILI');
    setText('#bestAsset','Motore dati in avvio');
    $('#changed').innerHTML='<div class="empty">Il motore dati non ha ancora prodotto uno snapshot verificato. ARGUS non inventa numeri.</div>';
    window.ARGUS_CAPITAL_LAB?.render({data:DATA,config:CONFIG,track:TRACK});
  }
}
$('#runSim').onclick=runSim;
$('#addHolding').onclick=addHolding;
$('#guideCap')?.addEventListener('input',runGuide);
$('#adviceCap')?.addEventListener('input',renderSimpleAdvice);
$$('.mode button').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
boot();
