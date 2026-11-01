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

// tocar no aviso: se o app já está aberto, só traz para frente e avisa a tela (sem recarregar);
// se está fechado, abre o app pela página inicial do ícone (index.html)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const destino = (e.notification.data && e.notification.data.url) || './';
  const hash = destino.includes('#') ? destino.slice(destino.indexOf('#')) : '';
  const painel = destino.includes('painel.html');
  e.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = janelas.find(w => !w.url.includes('painel.html'));
    if (app && !painel) {
      try { await app.focus(); app.postMessage({ fleet: 'aviso', hash }); return; } catch (_) {}
    }
    await self.clients.openWindow(new URL(painel ? 'painel.html' : 'index.html' + hash, self.registration.scope).href);
  })());
});
