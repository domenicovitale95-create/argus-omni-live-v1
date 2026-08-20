import { listJson, readManyJson, writeJson, storageReady } from './_report-store.js';

const PREFIX='argus/ledger/';
const OUT='argus/learning/ledger-diagnostics.json';
const n=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function bucket(v,step=10){const x=n(v);if(x==null)return'UNKNOWN';const lo=Math.floor(x/step)*step;return`${lo}-${lo+step-1}`}
function oddsBucket(o){const x=n(o);if(x==null)return'NO_PRICE';if(x<1.5)return'<1.50';if(x<1.8)return'1.50-1.79';if(x<2.2)return'1.80-2.19';if(x<3)return'2.20-2.99';return'3.00+'}
function regime(rec){const r=rec?.context?.regime||rec?.marketRegime||{};return String(r.type||r.regime||r.label||'UNKNOWN').toUpperCase()}
function rowStats(rows){
 const settled=rows.filter(r=>['WIN','LOSS'].includes(r.settlement?.status));
 const wins=settled.filter(r=>r.settlement.status==='WIN').length;
 const priced=settled.filter(r=>Number.isFinite(Number(r.settlement?.pl)));
 const pl=priced.reduce((s,r)=>s+Number(r.settlement.pl),0);
 const calibrated=settled.filter(r=>n(r.confidence)!=null);
 let brier=null,logLoss=null,calibrationError=null,meanConfidence=null;
 if(calibrated.length){
   let bs=0,ll=0,conf=0;
   for(const r of calibrated){const p=clamp(n(r.confidence,50)/100,0.001,0.999),y=r.settlement.status==='WIN'?1:0;bs+=Math.pow(p-y,2);ll+=-(y*Math.log(p)+(1-y)*Math.log(1-p));conf+=p;}
   brier=bs/calibrated.length;logLoss=ll/calibrated.length;meanConfidence=conf/calibrated.length*100;
   calibrationError=Math.abs(meanConfidence-(wins/Math.max(1,settled.length)*100));
 }
 return{sample:settled.length,wins,losses:settled.length-wins,hitRate:settled.length?Number((wins/settled.length*100).toFixed(1)):null,priced:priced.length,flatPL:Number(pl.toFixed(2)),roi:priced.length?Number((pl/priced.length*100).toFixed(1)):null,brier:brier==null?null:Number(brier.toFixed(4)),logLoss:logLoss==null?null:Number(logLoss.toFixed(4)),meanConfidence:meanConfidence==null?null:Number(meanConfidence.toFixed(1)),calibrationError:calibrationError==null?null:Number(calibrationError.toFixed(1)),confidenceGap:calibrationError==null?null:Number((meanConfidence-(wins/Math.max(1,settled.length)*100)).toFixed(1))};
}
function classify(s){
 if(s.sample<20)return{status:'LEARNING',multiplier:1,confidencePenalty:0,reason:'Sample <20; no adaptation'};
 let mult=1,penalty=0,status='NEUTRAL',reason='No material evidence';
 if((s.roi!=null&&s.priced>=20&&s.roi<=-12)||(s.calibrationError!=null&&s.calibrationError>=15)||(s.brier!=null&&s.brier>=.30)){status='DEGRADED';mult=.80;penalty=8;reason='Strong negative evidence, poor calibration or weak probability quality'}
 else if((s.roi!=null&&s.priced>=20&&s.roi<=-5)||(s.calibrationError!=null&&s.calibrationError>=9)||(s.brier!=null&&s.brier>=.27)){status='CAUTION';mult=.90;penalty=4;reason='Negative evidence or calibration gap'}
 else if(s.sample>=100&&s.priced>=60&&s.roi!=null&&s.roi>3&&s.calibrationError!=null&&s.calibrationError<=5&&s.brier!=null&&s.brier<.25){status='VALIDATING_POSITIVE';mult=1.01;penalty=0;reason='Large sample with positive ROI and stable probability calibration'}
 return{status,multiplier:mult,confidencePenalty:penalty,reason};
}
function group(rows,keyFn){const m={};for(const r of rows){const k=keyFn(r);(m[k]||(m[k]=[])).push(r)}return Object.fromEntries(Object.entries(m).map(([k,v])=>{const s=rowStats(v);return[k,{...s,...classify(s)}]}));}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
 const blobs=await listJson(PREFIX,3650),books=await readManyJson(blobs),rows=books.flatMap(b=>b?.records||[]).filter(r=>['WIN','LOSS'].includes(r.settlement?.status));
 const globalStats=rowStats(rows);
 const diagnostics={version:'LEDGER-LEARNING-2',generatedAt:new Date().toISOString(),totalSettled:rows.length,policy:{historyWindowDays:3650,negativeAdaptationMinSample:20,positiveAdaptationMinSample:100,positivePricedMinSample:60,minMultiplier:.80,maxMultiplier:1.01,metrics:['hitRate','roi','brier','logLoss','calibrationError','confidenceGap'],paperBetting:true,noHindsight:true,principle:'Learn fast to distrust; learn slowly to boost. Probability quality outranks raw win rate. No segment may create PRIME by itself.'},global:{...globalStats,...classify(globalStats)},byLeague:group(rows,r=>r.competition||'UNKNOWN'),byVerdict:group(rows,r=>String(r.verdict||'UNKNOWN').toUpperCase()),bySelection:group(rows,r=>r.selection||'UNKNOWN'),byConfidence:group(rows,r=>bucket(r.confidence,10)),byOdds:group(rows,r=>oddsBucket(r.odds)),byRegime:group(rows,r=>regime(r)),byLeagueVerdict:group(rows,r=>`${r.competition||'UNKNOWN'}|||${String(r.verdict||'UNKNOWN').toUpperCase()}`)};
 await writeJson(OUT,diagnostics);return res.status(200).json(diagnostics);
}
