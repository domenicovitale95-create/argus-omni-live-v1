import { readJsonFresh, storageReady } from './_report-store.js';

const STATE='argus/paper/training-bets-v1.json';
const ONE_X_TWO=new Set(['HOME','DRAW','AWAY']);
const n=(v,f=null)=>{if(v===null||v===undefined||v==='')return f;const x=Number(v);return Number.isFinite(x)?x:f};
const round=(v,d=2)=>Number.isFinite(v)?Number(v.toFixed(d)):null;
const canonical=v=>String(v||'').trim().toUpperCase().replace(/[^A-Z0-9:.-]+/g,'_').replace(/^_|_$/g,'');
const decided=b=>b?.status==='WIN'||b?.status==='LOSS';

function selectionProfile(rows,key){
  const selected=rows.filter(b=>canonical(b.selection)===key),settled=selected.filter(decided),wins=settled.filter(b=>b.status==='WIN').length,losses=settled.length-wins;
  const probs=settled.map(b=>n(b.probability)).filter(p=>p!=null&&p>0&&p<1),edges=selected.map(b=>n(b.edgePct)).filter(Number.isFinite),odds=selected.map(b=>n(b.odds)).filter(x=>x>1);
  const expectedWins=probs.reduce((s,p)=>s+p,0),meanPredicted=probs.length?expectedWins/probs.length:null,observed=settled.length?wins/settled.length:null;
  return{tracked:selected.length,settled:settled.length,wins,losses,meanPredictedPct:meanPredicted==null?null:round(meanPredicted*100,1),observedWinPct:observed==null?null:round(observed*100,1),calibrationGapPp:meanPredicted==null||observed==null?null:round((meanPredicted-observed)*100,1),avgEdgePct:edges.length?round(edges.reduce((a,b)=>a+b,0)/edges.length,2):null,avgOdds:odds.length?round(odds.reduce((a,b)=>a+b,0)/odds.length,3):null};
}

function auditProfile(rows){
  const has=v=>v!==null&&v!==undefined&&v!=='';
  const counts={modelProbability:0,marketProbability:0,rawEdgePct:0,source:0,marketFusion:0,complete:0};
  for(const b of rows){
    const model=has(b.modelProbability),market=has(b.marketProbability),raw=has(b.rawEdgePct),source=Boolean(b.modelSource||b.source||b.marketFusion?.mode),fusion=Boolean(b.marketFusion);
    if(model)counts.modelProbability++;if(market)counts.marketProbability++;if(raw)counts.rawEdgePct++;if(source)counts.source++;if(fusion)counts.marketFusion++;if(model&&market&&raw&&source&&fusion)counts.complete++;
  }
  const total=rows.length,pct=x=>total?round(x/total*100,1):null;
  return{total,...counts,completePct:pct(counts.complete),modelProbabilityPct:pct(counts.modelProbability),marketProbabilityPct:pct(counts.marketProbability),rawEdgePctCoverage:pct(counts.rawEdgePct),sourcePct:pct(counts.source),marketFusionPct:pct(counts.marketFusion)};
}

function diagnostics(rows){
  const oneXtwo=rows.filter(b=>ONE_X_TWO.has(canonical(b.selection))),settled=oneXtwo.filter(decided),counts={HOME:0,DRAW:0,AWAY:0};
  for(const b of oneXtwo)counts[canonical(b.selection)]++;
  const total=oneXtwo.length,shares=Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,total?round(v/total*100,1):0])),dominant=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]||['NONE',0],maxShare=total?dominant[1]/total:0;
  const validProb=settled.filter(b=>{const p=n(b.probability);return p!=null&&p>0&&p<1}),expectedWins=validProb.reduce((s,b)=>s+n(b.probability),0),actualWins=validProb.filter(b=>b.status==='WIN').length,meanPredicted=validProb.length?expectedWins/validProb.length:null,observed=validProb.length?actualWins/validProb.length:null;
  let brier=null;if(validProb.length)brier=validProb.reduce((s,b)=>{const p=n(b.probability),y=b.status==='WIN'?1:0;return s+(p-y)**2},0)/validProb.length;
  const flags=[];
  if(total>=20&&counts.HOME===0)flags.push('HOME_MISSING_1X2');
  if(total>=20&&maxShare>=.70)flags.push('SELECTION_CONCENTRATION_HIGH');
  if(total>=20&&(counts.DRAW+counts.AWAY)/total>=.90)flags.push('DRAW_AWAY_DOMINANCE');
  if(validProb.length>=15&&meanPredicted-observed>=.15)flags.push('OOS_CALIBRATION_WARNING');
  const audit=auditProfile(rows);if(rows.length>=10&&audit.completePct!=null&&audit.completePct<80)flags.push('AUDIT_TRAIL_INCOMPLETE');
  return{sample:{tracked:rows.length,oneXtwo:total,settledOneXtwo:settled.length,probabilitySettled:validProb.length},selectionDistribution:{counts,sharesPct:shares,dominantSelection:dominant[0],dominantSharePct:round(maxShare*100,1)},performance:{expectedWins:round(expectedWins,2),actualWins,meanPredictedPct:meanPredicted==null?null:round(meanPredicted*100,1),observedWinPct:observed==null?null:round(observed*100,1),calibrationGapPp:meanPredicted==null||observed==null?null:round((meanPredicted-observed)*100,1),brier:brier==null?null:round(brier,4)},bySelection:{HOME:selectionProfile(oneXtwo,'HOME'),DRAW:selectionProfile(oneXtwo,'DRAW'),AWAY:selectionProfile(oneXtwo,'AWAY')},audit,flags};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({ok:false,error:'Training storage unavailable'});
  const state=await readJsonFresh(STATE,null),rows=Object.values(state?.bets||{});
  const d=diagnostics(rows);
  return res.status(200).json({ok:true,version:'TRAINING-BIAS-DIAGNOSTIC-1',generatedAt:new Date().toISOString(),diagnostics:d,policy:{diagnosticOnly:true,changesOfficialDecisionPolicy:false,forceSelectionBalance:false,rule:'Never force HOME/DRAW/AWAY balance. Diagnose source calibration and selection concentration first; apply probability calibration only with sufficient prospective out-of-sample evidence.'},recommendedNext:['PRESERVE_MODEL_MARKET_AUDIT_TRAIL','KEEP_EXPLORATORY_SHADOW_SEPARATE_FROM_OFFICIAL_VALIDATION','CALIBRATE_SOURCE_PROBABILITIES_ONLY_AFTER_SUFFICIENT_OOS_SAMPLE','PREFER_CONSERVATIVE_PARAMETRIC_OR_TEMPERATURE_CALIBRATION_BEFORE_FLEXIBLE_ISOTONIC_AT_SMALL_SAMPLE']});
}
