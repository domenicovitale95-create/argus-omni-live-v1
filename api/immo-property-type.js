// Les studios ne sont plus des candidats ARGUS IMMO dans le catalogue appartements.
export function isStudioListing(x={}){
 const type=String(x.type||x.propertyType||'').trim().toLowerCase();if(['studio','kot','student room','student_room'].includes(type))return true;
 const title=String(x.title||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(/\b(studio|kot)\b/.test(title))return true;
 try{if(/\/(studio|kot)(?:\/|$)/i.test(new URL(String(x.canonical||x.source||x.url||'')).pathname))return true}catch{}
 return false;
}
