const hasOwn=(obj,key)=>Boolean(obj)&&Object.prototype.hasOwnProperty.call(obj,key);

export function requestQuery(req){
  if(hasOwn(req,'query')){
    const q=req.query;
    return q&&typeof q==='object'?q:{};
  }
  const raw=typeof req?.url==='string'?req.url:'';
  const i=raw.indexOf('?');
  if(i<0)return{};
  const out={};
  for(const [key,value] of new URLSearchParams(raw.slice(i+1))){
    if(!hasOwn(out,key)){out[key]=value;continue}
    out[key]=Array.isArray(out[key])?[...out[key],value]:[out[key],value];
  }
  return out;
}
