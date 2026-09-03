(() => {
  'use strict';

  const STORAGE_KEY = 'argusCapitalVirtualPortfolioV1';
  const PROXY_TO_MARKET = { acwi:'global_equity', spy:'sp500', qqq:'nasdaq', smh:'semis' };
  const ROLE_MULTIPLIER = {
    conservative:{CORE_GLOBAL:1.45,CORE_DEVELOPED:1.35,US_TILT:.70,GROWTH_TILT:.55,THEMATIC:.28},
    moderate:{CORE_GLOBAL:1.35,CORE_DEVELOPED:1.25,US_TILT:.90,GROWTH_TILT:.80,THEMATIC:.55},
    growth:{CORE_GLOBAL:1.15,CORE_DEVELOPED:1.05,US_TILT:1.05,GROWTH_TILT:1.05,THEMATIC:.82}
  };
  const ROLE_CAP = {
    conservative:{CORE_GLOBAL:.45,CORE_DEVELOPED:.38,US_TILT:.15,GROWTH_TILT:.10,THEMATIC:.06},
    moderate:{CORE_GLOBAL:.45,CORE_DEVELOPED:.40,US_TILT:.20,GROWTH_TILT:.16,THEMATIC:.10},
    growth:{CORE_GLOBAL:.45,CORE_DEVELOPED:.40,US_TILT:.25,GROWTH_TILT:.20,THEMATIC:.15}
  };

  let CTX={data:null,config:null,track:null};
  let bound=false;

  const $=s=>document.querySelector(s);
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const fmtEur=v=>new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v)||0);
  const fmtPct=v=>v==null?'—':(Number(v)>0?'+':'')+Number(v).toFixed(1)+'%';
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function readState(){
    try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{return null}
  }
  function writeState(x){localStorage.setItem(STORAGE_KEY,JSON.stringify(x))}
  function clearState(){localStorage.removeItem(STORAGE_KEY)}

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

    if(!data){reasons.push('No verified market snapshot loaded.')}
    if(coverage<60) reasons.push('Verified data coverage is below 60%.');
    if(global==null) reasons.push('Global market score is unavailable.');
    if(!num(best.score)) reasons.push('No scored opportunity passed the current data gate.');
    if(String(risk.severity||'').toUpperCase()==='HIGH' && (num(best.score)||0)<80) reasons.push('High risk state without exceptional evidence.');

    const blocked=reasons.length>0;
    return {
      shadow:blocked?'WAIT / CASH':'ALLOW SHADOW ALLOCATION',
      real:'BLOCKED',
      blocked,
      coverage,
      reasons:blocked?reasons:['Verified inputs are sufficient for a paper-only allocation.']
    };
  }

  function scenarioLens(data){
    const score=num(data?.global_market?.score);
    const vix=num(data?.macro?.vix?.price);
    const regime=String(data?.global_market?.regime||'DATA INSUFFICIENT').toUpperCase();
    if(score==null) return {bull:null,base:null,bear:null,label:'DATA INSUFFICIENT'};

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
    if(base<20){
      const take=(20-base)/2;
      bull-=take;bear-=take;base=20;
    }
    const total=bull+base+bear;
    bull=Math.round(bull/total*100);
    bear=Math.round(bear/total*100);
    base=100-bull-bear;
    return {bull,base,bear,label:'MODELLED SCENARIO WEIGHTS'};
  }

  function debate(data){
    const idea=data?.today?.top_ideas?.[0]||null;
    const best=data?.today?.best_opportunity||{};
    const asset=idea?.asset||best.asset||'No candidate';
    const bull=(idea?.why||[]).slice(0,3);
    const bear=(idea?.risks||[]).slice(0,3);
    if(!bull.length) bull.push('No verified bullish thesis has passed the evidence gate.');
    if(!bear.length) bear.push(data?.today?.biggest_risk?.detail||'Risk evidence is incomplete.');
    return {asset,bull,bear,score:num(idea?.score??best.score),action:idea?.action||best.status||'WAIT'};
  }

  function eligibleEtfs(data,config,profile){
    return (config?.etfs||[]).map(etf=>{
      const s=scoreForEtf(etf,data);
      const score=num(s?.score);
      const marketKey=marketKeyForEtf(etf);
      const m=marketKey?data?.market?.[marketKey]:null;
      const price=num(m?.price);
      const fresh=m?.fresh!==false;
      const roleMult=ROLE_MULTIPLIER[profile]?.[etf.role]??.5;
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
        version:1,createdAt:now,profile,startingCapital:capital,cash:capital,positions:[],
        benchmarkEntry:globalPrice,benchmarkEntryDate:data?.market?.global_equity?.date||null,
        governorAtEntry:governor.shadow,note:'Risk Governor kept the virtual portfolio in cash.'
      };
    }

    const picks=eligibleEtfs(data,config,profile).slice(0,6);
    if(!picks.length){
      return {
        version:1,createdAt:now,profile,startingCapital:capital,cash:capital,positions:[],
        benchmarkEntry:globalPrice,benchmarkEntryDate:data?.market?.global_equity?.date||null,
        governorAtEntry:'WAIT / CASH',note:'No ETF candidate met the verified score and proxy-price gate.'
      };
    }

    const target=investedTarget(profile,data);
    const meritTotal=picks.reduce((a,x)=>a+x.merit,0)||1;
    let allocated=0;
    const positions=[];

    for(const p of picks){
      const raw=target*(p.merit/meritTotal);
      const cap=ROLE_CAP[profile]?.[p.etf.role]??.10;
      const weight=Math.min(raw,cap);
      const notional=Math.floor(capital*weight);
      if(notional<50) continue;
      allocated+=notional;
      positions.push({
        id:p.etf.id,ticker:p.etf.ticker,name:p.etf.name,role:p.etf.role,
        marketKey:p.marketKey,proxySymbol:p.etf.proxy_id,entryProxyPrice:p.price,
        entryProxyDate:data?.market?.[p.marketKey]?.date||null,notional,scoreAtEntry:p.score,
        signalAtEntry:p.status
      });
    }

    return {
      version:1,createdAt:now,profile,startingCapital:capital,
      cash:Math.max(0,capital-allocated),positions,
      benchmarkEntry:globalPrice,benchmarkEntryDate:data?.market?.global_equity?.date||null,
      governorAtEntry:governor.shadow,note:'Paper portfolio. No broker order can be generated from this module.'
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
    const verdict=$('#debateVerdict'); if(verdict) verdict.textContent=(d.action||'WAIT')+(d.score!=null?' · '+d.score+'/100':'');

    const gstate=$('#governorState'); if(gstate) gstate.textContent=gov.shadow;
    const greal=$('#governorReal'); if(greal) greal.textContent='REAL EXECUTION: '+gov.real;
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
        ['REGIME',data?.global_market?.regime||'DATA INSUFFICIENT'],
        ['EVIDENCE',(q.state||'WEAK')+' · '+(q.coverage_pct??0)+'%'],
        ['DEBATE',d.action||'WAIT'],
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
      root.innerHTML='<div class="empty">Aucun portefeuille virtuel. Choisis un capital et un profil, puis lance ARGUS en mode papier.</div>';
      const ids=['#virtualValue','#virtualCash','#virtualPnl','#virtualBenchmark'];
      ids.forEach(id=>{const e=$(id);if(e)e.textContent='—'});
      return;
    }

    const cap=$('#vCap'); if(cap) cap.value=Math.round(state.startingCapital||100000);
    const prof=$('#vProfile'); if(prof) prof.value=state.profile||'moderate';

    const vv=$('#virtualValue'); if(vv) vv.textContent=fmtEur(state.total);
    const vc=$('#virtualCash'); if(vc) vc.textContent=fmtEur(state.cash);
    const vp=$('#virtualPnl'); if(vp) vp.textContent=fmtPct(state.pnlPct);
    const vb=$('#virtualBenchmark'); if(vb) vb.textContent=fmtPct(state.benchmarkPct);

    if(!(state.positions||[]).length){
      root.innerHTML='<div class="empty"><b>100% CASH VIRTUEL</b><br>'+esc(state.note||'Risk gate active.')+'<br><span class="muted">Created '+esc((state.createdAt||'').slice(0,16).replace('T',' '))+'</span></div>';
      return;
    }

    root.innerHTML=state.positions.map(p=>
      '<div class="virtual-row">'+
        '<div><b>'+esc(p.ticker)+'</b><span>'+esc(p.role)+' · proxy '+esc(p.proxySymbol||p.marketKey)+'</span></div>'+
        '<div><span>START</span><b>'+fmtEur(p.notional)+'</b></div>'+
        '<div><span>NOW</span><b>'+fmtEur(p.currentValue)+'</b></div>'+
        '<div><span>P/L</span><b class="'+(p.pnlPct>=0?'good':'risk')+'">'+fmtPct(p.pnlPct)+'</b></div>'+
      '</div>'
    ).join('')+
    '<div class="notice" style="margin-top:10px"><strong>PAPER ONLY:</strong> values are marked to verified proxy prices when available. No real order, broker connection or execution authority exists here.</div>';
  }

  function bind(){
    if(bound) return;
    bound=true;
    const build=$('#buildVirtual');
    if(build) build.addEventListener('click',()=>{
      const capital=Math.max(1000,Number($('#vCap')?.value)||100000);
      const profile=$('#vProfile')?.value||'moderate';
      const state=buildVirtualPortfolio(capital,profile,CTX.data,CTX.config);
      writeState(state);
      renderVirtual();
    });
    const reset=$('#resetVirtual');
    if(reset) reset.addEventListener('click',()=>{
      clearState();
      renderVirtual();
    });
  }

  function render(ctx){
    CTX={...CTX,...ctx};
    bind();
    renderIntelligence();
    renderVirtual();
  }

  window.ARGUS_CAPITAL_LAB={render,riskGovernor,scenarioLens,buildVirtualPortfolio,markPortfolio};
})();