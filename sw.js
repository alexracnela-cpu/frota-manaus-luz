// FLEET · service worker: só recebe e mostra as notificações (não guarda páginas em cache)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { corpo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'FLEET', {
    body: d.corpo || '',
    icon: 'assets/icone-192.png',
    badge: 'assets/icone-192.png',
    tag: d.tag || undefined,
    data: { url: d.url || './' },
  }));
});

// tocar no aviso abre o app (ou traz para frente) na tela certa
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of janelas) {
      try { await w.focus(); if (w.url !== url && 'navigate' in w) await w.navigate(url); return; } catch (_) {}
    }
    await self.clients.openWindow(url);
  })());
});
