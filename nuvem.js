/* Nuvem: guarda os cadernos do Controle Único no Google Drive de quem entrou.
   Cada módulo continua gravando no navegador (cache); a Nuvem manda o caderno para o Drive
   pouco depois de cada mudança e traz o que outro aparelho mudou quando a página volta à vista.

   Uso numa página:
     var c = Nuvem.caderno({ id, nome, rotulo, obter, aplicar, temDados,
                             criarVazio (padrão true), compartilhado (padrão false) });
     c.mudou()          a cada gravação do módulo
     Nuvem.iniciar()    depois de criar os cadernos da página

   O login vale para todas as abas do Controle Único abertas na mesma janela: quem entra
   passa a chave de acesso para as outras páginas (mesmo site, mesma aba do navegador). */
var Nuvem = (function(){
  var CLIENT_ID = "185782688251-p74qi2gguclcosk33f8p653dmb1dtt2a.apps.googleusercontent.com";
  var ESCOPO = "https://www.googleapis.com/auth/drive.file";
  var PROJETO = "185782688251";   // número do projeto no Google Cloud: o Picker exige
  var CHAVE_PICKER = "AIzaSyC81ALE3SlR_FcJlTwgF8f7kTYqrf-k9vQ";   // chave de navegador do Picker: só a API do Picker, só neste site e no localhost:8000
  var CH_TOKEN = "controle-unico-token";   // guardada neste aparelho até vencer (1 hora): no iPhone, fechar o app
                                            // apagava a chave da sessão e obrigava a passar pelo Google de novo

  var CH_CONTA = "controle-unico-conta";   // o e-mail de quem entrou, só neste aparelho: diz ao Google qual conta renovar

  var token = null, expira = 0, cliente = null, iniciado = false, saindo = false;
  var cadernos = [], estados = {};
  var relogio = null, renovando = false, estadoSilencioso = null, prazoRenovar = null;

  function $(id){ return document.getElementById(id); }
  function hora(){ return new Date().toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"}); }
  function guarda(k, v){ try{ v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); }catch(e){} }
  function le(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }

  /* ---------------- chave de acesso, uma para todas as páginas ---------------- */
  function temToken(){
    if(token && Date.now() < expira - 60000) return true;
    if(token){ token = null; try{ localStorage.removeItem(CH_TOKEN); }catch(e){} }
    return false;
  }
  function lerTokenGuardado(){
    try{ var s = JSON.parse(localStorage.getItem(CH_TOKEN)); if(s && s.e > Date.now() + 60000){ token = s.t; expira = s.e; } }catch(e){}
  }
  /* A chave do Google dura uma hora. Antes (até 01/10/2026) ela vencia calada: a casca continuava
     dizendo "Conectado", o botão de entrar não voltava e o que ele lançasse ficava só no aparelho.
     Agora cada página marca a hora em que a chave vence: nessa hora ela redesenha o estado e a
     casca tenta renovar sem tela (renovar); se não der, o botão de entrar reaparece. */
  function vigiarValidade(){
    clearTimeout(relogio);
    if(!token) return;
    relogio = setTimeout(aoVencer, Math.max(1000, expira - 60000 - Date.now() + 500));
  }
  function aoVencer(){
    temToken();
    cadernos.forEach(function(c){ c.venceu(); });
    desenhar();
    renovar();
  }
  function invalidar(){
    if(!token) return;
    token = null; clearTimeout(relogio);
    cadernos.forEach(function(c){ c.venceu(); });
    desenhar();
  }
  /* Renovação sem tela: uma moldura escondida vai até o Google com prompt=none; se a sessão dele
     no Google continua aberta, o Google devolve a chave nova no endereço da casca, e a casca
     (index.html, dentro da moldura) passa a chave para cá por mensagem. Só quem já entrou antes
     neste aparelho; no app instalado do iPhone a renovação é a de entrarSozinho. Navegador que
     bloqueia cookie de terceiros (Safari) não renova assim: sobra o botão de entrar. */
  function renovar(){
    if(window.top !== window){ try{ if(window.top.Nuvem && window.top.Nuvem.renovar) window.top.Nuvem.renovar(); }catch(e){} return; }
    if(renovando || temToken() || appNoIphone() || !le("controle-unico-ja-entrou") || !document.body) return;
    if(Date.now() - Number(le("controle-unico-renovar-falhou") || 0) < 30 * 60 * 1000) return;
    renovando = true;
    estadoSilencioso = "s" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    var p = {client_id:CLIENT_ID, redirect_uri:enderecoDeVolta(), response_type:"token", scope:ESCOPO, state:estadoSilencioso, prompt:"none", include_granted_scopes:"true"};
    if(le(CH_CONTA)) p.login_hint = le(CH_CONTA);
    var f = document.createElement("iframe");
    f.id = "nuvem-renovar"; f.hidden = true; f.setAttribute("aria-hidden", "true"); f.tabIndex = -1;
    f.src = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams(p).toString();
    document.body.appendChild(f);
    prazoRenovar = setTimeout(function(){ fimDaRenovacao(false); }, 12000);
    redesenharTudo();
  }
  function fimDaRenovacao(deuCerto){
    clearTimeout(prazoRenovar); renovando = false; estadoSilencioso = null;
    var f = $("nuvem-renovar"); if(f) f.remove();
    guarda("controle-unico-renovar-falhou", deuCerto ? null : String(Date.now()));
    redesenharTudo();
  }
  /* a linha de estado desta página e a das páginas dentro dela */
  function redesenharTudo(){
    desenhar();
    outrasJanelas().forEach(function(w){ try{ if(w.Nuvem && w.Nuvem.redesenhar) w.Nuvem.redesenhar(); }catch(e){} });
  }
  window.addEventListener("message", function(e){
    if(e.origin !== location.origin || !e.data || typeof e.data.cuOAuth !== "string" || !renovando) return;
    var p = new URLSearchParams(e.data.cuOAuth);
    if(p.get("state") !== estadoSilencioso || !p.get("access_token")) return fimDaRenovacao(false);
    token = p.get("access_token");
    expira = Date.now() + (Number(p.get("expires_in")) || 3600) * 1000;
    try{ localStorage.setItem(CH_TOKEN, JSON.stringify({t:token, e:expira})); }catch(err){}
    fimDaRenovacao(true);
    vigiarValidade(); espalhar();
    cadernos.forEach(function(c){ c.conectar(); });
    desenhar();
  });
  /* guarda o e-mail de quem entrou, para a renovação saber qual conta pedir quando há mais de uma aberta */
  function guardarConta(){
    if(le(CH_CONTA) || !temToken()) return;
    fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", {headers:{Authorization:"Bearer " + token}})
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){ if(j && j.user && j.user.emailAddress) guarda(CH_CONTA, j.user.emailAddress); })
      .catch(function(){});
  }
  /* as outras páginas do Controle Único abertas nesta janela (a casca e os quadros dela) */
  function outrasJanelas(){
    var lista = [];
    try{
      var topo = window.top;
      lista.push(topo);
      for(var i = 0; i < topo.frames.length; i++) lista.push(topo.frames[i]);
    }catch(e){}
    return lista.filter(function(w){ return w !== window; });
  }
  function espalhar(){
    outrasJanelas().forEach(function(w){
      try{ if(w.Nuvem && w.Nuvem.receberToken) w.Nuvem.receberToken(token, expira); }catch(e){}
    });
  }
  function receberToken(t, e){
    var tinha = temToken();
    token = t; expira = e;
    vigiarValidade();
    if(!tinha && temToken()) cadernos.forEach(function(c){ c.conectar(); });
    desenhar();
  }
  /* No iPhone, o app instalado na tela de início não abre a janela de login do Google: ela
     nunca aparece. Ali o login vai e volta na própria tela: a página vai até o Google, e o
     Google devolve a chave de acesso no endereço da casca (#access_token=...). O endereço de
     volta precisa estar autorizado no cliente do Google Cloud. */
  function appNoIphone(){ try{ return window.top.navigator.standalone === true; }catch(e){ return false; } }
  function enderecoDeVolta(){ var t = window.top.location; return t.origin + t.pathname.replace(/[^\/]*$/, ""); }
  function entrarPorRedirecionamento(silencioso){
    var estado = Math.random().toString(36).slice(2) + Date.now().toString(36);
    guarda("controle-unico-oauth-estado", estado);
    guarda("controle-unico-oauth-aba", window.top.location.hash || "");
    // o Google só devolve para o endereço autorizado (a pasta do site): quem saiu de outra página
    // (o controle da Ana, ana.html) volta para ela depois (30/09/2026)
    guarda("controle-unico-oauth-pagina", (window.top.location.pathname.match(/[^\/]+\.html$/) || [""])[0]);
    var p = {client_id:CLIENT_ID, redirect_uri:enderecoDeVolta(), response_type:"token", scope:ESCOPO, state:estado, include_granted_scopes:"true"};
    if(silencioso) p.prompt = "none";
    saindo = true;
    window.top.location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams(p).toString();
  }
  /* a volta do Google: só a casca lê, antes de tudo, e limpa o endereço */
  function lerVoltaDoGoogle(){
    if(window.top !== window) return;
    var h = (location.hash || "").replace(/^#/, "");
    if(!/(^|&)(access_token|error)=/.test(h)) return;
    var p = new URLSearchParams(h);
    var esperado = le("controle-unico-oauth-estado"), aba = le("controle-unico-oauth-aba") || "";
    var pagina = le("controle-unico-oauth-pagina");
    guarda("controle-unico-oauth-estado", null); guarda("controle-unico-oauth-aba", null); guarda("controle-unico-oauth-pagina", null);
    try{ history.replaceState(null, "", location.pathname + location.search + aba); }catch(e){}
    // quem saiu do controle da Ana volta para ele, tenha o Google aceitado ou não
    var voltar = function(){ if(pagina && pagina !== "index.html" && !location.pathname.endsWith(pagina)){ saindo = true; location.replace(pagina + aba); } };
    if(!esperado || p.get("state") !== esperado){ aviso = "A resposta do Google não conferiu. Entre de novo."; return voltar(); }
    if(p.get("error")){
      guarda("controle-unico-auto-falhou", String(Date.now()));
      if(!/^(interaction|login|consent)_required$/.test(p.get("error"))) aviso = "O Google recusou: " + p.get("error");
      return voltar();
    }
    token = p.get("access_token");
    expira = Date.now() + (Number(p.get("expires_in")) || 3600) * 1000;
    try{ localStorage.setItem(CH_TOKEN, JSON.stringify({t:token, e:expira})); }catch(e){}
    guarda("controle-unico-ja-entrou", "1");
    guarda("controle-unico-auto-falhou", null);
    voltar();
  }
  /* ao abrir o app no iPhone: quem já entrou antes entra de novo sem tocar em nada */
  function entrarSozinho(){
    if(!appNoIphone() || window.top !== window || temToken() || !le("controle-unico-ja-entrou")) return;
    if(Date.now() - Number(le("controle-unico-auto-falhou") || 0) < 12 * 3600 * 1000) return;
    entrarPorRedirecionamento(true);
  }

  function entrar(){
    aviso = null;
    if(appNoIphone()){ entrarPorRedirecionamento(false); return; }
    if(!(window.google && google.accounts && google.accounts.oauth2)){ avisoGeral("O Google ainda não carregou. Tente de novo em um segundo."); return; }
    if(!cliente){
      cliente = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: ESCOPO,
        callback: function(resp){
          if(resp.error){ avisoGeral("O Google recusou: " + resp.error); return; }
          token = resp.access_token;
          expira = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
          try{ localStorage.setItem(CH_TOKEN, JSON.stringify({t:token, e:expira})); }catch(e){}
          guarda("controle-unico-ja-entrou", "1");
          guarda("controle-unico-renovar-falhou", null);
          vigiarValidade(); guardarConta();
          espalhar();
          cadernos.forEach(function(c){ c.conectar(); });
          desenhar();
        },
        error_callback: function(e){ avisoGeral("A janela do Google foi fechada ou bloqueada (" + e.type + ")."); }
      });
    }
    var pedido = le("controle-unico-ja-entrou") ? {prompt:""} : {};
    if(le(CH_CONTA)) pedido.hint = le(CH_CONTA);
    cliente.requestAccessToken(pedido);
  }

  /* ---------------- conversa com o Drive ---------------- */
  function api(url, op){
    op = op || {};
    if(!temToken()) return Promise.reject(new Error("expirou"));
    var cab = Object.assign({}, op.headers || {}, {Authorization:"Bearer " + token});
    return fetch(url, Object.assign({}, op, {headers:cab})).then(function(r){
      /* o Google recusou a chave antes da hora marcada: as outras páginas também precisam saber */
      if(r.status === 401){
        invalidar(); guarda(CH_TOKEN, null);
        outrasJanelas().forEach(function(w){ try{ if(w.Nuvem && w.Nuvem.invalidar) w.Nuvem.invalidar(); }catch(e){} });
        throw new Error("expirou");
      }
      if(!r.ok) return r.text().then(function(t){ var e = new Error("o Drive respondeu " + r.status + ": " + t.slice(0, 200)); e.status = r.status; throw e; });
      return r;
    });
  }
  function acharPorNome(nome){
    var q = encodeURIComponent("name='" + nome.replace(/'/g, "\\'") + "' and trashed=false");
    return api("https://www.googleapis.com/drive/v3/files?q=" + q + "&spaces=drive&orderBy=createdTime&fields=files(id,modifiedTime)")
      .then(function(r){ return r.json(); }).then(function(j){ return j.files[0] || null; });
  }
  function versaoDoArquivo(id){
    return api("https://www.googleapis.com/drive/v3/files/" + id + "?fields=id,modifiedTime,trashed").then(function(r){ return r.json(); });
  }
  function baixar(id){
    return api("https://www.googleapis.com/drive/v3/files/" + id + "?alt=media").then(function(r){ return r.json(); });
  }
  function criar(nome, conteudo){
    var limite = "controleunico" + Date.now();
    var corpo = "--" + limite + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify({name:nome, mimeType:"application/json"}) +
      "\r\n--" + limite + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + conteudo + "\r\n--" + limite + "--";
    return api("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime", {
      method:"POST", headers:{"Content-Type":"multipart/related; boundary=" + limite}, body:corpo
    }).then(function(r){ return r.json(); });
  }
  function atualizar(id, conteudo){
    return api("https://www.googleapis.com/upload/drive/v3/files/" + id + "?uploadType=media&fields=id,modifiedTime", {
      method:"PATCH", headers:{"Content-Type":"application/json; charset=UTF-8"}, body:conteudo
    }).then(function(r){ return r.json(); });
  }

  /* O Picker é a janela do Google para escolher um arquivo. Com o escopo drive.file o app só
     enxerga o que ele mesmo criou; um caderno que outra pessoa compartilhou só fica visível
     depois de escolhido uma vez por aqui. */
  function carregarScript(src){
    return new Promise(function(ok, falha){
      if(document.querySelector('script[src="' + src + '"]') && window.gapi) return ok();
      var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = function(){ falha(new Error("não carregou " + src)); };
      document.head.appendChild(s);
    });
  }
  function abrirPicker(consulta){
    if(!CHAVE_PICKER) return Promise.reject(new Error("a chave do Picker ainda não foi criada"));
    return carregarScript("https://apis.google.com/js/api.js")
      .then(function(){ return new Promise(function(ok){ gapi.load("picker", ok); }); })
      .then(function(){
        return new Promise(function(ok){
          var vista = new google.picker.DocsView(google.picker.ViewId.DOCS)
            .setIncludeFolders(false).setMimeTypes("application/json").setQuery(consulta);
          var p = new google.picker.PickerBuilder()
            .setDeveloperKey(CHAVE_PICKER).setAppId(PROJETO).setOAuthToken(token)
            .addView(vista).setTitle("Escolha: " + consulta)
            .setCallback(function(d){
              var acao = d[google.picker.Response.ACTION];
              if(acao === google.picker.Action.PICKED){ var doc = d[google.picker.Response.DOCUMENTS][0]; ok(doc[google.picker.Document.ID]); }
              else if(acao === google.picker.Action.CANCEL) ok(null);
            }).build();
          p.setVisible(true);
        });
      });
  }

  /* ---------------- juntar duas versões de um caderno (04/10/2026) ----------------
     Antes, quando o Drive e este aparelho tinham mudado, era preciso escolher um dos dois e o
     outro se perdia; e o que ele lançava enquanto o app baixava o Drive sumia. Agora as duas
     versões são juntadas a partir da última versão que os dois tinham em comum (a "base"):
     - listas em que toda linha tem id (lançamentos, pagamentos, pacientes...): entra o que foi
       acrescentado de cada lado, sai o que foi apagado de cada lado, e a linha mudada dos dois
       lados é juntada campo a campo;
     - valor que só um lado mudou: fica o mudado; mudado dos dois lados: fica o deste aparelho.
     Sem base conhecida (aparelho novo ou navegador limpo), nada do Drive se perde: as listas
     com id somam as duas versões e o resto fica como está no Drive. */
  function igual(a, b){ return a === b || JSON.stringify(a) === JSON.stringify(b); }
  function ehObjeto(v){ return v !== null && typeof v === "object" && !Array.isArray(v); }
  function listaComId(l){
    if(!Array.isArray(l)) return false;
    var vistos = {};
    for(var i = 0; i < l.length; i++){
      var x = l[i];
      if(!ehObjeto(x) || x.id == null || x.id === "" || vistos["k" + x.id]) return false;   // id repetido: a lista vai inteira
      vistos["k" + x.id] = true;
    }
    return true;
  }
  function juntar(base, local, remoto, semBase){
    if(semBase){
      if(ehObjeto(local) && ehObjeto(remoto)) return juntarObjetos({}, local, remoto, true);
      if(listaComId(local) && listaComId(remoto)) return juntarListas([], local, remoto, true);
      return remoto === undefined ? local : remoto;
    }
    if(igual(local, base)) return remoto;
    if(igual(remoto, base) || igual(local, remoto)) return local;
    if(ehObjeto(local) && ehObjeto(remoto)) return juntarObjetos(ehObjeto(base) ? base : {}, local, remoto, false);
    if(listaComId(local) && listaComId(remoto) && (base === undefined || listaComId(base))) return juntarListas(base || [], local, remoto, false);
    return local;
  }
  function juntarObjetos(base, local, remoto, semBase){
    var r = {}, chaves = {};
    [local, remoto, base].forEach(function(o){ Object.keys(o).forEach(function(k){ chaves[k] = true; }); });
    Object.keys(chaves).forEach(function(k){
      var naBase = !semBase && k in base, aqui = k in local, la = k in remoto;
      if(aqui && la){ r[k] = juntar(naBase ? base[k] : undefined, local[k], remoto[k], semBase); return; }
      if(aqui){   // não está no Drive: acrescentado aqui, ou apagado lá
        if(naBase && igual(local[k], base[k])) return;
        r[k] = local[k]; return;
      }
      if(la){     // não está aqui: acrescentado lá, ou apagado aqui
        if(naBase) return;
        r[k] = remoto[k];
      }
    });
    return r;
  }
  function juntarListas(base, local, remoto, semBase){
    var porId = function(l){ var m = {}; l.forEach(function(x){ m["k" + x.id] = x; }); return m; };
    var b = semBase ? {} : porId(base), aqui = porId(local), res = [];
    remoto.forEach(function(x){
      var k = "k" + x.id;
      if(aqui[k]) res.push(juntar(b[k], aqui[k], x, semBase));
      else if(!b[k]) res.push(x);                       // acrescentado lá
      /* senão: apagado aqui */
    });
    var la = porId(remoto);
    local.forEach(function(x){
      var k = "k" + x.id;
      if(la[k]) return;
      if(!b[k] || !igual(x, b[k])) res.push(x);         // acrescentado aqui (ou mudado aqui e apagado lá)
    });
    return res;
  }

  /* ---------------- um caderno = um arquivo no Drive ---------------- */
  function Caderno(op){
    var c = this;
    c.id = op.id;
    var CH_P = "controle-unico-" + op.id + "-pendente";   // mudança feita aqui que o Drive ainda não tem
    var CH_A = "controle-unico-" + op.id + "-arquivo";    // id e versão do arquivo na última troca
    var CH_B = "controle-unico-" + op.id + "-base";     // a última versão que o Drive e este aparelho tinham em comum
    var arquivo = null, pendente = le(CH_P) === "1", timer = null, gravando = false, deNovo = false, conectando = false;
    var geracao = 0, base = null, tentativas = 0, novaTentativa = null;
    try{ arquivo = JSON.parse(le(CH_A)); }catch(e){ arquivo = null; }
    /* a base guardada só vale se for a da versão do Drive que este aparelho conhece */
    try{ var bg = JSON.parse(le(CH_B)); if(bg && arquivo && bg.mt === arquivo.modifiedTime) base = bg.s; }catch(e){ base = null; }
    function marcarBase(texto, mt){
      base = texto;
      try{ localStorage.setItem(CH_B, JSON.stringify({mt:mt, s:texto})); }catch(e){ try{ localStorage.removeItem(CH_B); }catch(e2){} }
    }
    /* põe na tela a versão do Drive juntada com o que está neste aparelho agora (inclusive o que
       ele lançou enquanto o Drive era baixado); se sobrou algo daqui, manda de volta */
    function receber(remoto, v){
      var textoRemoto = JSON.stringify(remoto);
      var local = op.obter();
      var juntado = (pendente || geracao) && op.temDados(local)
        ? juntar(base == null ? undefined : JSON.parse(base), local, remoto, base == null)
        : remoto;
      var sobrou = juntado !== remoto && JSON.stringify(juntado) !== textoRemoto;
      op.aplicar(juntado);
      marcarArquivo(v); marcarBase(textoRemoto, v.modifiedTime);
      if(sobrou){ marcarPendente(true); agendar(); return true; }
      marcarPendente(false);
      return false;
    }
    function agendar(){ clearTimeout(timer); timer = setTimeout(c.enviarAgora, 1200); }

    function estado(texto, tipo, acoes){
      estados[c.id] = {texto:texto, tipo:tipo || "", acoes:acoes || null, t:Date.now()}; desenhar();
      /* a casca mostra o pior estado entre os módulos: um erro aqui dentro não pode ficar com o ponto verde lá em cima */
      if(window.top !== window){ try{ if(window.top.Nuvem && window.top.Nuvem.redesenhar) window.top.Nuvem.redesenhar(); }catch(e){} }
    }
    function marcarPendente(v){ pendente = v; guarda(CH_P, v ? "1" : null); }
    function marcarArquivo(a){ arquivo = a ? {id:a.id, modifiedTime:a.modifiedTime} : null; guarda(CH_A, arquivo ? JSON.stringify(arquivo) : null); }
    c.pendente = function(){ return pendente; };
    c.arquivoId = function(){ return arquivo ? arquivo.id : null; };
    /* dá a outra pessoa acesso de edição a este caderno, sem mandar e-mail (controle da Ana, 30/09/2026) */
    c.compartilharCom = function(email){
      if(!arquivo) return Promise.reject(new Error("o caderno ainda não está no Drive"));
      return api("https://www.googleapis.com/drive/v3/files/" + arquivo.id + "/permissions?sendNotificationEmail=false", {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({role:"writer", type:"user", emailAddress:email})
      }).then(function(r){ return r.json(); });
    };

    function falhou(e){
      gravando = false; conectando = false;
      if(e.message === "expirou"){ c.venceu(); renovar(); return; }
      estado("Não consegui falar com o Drive (" + e.message + "). O que você mudou está guardado neste aparelho" + (pendente ? " e vai de novo sozinho." : "."), "erro");
      /* tenta de novo sozinho, com espera crescente: 15 s, 1 min, 4 min, depois a cada 10 min */
      if(pendente){
        clearTimeout(novaTentativa);
        var espera = [15000, 60000, 240000][tentativas] || 600000;
        tentativas++;
        novaTentativa = setTimeout(function(){ if(pendente && temToken()) c.enviarAgora(); }, espera);
      }
    }
    /* a chave de uma hora venceu: o que ele mudar daqui em diante fica no aparelho até entrar de novo */
    c.venceu = function(){
      estado(pendente ? "Há mudanças guardadas só neste aparelho. Entre com o Google para mandar ao Drive." : "A conexão com o Drive venceu. Entre com o Google de novo.", pendente ? "erro" : "");
    };

    function trazer(id, recado){
      return versaoDoArquivo(id).then(function(v){
        return baixar(id).then(function(d){
          if(receber(d, v)) estado("Juntei o que mudou no outro aparelho com o que está aqui. Salvando…", "indo");
          else estado(recado || ("Salvo no Drive · aberto às " + hora()), "ok");
        });
      });
    }

    function criarNovo(){
      estado("Criando o caderno no Drive…", "indo");
      var local = op.obter(), texto = JSON.stringify(local), g = geracao;
      return criar(op.nome, texto).then(function(novo){
        marcarArquivo(novo); marcarBase(texto, novo.modifiedTime);
        if(g === geracao) marcarPendente(false); else agendar();
        estado(op.temDados(local) ? "Caderno criado no Drive com o que estava neste aparelho." : "Caderno criado no Drive, ainda vazio.", "ok");
      }).catch(falhou);
    }

    function escolherCompartilhado(){
      estado("Abrindo a janela do Google…", "indo");
      return abrirPicker(op.nome).then(function(id){
        if(!id){ return c.conectar(); }
        return versaoDoArquivo(id).then(function(v){ marcarArquivo(v); return trazer(id, "Caderno compartilhado aberto às " + hora() + "."); });
      }).catch(falhou);
    }

    /* o arquivo deste caderno no Drive: o já conhecido neste aparelho, ou o achado pelo nome */
    function localizar(){
      var porNome = function(){ return acharPorNome(op.nome); };
      if(!arquivo) return porNome();
      return versaoDoArquivo(arquivo.id).then(function(v){ return v.trashed ? porNome() : v; }, porNome);
    }

    /* Depois de entrar: acha o caderno e decide quem vale, o Drive ou este aparelho. */
    c.conectar = function(){
      if(!temToken()){ estado(pendente ? "Há mudanças guardadas só neste aparelho. Entre com o Google para mandar ao Drive." : "Entre com o Google para abrir " + (op.rotulo || "o caderno") + ".", pendente ? "erro" : ""); return Promise.resolve(); }
      if(conectando) return Promise.resolve();
      conectando = true;
      estado("Abrindo o caderno no Drive…", "indo");
      return localizar().then(function(achado){
        var local = op.obter();
        if(!achado){
          /* caderno de duas pessoas: antes de criar outro, pergunta se já existe um compartilhado */
          if(op.compartilhado){
            estado("Não achei " + op.nome + " neste Google.", "escolha", [
              {rotulo:"Escolher o que foi compartilhado comigo", fn:escolherCompartilhado},
              {rotulo:"Criar um caderno novo", fn:criarNovo}]);
            return;
          }
          if(op.temDados(local)) return criarNovo();
          if(op.criarVazio === false){ estado(op.textoSemArquivo || "Ainda não há caderno no Drive.", "erro"); return; }
          return criarNovo();
        }
        var driveMudou = !arquivo || arquivo.id !== achado.id || arquivo.modifiedTime !== achado.modifiedTime;
        if(pendente && op.temDados(local) && !driveMudou){
          conectando = false;
          return c.enviarAgora();
        }
        /* o Drive mudou (ou este aparelho ainda não o conhecia): traz e junta com o que há aqui */
        if(!arquivo || arquivo.id !== achado.id) base = null;
        return baixar(achado.id).then(function(remoto){
          if(!op.temDados(remoto) && op.temDados(op.obter())){ marcarArquivo(achado); conectando = false; return c.enviarAgora(); }
          if(receber(remoto, achado)) estado("Juntei o que mudou no outro aparelho com o que está aqui. Salvando…", "indo");
          else estado("Salvo no Drive · aberto às " + hora(), "ok");
        });
      }).catch(falhou).then(function(){ conectando = false; });
    };

    c.enviarAgora = function(){
      clearTimeout(timer);
      if(gravando){ deNovo = true; return Promise.resolve(); }
      if(!temToken()){ falhou(new Error("expirou")); return Promise.resolve(); }
      if(!arquivo) return c.conectar();
      gravando = true;
      estado("Salvando no Drive…", "indo");
      return versaoDoArquivo(arquivo.id).then(function(v){
        /* mudou em outro aparelho desde a última troca: junta antes de gravar, em vez de escolher um lado */
        if(v.modifiedTime !== arquivo.modifiedTime){
          return baixar(arquivo.id).then(function(remoto){ receber(remoto, v); });
        }
      }).then(function(){
        var texto = JSON.stringify(op.obter()), g = geracao;
        return atualizar(arquivo.id, texto).then(function(r){
          marcarArquivo(r); marcarBase(texto, r.modifiedTime);
          gravando = false; tentativas = 0; clearTimeout(novaTentativa);
          if(deNovo || g !== geracao){ deNovo = false; return c.enviarAgora(); }
          clearTimeout(timer);
          marcarPendente(false);
          estado("Salvo no Drive às " + hora(), "ok");
        });
      }).catch(falhou);
    };

    c.mudou = function(){
      geracao++;
      marcarPendente(true);
      if(!iniciado) return;
      if(!temToken()){ estado("Guardado só neste aparelho. Entre com o Google para mandar ao Drive.", "erro"); return; }
      estado("Salvando no Drive…", "indo");
      agendar();
    };
    /* o app foi para o fundo ou vai fechar: manda já o que está pendente, sem esperar */
    c.enviarSeHouver = function(){ if(!saindo && pendente && iniciado && temToken() && arquivo && !gravando) c.enviarAgora(); };

    /* voltou para a tela: se nada daqui está pendente e o Drive mudou, traz o do Drive */
    c.aoVoltar = function(){
      if(!arquivo || !temToken() || gravando || conectando) return;
      if(pendente){ c.enviarAgora(); return; }
      versaoDoArquivo(arquivo.id).then(function(v){
        if(v.modifiedTime !== arquivo.modifiedTime) return trazer(arquivo.id, "Atualizado com o que mudou em outro aparelho, às " + hora() + ".");
      }).catch(falhou);
    };
  }

  /* ---------------- a linha de estado da página ---------------- */
  /* aviso de login (janela bloqueada, Google recusou): fica na tela até a próxima tentativa de entrar
     ou por 20 s, em vez de sumir no primeiro redesenho (04/10/2026) */
  var aviso = null, avisoAte = 0;
  function avisoGeral(t){ aviso = t; avisoAte = Date.now() + 20000; desenhar(); setTimeout(desenhar, 20100); }
  function pior(){
    var lista = cadernos.map(function(c){ return estados[c.id]; }).filter(Boolean);
    return lista.filter(function(x){ return x.tipo === "escolha"; })[0] || lista.filter(function(x){ return x.tipo === "erro"; })[0] ||
           lista.filter(function(x){ return x.tipo === "indo"; })[0] ||
           lista.slice().sort(function(a, b){ return b.t - a.t; })[0] || null;
  }
  function desenhar(){
    var el = $("nuvem-texto"), pt = $("nuvem-ponto"), bt = $("nuvem-entrar"), ac = $("nuvem-acoes");
    if(!el) return;
    if(!el.hasAttribute("role")){ el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); }
    var lista = [pior()];
    /* a casca não tem caderno: o estado dela é o dos módulos abertos dentro dela */
    if(!cadernos.length) outrasJanelas().forEach(function(w){ try{ if(w !== window.top && w.Nuvem && w.Nuvem.pior) lista.push(w.Nuvem.pior()); }catch(err){} });
    lista = lista.filter(Boolean);
    var ordem = {escolha:0, erro:1, indo:2};
    lista.sort(function(a, b){ return ((a.tipo in ordem ? ordem[a.tipo] : 3) - (b.tipo in ordem ? ordem[b.tipo] : 3)) || (b.t - a.t); });
    var e = lista[0] ||
            {texto: temToken() ? "Conectado ao Google Drive." : "Entre com o Google para abrir seus cadernos.", tipo: temToken() ? "ok" : ""};
    if(!cadernos.length && e.acoes) e = {texto:e.texto, tipo:e.tipo, t:e.t};   // os botões de escolha ficam no módulo
    /* enquanto a renovação sem tela está no ar (a casca, ou a casca acima desta página), diz isso e guarda o botão */
    var reconectando = renovando;
    if(!reconectando && window.top !== window){ try{ reconectando = !!(window.top.Nuvem && window.top.Nuvem.renovando && window.top.Nuvem.renovando()); }catch(err){} }
    if(reconectando && !temToken()) e = {texto:"Reconectando ao Drive…", tipo:"indo"};
    if(aviso && Date.now() > avisoAte) aviso = null;
    el.textContent = aviso || e.texto;
    var tipo = aviso ? "erro" : (e.tipo === "escolha" ? "erro" : e.tipo);
    if(pt){ pt.className = "nuvem-ponto" + (tipo ? " " + tipo : ""); pt.title = el.textContent; }
    /* a casca usa isto para mostrar o texto só quando ele importa (erro ou aviso) */
    if(el.parentNode && el.parentNode.dataset) el.parentNode.dataset.estado = tipo || "nada";
    if(bt) bt.classList.toggle("hidden", temToken() || reconectando);
    if(ac){
      ac.innerHTML = "";
      (e.acoes || []).forEach(function(a){
        var b = document.createElement("button");
        b.type = "button"; b.className = bt ? bt.className.replace(/\bhidden\b/, "") : ""; b.textContent = a.rotulo;
        b.addEventListener("click", a.fn);
        ac.appendChild(b);
      });
    }
  }

  function aoMostrar(){ cadernos.forEach(function(c){ c.aoVoltar(); }); }
  function algumPendente(){ return cadernos.some(function(c){ return c.pendente(); }); }

  function iniciar(){
    iniciado = true;
    lerTokenGuardado();
    var bt = $("nuvem-entrar");
    if(bt) bt.addEventListener("click", entrar);
    document.addEventListener("visibilitychange", function(){
      if(document.visibilityState === "visible") aoMostrar();
      else cadernos.forEach(function(c){ c.enviarSeHouver(); });
    });
    window.addEventListener("pagehide", function(){ cadernos.forEach(function(c){ c.enviarSeHouver(); }); });
    window.addEventListener("online", function(){ cadernos.forEach(function(c){ c.enviarSeHouver(); }); });
    window.addEventListener("beforeunload", function(e){ if(!saindo && algumPendente() && temToken()){ e.preventDefault(); e.returnValue = ""; } });
    if(temToken()) cadernos.forEach(function(c){ c.conectar(); });
    else cadernos.forEach(function(c){ if(!estados[c.id]) c.conectar(); });
    vigiarValidade(); guardarConta();
    desenhar();
    /* abriu o app com a chave vencida: quem já entrou neste aparelho volta a entrar sem tocar em nada */
    if(!temToken()) renovar();
  }

  /* Sair deste aparelho (04/10/2026): devolve a chave ao Google e apaga deste navegador tudo o que o
     Controle Único guardou (cópias dos cadernos, agenda, rascunhos de prontuário, formulações,
     carteira cripto). Os cadernos no Drive não são tocados. Só a casca chama. */
  function temPendente(){
    if(algumPendente()) return true;
    return outrasJanelas().some(function(w){ try{ return !!(w.Nuvem && w.Nuvem.algumPendente && w.Nuvem.algumPendente()); }catch(e){ return false; } });
  }
  function sair(){
    var aviso = temPendente()
      ? "ATENÇÃO: há mudanças que ainda não chegaram ao Google Drive. Se sair agora, elas se perdem.\n\nEspere o ponto ficar verde (\"Salvo no Drive\") e tente de novo, ou toque em OK para sair assim mesmo."
      : "Sair deste aparelho?\n\nO app apaga deste navegador as cópias dos cadernos (dinheiro, casa, clínica, carteira, formulações) e a conexão com o Google. Nada é apagado do seu Google Drive: é só entrar de novo para ver tudo.";
    if(!confirm(aviso)) return;
    var t = token;
    saindo = true;
    var apagar = function(){
      try{
        var chaves = [];
        for(var i = 0; i < localStorage.length; i++){ var k = localStorage.key(i); if(/^(controle-unico|cu-|cripto-|rede-pbt)/.test(k)) chaves.push(k); }
        chaves.forEach(function(k){ localStorage.removeItem(k); });
      }catch(e){}
      try{ sessionStorage.clear(); }catch(e){}
      location.replace(location.pathname);
    };
    if(t) fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(t), {method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}}).catch(function(){}).then(apagar);
    else apagar();
  }

  lerVoltaDoGoogle();

  return {
    caderno: function(op){ var c = new Caderno(op); cadernos.push(c); return c; },
    entrarSozinho: entrarSozinho,
    iniciar: iniciar, entrar: entrar, receberToken: receberToken, aoMostrar: aoMostrar,
    renovar: renovar, renovando: function(){ return renovando; }, redesenhar: function(){ desenhar(); }, invalidar: invalidar,
    /* recarrega a página de propósito, sem o aviso de mudança pendente (ela continua marcada) */
    recarregar: function(){ saindo = true; location.reload(); },
    conectado: temToken,
    pior: pior, algumPendente: algumPendente, sair: sair,
    /* a junção das duas cópias, exposta para os testes automáticos (testes/) */
    juntar: juntar
  };
})();

