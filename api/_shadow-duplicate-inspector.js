import { researchFixtureCore, researchFixtureFingerprint } from './_shadow-fixture-dedupe.js';

function text(v){return v===null||v===undefined?null:String(v)}
function compactBookMeta(book,index){return{bookIndex:index,date:text(book?.date),generatedAt:text(book?.generatedAt),version:text(book?.version),mode:text(book?.mode)}}
function copySummary(fixture,book,index){return{book:compactBookMeta(book,index),fixtureId:text(fixture?.fixtureId),frozenAt:text(fixture?.frozenAt),freezeVersion:text(fixture?.freezeVersion),core:researchFixtureCore(fixture),fingerprint:researchFixtureFingerprint(fixture)}}
function sectionDiff(a,b){return{kickoff:a.core.kickoff!==b.core.kickoff,finalScore:JSON.stringify(a.core.finalScore)!==JSON.stringify(b.core.finalScore),picks:JSON.stringify(a.core.picks)!==JSON.stringify(b.core.picks),frozenAt:a.frozenAt!==b.frozenAt,freezeVersion:a.freezeVersion!==b.freezeVersion}}

export function inspectShadowFixtureDuplicates(books,{onlyIds=null,limit=20}={}){
  const wanted=Array.isArray(onlyIds)&&onlyIds.length?new Set(onlyIds.map(String)):null,groups=new Map();
  let inputFixtures=0,missingFixtureId=0;
  for(let bookIndex=0;bookIndex<(books||[]).length;bookIndex++){
    const book=books[bookIndex];
    for(const fixture of Object.values(book?.fixtures||{})){
      inputFixtures++;const raw=fixture?.fixtureId;if(raw===null||raw===undefined||raw===''){missingFixtureId++;continue}
      const id=String(raw);if(wanted&&!wanted.has(id))continue;
      const list=groups.get(id)||[];list.push(copySummary(fixture,book,bookIndex));groups.set(id,list);
    }
  }
  const duplicates=[];
  for(const id of [...groups.keys()].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))){
    const copies=groups.get(id)||[];if(copies.length<2)continue;
    const fingerprints=new Set(copies.map(x=>x.fingerprint)),reference=copies[0],comparisons=copies.slice(1).map((x,i)=>({copyIndex:i+1,...sectionDiff(reference,x)}));
    duplicates.push({fixtureId:id,copies:copies.length,classification:fingerprints.size===1?'IDENTICAL_CORE':'CONFLICTING_CORE',changedSections:{kickoff:comparisons.some(x=>x.kickoff),finalScore:comparisons.some(x=>x.finalScore),picks:comparisons.some(x=>x.picks),frozenAt:comparisons.some(x=>x.frozenAt),freezeVersion:comparisons.some(x=>x.freezeVersion)},comparisons,copiesDetail:copies.map(({fingerprint,...x})=>x)});
    if(duplicates.length>=limit)break;
  }
  return{version:'SHADOW-DUPLICATE-INSPECTOR-1',inputFixtures,missingFixtureId,duplicateIds:duplicates.length,duplicates,policy:{readOnly:true,providerCalls:0,persistentWrites:0,fingerprintScope:'KICKOFF_FINAL_SCORE_FROZEN_PREDICTION_CORE',marketSnapshotFieldsExcludedFromConflictClassification:true}};
}
