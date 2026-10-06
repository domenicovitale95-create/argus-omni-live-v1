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
assert.ok(Math.abs(a.breakEvenPsm-2960.3729603729603)<1e-9);
assert.ok(a.profit>300000);
assert.ok(a.spread>.31);

const keep=evaluateOptionDeal({...base,keepOne:true,keepArea:65,keepPsm:4000});
assert.equal(keep.keepValue,260000);
assert.equal(keep.soldArea,265);
assert.equal(keep.soldGross,1060000);
assert.equal(keep.cashToKeep,0);
assert.ok(keep.cashAfterKeep>80000);
assert.ok(keep.maxFreeKeepArea>80);

const stress=evaluateOptionDeal(base,{multExit:.90,multCost:1.20});
assert.ok(stress.profit<a.profit);
assert.ok(stress.margin<a.margin);

const notCredited=evaluateOptionDeal({...base,premiumCredited:false});
assert.equal(notCredited.fixed,a.fixed+15000);
assert.equal(notCredited.profit,a.profit-15000);

console.log('ARGUS OPTION engine regression: OK');
