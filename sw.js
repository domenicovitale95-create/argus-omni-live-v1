const CACHE='argus-shell-v1';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','/daily-slip.html'])).catch(()=>{}));self.skipWaiting()});
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request))) });
self.addEventListener('push',e=>{let d={};try{d=e.data?.json?.()||{}}catch(_){d={body:e.data?.text?.()||''}};const title=d.title||'ARGUS OMNI';const options={body:d.body||'High-signal opportunity detected.',tag:d.tag||'argus-alert',renotify:true,data:{url:d.url||'/daily-slip.html'}};e.waitUntil(self.registration.showNotification(title,options))});
self.addEventListener('notificationclick',e=>{e.notification.close();const url=e.notification.data?.url||'/';e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list){if('focus'in c){c.navigate(url);return c.focus()}}return clients.openWindow(url)}))});
