import { listJsonComplete, readJson, readManyJson, writeJson } from './_report-store.js';

const TZ='Europe/Brussels';
export const SHADOW_FIXTURE_REGISTRY_PATH='argus/data/shadow-fixture-registry-v1.json';
export const SHADOW_FIXTURE_REGISTRY_VERSION='SHADOW-FIXTURE-REGISTRY-1';

function dateBrussels(d=new Date()){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function timeMs(value){
  const n=new Date(value||0).getTime();
  return Number.isFinite(n)&&n>0?n:Number.POSITIVE_INFINITY;
}

function candidateFromFixture(f,key,bookDate){
  const fixtureId=String(f?.fixtureId??key??'').trim();
  if(!fixtureId)return null;
  return {
    fixtureId,
    canonicalDate:String(bookDate||'').trim()||null,
    frozenAt:f?.frozenAt||null,
    frozenKickoff:f?.kickoff||null,
    freezeVersion:f?.freezeVersion||null
  };
}

function earlier(a,b){
  const ta=timeMs(a?.frozenAt),tb=timeMs(b?.frozenAt);
  if(ta!==tb)return ta<tb;
  return String(a?.canonicalDate||'9999-99-99')<String(b?.canonicalDate||'9999-99-99');
}

export function shadowBookDateForMatch(match,overrideDate=null){
  if(overrideDate)return String(overrideDate);
  const t=new Date(match?.kickoff||0);
  return Number.isFinite(t.getTime())?dateBrussels(t):dateBrussels();
}

export function buildShadowFixtureRegistry(books,{nowIso=new Date().toISOString()}={}){
  const fixtures={};
  let duplicateIds=0;
  for(const book of Array.isArray(books)?books:[]){
    const bookDate=String(book?.date||'').trim()||null;
    for(const [key,f] of Object.entries(book?.fixtures||{})){
      const candidate=candidateFromFixture(f,key,bookDate);
      if(!candidate)continue;
      const existing=fixtures[candidate.fixtureId];
      if(existing){
        duplicateIds++;
        if(earlier(candidate,existing))fixtures[candidate.fixtureId]=candidate;
      }else fixtures[candidate.fixtureId]=candidate;
    }
  }
  return {
    version:SHADOW_FIXTURE_REGISTRY_VERSION,
    builtAt:nowIso,
    updatedAt:nowIso,
    policy:'GLOBAL FIXTURE IDENTITY — earliest prospective freeze is canonical across daily books; reschedules must never create a second frozen forecast.',
    fixtures,
    seedDiagnostics:{books:Array.isArray(books)?books.length:0,fixtures:Object.keys(fixtures).length,duplicateCopiesObserved:duplicateIds}
  };
}

export function isShadowFixtureRegistry(value){
  return value?.version===SHADOW_FIXTURE_REGISTRY_VERSION&&value?.fixtures&&typeof value.fixtures==='object'&&!Array.isArray(value.fixtures);
}

export function canonicalShadowFixture(registry,fixtureId){
  return registry?.fixtures?.[String(fixtureId)]||null;
}

export function registerShadowBook(registry,book){
  if(!isShadowFixtureRegistry(registry))throw new Error('INVALID_SHADOW_FIXTURE_REGISTRY');
  const bookDate=String(book?.date||'').trim()||null;
  let changed=0;
  for(const [key,f] of Object.entries(book?.fixtures||{})){
    const candidate=candidateFromFixture(f,key,bookDate);
    if(!candidate)continue;
    const existing=registry.fixtures[candidate.fixtureId];
    if(!existing){registry.fixtures[candidate.fixtureId]=candidate;changed++;continue}
    if(earlier(candidate,existing)){registry.fixtures[candidate.fixtureId]=candidate;changed++}
  }
  return changed;
}

export async function loadShadowFixtureRegistry({seedIfMissing=true,now=new Date()}={}){
  const existing=await readJson(SHADOW_FIXTURE_REGISTRY_PATH,null);
  if(isShadowFixtureRegistry(existing))return{registry:existing,seeded:false};
  if(!seedIfMissing)throw new Error('SHADOW_FIXTURE_REGISTRY_MISSING');
  const listing=await listJsonComplete('argus/shadow/',{maxBlobs:5000,pageSize:500});
  if(!listing.complete)throw new Error(`SHADOW_FIXTURE_REGISTRY_SEED_INCOMPLETE:${listing.error||'UNKNOWN'}`);
  const books=await readManyJson(listing.blobs);
  const registry=buildShadowFixtureRegistry(books,{nowIso:now.toISOString()});
  registry.seedDiagnostics={...registry.seedDiagnostics,pages:listing.pages,scanned:listing.scanned,complete:true};
  await writeJson(SHADOW_FIXTURE_REGISTRY_PATH,registry);
  return{registry,seeded:true};
}

export async function persistShadowFixtureRegistry(registry,{now=new Date()}={}){
  if(!isShadowFixtureRegistry(registry))throw new Error('INVALID_SHADOW_FIXTURE_REGISTRY');
  registry.updatedAt=now.toISOString();
  await writeJson(SHADOW_FIXTURE_REGISTRY_PATH,registry);
  return registry;
}