/* Aviso de erro na tela (04/10/2026). Antes, um erro de programa ou o navegador sem espaço para
   guardar a cópia local passavam calados: a tela parava de responder ou a mudança só existia até
   fechar a aba. Agora aparece uma faixa dizendo o que fazer. O Drive continua sendo o lugar seguro. */
(function(){
  var mostrado = {};
  function faixa(chave, texto){
    if(mostrado[chave]) return; mostrado[chave] = true;
    var pinta = function(){
      if(!document.body) return setTimeout(pinta, 200);
      var d = document.createElement("div");
      d.setAttribute("role", "alert");
      d.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:560px;margin:0 auto;padding:12px 14px;border-radius:10px;" +
        "background:#fbeaea;color:#7a1f1f;border:1px solid #e5b4b4;font:14px/1.4 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.18);display:flex;gap:12px;align-items:flex-start";
      var p = document.createElement("span"); p.style.flex = "1"; p.textContent = texto;
      var x = document.createElement("button"); x.type = "button"; x.textContent = "Fechar";
      x.style.cssText = "border:1px solid currentColor;background:transparent;color:inherit;border-radius:6px;padding:4px 10px;cursor:pointer;font:inherit";
      x.onclick = function(){ d.remove(); };
      d.appendChild(p); d.appendChild(x); document.body.appendChild(d);
    };
    pinta();
  }
  window.addEventListener("error", function(e){
    // erro de imagem ou script de fora (Google) não é da tela
    if(!e || !e.message || /^Script error/.test(e.message)) return;
    faixa("erro", "Algo deu errado nesta tela. O que já foi guardado está a salvo; recarregue a página. Se repetir, avise com um print desta mensagem: " + e.message);
  });
  window.addEventListener("unhandledrejection", function(e){
    var m = e && e.reason && (e.reason.message || String(e.reason));
    if(!m || /Failed to fetch|NetworkError|Load failed|abort/i.test(m)) return;   // sem internet: a nuvem já avisa
    faixa("erro", "Algo deu errado nesta tela. O que já foi guardado está a salvo; recarregue a página. Detalhe: " + m);
  });
  try{
    var gravar = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v){
      try{ return gravar.call(this, k, v); }
      catch(e){
        if(e && (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014))
          faixa("cheio", "O navegador ficou sem espaço para guardar a cópia deste aparelho. Mantenha a conexão com o Google ativa: o que vai para o Drive continua seguro. Liberar espaço do navegador resolve.");
        throw e;
      }
    };
  }catch(e){}
})();
