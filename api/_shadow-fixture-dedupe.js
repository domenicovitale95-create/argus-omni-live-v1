function finite(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))}
function numeric(v){return finite(v)?Number(v):null}
function text(v){return v===null||v===undefined?null:String(v)}
function canonical(v){return String(v||'UNKNOWN').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'')||'UNKNOWN'}
function isoMs(v){const t=new Date(v||0).getTime();return Number.isFinite(t)&&t>0?t:null}

function normalizedPick(p={}){
  return{
    key:text(p?.key),
    source:canonical(p?.probabilitySource||p?.sourceClass||'UNKNOWN'),
    probability:numeric(p?.probability),
    outcome:text(p?.outcome)?.toUpperCase()||null,
    modelIndependentOfPrice:p?.modelIndependentOfPrice===true
  };
}

export function researchFixtureCore(fixture={}){
  const picks=(Array.isArray(fixture?.picks)?fixture.picks:[]).map(normalizedPick).sort((a,b)=>{
    const ka=`${a.source}|${a.key||''}`,kb=`${b.source}|${b.key||''}`;
    return ka.localeCompare(kb)||JSON.stringify(a).localeCompare(JSON.stringify(b));
  });
  return{
    kickoff:isoMs(fixture?.kickoff),
    finalScore:{home:numeric(fixture?.finalScore?.home),away:numeric(fixture?.finalScore?.away)},
    picks
  };
}

export function researchFixtureFingerprint(fixture={}){
  return JSON.stringify(researchFixtureCore(fixture));
}

function representativeRank(entry){
  const frozen=isoMs(entry.fixture?.frozenAt)||Infinity,kickoff=isoMs(entry.fixture?.kickoff)||Infinity;
  return [frozen,kickoff,entry.bookIndex,entry.fixtureIndex];
}
function compareRank(a,b){const ar=representativeRank(a),br=representativeRank(b);for(let i=0;i<ar.length;i++)if(ar[i]!==br[i])return ar[i]-br[i];return 0}

function entityToken(value){
  if(value===null||value===undefined)return null;
  if(typeof value==='object'){
    const id=value.id??value.team?.id;
    if(id!==null&&id!==undefined&&String(id).trim())return`ID:${String(id).trim()}`;
    const name=value.name??value.team?.name;
    return name==null?null:`NAME:${canonical(name)}`;
  }
  const s=String(value).trim();return s?`NAME:${canonical(s)}`:null;
}
function sameIdentity(entries,field,{required=false}={}){
  const xs=entries.map(e=>entityToken(e.fixture?.[field])).filter(Boolean);
  if(required&&xs.length!==entries.length)return false;
  return xs.length===0?!required:new Set(xs).size===1;
}
function sameCompetition(entries){
  const xs=entries.map(e=>entityToken(e.fixture?.competition)).filter(Boolean);
  return xs.length<2||new Set(xs).size===1;
}
function settledScore(fixture){
  const home=numeric(fixture?.finalScore?.home),away=numeric(fixture?.finalScore?.away);
  return home==null||away==null?null:{home,away};
}
function scoreKey(score){return score?`${score.home}:${score.away}`:null}
function settleKey(key,h,a){
  if(key==='home')return h>a;if(key==='draw')return h===a;if(key==='away')return a>h;
  if(key==='over15')return h+a>1;if(key==='over25')return h+a>2;if(key==='over35')return h+a>3;if(key==='under25')return h+a<3;
  if(key==='bttsYes')return h>0&&a>0;if(key==='bttsNo')return !(h>0&&a>0);if(key==='homeOver05')return h>0;if(key==='awayOver05')return a>0;
  if(key==='doubleChance1X')return h>=a;if(key==='doubleChance12')return h!==a;if(key==='doubleChanceX2')return a>=h;
  if(String(key||'').startsWith('score:'))return String(key).slice(6)===`${h}-${a}`;
  return null;
}
function reconcileSafeReschedule(entries){
  if(entries.length<2)return null;
  const ordered=[...entries].sort(compareRank),canonicalEntry=ordered[0],canonicalFixture=canonicalEntry.fixture||{};
  const frozen=isoMs(canonicalFixture.frozenAt),frozenKickoff=isoMs(canonicalFixture.kickoff);
  if(frozen==null||frozenKickoff==null||frozen>=frozenKickoff)return null;
  if(!sameIdentity(ordered,'home',{required:true})||!sameIdentity(ordered,'away',{required:true})||!sameCompetition(ordered))return null;
  const kickoffs=ordered.map(e=>isoMs(e.fixture?.kickoff));
  if(kickoffs.some(x=>x==null)||new Set(kickoffs).size<2)return null;
  const versions=ordered.map(e=>String(e.fixture?.freezeVersion||'')).filter(Boolean);
  if(versions.length>1&&new Set(versions).size!==1)return null;
  const settled=ordered.map(e=>({entry:e,score:settledScore(e.fixture)})).filter(x=>x.score);
  if(!settled.length||new Set(settled.map(x=>scoreKey(x.score))).size!==1)return null;
  const finalScore=settled[0].score,settledEntry=settled[0].entry;
  const picks=(Array.isArray(canonicalFixture.picks)?canonicalFixture.picks:[]).map(p=>{
    const outcome=settleKey(p?.key,finalScore.home,finalScore.away);
    return{
      ...p,
      outcome:outcome==null?null:(outcome?'WIN':'LOSS'),
      pl:null,
      closingOdds:null,
      clv:null
    };
  });
  if(!picks.length)return null;
  const latestKickoff=Math.max(...kickoffs),reconciled={
    ...canonicalFixture,
    finalScore:{...finalScore},
    picks,
    settledAt:settledEntry.fixture?.settledAt||null,
    settlementSource:'RESEARCH_RESCHEDULE_RECONCILIATION',
    closingSnapshot:null,
    rescheduleReconciliation:{
      method:'EARLIEST_PROSPECTIVE_FREEZE_PLUS_CONSISTENT_FINAL_SCORE',
      researchViewOnly:true,
      historicalBlobMutation:false,
      copies:ordered.length,
      canonicalFrozenAt:canonicalFixture.frozenAt||null,
      canonicalKickoff:canonicalFixture.kickoff||null,
      latestObservedKickoff:new Date(latestKickoff).toISOString(),
      finalScoreSourceFrozenAt:settledEntry.fixture?.frozenAt||null,
      discardedLaterProbabilities:true
    }
  };
  return{fixture:reconciled,canonicalEntry,settledEntry};
}

