/* Service worker do Controle Único: guarda as páginas do próprio site para o app abrir
   sem internet. Sempre tenta a rede primeiro, então uma versão nova publicada aparece na
   hora; a cópia guardada só entra quando não há conexão. Nada do Google nem dos serviços de
   cotação passa por aqui, e os dados continuam no Drive e no navegador. */
var CACHE = "controle-unico-v1";

self.addEventListener("install", function(){ self.skipWaiting(); });
self.addEventListener("activate", function(e){ e.waitUntil(self.clients.claim()); });

self.addEventListener("fetch", function(e){
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(function(resp){
      if (resp.ok) { var copia = resp.clone(); caches.open(CACHE).then(function(c){ c.put(req, copia); }); }
      return resp;
    }).catch(function(){
      return caches.match(req, { ignoreSearch: true }).then(function(r){ return r || caches.match("./"); });
    })
  );
});
