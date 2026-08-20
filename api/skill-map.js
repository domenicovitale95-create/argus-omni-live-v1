import { listJson, readManyJson, writeJson, storageReady } from './_report-store.js';

const PREFIX='argus/ledger/';
const OUT='argus/learning/skill-map.json';
const n=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

function oddsBucket(o){const x=n(o);if(x==null)return'NO_PRICE';if(x<1.5)return'<1.50';if(x<1.8)return'1.50-1.79';if(x<2.2)return'1.80-2.19';if(x<3)return'2.20-2.99';return'3.00+'}
function confidenceBucket(c){const x=n(c);if(x==null)return'UNKNOWN';const lo=Math.floor(x/10)*10;return`${lo}-${Math.min(100,lo+9)}`}
function marketKey(r){return String(r.market||r.marketName||r.selection||'1X2').toUpperCase()}
function regimeKey(r){const x=r?.context?.regime||r?.marketRegime||{};return String(x.type||x.regime||x.label||'UNKNOWN').toUpperCase()}
function metric(rows){
  const settled=rows.filter(r=>['WIN','LOSS'].includes(r.settlement?.status));
  const wins=settled.filter(r=>r.settlement.status==='WIN').length;
  const priced=settled.filter(r=>Number.isFinite(Number(r.settlement?.pl)));
  const pl=priced.reduce((s,r)=>s+Number(r.settlement.pl),0);
  const calibrated=settled.filter(r=>n(r.confidence)!=null);
  let brier=null,logLoss=null,meanConfidence=null,calibrationError=null;
  if(calibrated.length){let bs=0,ll=0,conf=0;for(const r of calibrated){const p=clamp(n(r.confidence,50)/100,.001,.999),y=r.settlement.status==='WIN'?1:0;bs+=(p-y)**2;ll+=-(y*Math.log(p)+(1-y)*Math.log(1-p));conf+=p}brier=bs/calibrated.length;logLoss=ll/calibrated.length;meanConfidence=conf/calibrated.length*100;calibrationError=Math.abs(meanConfidence-(wins/Math.max(1,settled.length)*100));}
  return {sample:settled.length,wins,losses:settled.length-wins,hitRate:settled.length?Number((wins/settled.length*100).toFixed(1)):null,priced:priced.length,roi:priced.length?Number((pl/priced.length*100).toFixed(1)):null,brier:brier==null?null:Number(brier.toFixed(4)),logLoss:logLoss==null?null:Number(logLoss.toFixed(4)),calibrationError:calibrationError==null?null:Number(calibrationError.toFixed(1)),meanConfidence:meanConfidence==null?null:Number(meanConfidence.toFixed(1))};
}
function skillScore(s){
  if(s.sample<20)return 20;
  let score=50;
  if(s.sample>=60)score+=8;if(s.sample>=150)score+=6;
  if(s.roi!=null)score+=clamp(s.roi,-15,15)*1.2;
  if(s.brier!=null)score+=clamp((.25-s.brier)*120,-12,12);
  if(s.calibrationError!=null)score+=clamp((6-s.calibrationError)*1.5,-12,9);
  return Math.round(clamp(score,0,100));
}
function status(s,score){if(s.sample<20)return'LEARNING';if(score>=75&&s.sample>=100&&s.roi!=null&&s.roi>2&&s.calibrationError!=null&&s.calibrationError<=6)return'STRONG';if(score>=60)return'PROMISING';if(score<35||((s.roi??0)<-8&&s.sample>=40))return'WEAK';return'NEUTRAL'}
function recommendation(x){if(x.status==='STRONG')return'PRIORITIZE';if(x.status==='PROMISING')return'ENRICH_AND_VALIDATE';if(x.status==='WEAK')return'DOWNGRADE_OR_AVOID';if(x.status==='LEARNING')return'COLLECT_MORE_DATA';return'MAINTAIN'}
function group(rows,keyFn){const m={};for(const r of rows){const k=keyFn(r);(m[k]||(m[k]=[])).push(r)}return Object.fromEntries(Object.entries(m).map(([k,v])=>{const metrics=metric(v),score=skillScore(metrics),st=status(metrics,score);return[k,{...metrics,skillScore:score,status:st,recommendation:recommendation({status:st})}]}));}
function topEntries(groups){return Object.entries(groups).map(([segment,v])=>({segment,...v})).sort((a,b)=>b.skillScore-a.skillScore||b.sample-a.sample).slice(0,12)}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!storageReady())return res.status(503).json({error:'Storage unavailable'});
  const blobs=await listJson(PREFIX,3650),books=await readManyJson(blobs),rows=books.flatMap(b=>b?.records||[]).filter(r=>['WIN','LOSS'].includes(r.settlement?.status));
  const byLeague=group(rows,r=>r.competition||'UNKNOWN');
  const byMarket=group(rows,r=>marketKey(r));
  const byOdds=group(rows,r=>oddsBucket(r.odds));
  const byConfidence=group(rows,r=>confidenceBucket(r.confidence));
  const byRegime=group(rows,r=>regimeKey(r));
  const byLeagueMarket=group(rows,r=>`${r.competition||'UNKNOWN'}|||${marketKey(r)}`);
  const strongest=topEntries(byLeagueMarket).filter(x=>x.status==='STRONG'||x.status==='PROMISING');
  const weakest=Object.entries(byLeagueMarket).map(([segment,v])=>({segment,...v})).filter(x=>x.status==='WEAK').sort((a,b)=>a.skillScore-b.skillScore).slice(0,12);
  const map={version:'ARGUS-SKILL-MAP-1',generatedAt:new Date().toISOString(),totalSettled:rows.length,principle:'Specialize where evidence is strongest. Never create confidence from a skill-map score alone.',allocationPolicy:{strong:'Prioritize analysis depth and preserve evidence quality.',promising:'Allocate extra enrichment while continuing validation.',neutral:'Maintain baseline coverage.',learning:'Collect data without promotion.',weak:'Reduce resource spend and block positive promotion until recovered.'},byLeague,byMarket,byOdds,byConfidence,byRegime,byLeagueMarket,strongest,weakest};
  await writeJson(OUT,map);
  return res.status(200).json(map);
}
