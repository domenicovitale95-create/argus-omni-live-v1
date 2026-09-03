#!/usr/bin/env python3
"""
ARGUS CAPITAL daily data engine.
No API keys. Public sources only.
- Market proxies: Stooq daily CSV
- Macro: FRED CSV (official Federal Reserve Bank of St. Louis distribution)
The engine never fabricates missing numbers: failed series become DATA_UNAVAILABLE or stale fallback.
"""
from __future__ import annotations
import csv, io, json, math, os, statistics, time
from datetime import datetime, timezone, date
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "capital" / "data"
HIST_DIR = DATA_DIR / "history"
LATEST = DATA_DIR / "latest.json"
SIGNALS = DATA_DIR / "signals.json"
TRACK = DATA_DIR / "track-record.json"
CONFIG = ROOT / "capital" / "config.json"
DATA_DIR.mkdir(parents=True, exist_ok=True)
HIST_DIR.mkdir(parents=True, exist_ok=True)

UA = "ARGUS-CAPITAL/1.0 (+https://github.com/domenicovitale95-create/argus-omni-live-v1)"
NOW = datetime.now(timezone.utc)
TODAY = NOW.date().isoformat()

ASSETS = {
    "global_equity": {"label":"Global Equities","symbol":"acwi.us","asset_class":"EQUITY","region":"GLOBAL","ucits":"VWCE"},
    "sp500": {"label":"S&P 500","symbol":"spy.us","asset_class":"EQUITY","region":"USA","ucits":"SXR8"},
    "nasdaq": {"label":"Nasdaq 100","symbol":"qqq.us","asset_class":"EQUITY","region":"USA","ucits":"EQQX"},
    "europe": {"label":"European Equities","symbol":"vgk.us","asset_class":"EQUITY","region":"EUROPE"},
    "emerging": {"label":"Emerging Markets","symbol":"eem.us","asset_class":"EQUITY","region":"EM"},
    "semis": {"label":"Semiconductors","symbol":"smh.us","asset_class":"EQUITY","region":"THEME","ucits":"VVSM"},
    "gold": {"label":"Gold","symbol":"gld.us","asset_class":"GOLD","region":"GLOBAL"},
    "treasuries": {"label":"US Treasuries 7-10Y","symbol":"ief.us","asset_class":"BOND","region":"USA"},
    "corp_bonds": {"label":"Investment Grade Bonds","symbol":"lqd.us","asset_class":"BOND","region":"USA"},
    "cash_proxy": {"label":"US T-Bills","symbol":"bil.us","asset_class":"CASH","region":"USA"},
    "quality_stock": {"label":"Microsoft","symbol":"msft.us","asset_class":"STOCK","region":"USA"},
    "nvidia": {"label":"NVIDIA","symbol":"nvda.us","asset_class":"STOCK","region":"USA"}
}
FRED = {
    "us10y": {"series":"DGS10","label":"US 10Y Treasury Yield","unit":"%","asset_class":"RATE"},
    "us2y": {"series":"DGS2","label":"US 2Y Treasury Yield","unit":"%","asset_class":"RATE"},
    "vix": {"series":"VIXCLS","label":"VIX","unit":"index","asset_class":"VOL"},
    "dollar": {"series":"DTWEXBGS","label":"Broad US Dollar Index","unit":"index","asset_class":"FX"},
    "ecb_deposit": {"series":"ECBDFR","label":"ECB Deposit Facility Rate","unit":"%","asset_class":"RATE"},
    "btc": {"series":"CBBTCUSD","label":"Bitcoin / USD","unit":"USD","asset_class":"CRYPTO"}
}

def fetch(url, timeout=20):
    req = Request(url, headers={"User-Agent": UA, "Accept":"text/csv,text/plain,*/*"})
    with urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")

def fetch_stooq(symbol):
    url = f"https://stooq.com/q/d/l/?s={quote(symbol)}&i=d"
    text = fetch(url)
    rows = []
    for row in csv.DictReader(io.StringIO(text)):
        try:
            d = date.fromisoformat(row["Date"])
            close = float(row["Close"])
            if math.isfinite(close) and close > 0:
                rows.append((d, close))
        except Exception:
            continue
    rows.sort(key=lambda x:x[0])
    if len(rows) < 60:
        raise ValueError(f"insufficient history for {symbol}: {len(rows)}")
    return rows, url

