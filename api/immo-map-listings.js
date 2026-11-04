const AREAS=Array.from({length:19},(_,i)=>String(21001+i)).join(',');
let cached;
export async function getMapListings(fetcher=fetch){
 const url=new URL('https://api.agimo.be/api/listings');
 for(const [k,v] of Object.entries({listing_type:'buy',property_types:'building,house',areas:AREAS,price_min:450000,price_max:2000000,exclude_under_option:'true',sort:'newest',limit:100}))url.searchParams.set(k,v);
 const pages=await Promise.all([collect('areas',AREAS,'building'),collect('bbox','4.24,50.74,4.49,50.93','building,house')]);
 const items=pages.flatMap(p=>p.items),total=pages.reduce((n,p)=>n+p.total,0),capped=pages.some(p=>p.partial);
 async function collect(scope,value,types){
  const endpoint=new URL(url);endpoint.searchParams.delete('areas');endpoint.searchParams.set(scope,value);endpoint.searchParams.set('property_types',types);
  const items=[];let total=0,capped=false;
  for(let offset=0;offset<1200;offset+=100){
   endpoint.searchParams.set('offset',offset);
   const r=await fetcher(endpoint,{signal:AbortSignal.timeout(12000),headers:{accept:'application/json'}});
   if(!r.ok)throw Error('AGIMO_HTTP_'+r.status);
   const j=await r.json();if(!Array.isArray(j.items))throw Error('AGIMO_INVALID_RESPONSE');
   total=Number(j.count)||0;capped=!!j.count_capped;items.push(...j.items);
   if(j.items.length<100||(!capped&&items.length>=total))break;
  }
  return {items,total,partial:capped||items.length<total};
 }
 const seen=new Set();return {items:items.filter(x=>!x.under_option&&x.price_eur>=450000&&x.price_eur<=2000000&&['building','house'].includes(x.property_type)&&String(x.area).match(/^210(?:0[1-9]|1[0-9])[A-Z]?$/)&&!seen.has(x.id)&&seen.add(x.id)),total,partial:capped||items.length<total,updatedAt:new Date().toISOString()};
}
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'GET required'});
 res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=600');
 try{if(!cached||Date.now()-cached.time>300000)cached={time:Date.now(),data:await getMapListings()};return res.status(200).json({ok:true,...cached.data});}
 catch{res.setHeader('Cache-Control','no-store');return res.status(502).json({ok:false,error:'Les annonces Agimo sont momentanément indisponibles.'});}
}
