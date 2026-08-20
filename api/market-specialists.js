import { readJson, writeJson, storageReady } from './_report-store.js';

const SKILL='argus/learning/skill-map.json';
const TRUTH='argus/learning/market-truth.json';
const OUT='argus/learning/market-specialists.json';
const SPECIALISTS={
 '1X2':{markets:['HOME','DRAW','AWAY'],focus:['team strength','home-away split','market prior','lineups','regime']},
 'GOALS':{markets:['OVER_1.5','OVER_2.5','UNDER_2.5','OVER_3.5'],focus:['goal rates','tempo','shot quality','game state','weather']},
 'BTTS':{markets:['BTTS_YES','BTTS_NO'],focus:['scoring consistency','clean sheets','both-side attack quality','lineups']},
 'TEAM_GOALS':{markets:['HOME_OVER_0.5','AWAY_OVER_0.5'],focus:['team attack','opponent defense','availability','home-away split']},
 'CORNERS':{markets:['CORNERS_7.5','CORNERS_8.5','CORNERS_9.5'],focus:['territorial pressure','wing usage','shots blocked','game state']},
 'EXACT_SCORE':{markets:['EXACT_SCORE'],focus:['score distribution','Poisson family','correlation','uncertainty'],maxConfidenceCap:35},
 'LIVE':{markets:['LIVE_1X2','LIVE_GOALS'],focus:['score state','minute','red cards','shots','momentum','market movement']}
};
function statusFromEvidence(sample,clv,skill){if(sample<30)return'RESEARCH';if(clv!=null&&clv<0&&sample>=50)return'DEPRIORITIZE';if(sample>=100&&clv!=null&&clv>1&&skill>=60)return'SHADOW_READY';return'VALIDATING'}
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});if(!storageReady())return res.status(503).json({error:'Specialist registry storage unavailable'});const [skill,truth]=await Promise.all([readJson(SKILL,{byMarket:{}}),readJson(TRUTH,{bySelection:{}})]),specialists={};for(const [id,cfg] of Object.entries(SPECIALISTS)){const evidenceRows=cfg.markets.map(m=>truth?.bySelection?.[m]).filter(Boolean),sample=evidenceRows.reduce((s,x)=>s+Number(x.sample||0),0),weightedCLV=sample?evidenceRows.reduce((s,x)=>s+Number(x.avgCLV||0)*Number(x.sample||0),0)/sample:null,skillRows=cfg.markets.map(m=>skill?.byMarket?.[m]).filter(Boolean),skillScore=skillRows.length?Math.round(skillRows.reduce((s,x)=>s+Number(x.skillScore||20),0)/skillRows.length):20,status=statusFromEvidence(sample,weightedCLV,skillScore);specialists[id]={id,status,researchOnly:true,automaticProductionPromotion:false,focus:cfg.focus,markets:cfg.markets,evidence:{sample,avgCLV:weightedCLV==null?null:Number(weightedCLV.toFixed(2)),skillScore},maxConfidenceCap:cfg.maxConfidenceCap??null,rule:status==='DEPRIORITIZE'?'Negative market evidence: reduce research priority until recovery.':status==='SHADOW_READY'?'Eligible for shadow comparison only; production promotion still requires governance gates.':'Continue evidence collection.'}}
 const state={version:'MARKET-SPECIALISTS-1',generatedAt:new Date().toISOString(),specialists,policy:{championUnchanged:true,shadowBeforePromotion:true,walkForwardRequired:true,outOfSampleRequired:true,marketSpecificCalibrationRequired:true,specialistCannotCreatePrimeByItself:true,automaticBetPlacement:false}};if(req.method==='POST')await writeJson(OUT,state);return res.status(200).json(state)}