def fetch_fred(series):
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={quote(series)}"
    text = fetch(url)
    rows = []
    reader = csv.reader(io.StringIO(text))
    next(reader, None)
    for row in reader:
        if len(row) < 2: continue
        try:
            d = date.fromisoformat(row[0])
            v = float(row[1])
            if math.isfinite(v):
                rows.append((d, v))
        except Exception:
            continue
    rows.sort(key=lambda x:x[0])
    if len(rows) < 20:
        raise ValueError(f"insufficient FRED history for {series}: {len(rows)}")
    return rows, url

def pct(a,b):
    return None if b in (None,0) or a is None else (a/b-1)*100

def ret_at(rows, n):
    if len(rows) <= n: return None
    return pct(rows[-1][1], rows[-1-n][1])

def ann_vol(rows, n=20):
    vals = [x[1] for x in rows[-(n+1):]]
    if len(vals) < 3: return None
    rets = [vals[i]/vals[i-1]-1 for i in range(1,len(vals)) if vals[i-1] > 0]
    return statistics.stdev(rets)*math.sqrt(252)*100 if len(rets)>1 else None

def sma(rows,n):
    if len(rows)<n: return None
    return statistics.fmean(x[1] for x in rows[-n:])

def drawdown_52w(rows):
    vals = [x[1] for x in rows[-252:]]
    if not vals: return None
    return (vals[-1]/max(vals)-1)*100

def max_drawdown(rows):
    peak = 0
    worst = 0
    for _,v in rows:
        peak = max(peak,v)
        if peak:
            worst = min(worst, v/peak-1)
    return worst*100

def stale_days(d):
    return max(0,(NOW.date()-d).days)

def r2(x): return None if x is None else round(float(x),2)

def summarize(rows, source, dtype="OBSERVED"):
    latest_d, latest_v = rows[-1]
    ma200 = sma(rows,200)
    return {
        "price": r2(latest_v),
        "date": latest_d.isoformat(),
        "ret_1d": r2(ret_at(rows,1)),
        "ret_1m": r2(ret_at(rows,21)),
        "ret_3m": r2(ret_at(rows,63)),
        "ret_6m": r2(ret_at(rows,126)),
        "ret_1y": r2(ret_at(rows,252)),
        "vol_20d_ann": r2(ann_vol(rows,20)),
        "sma_200": r2(ma200),
        "distance_200dma": r2(pct(latest_v,ma200)) if ma200 else None,
        "drawdown_52w": r2(drawdown_52w(rows)),
        "max_drawdown": r2(max_drawdown(rows)),
        "source": source,
        "last_update": latest_d.isoformat(),
        "delay_days": stale_days(latest_d),
        "data_type": dtype,
        "fresh": stale_days(latest_d) <= 5
    }

def monthly_points(rows, years=15):
    cutoff_year = NOW.year - years
    monthly = {}
    for d,v in rows:
        if d.year >= cutoff_year:
            monthly[(d.year,d.month)] = [d,v]
    return [{"date":d.isoformat(),"price":round(v,4)} for d,v in monthly.values()]

def clamp(v,lo=0,hi=100): return max(lo,min(hi,v))

