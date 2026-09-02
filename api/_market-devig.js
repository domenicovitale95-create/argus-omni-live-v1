const PAIRS=Object.freeze({
  over15:'under15',under15:'over15',over25:'under25',under25:'over25',over35:'under35',under35:'over35',
  bttsYes:'bttsNo',bttsNo:'bttsYes',homeOver05:'homeUnder05',homeUnder05:'homeOver05',awayOver05:'awayUnder05',awayUnder05:'awayOver05'
});

export function priceForKey(m,key){
  let raw;
  if(String(key).startsWith('score:'))raw=m?.marketOdds?.exactScores?.[String(key).slice(6)];
  else raw=m?.marketOdds?.[key]??m?.markets?.[key];
  const n=Number(raw?.odds??raw);
  return Number.isFinite(n)&&n>1?n:null;
}

export function fair1x2(m){
  const odds={home:priceForKey(m,'home'),draw:priceForKey(m,'draw'),away:priceForKey(m,'away')};
  if(!Object.values(odds).every(x=>Number.isFinite(x)&&x>1))return null;
  const raw=Object.fromEntries(Object.entries(odds).map(([k,o])=>[k,1/o])),sum=raw.home+raw.draw+raw.away;
  if(!(sum>0))return null;
  return{home:raw.home/sum,draw:raw.draw/sum,away:raw.away/sum,overround:sum-1};
}

export function marketFairForKey(m,key){
  const odds=priceForKey(m,key),rawImplied=odds?1/odds:null,one=fair1x2(m);
  if(['home','draw','away'].includes(key)&&one)return{odds,rawImplied,fair:one[key],overround:one.overround,method:'DEVIG_1X2_NORMALIZED'};
  if(key==='doubleChance1X'&&one)return{odds,rawImplied,fair:one.home+one.draw,overround:one.overround,method:'DERIVED_FROM_DEVIG_1X2'};
  if(key==='doubleChance12'&&one)return{odds,rawImplied,fair:one.home+one.away,overround:one.overround,method:'DERIVED_FROM_DEVIG_1X2'};
  if(key==='doubleChanceX2'&&one)return{odds,rawImplied,fair:one.draw+one.away,overround:one.overround,method:'DERIVED_FROM_DEVIG_1X2'};
  const pair=PAIRS[key];
  if(pair&&odds){
    const other=priceForKey(m,pair);
    if(other){const rawOther=1/other,sum=rawImplied+rawOther;if(sum>0)return{odds,rawImplied,fair:rawImplied/sum,overround:sum-1,method:'DEVIG_BINARY_PAIR_NORMALIZED'}}
  }
  return{odds,rawImplied,fair:null,overround:null,method:rawImplied==null?'NO_MARKET_PRICE':'UNPAIRED_RAW_BREAK_EVEN'};
}
