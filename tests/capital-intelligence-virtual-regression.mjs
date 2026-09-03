import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../market.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../capital/app.js',import.meta.url),'utf8');
const lab=fs.readFileSync(new URL('../capital/intelligence-lab.js',import.meta.url),'utf8');
const config=JSON.parse(fs.readFileSync(new URL('../capital/config.json',import.meta.url),'utf8'));

new Function(app);
new Function(lab);

assert.match(html,/<html lang="it">/,'the Capital site must be Italian');
assert.match(html,/id="my-investments"/,'My Investments section must be visible');
assert.match(html,/id="advice"/,'simple investment advice must be visible near the top');
assert.match(html,/CONSIGLIO INVESTIMENTI/,'simple advice must use explicit child-readable wording');
assert.match(html,/id="ai-portfolios"/,'AI portfolio arena must be visible');
assert.match(html,/PORTAFOGLI AI NEL MONDO/,'AI portfolio comparison title must remain visible');
assert.match(html,/id="intelligence"/,'intelligence section must be visible');
assert.match(html,/id="virtual"/,'virtual money lab must be visible');
assert.match(html,/id="simulator"/,'long-horizon investment simulator must remain present');
assert.match(html,/capital\/intelligence-lab\.js/,'shadow intelligence module must load');
assert.match(html,/I MIEI INVESTIMENTI/,'investment guide must remain Italian and prominent');
assert.match(html,/METALLI, MINERALI E TEMI/,'resources section must remain visible');
assert.match(app,/renderInvestments\(\)/,'investment universe must be rendered');
assert.match(app,/renderSimpleAdvice\(\)/,'simple advice must be rendered');
assert.match(app,/renderAIPortfolios\(\)/,'AI portfolios must be rendered');
assert.match(app,/INVESTI UNA PARTE, NON TUTTO/,'advice must include plain-language partial-investment state');
assert.match(app,/ARGUS_CAPITAL_LAB\?\.render/,'dashboard data must feed the intelligence lab');
assert.doesNotMatch(app,/\\n\s+window\.ARGUS_CAPITAL_LAB/,'app must not contain escaped newline syntax corruption');

assert.match(lab,/ESECUZIONE REALE:/,'UI must expose real-execution state in Italian');
assert.match(lab,/real:'BLOCCATA'/,'real-money execution must remain hard blocked');
assert.match(lab,/SOLO VIRTUALE/,'virtual module must state paper-only');
assert.match(lab,/coverage<60/,'weak verified-data coverage must block paper allocation');
assert.match(lab,/entryProxyPrice/,'virtual entries must freeze a proxy entry price');
assert.match(lab,/scoreAtEntry/,'virtual entries must freeze the score at entry');
assert.match(lab,/benchmarkEntry/,'virtual portfolio must freeze a benchmark entry');
assert.doesNotMatch(lab,/broker.*(send|place|execute)|placeOrder|executeOrder/i,'shadow lab must not contain broker execution calls');

assert.ok(config.etfs.some(x=>x.id==='vwce' && x.tier_it==='CORE'),'global core ETF must remain in investment universe');
assert.ok(config.etfs.some(x=>x.id==='sgln' && x.role==='METAL_DEFENSE'),'gold must remain in defensive universe');
assert.ok(config.etfs.some(x=>x.id==='urnm'),'uranium miners candidate must remain present');
assert.ok(config.etfs.some(x=>x.id==='copx'),'copper miners candidate must remain present');
assert.ok(config.etfs.some(x=>x.id==='litu'),'lithium candidate must remain present');
assert.ok((config.stock_watchlist||[]).length>=6,'stock research watchlist must remain broad');
assert.ok((config.ai_portfolios||[]).some(x=>x.id==='claude' && x.verified===true),'Claude public live record must be present and verified');
assert.ok((config.ai_portfolios||[]).filter(x=>x.id!=='claude').every(x=>x.verified===false),'unverified AI portfolios must never receive fabricated verified status');
assert.ok((config.ai_portfolios||[]).filter(x=>!x.verified).every(x=>x.since_inception_net_pct==null),'unverified AI portfolios must not contain fabricated returns');
assert.ok(config.stock_watchlist.every(x=>/ATTESA DATI FONDAMENTALI/.test(x.status_it)),'stocks must remain blocked until fundamentals are verified');

console.log('capital simple advice + AI portfolio arena + virtual money regression: OK');
