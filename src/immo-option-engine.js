export function evaluateOptionDeal(input={}, multipliers={}){
  const multExit=Number.isFinite(Number(multipliers.multExit))?Number(multipliers.multExit):1;
  const multCost=Number.isFinite(Number(multipliers.multCost))?Number(multipliers.multCost):1;
  const n=v=>Number.isFinite(Number(v))?Number(v):0;

  const price=n(input.price);
  const premium=n(input.premium);
  const legal=n(input.legal)*multCost;
  const division=n(input.division)*multCost;
  const other=n(input.other)*multCost;
  const exitRate=Math.max(0,n(input.exitRate));
  const area=Math.max(0,n(input.area));
  const basePsm=Math.max(0,n(input.exitPsm));
  const psm=Math.max(0,basePsm*multExit);
  const keepOne=Boolean(input.keepOne);
  const keepArea=keepOne?Math.max(0,n(input.keepArea)):0;
  const keepPsm=Math.max(0,(n(input.keepPsm)||basePsm)*multExit);
  const target=Math.max(0,n(input.target));
  const taxReserve=Math.max(0,n(input.taxReserve));
  const premiumCredited=input.premiumCredited!==false;
  const cash=Math.max(0,n(input.cash));
  const months=Math.max(0,n(input.months));

  const lotInput=Array.isArray(input.lots)?input.lots:[];
  const lots=lotInput.map((lot,index)=>{
    const lotArea=Math.max(0,n(lot?.area));
    const lotPsm=Math.max(0,n(lot?.psm)*multExit);
    return {index,label:String(lot?.label||('Lot '+(index+1))),area:lotArea,psm:lotPsm,value:lotArea*lotPsm,keep:keepOne&&Boolean(lot?.keep)};
  }).filter(lot=>lot.area>0&&lot.psm>0);
  const useLots=lots.length>0;
  const matrixKeepArea=useLots?lots.filter(l=>l.keep).reduce((s,l)=>s+l.area,0):keepArea;
  const matrixKeepValue=useLots?lots.filter(l=>l.keep).reduce((s,l)=>s+l.value,0):keepArea*keepPsm;
  const matrixSoldArea=useLots?lots.filter(l=>!l.keep).reduce((s,l)=>s+l.area,0):Math.max(0,area-keepArea);
  const matrixSoldGross=useLots?lots.filter(l=>!l.keep).reduce((s,l)=>s+l.value,0):matrixSoldArea*psm;
  const matrixTotalRetail=useLots?lots.reduce((s,l)=>s+l.value,0):matrixSoldGross+matrixKeepValue;
  const keepValue=matrixKeepValue;
  const soldArea=matrixSoldArea;
  const soldGross=matrixSoldGross;
  const totalRetail=matrixTotalRetail;
  const lotAreaTotal=useLots?lots.reduce((s,l)=>s+l.area,0):area;
  const effectivePsm=useLots&&lotAreaTotal>0?totalRetail/lotAreaTotal:psm;
  const effectiveSoldPsm=soldArea>0?soldGross/soldArea:effectivePsm;
  const exitCosts=soldGross*exitRate;
  const premiumEconomic=premiumCredited?0:premium;
  const fixed=legal+division+other+premiumEconomic;
  const economicPreTax=totalRetail-price-fixed-exitCosts;
  const reserve=Math.max(0,economicPreTax)*taxReserve;
  const profit=economicPreTax-reserve;
  const totalEconomicCost=price+fixed+exitCosts+reserve;
  const margin=totalEconomicCost?profit/totalEconomicCost:0;
  const spread=totalRetail?((totalRetail-price)/totalRetail):0;
  const cashPeak=premium+legal+division+other;
  const cashAfterKeep=keepOne?Math.max(0,soldGross-price-fixed-exitCosts-reserve):0;
  const cashToKeep=keepOne?Math.max(0,price+fixed+exitCosts+reserve-soldGross):0;
  const sellerCoverage=price?soldGross/price:0;
  const maxPrice=Math.max(0,totalRetail-fixed-exitCosts-reserve-(totalRetail*target));
  const breakEvenPsm=area>0&&1-exitRate>0?(price+fixed)/(area*(1-exitRate)):0;
  const requiredSoldArea=effectiveSoldPsm>0&&1-exitRate>0?(price+fixed)/(effectiveSoldPsm*(1-exitRate)):Infinity;
  const maxFreeKeepArea=Math.max(0,area-requiredSoldArea);

  return {
    price,premium,legal,division,other,exitRate,area,psm:effectivePsm,basePsm,keepArea:matrixKeepArea,keepPsm,keepValue,lots,useLots,
    soldArea,soldGross,totalRetail,exitCosts,fixed,economicPreTax,reserve,profit,
    totalEconomicCost,margin,spread,cashPeak,cash,cashAfterKeep,cashToKeep,
    sellerCoverage,maxPrice,breakEvenPsm,maxFreeKeepArea,target,months,
    classicTax:price*.125
  };
}
