import { readJson, writeJson, storageReady } from './_report-store.js';

const NAME='control-plane-rd';
const PREFIX='argus/control-plane';
function secret(){return String(process.env.CRON_SECRET||'').trim()}
function authorized(req){const s=secret();return !s||req.headers.authorization===`Bearer ${s}`}
function bucket(now=new Date()){
  const d=new Date(now);const h=Math.floor(d.getUTCHours()/3)*3;
  return `${d.toISOString().slice(0,10)}T${String(h).padStart(2,'0')}:00Z`;
}
function classify(e){
  const s=String(e?.message||e||'').toLowerCase();
  if(/blob|storage|store/.test(s))return'STORAGE';
  if(/auth|unauthor|forbidden|credential|secret/.test(s))return'AUTH';
  if(/429|quota|provider|api-football|fetch|network/.test(s))return'PROVIDER';
  if(/data|json|parse|schema/.test(s))return'DATA';
  if(/model|prediction|calibr/.test(s))return'MODEL';
  if(/cron|overlap|duplicate|lock/.test(s))return'CRON';
  return'UNKNOWN';
}
async function persist(path,value){await writeJson(path,value);const reread=await readJson(path,null);return Boolean(reread&&reread.runId===value.runId&&reread.status===value.status)}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!authorized(req))return res.status(401).json({error:'Unauthorized'});
  if(!storageReady())return res.status(503).json({ok:false,category:'STORAGE',error:'Control-plane storage unavailable'});
  const invokedAt=new Date(),slot=bucket(invokedAt),runKey=`${NAME}:${slot}`,safeSlot=slot.replace(/[:]/g,'-'),finalPath=`${PREFIX}/runs/${NAME}/${safeSlot}.json`,healthPath=`${PREFIX}/health/${NAME}.json`,failurePath=`${PREFIX}/failures/${NAME}.json`;
  const previous=await readJson(finalPath,null);
  if(previous){
    const duplicate={...previous,duplicateInvocations:Number(previous.duplicateInvocations||0)+1,lastDuplicateAt:new Date().toISOString()};
    await writeJson(finalPath,duplicate);
    return res.status(200).json({ok:true,skipped:true,reason:'DUPLICATE_RUN_KEY',runKey,originalRunId:previous.runId});
  }
  const runId=`${NAME}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const base={version:'CONTROL-PLANE-RD-1',name:NAME,runId,runKey,slot,configured:true,deployed:Boolean(process.env.VERCEL_URL),invoked:true,startedAt:invokedAt.toISOString(),automaticWagering:false,externalApiCalls:0,modelMutation:false,thresholdMutation:false};
  try{
    const provisional={...base,status:'RUNNING',persisted:false};
    await writeJson(finalPath,provisional);
    const owner=await readJson(finalPath,null);
    if(owner?.runId!==runId)return res.status(200).json({ok:true,skipped:true,reason:'OVERLAP_LOCK_LOST',runKey,runId});
    const completed={...base,status:'SUCCEEDED',succeeded:true,completedAt:new Date().toISOString(),persisted:true,proof:{configured:true,deployed:Boolean(process.env.VERCEL_URL),invoked:true,succeeded:true,persisted:true},duplicateInvocations:0};
    const persisted=await persist(finalPath,completed);
    const final={...completed,persisted,proof:{...completed.proof,persisted}};
    if(!persisted)throw new Error('Storage persistence read-back failed');
    await writeJson(healthPath,final);
    return res.status(200).json({ok:true,...final});
  }catch(e){
    const category=classify(e),failed={...base,status:'FAILED',succeeded:false,completedAt:new Date().toISOString(),persisted:false,failure:{category,message:String(e?.message||e).slice(0,500)}};
    try{await writeJson(finalPath,failed);const memory=await readJson(failurePath,{version:'FAILURE-MEMORY-1',counts:{},recent:[]});memory.counts[category]=Number(memory.counts[category]||0)+1;memory.recent=[{runId,runKey,at:failed.completedAt,category,message:failed.failure.message},...(memory.recent||[])].slice(0,50);memory.updatedAt=failed.completedAt;await writeJson(failurePath,memory);await writeJson(healthPath,failed)}catch(_){ }
    return res.status(500).json({ok:false,...failed});
  }
}