def score_asset(m, asset_class, macro):
    required = ["ret_1m","ret_3m","ret_6m","vol_20d_ann","distance_200dma","drawdown_52w"]
    present = sum(m.get(k) is not None for k in required)
    coverage = present/len(required)
    if coverage < .67 or not m.get("fresh"):
        return {"score":None,"status":"DATA INSUFFICIENT","evidence":"Weak","coverage":round(coverage*100)}
    mom = clamp(50 + (m["ret_1m"] or 0)*1.2 + (m["ret_3m"] or 0)*.8 + (m["ret_6m"] or 0)*.35)
    dist = m["distance_200dma"] or 0
    trend = 75 if dist >= 0 else 35
    if 0 <= dist <= 8: trend += 10
    elif dist > 18: trend -= 15
    entry = 78 if -4 <= dist <= 7 else 62 if -10 <= dist < -4 or 7 < dist <= 14 else 45
    vol = m["vol_20d_ann"] or 30
    target_vol = {"EQUITY":22,"STOCK":35,"GOLD":20,"BOND":12,"CASH":5}.get(asset_class,25)
    risk = clamp(85 - max(0,vol-target_vol)*1.8 + min(0,(m["drawdown_52w"] or 0))*0.5)
    macro_overlay = 50
    vix = macro.get("vix",{}).get("price")
    y10 = macro.get("us10y",{}).get("price")
    usd1m = macro.get("dollar",{}).get("ret_1m")
    if asset_class in ("EQUITY","STOCK"):
        if vix is not None: macro_overlay += 10 if vix < 18 else -15 if vix > 30 else -5 if vix > 24 else 0
        if y10 is not None and y10 > 5: macro_overlay -= 8
    elif asset_class == "GOLD":
        if vix is not None and vix > 24: macro_overlay += 10
        if usd1m is not None: macro_overlay += 8 if usd1m < -1 else -6 if usd1m > 2 else 0
    elif asset_class == "BOND":
        if y10 is not None: macro_overlay += 10 if y10 >= 4 else 0
    elif asset_class == "CASH":
        macro_overlay = 55
    total = .30*mom + .25*trend + .20*risk + .15*entry + .10*clamp(macro_overlay)
    total = round(clamp(total))
    status = "ACCUMULATE" if total>=82 else "ATTRACTIVE" if total>=72 else "WATCH" if total>=62 else "NEUTRAL" if total>=52 else "EXPENSIVE / RISK HIGH"
    evidence = "Strong" if coverage == 1 and m.get("delay_days",99)<=2 else "Moderate"
    return {
        "score":total,"status":status,"evidence":evidence,"coverage":round(coverage*100),
        "components":{"momentum":round(mom),"trend":round(trend),"risk":round(risk),"entry":round(entry),"macro":round(clamp(macro_overlay))},
        "methodology":{"momentum":30,"trend":25,"risk":20,"entry_quality":15,"macro_overlay":10},
        "note":"MODELLED score; valuation is not included unless a verified valuation feed is available."
    }

def macro_metrics(rows):
    latest = rows[-1]
    return {
        "price":r2(latest[1]),"date":latest[0].isoformat(),
        "ret_1d":r2(latest[1]-rows[-2][1]) if len(rows)>1 else None,
        "ret_1m":r2(latest[1]-rows[-22][1]) if len(rows)>22 else None,
        "last_update":latest[0].isoformat(),"delay_days":stale_days(latest[0]),
        "fresh":stale_days(latest[0])<=7
    }

def changed_items(market, macro):
    candidates = []
    map_text = {
        "global_equity":("Global equities moved","Broad risk appetite changed across global stocks."),
        "sp500":("S&P 500 moved","US large caps shifted, affecting many global UCITS portfolios."),
        "nasdaq":("Nasdaq moved","Growth and duration-sensitive equities changed materially."),
        "europe":("Europe moved","European equity risk/reward shifted relative to the US."),
        "emerging":("Emerging markets moved","EM risk appetite and global growth sensitivity changed."),
        "gold":("Gold moved","Safe-haven demand, real-rate expectations or USD dynamics may be shifting."),
        "treasuries":("Treasuries moved","Rate expectations and duration pricing changed.")
    }
    for k,(title,why) in map_text.items():
        m=market.get(k,{})
        val=m.get("ret_1d")
        if val is not None:
            candidates.append((abs(val),{"event":title,"move":val,"why_it_matters":why,"affected_assets":[k]}))
    v=macro.get("vix",{}).get("ret_1d")
    if v is not None:
        candidates.append((abs(v)*1.4,{"event":"VIX changed","move":v,"why_it_matters":"Equity option-implied volatility changed, altering the short-term risk backdrop.","affected_assets":["equities","options","credit"]}))
    y=macro.get("us10y",{}).get("ret_1d")
    if y is not None:
        candidates.append((abs(y)*8,{"event":"US 10Y yield changed","move_pp":y,"why_it_matters":"Discount rates moved, affecting bonds and equity valuations.","affected_assets":["bonds","growth equities","USD","gold"]}))
    return [x[1] for x in sorted(candidates,key=lambda x:x[0],reverse=True)[:4]]

def market_regime(market, macro):
    eq_ids=["global_equity","sp500","nasdaq","europe","emerging"]
    above=sum(1 for k in eq_ids if (market.get(k,{}).get("distance_200dma") or -999)>0)
    vix=macro.get("vix",{}).get("price")
    g=market.get("global_equity",{})
    r3=g.get("ret_3m")
    if vix is not None and vix>32: return "RISK-OFF","High"
    if above<=1 and (r3 is not None and r3<0): return "CORRECTION","Medium"
    if above>=4 and (r3 is not None and r3>5): return "RISK-ON","High"
    if above>=3: return "EARLY / MID BULL","Medium"
    return "MIXED","Medium"

