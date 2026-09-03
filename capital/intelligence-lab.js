(() => {
  'use strict';

  const STORAGE_KEY = 'argusCapitalVirtualPortfolioV1';
  const PROXY_TO_MARKET = { acwi:'global_equity', spy:'sp500', qqq:'nasdaq', smh:'semis', gld:'gold', ief:'treasuries' };
  const ROLE_MULTIPLIER = {
    conservative:{CORE_GLOBAL:1.45,CORE_DEVELOPED:1.35,US_TILT:.65,GROWTH_TILT:.45,THEMATIC:.22,BOND_CORE:1.20,METAL_DEFENSE:1.05,METAL_SATELLITE:.20,RESOURCE_THEMATIC:.15},
    moderate:{CORE_GLOBAL:1.35,CORE_DEVELOPED:1.25,US_TILT:.85,GROWTH_TILT:.75,THEMATIC:.45,BOND_CORE:.90,METAL_DEFENSE:.85,METAL_SATELLITE:.25,RESOURCE_THEMATIC:.20},
    growth:{CORE_GLOBAL:1.15,CORE_DEVELOPED:1.05,US_TILT:1.00,GROWTH_TILT:1.00,THEMATIC:.72,BOND_CORE:.45,METAL_DEFENSE:.55,METAL_SATELLITE:.28,RESOURCE_THEMATIC:.28}
  };
  const ROLE_CAP = {
    conservative:{CORE_GLOBAL:.45,CORE_DEVELOPED:.38,US_TILT:.12,GROWTH_TILT:.08,THEMATIC:.05,BOND_CORE:.22,METAL_DEFENSE:.12,METAL_SATELLITE:.03,RESOURCE_THEMATIC:.03},
    moderate:{CORE_GLOBAL:.45,CORE_DEVELOPED:.40,US_TILT:.18,GROWTH_TILT:.14,THEMATIC:.08,BOND_CORE:.18,METAL_DEFENSE:.10,METAL_SATELLITE:.04,RESOURCE_THEMATIC:.04},
    growth:{CORE_GLOBAL:.45,CORE_DEVELOPED:.40,US_TILT:.22,GROWTH_TILT:.18,THEMATIC:.12,BOND_CORE:.10,METAL_DEFENSE:.08,METAL_SATELLITE:.05,RESOURCE_THEMATIC:.06}
  };

  let CTX={data:null,config:null,track:null};
  let bound=false;

  const $=s=>document.querySelector(s);
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const fmtEur=v=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v)||0);
  const fmtPct=v=>v==null?'—':(Number(v)>0?'+':'')+Number(v).toFixed(1)+'%';
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function readState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{return null}}
  function writeState(x){localStorage.setItem(STORAGE_KEY,JSON.stringify(x))}
  function clearState(){localStorage.removeItem(STORAGE_KEY)}

  function statusIt(v){
    return ({
      'DATA INSUFFICIENT':'DATI INSUFFICIENTI','WAIT':'ASPETTA','WAIT / CASH':'ASPETTA / LIQUIDITÀ',
      'ALLOW SHADOW ALLOCATION':'ALLOCAZIONE VIRTUALE CONSENTITA','BLOCKED':'BLOCCATA',
      'ACCUMULATE':'ACCUMULA','ATTRACTIVE':'INTERESSANTE','WATCH':'OSSERVA','NEUTRAL':'NEUTRALE',
      'EXPENSIVE / RISK HIGH':'CARO / RISCHIO ALTO','RISK-OFF':'AVVERSIONE AL RISCHIO',
      'CORRECTION':'CORREZIONE','RISK-ON':'PROPENSIONE AL RISCHIO','EARLY / MID BULL':'FASE RIALZISTA','MIXED':'MISTO',
      'STRONG':'FORTE','MODERATE':'MODERATA','WEAK':'DEBOLE'
    }[String(v||'').toUpperCase()]||v||'—');
  }

  function marketKeyForEtf(etf){return PROXY_TO_MARKET[etf.proxy_id]||null}
  function scoreForEtf(etf,data){
    const key=marketKeyForEtf(etf);
    return key && data?.scores?.[key] ? data.scores[key] : null;
  }

  function riskGovernor(data){
    const q=data?.data_quality||{};
    const coverage=num(q.coverage_pct)||0;
    const best=data?.today?.best_opportunity||{};
    const risk=data?.today?.biggest_risk||{};
    const global=num(data?.global_market?.score);
    const reasons=[];

    if(!data) reasons.push('Nessuno snapshot di mercato verificato è stato caricato.');
    if(coverage<60) reasons.push('La copertura dei dati verificati è inferiore al 60%.');
    if(global==null) reasons.push('Lo score globale di mercato non è disponibile.');
    if(!num(best.score)) reasons.push('Nessuna opportunità con score ha superato il filtro dati.');
    if(String(risk.severity||'').toUpperCase()==='HIGH' && (num(best.score)||0)<80) reasons.push('Rischio alto senza evidenza eccezionalmente forte.');

    const blocked=reasons.length>0;
    return {
      shadow:blocked?'ASPETTA / LIQUIDITÀ':'ALLOCAZIONE VIRTUALE CONSENTITA',
      real:'BLOCCATA',
      blocked,
      coverage,
      reasons:blocked?reasons:['I dati verificati sono sufficienti per una simulazione con denaro virtuale.']
    };
  }

  function scenarioLens(data){
    const score=num(data?.global_market?.score);
    const vix=num(data?.macro?.vix?.price);
    const regime=String(data?.global_market?.regime||'DATA INSUFFICIENT').toUpperCase();
    if(score==null) return {bull:null,base:null,bear:null,label:'DATI INSUFFICIENTI'};

    let bull=30+(score-50)*.45;
    let bear=30-(score-50)*.35;
    if(vix!=null){
      if(vix>=30){bull-=8;bear+=12}
      else if(vix<=18){bull+=6;bear-=5}
    }
    if(/RISK-OFF|CORRECTION/.test(regime)){bull-=7;bear+=10}
    if(/RISK-ON|BULL/.test(regime)){bull+=6;bear-=4}

    bull=clamp(bull,10,65);
    bear=clamp(bear,10,65);
    let base=100-bull-bear;
    if(base<20){const take=(20-base)/2;bull-=take;bear-=take;base=20}
    const total=bull+base+bear;
    bull=Math.round(bull/total*100);
    bear=Math.round(bear/total*100);
    base=100-bull-bear;
    return {bull,base,bear,label:'PESI DI SCENARIO MODELLATI'};
  }

  function debate(data){
    const idea=data?.today?.top_ideas?.[0]||null;
    const best=data?.today?.best_opportunity||{};
    const asset=idea?.asset||best.asset||'Nessun candidato';
    const bull=(idea?.why||[]).slice(0,3);
    const bear=(idea?.risks||[]).slice(0,3);
    if(!bull.length) bull.push('Nessuna tesi positiva verificata ha superato il filtro di evidenza.');
    if(!bear.length) bear.push(data?.today?.biggest_risk?.detail||'L’evidenza sui rischi è incompleta.');
    return {asset,bull,bear,score:num(idea?.score??best.score),action:idea?.action||best.status||'WAIT'};
  }

  function eligibleEtfs(data,config,profile){
    return (config?.etfs||[]).filter(etf=>etf.paper_eligible!==false).map(etf=>{
      const s=scoreForEtf(etf,data);
      const score=num(s?.score);
      const marketKey=marketKeyForEtf(etf);
      const m=marketKey?data?.market?.[marketKey]:null;
      const price=num(m?.price);
      const fresh=m?.fresh!==false;
      const roleMult=ROLE_MULTIPLIER[profile]?.[etf.role]??.35;
      return {etf,score,status:s?.status||'DATA INSUFFICIENT',marketKey,price,fresh,merit:score==null?0:Math.max(0,score-50)*roleMult};
    }).filter(x=>x.score!=null && x.score>=62 && x.price!=null && x.fresh && x.merit>0)
      .sort((a,b)=>b.merit-a.merit);
  }

  function investedTarget(profile,data){
    let target=profile==='conservative'?.55:profile==='growth'?.90:.75;
    const regime=String(data?.global_market?.regime||'').toUpperCase();
    const risk=String(data?.today?.biggest_risk?.severity||'').toUpperCase();
    if(/RISK-OFF|CORRECTION/.test(regime)) target-=.20;
    if(risk==='HIGH') target-=.10;
    return clamp(target,.25,.92);
  }

  function buildVirtualPortfolio(capital,profile,data,config){
    const governor=riskGovernor(data);
    const now=new Date().toISOString();
    const globalPrice=num(data?.market?.global_equity?.price);

    if(governor.blocked){
      return {
        version:2,createdAt:now,profile,startingCapital:capital,cash:capital,positions:[],
        benchmarkEntry:globalPrice,benchmarkEntryDate:data?.market?.global_equity?.date||null,
        governorAtEntry:governor.shadow,note:'Il Risk Governor ha lasciato il portafoglio virtuale interamente in liquidità.'
      };
    }

    const picks=eligibleEtfs(data,config,profile).slice(0,7);
    if(!picks.length){
      return {
        version:2,createdAt:now,profile,startingCapital:capital,cash:capital,positions:[],
        benchmarkEntry:globalPrice,benchmarkEntryDate:data?.market?.global_equity?.date||null,
        governorAtEntry:'ASPETTA / LIQUIDITÀ',note:'Nessun candidato ha superato insieme score, prezzo proxy e qualità dati.'
      };
    }

    const target=investedTarget(profile,data);
    const meritTotal=picks.reduce((a,x)=>a+x.merit,0)||1;
    let allocated=0;
    const positions=[];

    for(const p of picks){
      const raw=target*(p.merit/meritTotal);
      const cap=ROLE_CAP[profile]?.[p.etf.role]??.08;
      const weight=Math.min(raw,cap);
      const notional=Math.floor(capital*weight);
      if(notional<50) continue;
      allocated+=notional;
      positions.push({
        id:p.etf.id,ticker:p.etf.ticker,name:p.etf.name,role:p.etf.role,roleIt:p.etf.role_it,
        marketKey:p.marketKey,proxySymbol:p.etf.proxy_id,entryProxyPrice:p.price,
        entryProxyDate:data?.market?.[p.marketKey]?.date||null,notional,scoreAtEntry:p.score,
        signalAtEntry:p.status
      });
    }

    return {
      version:2,createdAt:now,profile,startingCapital:capital,
      cash:Math.max(0,capital-allocated),positions,
      benchmarkEntry:globalPrice,benchmarkEntryDate:data?.market?.global_equity?.date||null,
      governorAtEntry:governor.shadow,note:'Portafoglio simulato. Questo modulo non può generare ordini reali.'
    };
  }

  function markPortfolio(state,data){
    if(!state) return null;
    let positionsValue=0;
    const positions=(state.positions||[]).map(p=>{
      const current=num(data?.market?.[p.marketKey]?.price);
      const ratio=current!=null && num(p.entryProxyPrice)>0 ? current/Number(p.entryProxyPrice) : 1;
      const value=Number(p.notional||0)*ratio;
      positionsValue+=value;
      return {...p,currentProxyPrice:current,currentValue:value,pnlPct:(ratio-1)*100,stale:current==null};
    });
    const total=Number(state.cash||0)+positionsValue;
    const pnlPct=Number(state.startingCapital)>0?(total/Number(state.startingCapital)-1)*100:null;
    const benchNow=num(data?.market?.global_equity?.price);
    const benchPct=benchNow!=null && num(state.benchmarkEntry)>0?(benchNow/Number(state.benchmarkEntry)-1)*100:null;
    return {...state,positions,total,pnlPct,benchmarkPct:benchPct};
  }

  function renderIntelligence(){
    const data=CTX.data;
    const gov=riskGovernor(data);
    const scen=scenarioLens(data);
    const d=debate(data);

    const asset=$('#debateAsset'); if(asset) asset.textContent=d.asset;
    const bull=$('#bullCase'); if(bull) bull.innerHTML=d.bull.map(x=>'<li>'+esc(x)+'</li>').join('');
    const bear=$('#bearCase'); if(bear) bear.innerHTML=d.bear.map(x=>'<li>'+esc(x)+'</li>').join('');
    const verdict=$('#debateVerdict'); if(verdict) verdict.textContent=statusIt(d.action)+(d.score!=null?' · '+d.score+'/100':'');

    const gstate=$('#governorState'); if(gstate) gstate.textContent=gov.shadow;
    const greal=$('#governorReal'); if(greal) greal.textContent='ESECUZIONE REALE: '+gov.real;
    const greasons=$('#governorReasons'); if(greasons) greasons.innerHTML=gov.reasons.map(x=>'<li>'+esc(x)+'</li>').join('');

    const sb=$('#scenarioBull'), ss=$('#scenarioBase'), sr=$('#scenarioBear');
    if(sb) sb.textContent=scen.bull==null?'—':scen.bull+'%';
    if(ss) ss.textContent=scen.base==null?'—':scen.base+'%';
    if(sr) sr.textContent=scen.bear==null?'—':scen.bear+'%';
    const sl=$('#scenarioLabel'); if(sl) sl.textContent=scen.label;

    const packet=$('#decisionPacket');
    if(packet){
      const q=data?.data_quality||{};
      packet.innerHTML=[
        ['REGIME',statusIt(data?.global_market?.regime||'DATA INSUFFICIENT')],
        ['EVIDENZA',statusIt(q.state||'WEAK')+' · '+(q.coverage_pct??0)+'%'],
        ['DIBATTITO',statusIt(d.action||'WAIT')],
        ['RISK GOVERNOR',gov.shadow]
      ].map(([k,v])=>'<div class="mini"><span>'+esc(k)+'</span><b>'+esc(v)+'</b></div>').join('');
    }
  }

  function renderVirtual(){
    const root=$('#virtualHoldings');
    if(!root) return;
    const raw=readState();
    const state=markPortfolio(raw,CTX.data);

    if(!state){
      root.innerHTML='<div class="empty">Nessun portafoglio virtuale. Scegli capitale e profilo, poi avvia ARGUS.</div>';
      ['#virtualValue','#virtualCash','#virtualPnl','#virtualBenchmark'].forEach(id=>{const e=$(id);if(e)e.textContent='—'});
      return;
    }

    const cap=$('#vCap'); if(cap) cap.value=Math.round(state.startingCapital||100000);
    const prof=$('#vProfile'); if(prof) prof.value=state.profile||'moderate';

    const vv=$('#virtualValue'); if(vv) vv.textContent=fmtEur(state.total);
    const vc=$('#virtualCash'); if(vc) vc.textContent=fmtEur(state.cash);
    const vp=$('#virtualPnl'); if(vp) vp.textContent=fmtPct(state.pnlPct);
    const vb=$('#virtualBenchmark'); if(vb) vb.textContent=fmtPct(state.benchmarkPct);

    if(!(state.positions||[]).length){
      root.innerHTML='<div class="empty"><b>100% LIQUIDITÀ VIRTUALE</b><br>'+esc(state.note||'Filtro rischio attivo.')+'<br><span class="muted">Creato '+esc((state.createdAt||'').slice(0,16).replace('T',' '))+'</span></div>';
      return;
    }

    root.innerHTML=state.positions.map(p=>
      '<div class="virtual-row">'+
        '<div><b>'+esc(p.ticker)+'</b><span>'+esc(p.roleIt||p.role)+' · proxy '+esc(p.proxySymbol||p.marketKey)+'</span></div>'+
        '<div><span>INIZIO</span><b>'+fmtEur(p.notional)+'</b></div>'+
        '<div><span>ORA</span><b>'+fmtEur(p.currentValue)+'</b></div>'+
        '<div><span>P/L</span><b class="'+(p.pnlPct>=0?'good':'risk')+'">'+fmtPct(p.pnlPct)+'</b></div>'+
      '</div>'
    ).join('')+
    '<div class="notice" style="margin-top:10px"><strong>SOLO VIRTUALE:</strong> i valori sono aggiornati con prezzi proxy verificati quando disponibili. Nessun ordine reale, nessun broker, nessuna esecuzione automatica.</div>';
  }

  function bind(){
    if(bound) return;
    bound=true;
    $('#buildVirtual')?.addEventListener('click',()=>{
      const capital=Math.max(1000,Number($('#vCap')?.value)||100000);
      const profile=$('#vProfile')?.value||'moderate';
      writeState(buildVirtualPortfolio(capital,profile,CTX.data,CTX.config));
      renderVirtual();
    });
    $('#resetVirtual')?.addEventListener('click',()=>{clearState();renderVirtual()});
  }

  function render(ctx){
    CTX={...CTX,...ctx};
    bind();
    renderIntelligence();
    renderVirtual();
  }

  window.ARGUS_CAPITAL_LAB={render,riskGovernor,scenarioLens,buildVirtualPortfolio,markPortfolio};
})();