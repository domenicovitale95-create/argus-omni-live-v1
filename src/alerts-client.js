(function(){
  const SEEN_KEY='argus-alerts-seen-v1';
  const ENABLED_KEY='argus-alerts-enabled-v1';
  function seen(){try{return new Set(JSON.parse(localStorage.getItem(SEEN_KEY)||'[]'))}catch(_){return new Set()}}
  function saveSeen(set){try{localStorage.setItem(SEEN_KEY,JSON.stringify([...set].slice(-200)))}catch(_){}}
  function enabled(){try{return localStorage.getItem(ENABLED_KEY)==='1'}catch(_){return false}}
  function setEnabled(v){try{localStorage.setItem(ENABLED_KEY,v?'1':'0')}catch(_){}}
  function label(){const btn=document.getElementById('argusAlertToggle');if(!btn)return;const on=enabled()&&'Notification'in window&&Notification.permission==='granted';btn.textContent=on?'Alerts on':'Alerts';btn.dataset.enabled=on?'1':'0'}
  async function requestPermission(){if(!('Notification'in window)){alert('Browser notifications are not supported on this device.');return}const p=await Notification.requestPermission();setEnabled(p==='granted');label();if(p==='granted')poll(true)}
  function notify(a){try{const title=`ARGUS ${a.verdict}: ${a.home} vs ${a.away}`;const body=[a.selection,a.odds?`@ ${Number(a.odds).toFixed(2)}`:'',a.confidence!=null?`confidence ${a.confidence}%`:''].filter(Boolean).join(' · ');const n=new Notification(title,{body,tag:`argus-${a.fixtureId}-${a.selection||''}`,renotify:true});n.onclick=()=>{window.focus();location.href='/daily-slip.html'}}catch(_){}}
  async function poll(force=false){if(!enabled()||!('Notification'in window)||Notification.permission!=='granted')return;try{const r=await fetch('/api/alert-engine',{cache:'no-store'}),j=await r.json();if(!r.ok)return;const s=seen();for(const a of j.newAlerts||[]){if(s.has(a.id))continue;s.add(a.id);notify(a)}saveSeen(s)}catch(_){}}
  function mount(){if(document.getElementById('argusAlertToggle'))return;const host=document.querySelector('.top-status,.nav-links,.links');if(!host)return;const btn=document.createElement('button');btn.id='argusAlertToggle';btn.type='button';btn.className='nav-link alert-toggle';btn.style.cursor='pointer';btn.onclick=requestPermission;host.appendChild(btn);label()}
  document.addEventListener('DOMContentLoaded',()=>{mount();label();if(enabled())poll(false);setInterval(()=>poll(false),60000)});
})();
