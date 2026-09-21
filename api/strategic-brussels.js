import strategicData from '../data/strategic-brussels.json' with { type: 'json' };
import strategicSnapshot from '../data/strategic-watch-snapshot.json' with { type: 'json' };
import {rankZones,topOpportunityBuckets,detectEmergingAreas} from '../lib/strategic-brussels.js';

function slimZone(z){
  return {
    id:z.id,cluster:z.cluster,name:z.name,communes:z.communes,microzones:z.microzones,center:z.center,status:z.status,
    market:z.market,scores:z.scores,projects:z.projects,penalties:z.penalties,horizons:z.horizons,timeHorizon:z.timeHorizon,
    reasons:z.reasons,risks:z.risks,sourceIds:z.sourceIds,excludedCatalysts:z.excludedCatalysts,
    institutionalWatch:z.institutionalWatch,derived:z.derived
  };
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=900, stale-while-revalidate=3600');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'GET required'});
  try{
    const data=strategicData;
    const snapshot=strategicSnapshot||{generatedAt:null,signals:[],candidates:[],feeds:[],errors:[]};
    const benchmarks={regionAskingPricePerM2:data.methodology.marketBenchmark.regionAskingPricePerM2};
    const ranked=rankZones(data.zones,benchmarks);
    const buckets=topOpportunityBuckets(data.zones,benchmarks);
    const emerging=detectEmergingAreas(data.discovery?.candidates||[]);
    const reviewCandidates=(snapshot.candidates||[]).filter(c=>c.qualifiesForReview).map(c=>({
      key:c.key,area:c.area,signalCount:c.signalCount,independentSources:c.independentSources,categories:c.categories,
      promotionBlocked:!c.area||c.area.known===true||!c.area.id,
      reason:!c.area?'geography_unresolved':c.area.known===true?'already_tracked_zone':!c.area.id?'microzone_resolution_required':null
    }));
    const q=String(req.query?.zone||'').trim();
    if(q){
      const zone=ranked.find(z=>z.id===q);
      if(!zone)return res.status(404).json({ok:false,error:'Zone not found'});
      const sourceMap=Object.fromEntries((data.sources||[]).map(s=>[s.id,s]));
      return res.status(200).json({ok:true,updatedAt:data.updatedAt,methodology:data.methodology,zone:slimZone(zone),sources:(zone.sourceIds||[]).map(id=>sourceMap[id]).filter(Boolean)});
    }
    const bucketIds=Object.fromEntries(Object.entries(buckets).map(([k,v])=>[k,v?.id||null]));
    return res.status(200).json({
      ok:true,updatedAt:data.updatedAt,methodology:data.methodology,
      coverage:{municipalities:data.municipalities.length,municipalityNames:data.municipalities.map(x=>x.name),enhancedZones:data.zones.filter(x=>x.status==='ENHANCED_WATCH').length},
      municipalities:data.municipalities,
      zones:ranked.map(slimZone),
      topOpportunityIds:bucketIds,
      emergingAreas:emerging,
      discoveryReviewCandidates:reviewCandidates,
      discoverySnapshot:{generatedAt:snapshot.generatedAt,mode:snapshot.mode,feedStatus:snapshot.feeds,errors:snapshot.errors,signalCount:(snapshot.signals||[]).length},
      discovery:data.discovery,
      sources:data.sources
    });
  }catch(e){
    return res.status(500).json({ok:false,error:String(e?.message||e)});
  }
}
