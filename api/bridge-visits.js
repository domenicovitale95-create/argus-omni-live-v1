// Private Google Sheets read-only bridge. No credentials or visits in the public repository.
import crypto from 'node:crypto';

const SHEET_ID='14Nfs41fbNSmr0u7hHTDlvNncJbA8CnvIedC6EyocECc';
const COOKIE='argus_bridge_session';
const TTL=30*24*60*60;
const deny=(res,code,msg)=>res.status(code).json({ok:false,error:msg});
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const eq=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const secret=()=>process.env.BRIDGE_SESSION_SECRET||'';
function sign(value){return crypto.createHmac('sha256',secret()).update(value).digest('base64url')}
function authorized(req){
 const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
 const [exp,sig]=raw.split('.');
 return !!exp&&/^\d+$/.test(exp)&&Number(exp)>Math.floor(Date.now()/1000)&&!!sig&&eq(sig,sign(exp));
}
function sheetRows(values){
 const headIndex=values.findIndex(r=>r[0]==='ID'&&r.includes('IMMEUBLE'));
 if(headIndex<0)return [];
 const cols=values[headIndex].map(x=>String(x||'').trim().toUpperCase());
 const get=(r,key)=>r[cols.indexOf(key)]||'';
 return values.slice(headIndex+1).filter(r=>/^BR-\d+$/i.test(String(r[0]||'').trim())).map(r=>({
 id:String(r[0]||'').trim(),
 name:get(r,'IMMEUBLE'),
 agency:get(r,'AGENCE'),
 agent:get(r,'AGENT'),
 source:get(r,'VISITE (SOURCE)'),
 date:get(r,'DATE VALIDÉE'),
 hour:get(r,'HEURE VALIDÉE'),
 action:get(r,'PROCHAINE ACTION'),
 owner:get(r,'RESPONSABLE'),
 notes:get(r,'NOTES'),
 calendar:get(r,'LIEN CALENDRIER')
 }));
}
function buildingRows(values){
 const i=values.findIndex(r=>r[0]==='ID'&&r.some(c=>String(c).includes('IMMEUBLE / ADRESSE')));
 if(i<0)return [];
 const headers=values[i].map(c=>String(c||'').trim().toUpperCase());
 const get=(r,name)=>{const j=headers.indexOf(name);return j<0?'':String(r[j]||'').trim()};
 return values.slice(i+1).filter(r=>/^BR-[0-9]+$/i.test(String(r[0]||'').trim())).map(r=>({
 id:get(r,'ID'),address:get(r,'IMMEUBLE / ADRESSE'),commune:get(r,'COMMUNE'),
 price:get(r,'PRIX (€)'),stage:get(r,'ÉTAPE'),listingUrl:get(r,'LIEN ANNONCE'),
 urbanism:get(r,'URBANISME'),peb:get(r,'PEB'),appointment:get(r,'RENDEZ-VOUS (SOURCE)')
 }));
}
async function googleAccessToken(){
 const email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
 const key=(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY||'').replace(/\\n/g,'\n');
 if(!email||!key)throw new Error('Google Sheets non configuré');
 const now=Math.floor(Date.now()/1000);
 const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
 const claim=enc({iss:email,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3300});
 const jwtHead=enc({alg:'RS256',typ:'JWT'});
 const unsigned=jwtHead+'.'+claim;
 const signature=crypto.sign('RSA-SHA256',Buffer.from(unsigned),key).toString('base64url');
 const body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+signature});
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString(),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new Error('Autorisation Google impossible ('+r.status+')');
 const j=await r.json();
 if(!j.access_token)throw new Error('Jeton Google absent');
 return j.access_token;
}
async function readSheet(){
 const token=await googleAccessToken();
 const range=encodeURIComponent("'APPELS_VISITES'!A1:N500");
 const r=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+SHEET_ID+'/values/'+range,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000),cache:'no-store'});
 if(!r.ok)throw new Error(r.status===403||r.status===404?'Partager le Google Sheet avec le compte de service ('+r.status+')':'Lecture Google Sheets impossible ('+r.status+')');
 const j=await r.json();
 return sheetRows(j.values||[]);
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Vary','Cookie');
 if(!['GET','POST'].includes(req.method))return deny(res,405,'Méthode non autorisée');
 if(!secret()||!process.env.BRIDGE_ACCESS_PASSWORD_SHA256)return deny(res,503,'Synchronisation sécurisée non configurée');
 if(req.method==='POST'){
   if(!String(req.headers['content-type']||'').startsWith('application/json'))return deny(res,415,'JSON attendu');
   const password=String(req.body?.password||'');
   if(password.length<12||password.length>256||!eq(hash(password),process.env.BRIDGE_ACCESS_PASSWORD_SHA256.trim().toLowerCase()))return deny(res,401,'Code BRIDGE incorrect');
   const exp=String(Math.floor(Date.now()/1000)+TTL);
   res.setHeader('Set-Cookie',COOKIE+'='+exp+'.'+sign(exp)+'; Path=/api/bridge-visits; Max-Age='+TTL+'; HttpOnly; Secure; SameSite=Strict');
 }else if(!authorized(req))return deny(res,401,'Connexion BRIDGE nécessaire');
 try{const visits=await readSheet();return res.status(200).json({ok:true,visits,updatedAt:new Date().toISOString(),source:'Google Sheets · APPELS_VISITES'})}
 catch(err){return deny(res,502,err.message||'Erreur Google Sheets')}
}
