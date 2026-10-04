/* Service worker do Controle Único: guarda as páginas do próprio site para o app abrir
   sem internet. Tenta a rede primeiro, então uma versão nova publicada aparece na hora; a cópia
   guardada entra quando não há conexão e também quando a rede demora mais de 3 segundos
   (sinal fraco no celular: o app abre pela cópia em vez de ficar parado, e a rede continua
   atualizando a cópia para a próxima vez). Nada do Google nem dos serviços de cotação passa por
   aqui, e os dados continuam no Drive e no navegador. O versao.json nunca é guardado: é ele que
   diz se saiu versão nova. */
var CACHE = "controle-unico-v3";
var ESPERA = 3000;

self.addEventListener("install", function(){ self.skipWaiting(); });
self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(nomes){
      return Promise.all(nomes.filter(function(n){ return n !== CACHE; }).map(function(n){ return caches.delete(n); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(e){
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (/\/versao\.json$/.test(url.pathname)) return;
  e.respondWith(daRedeOuDaCopia(req));
});

/* a página inicial só substitui uma PÁGINA que falta; um arquivo de código que falta não vira
   a página inicial (antes um .js sem cópia voltava como index.html e quebrava a tela, 04/10/2026) */
function copia(req){
  return caches.match(req, { ignoreSearch: true }).then(function(r){
    if (r) return r;
    return req.mode === "navigate" ? caches.match("./") : undefined;
  });
}

function daRedeOuDaCopia(req){
  var rede = fetch(req).then(function(resp){
    if (resp.ok) { var c = resp.clone(); caches.open(CACHE).then(function(ca){ ca.put(req, c); }); }
    return resp;
  });
  /* rede que falha (sem internet): a cópia; rede que demora: a cópia, se houver, enquanto ela termina */
  var demora = new Promise(function(ok){
    setTimeout(function(){ copia(req).then(function(r){ if (r) ok(r); }); }, ESPERA);
  });
  return Promise.race([rede.catch(function(){ return copia(req).then(function(r){ return r || Response.error(); }); }), demora]);
}
