export const GOVERNANCE_VERSION='ARGUS-GOVERNANCE-CORE-1';
export const THRESHOLDS=Object.freeze({
  uncertainty:{moderate:30,elevated:45,high:60,extreme:75,primeDecisionMarginMin:55,valueDecisionMarginMin:40},
  eligibility:{primeEdgeMinPct:6,primeConfidenceMin:68,primeQualityMin:70,primeFreshnessMin:70,valueEdgeMinPct:3.5,valueConfidenceMin:58,valueQualityMin:60,valueFreshnessMin:55,watchEdgeMinPct:2},
  promotion:{minimumReviewSample:40,minimumShadowSample:60,minimumShadowDeltaPL:8,probationSettledMin:40},
  market:{staleMinutes:45}
});
export function number(v,f=0){if(v===null||v===undefined||v==='')return f;const x=Number(v);return Number.isFinite(x)?x:f}
export function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,number(v,min)))}
export function uncertaintyBand(score){const x=number(score);const t=THRESHOLDS.uncertainty;if(x>=t.extreme)return{status:'EXTREME',penalty:10,hardBlock:true};if(x>=t.high)return{status:'HIGH',penalty:8,hardBlock:false};if(x>=t.elevated)return{status:'ELEVATED',penalty:5,hardBlock:false};if(x>=t.moderate)return{status:'MODERATE',penalty:2,hardBlock:false};return{status:'LOW_UNCERTAINTY',penalty:0,hardBlock:false}}
export function issueSeverity(issue){const x=String(issue||'').toUpperCase();if(/CONTRADICTION|HARD_BLOCK|EXTREME|REVERSAL|EXPIRED|CHAOTIC/.test(x))return 3;if(/HIGH_DISAGREEMENT|HIGH|DEGRADED|UNSTABLE|STALE|FAIL|DECAYING/.test(x))return 2;if(/CAUTION|ELEVATED|AGING|OSCILLATING|WAIT|VOLATILE|DRIFT/.test(x))return 1;return 0}
export function uniquePenalty(parts=[]){const seen=new Set(),accepted=[],duplicates=[];let total=0;for(const p of parts){if(!p)continue;const key=String(p.key||p.source||p.name||'UNKNOWN').toUpperCase(),value=Math.max(0,number(p.value??p.penalty));if(!value)continue;if(seen.has(key)){duplicates.push({key,value});continue}seen.add(key);accepted.push({key,value});total+=value}return{total:+total.toFixed(2),accepted,duplicates}}
export function downgradeOnlyPolicy(extra={}){return{mayCreatePrime:false,mayUpgradeVerdict:false,mayIncreaseConfidence:false,mayIncreaseStake:false,automaticBetPlacement:false,...extra}}
export function promotionEvidence({reviewScore=0,shadowStatus='UNKNOWN',shadowSample=0,shadowDeltaPL=0,avoidedLosses=0,missedWins=0}={}){const t=THRESHOLDS.promotion,checks={reviewScore:Number(reviewScore)>=55,shadowPassed:String(shadowStatus)==='SHADOW_PASS',sample:Number(shadowSample)>=t.minimumShadowSample,materialDelta:Number(shadowDeltaPL)>=t.minimumShadowDeltaPL,lossAsymmetry:Number(avoidedLosses)>=Number(missedWins)+3};const passed=Object.values(checks).filter(Boolean).length;return{checks,passed,total:Object.keys(checks).length,ready:Object.values(checks).every(Boolean)}}
