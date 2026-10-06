import assert from 'node:assert/strict';
import {evaluateOptionDeal} from '../src/immo-option-engine.js';

const base={
  price:900000,premium:15000,legal:12000,division:25000,other:15000,
  exitRate:.025,area:330,exitPsm:4000,target:.20,taxReserve:0,
  premiumCredited:true,cash:100000,months:6,keepOne:false
};

const a=evaluateOptionDeal(base);
assert.equal(a.totalRetail,1320000);
assert.equal(a.cashPeak,67000);
assert.equal(a.classicTax,112500);
assert.ok(Math.abs(a.breakEvenPsm-2958.818958818959)<1e-9);
assert.ok(a.profit>300000);
assert.ok(a.spread>.31);

const keep=evaluateOptionDeal({...base,keepOne:true,keepArea:65,keepPsm:4000});
assert.equal(keep.keepValue,260000);
assert.equal(keep.soldArea,265);
assert.equal(keep.soldGross,1060000);
assert.equal(keep.cashToKeep,0);
assert.ok(keep.cashAfterKeep>80000);
assert.ok(keep.maxFreeKeepArea>80);



const keepStress=evaluateOptionDeal({...base,keepOne:true,keepArea:65,keepPsm:0},{multExit:.90,multCost:1});
assert.equal(keepStress.keepPsm,3600);

const lotMatrix=evaluateOptionDeal({...base,keepOne:true,lots:[
  {label:'A',area:80,psm:4200,keep:false},
  {label:'B',area:75,psm:4000,keep:false},
  {label:'C',area:70,psm:3900,keep:true},
  {label:'D',area:65,psm:4100,keep:false}
]});
assert.equal(lotMatrix.useLots,true);
assert.equal(lotMatrix.keepArea,70);
assert.equal(lotMatrix.keepValue,273000);
assert.equal(lotMatrix.totalRetail,1175500);
assert.equal(lotMatrix.soldGross,902500);
assert.ok(Math.abs(lotMatrix.psm-(1175500/290))<1e-9);
assert.ok(lotMatrix.cashToKeep>0);

const stress=evaluateOptionDeal(base,{multExit:.90,multCost:1.20});
assert.ok(stress.profit<a.profit);
assert.ok(stress.margin<a.margin);

const notCredited=evaluateOptionDeal({...base,premiumCredited:false});
assert.equal(notCredited.fixed,a.fixed+15000);
assert.equal(notCredited.profit,a.profit-15000);

console.log('ARGUS OPTION engine regression: OK');
