/* ARGUS metric semantics V2 — prevents confidence, probability and evidence quality from being conflated. */
(function(){
'use strict';
function apply(){
  const conf=document.getElementById('osV2Confidence');
  if(conf&&/%\s*$/.test(conf.textContent||''))conf.textContent=(conf.textContent||'').replace(/%\s*$/,'/100');
  const edge=document.getElementById('osV2Edge');
  if(edge){edge.textContent=(edge.textContent||'').replace(/value advantage/gi,'model edge').replace(/ pts\b/gi,' pp')}
  const fair=document.getElementById('osV2Fair');
  if(fair){const text=fair.textContent||'',m=text.match(/fair odds\s+([0-9]+(?:\.[0-9]+)?)/i),o=m?Number(m[1]):null;if(o&&o>1){const p=100/o;fair.textContent=`ARGUS fair odds ${o.toFixed(2)} · outcome p ${p.toFixed(1)}%`}}
  document.querySelectorAll('.os-v2-metric > span').forEach(el=>{const t=(el.textContent||'').trim().toLowerCase();if(t==='confidence')el.textContent='Decision confidence';if(t==='data reliability')el.textContent='Evidence quality'});
  document.querySelectorAll('*').forEach(el=>{if(el.children.length)return;const t=(el.textContent||'').trim();if(t==='Data reliability')el.textContent='Evidence quality'});
}
let queued=false;function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply()})}
window.addEventListener('load',schedule);document.addEventListener('argus:data-updated',schedule);const obs=new MutationObserver(schedule);if(document.body)obs.observe(document.body,{childList:true,subtree:true,characterData:true});
})();
