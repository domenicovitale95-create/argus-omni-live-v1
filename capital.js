const state={assets:[],filter:"all"};
const presets={
  defensive:{label:"Defensive",text:"Defensive: more stability, less growth concentration.",parts:[["Global core ETF",45],["Gold",25],["Cash reserve",25],["Growth / technology",5]]},
  balanced:{label:"Balanced",text:"Balanced: diversified core with measured growth exposure.",parts:[["Global core ETF",60],["Growth / technology",20],["Gold",15],["Cash reserve",5]]},
  growth:{label:"Growth",text:"Growth: higher equity and technology exposure, with bigger drawdown risk.",parts:[["Global core ETF",55],["Growth / technology",35],["Gold",5],["Cash reserve",5]]}
};
let activePreset="balanced";
function money(v,c){if(v==null||Number.isNaN(v))return "—";try{return new Intl.NumberFormat("en-BE",{style:"currency",currency:c||"EUR",maximumFractionDigits:v>1000?0:2}).format(v)}catch(e){return Number(v).toFixed(2)}}
function pct(v){if(v==null||Number.isNaN(v))return "—";return (v>=0?"+":"")+v.toFixed(2)+"%"}
function cls(v){if(v==null)return "flat";return v>.05?"pos":v<-.05?"neg":"flat"}
function scoreClass(v){return v>=70?"pos":v<45?"neg":"flat"}
function find(id){return state.assets.find(function(a){return a.id===id})}
function updateStrip(){
  [["vwce","vwce"],["spy","spy"],["gold","gold"],["oil","oil"],["btc","btc"]].forEach(function(pair){
    const a=find(pair[0]); if(!a)return;
    const q=document.getElementById("q-"+pair[1]); const c=document.getElementById("c-"+pair[1]);
    q.textContent=money(a.price,a.currency); c.textContent=pct(a.change1d); c.className=cls(a.change1d);
  });
}
function renderOpportunities(){
  const el=document.getElementById("opportunityGrid");
  const arr=state.assets.filter(function(a){return a.price!=null}).sort(function(a,b){return b.score-a.score}).slice(0,3);
  el.innerHTML=arr.map(function(a,i){
    const label=i===0?"#1 BEST SIGNAL":i===1?"#2 STRONG WATCH":"#3 WATCH";
    return '<article class="op-card"><div class="op-top"><div><div class="asset-type">'+label+' · '+a.type+'</div></div><div class="score">'+a.score+'</div></div><h3>'+a.name+'</h3><p>'+a.thesis+'</p><div class="metrics"><div><span>1 month</span><b class="'+cls(a.change1m)+'">'+pct(a.change1m)+'</b></div><div><span>3 months</span><b class="'+cls(a.change3m)+'">'+pct(a.change3m)+'</b></div><div><span>Risk</span><b>'+a.risk+'</b></div></div></article>';
  }).join("");
}
function renderTable(){
  const body=document.getElementById("marketTable");
  const arr=state.assets.filter(function(a){return state.filter==="all"||a.type===state.filter});
  body.innerHTML=arr.map(function(a){
    return '<tr><td><div class="asset-name"><strong>'+a.name+'</strong><span>'+a.symbol+'</span></div></td><td><span class="pill">'+a.type+'</span></td><td>'+money(a.price,a.currency)+'</td><td class="'+cls(a.change1d)+'">'+pct(a.change1d)+'</td><td class="'+cls(a.change1m)+'">'+pct(a.change1m)+'</td><td class="'+cls(a.change3m)+'">'+pct(a.change3m)+'</td><td><span class="score-pill '+scoreClass(a.score)+'"><i></i>'+a.score+'/100</span></td></tr>';
  }).join("");
}
function renderVerdict(meta){
  const trad=state.assets.filter(function(a){return a.type!=="Crypto"&&a.price!=null});
  const avg=trad.length?trad.reduce(function(s,a){return s+a.score},0)/trad.length:50;
  const best=state.assets.filter(function(a){return a.price!=null}).sort(function(a,b){return b.score-a.score})[0];
  let regime="Neutral",verdict="STAY SELECTIVE",risk="Medium",text="Mixed signals. Prefer gradual entries and avoid chasing short-term moves.";
  if(avg>=62){regime="Risk-on";verdict="BUILD GRADUALLY";risk="Medium";text="Broad momentum is constructive. Focus on quality and keep position sizes disciplined."}
  if(avg<44){regime="Risk-off";verdict="PROTECT CAPITAL";risk="High";text="Market momentum is weak. Cash, diversification and patience matter more than forcing new positions."}
  document.getElementById("marketVerdict").textContent=verdict;
  document.getElementById("regime").textContent=regime;
  document.getElementById("bestSignal").textContent=best?best.name:"—";
  document.getElementById("riskLevel").textContent=risk;
  document.getElementById("verdictText").textContent=text;
  document.getElementById("lastUpdate").textContent="Updated "+new Date(meta.updatedAt||Date.now()).toLocaleString("en-BE")+" · indicative / delayed data";
}
function renderSimulator(){
  const amount=Math.max(0,Number(document.getElementById("amountInput").value)||0);
  const p=presets[activePreset];
  document.getElementById("presetText").textContent=p.text;
  document.getElementById("simResult").innerHTML=p.parts.map(function(x){
    const value=amount*x[1]/100;
    return '<div class="sim-item"><span>'+x[0]+' · '+x[1]+'%</span><strong>'+money(value,"EUR")+'</strong><small>Virtual allocation</small></div>';
  }).join("");
}
async function loadData(){
  const btn=document.getElementById("refreshBtn"); btn.disabled=true; btn.textContent="Refreshing…";
  try{
    const res=await fetch("/api/capital-market?ts="+Date.now(),{cache:"no-store"});
    if(!res.ok)throw new Error("market endpoint");
    const data=await res.json(); state.assets=data.assets||[];
    updateStrip();renderOpportunities();renderTable();renderVerdict(data);
  }catch(e){
    document.getElementById("lastUpdate").textContent="Market data temporarily unavailable. Try refresh.";
    document.getElementById("marketVerdict").textContent="DATA CHECK";
    document.getElementById("verdictText").textContent="ARGUS will not invent prices when the market feed is unavailable.";
  }finally{btn.disabled=false;btn.textContent="Refresh data"}
}
document.getElementById("refreshBtn").addEventListener("click",loadData);
document.querySelectorAll(".tab").forEach(function(b){b.addEventListener("click",function(){
  document.querySelectorAll(".tab").forEach(function(x){x.classList.remove("active")}); b.classList.add("active");state.filter=b.dataset.filter;renderTable();
})});
document.querySelectorAll(".preset").forEach(function(b){b.addEventListener("click",function(){
  document.querySelectorAll(".preset").forEach(function(x){x.classList.remove("active")});b.classList.add("active");activePreset=b.dataset.preset;renderSimulator();
})});
document.getElementById("amountInput").addEventListener("input",renderSimulator);
renderSimulator();loadData();