def global_score(market, macro):
    eq_ids=["global_equity","sp500","nasdaq","europe","emerging"]
    trend_vals=[]
    mom_vals=[]
    for k in eq_ids:
        m=market.get(k,{})
        if m.get("distance_200dma") is not None: trend_vals.append(70 if m["distance_200dma"]>=0 else 30)
        if m.get("ret_3m") is not None: mom_vals.append(clamp(50+m["ret_3m"]*2))
    if not trend_vals or not mom_vals: return None,{}
    trend=statistics.fmean(trend_vals)
    momentum=statistics.fmean(mom_vals)
    vix=macro.get("vix",{}).get("price")
    vol=70 if vix is None else clamp(100-(vix-12)*3)
    lqd=market.get("corp_bonds",{})
    credit=60 if lqd.get("distance_200dma") is None else (70 if lqd["distance_200dma"]>=0 else 35)
    y10=macro.get("us10y",{}).get("price")
    rates=55 if y10 is None else clamp(75-abs(y10-3.5)*8)
    score=round(.30*trend+.25*momentum+.20*vol+.15*credit+.10*rates)
    return score,{"trend_breadth":round(trend),"momentum":round(momentum),"volatility":round(vol),"credit_proxy":round(credit),"rates":round(rates),
                  "weights":{"trend_breadth":30,"momentum":25,"volatility":20,"credit_proxy":15,"rates":10}}

def biggest_risk(market, macro):
    vix=macro.get("vix",{}).get("price")
    if vix is not None and vix>=30:
        return {"title":"Elevated volatility","detail":f"VIX is {vix:.1f}; short-term market stress is elevated.","severity":"HIGH"}
    y=macro.get("us10y",{})
    if y.get("ret_1m") is not None and y["ret_1m"]>=0.35:
        return {"title":"Rates repricing higher","detail":f"US 10Y yield rose {y['ret_1m']:.2f} pp over ~1 month, a headwind for duration-sensitive assets.","severity":"HIGH"}
    q=market.get("nasdaq",{})
    if q.get("distance_200dma") is not None and q["distance_200dma"]>18:
        return {"title":"Growth concentration / extension","detail":"Nasdaq is materially above its 200-day average; entry risk is less attractive even if trend is strong.","severity":"MEDIUM"}
    return {"title":"No single dominant systemic risk","detail":"Risk remains distributed across rates, valuation, growth and geopolitics; monitor catalysts rather than forcing a single narrative.","severity":"MEDIUM"}

def idea_from(k, meta, m, s):
    label=meta["label"]
    score=s.get("score")
    why=[]
    if m.get("ret_3m") is not None: why.append(f"3-month momentum: {m['ret_3m']:+.1f}%")
    if m.get("distance_200dma") is not None: why.append(f"Distance vs 200-day average: {m['distance_200dma']:+.1f}%")
    if m.get("vol_20d_ann") is not None: why.append(f"20-day annualised volatility: {m['vol_20d_ann']:.1f}%")
    risks=[]
    if m.get("distance_200dma") is not None and m["distance_200dma"]>12: risks.append("Entry is extended versus the 200-day trend.")
    if meta["asset_class"] in ("EQUITY","STOCK"): risks.append("Earnings, rates or risk-premium shocks can cause material drawdowns.")
    if meta["asset_class"]=="GOLD": risks.append("Higher real yields and a stronger USD can pressure gold.")
    if meta["asset_class"]=="BOND": risks.append("Duration losses remain possible if yields rise further.")
    if not risks: risks=["Market conditions can change faster than historical indicators."]
    return {
        "asset_id":k,"asset":label,"ucits_candidate":meta.get("ucits"),
        "score":score,"action":s.get("status"),"conviction":"High" if s.get("evidence")=="Strong" and score and score>=78 else "Medium",
        "horizon":"Years" if meta["asset_class"] in ("EQUITY","GOLD") else "Months / Years",
        "why":why[:3],"risks":risks[:3],
        "entry_approach":"Gradual accumulation is more robust than a single all-in entry when timing uncertainty is meaningful.",
        "invalidation":"Trend deterioration below the long-term average, worsening macro risk, or materially weaker evidence would reduce conviction.",
        "evidence_quality":s.get("evidence"),"data_date":m.get("date")
    }

def load_json(path, default):
    try:
        return json.loads(path.read_text())
    except Exception:
        return default

previous=load_json(LATEST,{})
market={}
histories={}
errors=[]

