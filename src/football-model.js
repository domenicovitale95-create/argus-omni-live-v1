export const number=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
export function day(v=new Date()){const d=new Date(v);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).format(d):''}
export function upcoming(r,now=Date.now()){return !r.isLive&&!r.isFinished&&!['FT','AET','PEN','CANC','ABD','PST','WO','AWD','1H','2H','HT','LIVE'].includes(String(r.status||'').toUpperCase())&&Date.parse(r.kickoff)>now}
export function candidate(r){const c=r.candidate||r.eligibilityCandidate||{};return {selection:c.selection||c.side||r.selectionKey||null,label:c.label||null,odds:number(c.odds??r.odds),probability:number(c.probability),confidence:number(r.confidence??r.netConfidence),quality:number(r.dataQuality??c.dataQuality)}}
export function official(r){return r.eligible===true&&['PRIME','VALUE'].includes(r.verdict)}
export function makeTrial(r,selection,odds,stake,now=Date.now()){
 if(!upcoming(r,now))throw Error('Ce match a commencé ou n’est plus disponible avant-match.');
 const price=number(odds),amount=number(stake);
 if(!['HOME','DRAW','AWAY'].includes(selection))throw Error('Choisis 1, N ou 2.');
 if(!(price>1&&price<=1000))throw Error('Indique une cote entre 1 et 1 000, excluant 1.');
 if(!(amount>0&&amount<=1000))throw Error('La mise virtuelle doit être comprise entre 0 et 1 000 €, excluant 0.');
 return {id:`USER-${r.fixtureId}-${now}`,fixtureId:r.fixtureId,home:r.home,away:r.away,competition:r.competition,kickoff:r.kickoff,selection,odds:price,stakeAmount:amount,capturedAt:new Date(now).toISOString(),status:'OPEN',pnl:null,trainingOnly:true,source:'PERSONAL_DEVICE',officialBetEligible:false,modelSnapshot:candidate(r)};
}
export function settleTrials(trials,records){
 const finals=new Map();
 for(const r of records){const s=r.settlement,score=s?.finalScore;if(!['WIN','LOSS'].includes(s?.status)||!score)continue;const h=number(score.home),a=number(score.away);if(h===null||a===null)continue;const key=String(r.fixtureId),old=finals.get(key);if(old&&(old.home!==h||old.away!==a)){finals.set(key,{conflict:true});continue}if(!old?.conflict)finals.set(key,{home:h,away:a})}
 return trials.map(r=>{if(r.status!=='OPEN')return r;const s=finals.get(String(r.fixtureId));if(!s||s.conflict)return r;const result=s.home>s.away?'HOME':s.home<s.away?'AWAY':'DRAW',win=result===r.selection;return {...r,status:win?'WIN':'LOSS',pnl:Math.round((win?r.stakeAmount*(r.odds-1):-r.stakeAmount)*100)/100,settlement:{status:win?'WIN':'LOSS',finalScore:{home:s.home,away:s.away},source:'OFFICIAL_LEDGER_FINAL_SCORE'}}});
}
