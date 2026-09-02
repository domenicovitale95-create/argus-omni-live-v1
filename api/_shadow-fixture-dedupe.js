const CORE_PICK_FIELDS=['key','probabilitySource','sourceClass','probability','outcome','modelIndependentOfPrice'];

function finite(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))}
function numeric(v){return finite(v)?Number(v):null}
function text(v){return v===null||v===undefined?null:String(v)}
function isoMs(v){const t=new Date(v||0).getTime();return Number.isFinite(t)&&t>0?t:null}

function normalizedPick(p={}){
  const out={};
  for(const key of CORE_PICK_FIELDS){
    if(key==='probability')out[key]=numeric(p[key]);
    else if(key==='modelIndependentOfPrice')out[key]=p[key]===true;
    else out[key]=text(p[key]);
  }
  return out;
}

export function researchFixtureCore(fixture={}){
  const picks=(Array.isArray(fixture?.picks)?fixture.picks:[]).map(normalizedPick).sort((a,b)=>{
    const ka=`${a.probabilitySource||a.sourceClass||''}|${a.key||''}`,kb=`${b.probabilitySource||b.sourceClass||''}|${b.key||''}`;
    return ka.localeCompare(kb)||JSON.stringify(a).localeCompare(JSON.stringify(b));
  });
  return{
    kickoff:text(fixture?.kickoff),
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

export function dedupeShadowFixtures(books,{sampleLimit=12}={}){
  const groups=new Map(),diagnostics={inputFixtures:0,outputFixtures:0,uniqueFixtureIds:0,duplicateFixtureIds:0,duplicateCopiesRemoved:0,identicalDuplicateFixtureIds:0,conflictingDuplicateFixtureIds:0,missingFixtureId:0,identicalDuplicateIds:[],conflictingDuplicateIds:[]};
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
    }else{
      diagnostics.conflictingDuplicateFixtureIds++;
      if(diagnostics.conflictingDuplicateIds.length<sampleLimit)diagnostics.conflictingDuplicateIds.push(id);
      // Fail closed: conflicting copies are excluded entirely from research/calibration metrics.
    }
  }
  diagnostics.outputFixtures=fixtures.length;
  return{fixtures,diagnostics,policy:{duplicateIdentity:'fixtureId',identicalDuplicateAction:'COUNT_ONCE_EARLIEST_FREEZE',conflictingDuplicateAction:'EXCLUDE_ALL_COPIES',missingFixtureIdAction:'EXCLUDE',historicalBlobMutation:false}};
}