export function dedupeShadowFixtures(books,{sampleLimit=12}={}){
  const groups=new Map(),diagnostics={inputFixtures:0,outputFixtures:0,uniqueFixtureIds:0,duplicateFixtureIds:0,duplicateCopiesRemoved:0,identicalDuplicateFixtureIds:0,rawConflictingDuplicateFixtureIds:0,rescheduleReconciledFixtureIds:0,conflictingDuplicateFixtureIds:0,missingFixtureId:0,identicalDuplicateIds:[],rescheduleReconciledIds:[],conflictingDuplicateIds:[]};
  let fixtureIndex=0;
  for(let bookIndex=0;bookIndex<(books||[]).length;bookIndex++){
    const book=books[bookIndex];
    for(const fixture of Object.values(book?.fixtures||{})){
      diagnostics.inputFixtures++;fixtureIndex++;
      const rawId=fixture?.fixtureId;
      if(rawId===null||rawId===undefined||rawId===''){diagnostics.missingFixtureId++;continue}
      const id=String(rawId),entry={id,fixture,bookIndex,fixtureIndex,fingerprint:researchFixtureFingerprint(fixture)},list=groups.get(id)||[];list.push(entry);groups.set(id,list);
    }
  }
  diagnostics.uniqueFixtureIds=groups.size;
  const fixtures=[];
  const orderedIds=[...groups.keys()].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  for(const id of orderedIds){
    const entries=groups.get(id)||[];
    if(entries.length===1){fixtures.push(entries[0].fixture);continue}
    diagnostics.duplicateFixtureIds++;diagnostics.duplicateCopiesRemoved+=entries.length-1;
    const fingerprints=new Set(entries.map(x=>x.fingerprint));
    if(fingerprints.size===1){
      diagnostics.identicalDuplicateFixtureIds++;
      if(diagnostics.identicalDuplicateIds.length<sampleLimit)diagnostics.identicalDuplicateIds.push(id);
      fixtures.push([...entries].sort(compareRank)[0].fixture);
      continue;
    }
    diagnostics.rawConflictingDuplicateFixtureIds++;
    const reconciled=reconcileSafeReschedule(entries);
    if(reconciled){
      diagnostics.rescheduleReconciledFixtureIds++;
      if(diagnostics.rescheduleReconciledIds.length<sampleLimit)diagnostics.rescheduleReconciledIds.push(id);
      fixtures.push(reconciled.fixture);
    }else{
      diagnostics.conflictingDuplicateFixtureIds++;
      if(diagnostics.conflictingDuplicateIds.length<sampleLimit)diagnostics.conflictingDuplicateIds.push(id);
      // Fail closed: unresolved conflicting copies are excluded entirely.
    }
  }
  diagnostics.outputFixtures=fixtures.length;
  return{fixtures,diagnostics,policy:{duplicateIdentity:'fixtureId',fingerprintScope:'KICKOFF_FINAL_SCORE_FROZEN_PREDICTION_CORE',identicalDuplicateAction:'COUNT_ONCE_EARLIEST_FREEZE',safeRescheduleAction:'RESEARCH_VIEW_EARLIEST_PROSPECTIVE_FREEZE_PLUS_CONSISTENT_FINAL_SCORE',safeRescheduleRequires:'SAME_HOME_AWAY_COMPETITION_IF_PRESENT_DIFFERENT_KICKOFF_CONSISTENT_FINAL_SCORE_SAME_FREEZE_VERSION',laterRescheduleProbabilitiesUsed:false,unresolvedConflictingDuplicateAction:'EXCLUDE_ALL_COPIES',missingFixtureIdAction:'EXCLUDE',historicalBlobMutation:false}};
}