for k,meta in ASSETS.items():
    try:
        rows,url=fetch_stooq(meta["symbol"])
        market[k]={**summarize(rows,url),"label":meta["label"],"asset_class":meta["asset_class"],"proxy_symbol":meta["symbol"],"data_type":"OBSERVED_PROXY"}
        histories[k]=monthly_points(rows)
    except Exception as e:
        old=previous.get("market",{}).get(k)
        if old:
            market[k]={**old,"fresh":False,"fallback":True,"data_type":"STALE_LAST_KNOWN_GOOD","error":str(e)}
        else:
            market[k]={"label":meta["label"],"asset_class":meta["asset_class"],"status":"DATA UNAVAILABLE","error":str(e)}
        errors.append({"series":k,"error":str(e)})

macro={}
for k,meta in FRED.items():
    try:
        rows,url=fetch_fred(meta["series"])
        mm=macro_metrics(rows)
        mm.update({"label":meta["label"],"unit":meta["unit"],"source":url,"data_type":"OBSERVED"})
        # Rates are expressed as percentage-point changes; VIX/FX/Crypto use percentage returns.
        if meta["asset_class"] in ("VOL","FX","CRYPTO"):
            mm["ret_1d"]=r2(ret_at(rows,1))
            mm["ret_1m"]=r2(ret_at(rows,21))
        macro[k]=mm
        if k=="btc":
            histories[k]=monthly_points(rows)
    except Exception as e:
        old=previous.get("macro",{}).get(k)
        macro[k]={**old,"fresh":False,"fallback":True,"data_type":"STALE_LAST_KNOWN_GOOD","error":str(e)} if old else {"label":meta["label"],"status":"DATA UNAVAILABLE","error":str(e)}
        errors.append({"series":k,"error":str(e)})

scores={}
for k,meta in ASSETS.items():
    if meta["asset_class"] == "STOCK":
        scores[k] = {
            "score": None,
            "status": "DATA INSUFFICIENT",
            "evidence": "Weak",
            "coverage": 0,
            "note": "No stock recommendation: verified fundamentals, valuation and earnings-revision feeds are not connected yet. Price/momentum data is shown for context only."
        }
    else:
        scores[k]=score_asset(market.get(k,{}),meta["asset_class"],macro)

# Cash EUR is scored from ECB deposit rate if available; no pretend market-price score.
ecb=macro.get("ecb_deposit",{})
if ecb.get("price") is not None and ecb.get("fresh"):
    cash_score=round(clamp(50 + ecb["price"]*8))
    scores["cash_eur"]={"score":cash_score,"status":"ATTRACTIVE" if cash_score>=72 else "WATCH" if cash_score>=62 else "NEUTRAL",
                        "evidence":"Moderate","coverage":100,"components":{"short_rate":cash_score},
                        "methodology":{"ecb_deposit_rate_proxy":100},
                        "note":"MODELLED cash attractiveness using ECB deposit facility rate as a euro short-rate proxy; bank deposit rates may differ."}
else:
    scores["cash_eur"]={"score":None,"status":"DATA INSUFFICIENT","evidence":"Weak","coverage":0}

ranking=[]
for k,s in scores.items():
    if s.get("score") is not None:
        label="Euro Cash" if k=="cash_eur" else ASSETS[k]["label"]
        ranking.append({"id":k,"label":label,"score":s["score"],"status":s["status"],"evidence":s["evidence"]})
ranking.sort(key=lambda x:x["score"],reverse=True)

top_ideas=[]
for r in ranking:
    if len(top_ideas)>=3: break
    if r["id"]=="cash_eur": continue
    if r["score"]>=68 and r["id"] in ASSETS:
        top_ideas.append(idea_from(r["id"],ASSETS[r["id"]],market[r["id"]],scores[r["id"]]))

gscore,gcomponents=global_score(market,macro)
regime,regime_conf=market_regime(market,macro)
if gscore is None: status="DATA INSUFFICIENT"
elif gscore>=72: status="POSITIVE"
elif gscore>=58: status="CAUTION"
elif gscore>=45: status="HIGH RISK"
else: status="DEFENSIVE"
prev_score=previous.get("global_market",{}).get("score")
direction="Stable →" if prev_score is None or gscore is None or abs(gscore-prev_score)<3 else "Improving ↑" if gscore>prev_score else "Deteriorating ↓"

if ranking and ranking[0]["score"]>=72:
    best={"type":"BEST CURRENT OPPORTUNITY","asset":ranking[0]["label"],"score":ranking[0]["score"],"status":ranking[0]["status"]}
