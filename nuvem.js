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

  var token = null, expira = 0, cliente = null, iniciado = false, saindo = false;
  var cadernos = [], estados = {};

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
    guarda("controle-unico-oauth-estado", null); guarda("controle-unico-oauth-aba", null);
    try{ history.replaceState(null, "", location.pathname + location.search + aba); }catch(e){}
    if(!esperado || p.get("state") !== esperado){ aviso = "A resposta do Google não conferiu. Entre de novo."; return; }
    if(p.get("error")){
      guarda("controle-unico-auto-falhou", String(Date.now()));
      if(!/^(interaction|login|consent)_required$/.test(p.get("error"))) aviso = "O Google recusou: " + p.get("error");
      return;
    }
    token = p.get("access_token");
    expira = Date.now() + (Number(p.get("expires_in")) || 3600) * 1000;
    try{ localStorage.setItem(CH_TOKEN, JSON.stringify({t:token, e:expira})); }catch(e){}
    guarda("controle-unico-ja-entrou", "1");
    guarda("controle-unico-auto-falhou", null);
  }
  /* ao abrir o app no iPhone: quem já entrou antes entra de novo sem tocar em nada */
  function entrarSozinho(){
    if(!appNoIphone() || window.top !== window || temToken() || !le("controle-unico-ja-entrou")) return;
    if(Date.now() - Number(le("controle-unico-auto-falhou") || 0) < 12 * 3600 * 1000) return;
    entrarPorRedirecionamento(true);
  }

  function entrar(){
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
          espalhar();
          cadernos.forEach(function(c){ c.conectar(); });
          desenhar();
        },
        error_callback: function(e){ avisoGeral("A janela do Google foi fechada ou bloqueada (" + e.type + ")."); }
      });
    }
    cliente.requestAccessToken(le("controle-unico-ja-entrou") ? {prompt:""} : {});
  }

  /* ---------------- conversa com o Drive ---------------- */
  function api(url, op){
    op = op || {};
    if(!temToken()) return Promise.reject(new Error("expirou"));
    var cab = Object.assign({}, op.headers || {}, {Authorization:"Bearer " + token});
    return fetch(url, Object.assign({}, op, {headers:cab})).then(function(r){
      if(r.status === 401){ token = null; throw new Error("expirou"); }
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

  /* ---------------- um caderno = um arquivo no Drive ---------------- */
  function Caderno(op){
    var c = this;
    c.id = op.id;
    var CH_P = "controle-unico-" + op.id + "-pendente";   // mudança feita aqui que o Drive ainda não tem
    var CH_A = "controle-unico-" + op.id + "-arquivo";    // id e versão do arquivo na última troca
    var arquivo = null, pendente = le(CH_P) === "1", timer = null, gravando = false, deNovo = false, conectando = false;
    try{ arquivo = JSON.parse(le(CH_A)); }catch(e){ arquivo = null; }

    function estado(texto, tipo, acoes){ estados[c.id] = {texto:texto, tipo:tipo || "", acoes:acoes || null, t:Date.now()}; desenhar(); }
    function marcarPendente(v){ pendente = v; guarda(CH_P, v ? "1" : null); }
    function marcarArquivo(a){ arquivo = a ? {id:a.id, modifiedTime:a.modifiedTime} : null; guarda(CH_A, arquivo ? JSON.stringify(arquivo) : null); }
    c.pendente = function(){ return pendente; };

    function falhou(e){
      gravando = false; conectando = false;
      if(e.message === "expirou") estado(pendente ? "O acesso ao Drive expirou. Suas mudanças estão guardadas aqui; entre de novo para enviar." : "O acesso ao Drive expirou. Entre de novo.", "erro");
      else estado("Não consegui falar com o Drive (" + e.message + "). O que você mudou está guardado neste aparelho.", "erro");
    }

    function trazer(id, recado){
      return baixar(id).then(function(d){
        return versaoDoArquivo(id).then(function(v){
          op.aplicar(d); marcarArquivo(v); marcarPendente(false);
          estado(recado || ("Salvo no Drive · aberto às " + hora()), "ok");
        });
      });
    }

    function criarNovo(){
      estado("Criando o caderno no Drive…", "indo");
      var local = op.obter();
      return criar(op.nome, JSON.stringify(local)).then(function(novo){
        marcarArquivo(novo); marcarPendente(false);
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
        if(pendente && op.temDados(local)){
          if(!driveMudou || confirm("Este aparelho tem mudanças em " + (op.rotulo || "um caderno") + " que ainda não foram para o Drive, e o Drive também mudou em outro aparelho.\n\nOK: fico com o deste aparelho (grava por cima do Drive).\nCancelar: fico com o do Drive (perde as mudanças daqui).")){
            marcarArquivo(achado);
            conectando = false;
            return c.enviarAgora();
          }
        }
        return baixar(achado.id).then(function(remoto){
          if(!op.temDados(remoto) && op.temDados(local)){ marcarArquivo(achado); conectando = false; return c.enviarAgora(); }
          op.aplicar(remoto); marcarArquivo(achado); marcarPendente(false);
          estado("Salvo no Drive · aberto às " + hora(), "ok");
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
        if(v.modifiedTime !== arquivo.modifiedTime &&
           !confirm((op.rotulo || "O caderno") + " foi mudado em outro aparelho depois que você abriu aqui.\n\nOK: gravo por cima com o deste aparelho.\nCancelar: trago o do Drive (perde a última mudança feita aqui).")){
          gravando = false;
          return trazer(arquivo.id, "Trouxe o caderno do Drive, com o que mudou no outro aparelho.");
        }
        return atualizar(arquivo.id, JSON.stringify(op.obter())).then(function(r){
          marcarArquivo(r);
          gravando = false;
          if(deNovo){ deNovo = false; return c.enviarAgora(); }
          marcarPendente(false);
          estado("Salvo no Drive às " + hora(), "ok");
        });
      }).catch(falhou);
    };

    c.mudou = function(){
      marcarPendente(true);
      if(!iniciado) return;
      if(!temToken()){ estado("Guardado só neste aparelho. Entre com o Google para mandar ao Drive.", "erro"); return; }
      estado("Salvando no Drive…", "indo");
      clearTimeout(timer);
      timer = setTimeout(c.enviarAgora, 1200);
    };

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
  var aviso = null;
  function avisoGeral(t){ aviso = t; desenhar(); }
  function desenhar(){
    var el = $("nuvem-texto"), pt = $("nuvem-ponto"), bt = $("nuvem-entrar"), ac = $("nuvem-acoes");
    if(!el) return;
    var lista = cadernos.map(function(c){ return estados[c.id]; }).filter(Boolean);
    var e = lista.filter(function(x){ return x.tipo === "escolha"; })[0] || lista.filter(function(x){ return x.tipo === "erro"; })[0] ||
            lista.filter(function(x){ return x.tipo === "indo"; })[0] ||
            lista.slice().sort(function(a, b){ return b.t - a.t; })[0] ||
            {texto: temToken() ? "Conectado ao Google Drive." : "Entre com o Google para abrir seus cadernos.", tipo: temToken() ? "ok" : ""};
    el.textContent = aviso || e.texto;
    aviso = null;
    if(pt) pt.className = "nuvem-ponto" + (e.tipo ? " " + (e.tipo === "escolha" ? "erro" : e.tipo) : "");
    if(bt) bt.classList.toggle("hidden", temToken());
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
    document.addEventListener("visibilitychange", function(){ if(document.visibilityState === "visible") aoMostrar(); });
    window.addEventListener("beforeunload", function(e){ if(!saindo && algumPendente() && temToken()){ e.preventDefault(); e.returnValue = ""; } });
    if(temToken()) cadernos.forEach(function(c){ c.conectar(); });
    else cadernos.forEach(function(c){ if(!estados[c.id]) c.conectar(); });
    desenhar();
  }

  lerVoltaDoGoogle();

  return {
    caderno: function(op){ var c = new Caderno(op); cadernos.push(c); return c; },
    entrarSozinho: entrarSozinho,
    iniciar: iniciar, entrar: entrar, receberToken: receberToken, aoMostrar: aoMostrar,
    /* recarrega a página de propósito, sem o aviso de mudança pendente (ela continua marcada) */
    recarregar: function(){ saindo = true; location.reload(); },
    conectado: temToken
  };
})();
