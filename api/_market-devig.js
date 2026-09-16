const PAIRS=Object.freeze({
  over15:'under15',under15:'over15',over25:'under25',under25:'over25',over35:'under35',under35:'over35',
  bttsYes:'bttsNo',bttsNo:'bttsYes',homeOver05:'homeUnder05',homeUnder05:'homeOver05',awayOver05:'awayUnder05',awayUnder05:'awayOver05'
});
const EXACT_SCORE_CORE=Object.freeze(['0-0','1-0','0-1','1-1','2-0','0-2','2-1','1-2','2-2']);
const EXACT_SCORE_MIN_OUTCOMES=12;
const EXACT_SCORE_MAX_IMPLIED_MASS=1.60;

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

export function fairExactScores(m){
  const book=m?.marketOdds?.exactScores;
  if(!book||typeof book!=='object'||Array.isArray(book))return null;
  const rows=[];
  for(const[score,value]of Object.entries(book)){
    if(!/^\d+-\d+$/.test(String(score)))continue;
    const odds=Number(value?.odds??value);if(!(Number.isFinite(odds)&&odds>1))continue;
    rows.push({score:String(score),odds,raw:1/odds});
  }
  const scores=new Set(rows.map(x=>x.score)),impliedMass=rows.reduce((s,x)=>s+x.raw,0),coreComplete=EXACT_SCORE_CORE.every(x=>scores.has(x));
  if(rows.length<EXACT_SCORE_MIN_OUTCOMES||!coreComplete||!(impliedMass>1&&impliedMass<=EXACT_SCORE_MAX_IMPLIED_MASS))return null;
  const fair=Object.fromEntries(rows.map(x=>[x.score,x.raw/impliedMass]));
  return{fair,overround:impliedMass-1,impliedMass,outcomes:rows.length,coreOutcomes:EXACT_SCORE_CORE.length,method:'DEVIG_EXACT_SCORE_NORMALIZED'};
}

export function marketFairForKey(m,key){
  const odds=priceForKey(m,key),rawImplied=odds?1/odds:null,one=fair1x2(m);
  if(['home','draw','away'].includes(key)&&one)return{odds,rawImplied,fair:one[key],overround:one.overround,method:'DEVIG_1X2_NORMALIZED'};
  if(key==='doubleChance1X'&&one)return{odds,rawImplied,fair:one.home+one.draw,overround:one.overround,method:'DERIVED_FROM_DEVIG_1X2'};
  if(key==='doubleChance12'&&one)return{odds,rawImplied,fair:one.home+one.away,overround:one.overround,method:'DERIVED_FROM_DEVIG_1X2'};
  if(key==='doubleChanceX2'&&one)return{odds,rawImplied,fair:one.draw+one.away,overround:one.overround,method:'DERIVED_FROM_DEVIG_1X2'};
  if(String(key).startsWith('score:')&&odds){
    const score=String(key).slice(6),exact=fairExactScores(m);
    if(exact&&Number.isFinite(exact.fair?.[score]))return{odds,rawImplied,fair:exact.fair[score],overround:exact.overround,method:exact.method,marketOutcomes:exact.outcomes,impliedMass:exact.impliedMass};
    return{odds,rawImplied,fair:null,overround:null,method:'INCOMPLETE_EXACT_SCORE_BOOK_RAW_BREAK_EVEN'};
  }
  const pair=PAIRS[key];
  if(pair&&odds){
    const other=priceForKey(m,pair);
    if(other){const rawOther=1/other,sum=rawImplied+rawOther;if(sum>0)return{odds,rawImplied,fair:rawImplied/sum,overround:sum-1,method:'DEVIG_BINARY_PAIR_NORMALIZED'}}
  }
  return{odds,rawImplied,fair:null,overround:null,method:rawImplied==null?'NO_MARKET_PRICE':'UNPAIRED_RAW_BREAK_EVEN'};
}
