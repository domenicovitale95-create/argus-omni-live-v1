const ASSETS=[
{id:"vwce",symbol:"VWCE.DE",name:"Vanguard FTSE All-World UCITS ETF",type:"ETF",currency:"EUR",thesis:"Broad global core exposure. Simple foundation before adding themes."},
{id:"iwda",symbol:"IWDA.AS",name:"iShares Core MSCI World UCITS ETF",type:"ETF",currency:"EUR",thesis:"Developed-market core ETF with deep diversification."},
{id:"semis",symbol:"VVSM.DE",name:"VanEck Semiconductor UCITS ETF",type:"ETF",currency:"EUR",thesis:"High-growth semiconductor theme with materially higher volatility."},
{id:"cyber",symbol:"ISPY.MI",name:"L&G Cyber Security UCITS ETF",type:"ETF",currency:"EUR",thesis:"Cybersecurity theme; useful as a satellite rather than a portfolio core."},
{id:"spy",symbol:"SPY",name:"S&P 500",type:"ETF",currency:"USD",thesis:"US large-cap benchmark and a useful global risk barometer."},
{id:"nvda",symbol:"NVDA",name:"NVIDIA",type:"Stock",currency:"USD",thesis:"AI infrastructure leader; strong growth can come with valuation risk."},
{id:"msft",symbol:"MSFT",name:"Microsoft",type:"Stock",currency:"USD",thesis:"Cloud, software and AI exposure with diversified cash generation."},
{id:"asml",symbol:"ASML.AS",name:"ASML",type:"Stock",currency:"EUR",thesis:"Critical semiconductor equipment supplier with strategic global importance."},
{id:"amzn",symbol:"AMZN",name:"Amazon",type:"Stock",currency:"USD",thesis:"Cloud and consumer platform with multiple growth engines."},
{id:"gold",symbol:"GC=F",name:"Gold",type:"Commodity",currency:"USD",thesis:"Portfolio diversifier and potential hedge during macro or geopolitical stress."},
{id:"oil",symbol:"CL=F",name:"WTI Oil",type:"Commodity",currency:"USD",thesis:"Cyclical macro asset sensitive to growth, supply and geopolitical shocks."},
{id:"btc",symbol:"BTC-EUR",name:"Bitcoin",type:"Crypto",currency:"EUR",thesis:"High-volatility digital asset; position sizing matters more than narratives."},
{id:"eth",symbol:"ETH-EUR",name:"Ethereum",type:"Crypto",currency:"EUR",thesis:"Smart-contract network exposure with high volatility and adoption risk."}
];
function valid(v){return typeof v==="number"&&Number.isFinite(v)}
function change(a,b){return valid(a)&&valid(b)&&b!==0?(a/b-1)*100:null}
function std(xs){if(!xs.length)return 0;const m=xs.reduce((a,b)=>a+b,0)/xs.length;return Math.sqrt(xs.reduce((s,x)=>s+(x-m)*(x-m),0)/xs.length)}
function calcScore(m1,m3,vol){
  let s=50;
  if(valid(m1))s+=Math.max(-20,Math.min(20,m1*1.2));
  if(valid(m3))s+=Math.max(-22,Math.min(22,m3*.65));
  s-=Math.min(15,vol*.35);
  return Math.max(1,Math.min(99,Math.round(s)));
}
async function getYahoo(asset){
  const url="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(asset.symbol)+"?interval=1d&range=6mo&includePrePost=false";
  const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"},signal:AbortSignal.timeout(7000)});
  if(!r.ok)throw new Error("quote "+r.status);
  const j=await r.json();const result=j&&j.chart&&j.chart.result&&j.chart.result[0];if(!result)throw new Error("no result");
  const closes=(result.indicators&&result.indicators.quote&&result.indicators.quote[0]&&result.indicators.quote[0].close||[]).filter(valid);
  if(closes.length<2)throw new Error("no history");
  const price=closes[closes.length-1];
  const prev=closes[closes.length-2];
  const m1=closes[Math.max(0,closes.length-22)];
  const m3=closes[Math.max(0,closes.length-66)];
  const daily=[];
  for(let i=Math.max(1,closes.length-22);i<closes.length;i++){if(closes[i-1])daily.push((closes[i]/closes[i-1]-1)*100)}
  const vol=std(daily)*Math.sqrt(252);
  const currency=(result.meta&&result.meta.currency)||asset.currency;
  return {...asset,currency:currency,price:price,change1d:change(price,prev),change1m:change(price,m1),change3m:change(price,m3),volatility:vol,score:calcScore(change(price,m1),change(price,m3),vol),risk:vol>45?"High":vol>25?"Medium":"Lower"};
}
export default async function handler(req,res){
  res.setHeader("Cache-Control","s-maxage=60, stale-while-revalidate=300");
  const settled=await Promise.allSettled(ASSETS.map(getYahoo));
  const assets=settled.map(function(x,i){
    if(x.status==="fulfilled")return x.value;
    return {...ASSETS[i],price:null,change1d:null,change1m:null,change3m:null,volatility:null,score:50,risk:"Unknown"};
  });
  res.status(200).json({updatedAt:new Date().toISOString(),source:"Yahoo Finance chart endpoint; indicative/delayed market data",assets:assets});
}