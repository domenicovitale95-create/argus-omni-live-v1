import { readJson, writeJson, listJson } from './_report-store.js';

export const SHARD_PREFIX='argus/research/historical-decade-shards/';
export const SHARD_INDEX='argus/research/historical-decade-shards/index.json';
export const SHARD_VERSION='HISTORICAL-DECADE-SHARDS-1';

export function monthKey(date){return String(date||'').slice(0,7)}
export function shardPath(month){return `${SHARD_PREFIX}${month}.json`}

export async function readShardIndex(){
  const index=await readJson(SHARD_INDEX,null);
  if(index&&index.version===SHARD_VERSION)return index;
  return {version:SHARD_VERSION,createdAt:new Date().toISOString(),updatedAt:null,dates:{},shards:{},fixtureCount:0,completedDates:0};
}

export async function readMonthShard(month){
  return await readJson(shardPath(month),{version:SHARD_VERSION,month,fixtures:{},dates:{},updatedAt:null});
}

export async function writeMonthShard(month,shard){
  shard.version=SHARD_VERSION;
  shard.month=month;
  shard.updatedAt=new Date().toISOString();
  shard.fixtureCount=Object.keys(shard.fixtures||{}).length;
  shard.completedDates=Object.values(shard.dates||{}).filter(x=>x?.complete).length;
  await writeJson(shardPath(month),shard);
  return shard;
}

export async function writeShardIndex(index){
  index.version=SHARD_VERSION;
  index.updatedAt=new Date().toISOString();
  index.completedDates=Object.values(index.dates||{}).filter(x=>x?.complete).length;
  index.fixtureCount=Object.values(index.shards||{}).reduce((s,x)=>s+(Number(x?.fixtureCount)||0),0);
  await writeJson(SHARD_INDEX,index);
  return index;
}

export async function listMonthShards(){
  const blobs=await listJson(SHARD_PREFIX,500);
  return blobs.filter(b=>/^argus\/research\/historical-decade-shards\/\d{4}-\d{2}\.json$/.test(b.pathname)).sort((a,b)=>a.pathname.localeCompare(b.pathname));
}
