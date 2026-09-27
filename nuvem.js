/* Nuvem: guarda o caderno de um módulo no Google Drive de quem entrou.
   O módulo continua gravando no navegador (cache); a Nuvem manda a mesma coisa para o Drive
   pouco depois de cada mudança e traz o que outro aparelho mudou quando a página volta à vista.
   Uso: Nuvem.iniciar({obter, aplicar, temDados}); Nuvem.mudou() a cada gravação. */
var Nuvem = (function(){
  var CLIENT_ID = "185782688251-p74qi2gguclcosk33f8p653dmb1dtt2a.apps.googleusercontent.com";
  var ESCOPO = "https://www.googleapis.com/auth/drive.file";
  var NOME = "Controle Único - clínica.json";
  var CH_PENDENTE = "controle-unico-clinica-pendente";   // mudança feita aqui que o Drive ainda não tem
  var CH_ARQUIVO = "controle-unico-clinica-arquivo";     // id e versão do arquivo na última troca
  var CH_TOKEN = "controle-unico-token";                 // só na sessão da aba

  var app = null, token = null, expira = 0, cliente = null;
  var arquivo = null, pendente = false, timer = null, gravando = false, deNovo = false;

  function $(id){ return document.getElementById(id); }
  function hora(){ return new Date().toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"}); }
  function guarda(k, v){ try{ v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); }catch(e){} }
  function le(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }

  function status(texto, tipo){
    $("nuvem-texto").textContent = texto;
    $("nuvem-ponto").className = "nuvem-ponto" + (tipo ? " " + tipo : "");
    $("nuvem-entrar").classList.toggle("hidden", !!token);
  }
  function marcarPendente(v){ pendente = v; guarda(CH_PENDENTE, v ? "1" : null); }
  function marcarArquivo(a){ arquivo = a ? {id:a.id, modifiedTime:a.modifiedTime} : null; guarda(CH_ARQUIVO, arquivo ? JSON.stringify(arquivo) : null); }

  function temToken(){
    if(token && Date.now() < expira - 60000) return true;
    if(token){ token = null; try{ sessionStorage.removeItem(CH_TOKEN); }catch(e){} }
    return false;
  }

  function api(url, op){
    op = op || {};
    if(!temToken()) return Promise.reject(new Error("expirou"));
    var cab = Object.assign({}, op.headers || {}, {Authorization:"Bearer " + token});
    return fetch(url, Object.assign({}, op, {headers:cab})).then(function(r){
      if(r.status === 401){ token = null; throw new Error("expirou"); }
      if(!r.ok) return r.text().then(function(t){ throw new Error("o Drive respondeu " + r.status + ": " + t.slice(0, 200)); });
      return r;
    });
  }

  function falhou(e){
    gravando = false;
    if(e.message === "expirou") status(pendente ? "O acesso ao Drive expirou. Suas mudanças estão guardadas aqui; entre de novo para enviar." : "O acesso ao Drive expirou. Entre de novo.", "erro");
    else status("Não consegui falar com o Drive (" + e.message + "). Suas mudanças estão guardadas neste aparelho.", "erro");
  }

  function acharArquivo(){
    var q = encodeURIComponent("name='" + NOME + "' and trashed=false");
    return api("https://www.googleapis.com/drive/v3/files?q=" + q + "&spaces=drive&orderBy=createdTime&fields=files(id,modifiedTime)")
      .then(function(r){ return r.json(); }).then(function(j){ return j.files[0] || null; });
  }
  function versaoDoArquivo(id){
    return api("https://www.googleapis.com/drive/v3/files/" + id + "?fields=id,modifiedTime").then(function(r){ return r.json(); });
  }
  function baixar(id){
    return api("https://www.googleapis.com/drive/v3/files/" + id + "?alt=media").then(function(r){ return r.json(); });
  }
  function criar(conteudo){
    var limite = "controleunico" + Date.now();
    var corpo = "--" + limite + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify({name:NOME, mimeType:"application/json"}) +
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

  function trazer(id, recado){
    return baixar(id).then(function(d){
      return versaoDoArquivo(id).then(function(v){
        app.aplicar(d); marcarArquivo(v); marcarPendente(false);
        status(recado || ("Salvo no Drive · aberto às " + hora()), "ok");
      });
    });
  }

  /* Depois de entrar: acha o caderno e decide quem vale, o Drive ou este aparelho. */
  function conectar(){
    status("Abrindo o caderno no Drive…", "indo");
    return acharArquivo().then(function(achado){
      var local = app.obter();
      if(!achado){
        return criar(JSON.stringify(local)).then(function(novo){
          marcarArquivo(novo); marcarPendente(false);
          status(app.temDados(local) ? "Caderno criado no Drive com o que estava neste aparelho." : "Caderno criado no Drive, ainda vazio. Traga a agenda por \"Ler a planilha\" ou \"Importar dados\".", "ok");
        });
      }
      var driveMudou = !arquivo || arquivo.id !== achado.id || arquivo.modifiedTime !== achado.modifiedTime;
      if(pendente && app.temDados(local)){
        if(!driveMudou || confirm("Este aparelho tem mudanças que ainda não foram para o Drive, e o Drive também mudou em outro aparelho.\n\nOK: fico com o deste aparelho (grava por cima do Drive).\nCancelar: fico com o do Drive (perde as mudanças daqui).")){
          marcarArquivo(achado);
          return enviarAgora();
        }
      }
      return baixar(achado.id).then(function(remoto){
        if(!app.temDados(remoto) && app.temDados(local)){ marcarArquivo(achado); return enviarAgora(); }
        app.aplicar(remoto); marcarArquivo(achado); marcarPendente(false);
        status("Salvo no Drive · aberto às " + hora(), "ok");
      });
    }).catch(falhou);
  }

  function enviarAgora(){
    if(gravando){ deNovo = true; return Promise.resolve(); }
    if(!temToken()){ falhou(new Error("expirou")); return Promise.resolve(); }
    if(!arquivo) return conectar();
    gravando = true;
    status("Salvando no Drive…", "indo");
    return versaoDoArquivo(arquivo.id).then(function(v){
      if(v.modifiedTime !== arquivo.modifiedTime &&
         !confirm("O caderno foi mudado em outro aparelho depois que você abriu aqui.\n\nOK: gravo por cima com o deste aparelho.\nCancelar: trago o do Drive (perde a última mudança feita aqui).")){
        gravando = false;
        return trazer(arquivo.id, "Trouxe o caderno do Drive, com o que mudou no outro aparelho.");
      }
      return atualizar(arquivo.id, JSON.stringify(app.obter())).then(function(r){
        marcarArquivo(r);
        gravando = false;
        if(deNovo){ deNovo = false; return enviarAgora(); }
        marcarPendente(false);
        status("Salvo no Drive às " + hora(), "ok");
      });
    }).catch(falhou);
  }

  function mudou(){
    if(!app) return;
    marcarPendente(true);
    if(!temToken()){ status("Guardado só neste aparelho. Entre com o Google para mandar ao Drive.", "erro"); return; }
    status("Salvando no Drive…", "indo");
    clearTimeout(timer);
    timer = setTimeout(enviarAgora, 1200);
  }

  function entrar(){
    if(!(window.google && google.accounts && google.accounts.oauth2)){ status("O Google ainda não carregou. Tente de novo em um segundo.", "erro"); return; }
    if(!cliente){
      cliente = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: ESCOPO,
        callback: function(resp){
          if(resp.error){ status("O Google recusou: " + resp.error, "erro"); return; }
          token = resp.access_token;
          expira = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
          try{ sessionStorage.setItem(CH_TOKEN, JSON.stringify({t:token, e:expira})); }catch(e){}
          guarda("controle-unico-ja-entrou", "1");
          conectar();
        },
        error_callback: function(e){ status("A janela do Google foi fechada ou bloqueada (" + e.type + ").", "erro"); }
      });
    }
    cliente.requestAccessToken(le("controle-unico-ja-entrou") ? {prompt:""} : {});
  }

  /* Voltou para a aba: se nada daqui está pendente e o Drive mudou, traz o do Drive. */
  function aoVoltar(){
    if(document.visibilityState !== "visible" || !arquivo || !temToken()) return;
    if(pendente){ enviarAgora(); return; }
    versaoDoArquivo(arquivo.id).then(function(v){
      if(v.modifiedTime !== arquivo.modifiedTime) return trazer(arquivo.id, "Atualizado com o que mudou em outro aparelho, às " + hora() + ".");
    }).catch(falhou);
  }

  function iniciar(opcoes){
    app = opcoes;
    pendente = le(CH_PENDENTE) === "1";
    try{ arquivo = JSON.parse(le(CH_ARQUIVO)); }catch(e){ arquivo = null; }
    try{ var s = JSON.parse(sessionStorage.getItem(CH_TOKEN)); if(s){ token = s.t; expira = s.e; } }catch(e){}
    $("nuvem-entrar").addEventListener("click", entrar);
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("beforeunload", function(e){ if(pendente && temToken()){ e.preventDefault(); e.returnValue = ""; } });
    if(temToken()) conectar();
    else status(pendente ? "Há mudanças guardadas só neste aparelho. Entre com o Google para mandar ao Drive." : "Entre com o Google para abrir o caderno da clínica.", pendente ? "erro" : "");
  }

  return {iniciar:iniciar, mudou:mudou};
})();