else:
    best={"type":"NO CLEAR OPPORTUNITY","asset":"Patience / cash remains rational","score":ranking[0]["score"] if ranking else None,"status":"WAIT"}

action="WAIT / REVIEW" if not ranking or ranking[0]["score"]<72 else "ACCUMULATE GRADUALLY"
if status in ("HIGH RISK","DEFENSIVE"): action="WAIT / REDUCE TIMING RISK"

fresh_series=sum(1 for x in list(market.values())+list(macro.values()) if x.get("fresh"))
total_series=len(market)+len(macro)
quality_pct=round(fresh_series/total_series*100) if total_series else 0

payload={
    "schema_version":"1.0",
    "generated_at":NOW.isoformat(),
    "data_quality":{"fresh_series":fresh_series,"total_series":total_series,"coverage_pct":quality_pct,
                    "state":"STRONG" if quality_pct>=90 else "MODERATE" if quality_pct>=70 else "WEAK",
                    "errors":errors[:12],
                    "rules":["No synthetic price fabrication","Stale fallback explicitly labelled","Scores suppressed when core data coverage is insufficient","Valuation omitted until a verified valuation feed is connected"]},
    "global_market":{"status":status,"score":gscore,"trend":direction,"regime":regime,"regime_confidence":regime_conf,
                     "components":gcomponents,"methodology":"Derived from observed trend breadth, momentum, VIX, investment-grade bond proxy and rates. Not a return forecast."},
    "today":{"best_opportunity":best,"biggest_risk":biggest_risk(market,macro),"action":action,
             "what_changed":changed_items(market,macro),"top_ideas":top_ideas,
             "no_forced_recommendation": True},
    "ranking":ranking,
    "market":market,
    "macro":macro,
    "scores":scores,
    "sources":{"market":"Stooq daily market data (proxy instruments)","macro":"FRED public CSV series; underlying source varies by series","etf_metadata":"Issuer pages / verified static config"},
    "states":{"prices":"OBSERVED_PROXY","macro":"OBSERVED","scores":"MODELLED","simulations":"SCENARIO"}
}

LATEST.write_text(json.dumps(payload,indent=2,ensure_ascii=False)+"\n")

for k,pts in histories.items():
    (HIST_DIR/f"{k}.json").write_text(json.dumps({"asset_id":k,"generated_at":NOW.isoformat(),"frequency":"monthly_close","data":pts},indent=2)+"\n")

# Track record: append today's top ideas once, then settle horizons when enough future monthly data exists.
signals=load_json(SIGNALS,{"schema_version":"1.0","signals":[]})
seen={(x.get("date"),x.get("asset_id")) for x in signals["signals"]}
for idea in top_ideas:
    k=idea["asset_id"]; m=market.get(k,{})
    if (TODAY,k) not in seen and m.get("price") is not None:
        signals["signals"].append({"date":TODAY,"asset_id":k,"asset":idea["asset"],"signal":idea["action"],"score":idea["score"],
                                   "price":m["price"],"conviction":idea["conviction"],"horizon":idea["horizon"],
                                   "reasoning_summary":idea["why"],"source_date":m.get("date"),"outcomes":{}})
SIGNALS.write_text(json.dumps(signals,indent=2,ensure_ascii=False)+"\n")

# Lightweight accountability summary from signals with currently observable prices.
wins=0; evaluated=0; returns=[]
for s in signals["signals"]:
    k=s.get("asset_id"); current=market.get(k,{}).get("price")
    if current and s.get("price") and date.fromisoformat(s["date"]) < NOW.date():
        rr=(current/s["price"]-1)*100
        s["outcomes"]["to_latest_pct"]=round(rr,2)
        evaluated+=1; returns.append(rr)
        if rr>0:wins+=1
track={"generated_at":NOW.isoformat(),"evaluated_signals":evaluated,
       "hit_rate_positive_pct":round(wins/evaluated*100,1) if evaluated else None,
       "average_return_to_latest_pct":round(statistics.fmean(returns),2) if returns else None,
       "note":"Early track record uses return from signal date to latest available close. Horizon-specific evaluation will populate as history accumulates."}
TRACK.write_text(json.dumps(track,indent=2)+"\n")

print(json.dumps({"ok":True,"generated_at":NOW.isoformat(),"coverage_pct":quality_pct,"global_score":gscore,"top":ranking[:3],"errors":errors[:5]},indent=2))
