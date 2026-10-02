/* O formulário único de lançamento, igual no app dele (app.html) e no da Ana (ana.html).
   Pedido de Matheus em 01/10/2026: primeiro tem de ficar claro se o gasto é Pessoal ou da Casa,
   para não lançar no lugar errado; depois o dia, a categoria, a descrição (opcional), o valor e
   a forma de pagamento. As categorias viram botões agrupados, em vez de uma lista para abrir.
   O mesmo formulário serve para alterar um lançamento que já existe (o lápis de cada linha).

   A página chama FormLancamento.montar(el, cfg) toda vez que se redesenha. O que está escolhido
   e digitado mora aqui (est), não na tela: o Drive e a Clínica mandam redesenhar a qualquer hora
   e o formulário volta do jeito que estava, com o foco no mesmo campo.

   cfg = {
     tela:    nome da tela (o formulário de cada tela guarda a sua escolha de Pessoal ou Casa),
     padrao:  "pessoal", "casa" ou null (null obriga a escolher antes de preencher),
     pessoal: { explica, tipos:[[valor, rótulo, dica]] ou null, grupos:[[nome,[categorias]]], formas:[...] } ou null,
     casa:    { explica, pessoas:[...], eu, grupos:[[nome,[categorias]]] } ou null,
     dataPadrao: "AAAA-MM-DD",
     lancar:  function(onde, dados) → devolve a função que desfaz o lançamento,
     alterar: function(onde, id, dados) → grava a alteração de um lançamento que já existe
   }
   Este arquivo é público: só desenho e regra, nenhum dado. */
var FormLancamento = (function(){
  var CSS =
    ".lanc{margin:0 0 14px;--lanc-pessoal:var(--accent);--lanc-casa:#1c7f8f}" +
    "@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .lanc{--lanc-casa:#6fc7d6}} :root[data-theme=dark] .lanc{--lanc-casa:#6fc7d6}" +
    ".lanc-abrir{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--accent);background:var(--accent);color:var(--surface);font:inherit;font-size:14px;font-weight:600;padding:8px 14px;border-radius:var(--radius);cursor:pointer}" +
    ".lanc-abrir[aria-expanded=true]{background:var(--surface);color:var(--text);border-color:var(--line);font-weight:500}" +
    ".lanc-form{margin-top:10px;background:var(--surface-2);border-radius:var(--radius);padding:14px;display:grid;gap:14px;border-left:4px solid var(--line)}" +
    ".lanc-form.pessoal{border-left-color:var(--lanc-pessoal)} .lanc-form.casa{border-left-color:var(--lanc-casa)}" +
    ".lanc-campo>label,.lanc-rot{display:block;font-size:12px;color:var(--muted);margin:0 0 6px;font-weight:500}" +
    ".lanc-campo>label small{font-weight:400;color:var(--faint)}" +
    ".lanc-titulo{margin:0;font-size:14px;font-weight:600}" +
    /* de quem é: dois cartões grandes, cada um com a sua cor e uma frase dizendo o que acontece */
    ".lanc-onde{display:grid;grid-template-columns:1fr 1fr;gap:10px}" +
    ".lanc-onde label{position:relative;display:flex;gap:10px;align-items:flex-start;margin:0;padding:12px;border:2px solid var(--line);border-radius:10px;background:var(--surface);cursor:pointer;color:var(--text)}" +
    ".lanc-onde input{position:absolute;opacity:0;pointer-events:none}" +
    ".lanc-onde svg{width:22px;height:22px;flex:none;margin-top:1px;color:var(--faint)}" +
    ".lanc-onde b{display:block;font-size:15px} .lanc-onde span span{display:block;font-size:12px;color:var(--muted);line-height:1.35;margin-top:1px}" +
    ".lanc-onde label.pessoal:has(input:checked){border-color:var(--lanc-pessoal);box-shadow:inset 0 0 0 1px var(--lanc-pessoal)} .lanc-onde label.pessoal:has(input:checked) svg,.lanc-onde label.pessoal:has(input:checked) b{color:var(--lanc-pessoal)}" +
    ".lanc-onde label.casa:has(input:checked){border-color:var(--lanc-casa);box-shadow:inset 0 0 0 1px var(--lanc-casa)} .lanc-onde label.casa:has(input:checked) svg,.lanc-onde label.casa:has(input:checked) b{color:var(--lanc-casa)}" +
    ".lanc-onde label:has(input:focus-visible),.lanc-chips label:has(input:focus-visible){outline:2px solid var(--accent);outline-offset:2px}" +
    ".lanc-falta{margin:0;font-size:13px;color:var(--muted)}" +
    /* escolhas em botões: tipo, categoria, forma, quem comprou */
    ".lanc-chips{display:flex;flex-wrap:wrap;gap:6px}" +
    ".lanc-chips label{position:relative;margin:0;cursor:pointer}" +
    ".lanc-chips input{position:absolute;opacity:0;pointer-events:none}" +
    ".lanc-chips span{display:inline-flex;align-items:center;min-height:34px;padding:5px 12px;border:1px solid var(--line);border-radius:99px;background:var(--surface);color:var(--text);font-size:13.5px;white-space:nowrap}" +
    ".lanc-chips label:hover span{border-color:var(--faint)}" +
    ".lanc-chips input:checked + span{background:var(--text);border-color:var(--text);color:var(--surface);font-weight:600}" +
    ".lanc-grupo{display:grid;grid-template-columns:104px minmax(0,1fr);gap:4px 10px;align-items:start}" +
    ".lanc-grupo + .lanc-grupo{margin-top:8px}" +
    ".lanc-grupo > i{font-style:normal;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);padding-top:9px}" +
    ".lanc-grupo.solto{grid-template-columns:minmax(0,1fr)} .lanc-grupo.solto > i{display:none}" +
    ".lanc-duas{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:14px}" +
    ".lanc-dia{display:flex;gap:6px;align-items:center;flex-wrap:wrap} .lanc-dia input{width:auto;flex:1 1 150px}" +
    ".lanc-mini{border:1px solid var(--line);background:var(--surface);color:var(--muted);font:inherit;font-size:13px;padding:6px 10px;border-radius:99px;cursor:pointer}" +
    ".lanc-mini[aria-pressed=true]{color:var(--text);border-color:var(--text);font-weight:600}" +
    ".lanc-valor{position:relative} .lanc-valor input{padding-left:38px;font-size:18px;font-weight:600} .lanc-valor i{position:absolute;left:12px;top:50%;transform:translateY(-50%);font-style:normal;color:var(--muted);font-size:14px}" +
    ".lanc-nota{margin:0;font-size:12.5px;color:var(--muted)}" +
    ".lanc-pe{display:flex;gap:12px;align-items:center;flex-wrap:wrap}" +
    ".lanc-ok{border:0;font:inherit;font-size:15px;font-weight:600;padding:10px 18px;border-radius:var(--radius);cursor:pointer;color:#fff;background:var(--lanc-pessoal)}" +
    ".lanc-form.casa .lanc-ok{background:var(--lanc-casa)}" +
    ":root[data-theme=dark] .lanc-ok{color:#10141a} @media (prefers-color-scheme:dark){:root:not([data-theme=light]) .lanc-ok{color:#10141a}}" +
    ".lanc-cancelar{border:1px solid var(--line);background:var(--surface);color:var(--text);font:inherit;font-size:14px;padding:9px 14px;border-radius:var(--radius);cursor:pointer}" +
    ".lanc-erro{color:var(--neg);font-size:13px;font-weight:500}" +
    ".lanc-feito{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px;color:var(--pos);background:var(--pos-soft);border-radius:var(--radius);padding:8px 12px}" +
    ".lanc-feito button{border:0;background:transparent;color:inherit;font:inherit;text-decoration:underline;cursor:pointer;padding:0}" +
    "@media (max-width:700px){" +
      ".lanc-abrir{width:100%;justify-content:center;padding:11px 14px;font-size:15px}" +
      ".lanc-form{padding:12px}" +
      ".lanc-onde{gap:8px} .lanc-onde label{padding:10px}" +
      ".lanc-grupo{grid-template-columns:1fr} .lanc-grupo > i{padding-top:0}" +
      ".lanc-chips span{min-height:38px;padding:6px 13px;font-size:14px}" +
      ".lanc-duas{grid-template-columns:1fr}" +
      ".lanc-ok,.lanc-cancelar{width:100%;padding:12px}" +
    "}";

  var ICONE = {
    pessoal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>',
    casa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>'
  };

  // o estado do formulário de cada tela: o que foi escolhido e digitado
  var telas = {};
  function estadoDa(cfg){
    var k = cfg.tela || "geral";
    if (!telas[k]) telas[k] = { aberto:false, onde:cfg.padrao || null, tipo:"", data:"", cat:{ pessoal:"", casa:"" }, descricao:"", valor:"", forma:"", quem:"", feito:null, erro:"", foco:"", editando:null };
    return telas[k];
  }
  function limpar(est, cfg){
    est.onde = cfg.padrao || null; est.tipo = ""; est.data = cfg.dataPadrao || hoje(); est.cat = { pessoal:"", casa:"" };
    est.descricao = ""; est.valor = ""; est.erro = ""; est.foco = ""; est.editando = null;
  }
  var esc = function(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); };
  var iso = function(d){ return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  var hoje = function(){ return iso(new Date()); };
  var ontem = function(){ var d = new Date(); d.setDate(d.getDate() - 1); return iso(d); };
  var dinheiro = function(v){ return (Number(v) || 0).toLocaleString("pt-BR", { style:"currency", currency:"BRL" }); };
  var diaBR = function(d){ return String(d || "").slice(8, 10) + "/" + String(d || "").slice(5, 7); };
  var lembrado = function(k){ try { return localStorage.getItem("cu-lanc-" + k) || ""; } catch(e){ return ""; } };
  var lembrar = function(k, v){ try { localStorage.setItem("cu-lanc-" + k, v); } catch(e){} };
  /* Ponto final só na tela (pedido dele, 02/10/2026): categoria e descrição aparecem com ponto, como
     nas planilhas, mas o que se guarda continua sem, para nenhuma soma depender da grafia. */
  var comPonto = function(s){ var t = String(s == null ? "" : s).trim(); return !t || t === "-" || /[.!?…]$/.test(t) ? t : t + "."; };
  /* O valor se escreve só com os números e a vírgula anda sozinha (pedido dele, 02/10/2026):
     1, 10, 102, 1025 viram 0,01, 0,10, 1,02, 10,25. */
  var mascara = function(s){
    var d = String(s == null ? "" : s).replace(/\D/g, "").replace(/^0+/, "").slice(0, 11);
    return d ? (Number(d) / 100).toLocaleString("pt-BR", { minimumFractionDigits:2, maximumFractionDigits:2 }) : "";
  };
  var centavos = function(s){ return Number(String(s == null ? "" : s).replace(/\D/g, "")) / 100; };

  function chips(nome, itens, atual){
    return '<div class="lanc-chips">' + itens.map(function(it){
      var v = Array.isArray(it) ? it[0] : it, r = Array.isArray(it) ? it[1] : it;
      return '<label><input type="radio" name="' + nome + '" value="' + esc(v) + '"' + (v === atual ? " checked" : "") + '><span>' + esc(r) + '</span></label>';
    }).join("") + '</div>';
  }

  function montar(el, cfg){
    if (!el) return;
    var doc = el.ownerDocument;
    if (!doc.getElementById("lanc-css")){ var st = doc.createElement("style"); st.id = "lanc-css"; st.textContent = CSS; doc.head.appendChild(st); }
    var est = estadoDa(cfg);
    if (est.onde && !cfg[est.onde]) est.onde = null;
    // com um caderno só (a Ana sem a Casa aberta), não há o que escolher
    var soUm = !cfg.pessoal || !cfg.casa;
    if (soUm) est.onde = cfg.pessoal ? "pessoal" : "casa";
    var o = est.onde, lado = o ? cfg[o] : null, alterando = !!est.editando;
    var tipos = o === "pessoal" && cfg.pessoal.tipos ? cfg.pessoal.tipos : null;
    if (tipos && !tipos.some(function(t){ return t[0] === est.tipo; })) est.tipo = tipos[0][0];
    var tipo = tipos ? est.tipo : "";
    var semCategoria = tipo === "Receita" || tipo === "Aporte" || tipo === "Resgate";
    if (!est.data) est.data = cfg.dataPadrao || hoje();
    if (o === "pessoal" && !est.forma) est.forma = lembrado("forma") || "";
    if (o === "casa" && (!est.quem || cfg.casa.pessoas.indexOf(est.quem) < 0)) est.quem = cfg.casa.eu || cfg.casa.pessoas[0] || "";

    var h = '<button type="button" class="lanc-abrir" aria-expanded="' + est.aberto + '">' + (est.aberto ? "Fechar o lançamento" : "+ Novo lançamento") + '</button>';
    if (est.aberto){
      h += '<form class="lanc-form ' + (o || "") + '" novalidate>';
      if (alterando){
        h += '<p class="lanc-titulo">Alterando um lançamento ' + (o === "pessoal" ? "Pessoal" : "da Casa") + '</p>';
      } else if (!soUm){
        h += '<div><span class="lanc-rot">De quem é</span><div class="lanc-onde" role="radiogroup" aria-label="Pessoal ou da casa">' +
          ["pessoal", "casa"].map(function(k){
            return '<label class="' + k + '"><input type="radio" name="onde" value="' + k + '"' + (o === k ? " checked" : "") + '>' + ICONE[k] +
              '<span><b>' + (k === "pessoal" ? "Pessoal" : "Casa") + '</b><span>' + esc(cfg[k].explica) + '</span></span></label>';
          }).join("") + '</div></div>';
      }
      if (!o){
        h += '<p class="lanc-falta">Escolha primeiro de quem é. O resto do lançamento aparece em seguida.</p>';
      } else {
        if (tipos){
          h += '<div><span class="lanc-rot">O que é</span>' + chips("tipo", tipos.map(function(t){ return [t[0], t[1]]; }), tipo) +
            (function(){ var t = tipos.filter(function(x){ return x[0] === tipo; })[0]; return t && t[2] ? '<p class="lanc-nota" style="margin-top:6px">' + esc(t[2]) + '</p>' : ""; })() + '</div>';
        }
        h += '<div class="lanc-campo"><label for="lanc-data">Dia</label><div class="lanc-dia"><input type="date" id="lanc-data" name="data" value="' + esc(est.data) + '" required>' +
          '<button type="button" class="lanc-mini" data-dia="' + hoje() + '" aria-pressed="' + (est.data === hoje()) + '">Hoje</button>' +
          '<button type="button" class="lanc-mini" data-dia="' + ontem() + '" aria-pressed="' + (est.data === ontem()) + '">Ontem</button></div></div>';
        if (!semCategoria){
          h += '<div><span class="lanc-rot">Categoria</span>' + lado.grupos.map(function(g){
            return '<div class="lanc-grupo' + (g[0] ? "" : " solto") + '"><i>' + esc(g[0]) + '</i>' + chips("categoria", g[1].map(function(c){ return [c, comPonto(c)]; }), est.cat[o]) + '</div>';
          }).join("") + '</div>';
        }
        // a ordem que ele pediu: categoria, descrição (opcional), valor e, por fim, a forma de pagamento
        h += '<div class="lanc-duas">' +
          '<div class="lanc-campo"><label for="lanc-desc">Descrição <small>(opcional)</small></label><input id="lanc-desc" name="descricao" autocomplete="off" placeholder="' +
            (semCategoria ? (tipo === "Receita" ? "de onde veio" : "para que foi") : "se quiser lembrar o que foi") + '" value="' + esc(est.descricao) + '"></div>' +
          '<div class="lanc-campo"><label for="lanc-valor">Valor</label><div class="lanc-valor"><i>R$</i><input type="text" id="lanc-valor" name="valor" inputmode="numeric" autocomplete="off" placeholder="0,00" value="' + esc(est.valor) + '" required></div></div></div>';
        if (o === "pessoal") h += '<div><span class="lanc-rot">Forma de pagamento</span>' + chips("forma", cfg.pessoal.formas, est.forma) + '</div>';
        else h += '<div><span class="lanc-rot">Quem comprou</span>' + chips("quem", cfg.casa.pessoas.map(function(p){ return [p, String(p).split(" ")[0]]; }), est.quem) + '</div>';
        h += '<div class="lanc-pe"><button type="submit" class="lanc-ok">' + (alterando ? "Guardar a alteração" : (o === "pessoal" ? "Lançar em Pessoal" : "Lançar na Casa")) + '</button>' +
          (alterando ? '<button type="button" class="lanc-cancelar">Cancelar</button>' : "") +
          '<span class="lanc-erro" role="alert">' + esc(est.erro) + '</span></div>';
      }
      if (est.feito) h += '<div class="lanc-feito" role="status"><span>' + esc(est.feito.texto) + '</span>' +
        (est.feito.desfaz ? '<button type="button" data-desfazer>Desfazer</button>' : "") + '</div>';
      h += '</form>';
    }
    el.className = "lanc";
    el.innerHTML = h;

    var redesenhar = function(){ montar(el, cfg); };
    el.querySelector(".lanc-abrir").onclick = function(){
      est.aberto = !est.aberto;
      // ao abrir de novo, a escolha volta a ser a da tela: sobra de um lançamento antigo é o que faz errar
      limpar(est, cfg); est.feito = null;
      redesenhar();
      if (est.aberto){ var f = el.querySelector(".lanc-form"); if (f && f.scrollIntoView) f.scrollIntoView({ block:"nearest" }); }
    };
    var form = el.querySelector(".lanc-form");
    if (!form) return;

    form.addEventListener("change", function(e){
      var n = e.target.name, v = e.target.value;
      if (n === "onde"){ est.onde = v; est.erro = ""; redesenhar(); }
      else if (n === "tipo"){ est.tipo = v; est.erro = ""; redesenhar(); }
      else if (n === "categoria"){ est.cat[o] = v; est.erro = ""; var er = form.querySelector(".lanc-erro"); if (er) er.textContent = ""; }
      else if (n === "forma"){ est.forma = v; lembrar("forma", v); }
      else if (n === "quem") est.quem = v;
      else if (n === "data"){ est.data = v; redesenhar(); }
    });
    form.addEventListener("input", function(e){
      var n = e.target.name;
      if (n === "valor"){ est.valor = mascara(e.target.value); if (e.target.value !== est.valor) e.target.value = est.valor; }
      else if (n === "descricao") est[n] = e.target.value;
    });
    form.addEventListener("focusin", function(e){ est.foco = e.target.name && e.target.type !== "radio" ? e.target.name : ""; });
    form.querySelectorAll("[data-dia]").forEach(function(b){ b.onclick = function(){ est.data = b.getAttribute("data-dia"); redesenhar(); }; });
    var des = form.querySelector("[data-desfazer]");
    if (des) des.onclick = function(){
      var f = est.feito; est.feito = null;
      if (f && typeof f.desfazer === "function") f.desfazer(); else redesenhar();
    };
    var canc = form.querySelector(".lanc-cancelar");
    if (canc) canc.onclick = function(){ limpar(est, cfg); est.aberto = false; redesenhar(); };
    // o redesenho da página não pode tirar o cursor do campo em que ele está digitando
    if (est.foco && (!doc.activeElement || doc.activeElement === doc.body)){
      var campo = form.querySelector('[name="' + est.foco + '"]');
      if (campo && campo.type !== "radio"){ try { campo.focus({ preventScroll:true }); } catch(e){} }
    }

    form.onsubmit = function(e){
      e.preventDefault();
      if (!o) return;
      var valor = centavos(est.valor);
      var erro = "";
      if (!est.data) erro = "Falta o dia.";
      else if (!semCategoria && !est.cat[o]) erro = "Falta a categoria.";
      else if (!(valor > 0)) erro = "Falta o valor.";
      else if (o === "pessoal" && !est.forma) erro = "Falta a forma de pagamento.";
      if (erro){ est.erro = erro; redesenhar(); return; }
      var dados = { data:est.data, tipo:tipo, categoria:semCategoria ? "" : est.cat[o], descricao:String(est.descricao || "").trim(), valor:valor, forma:est.forma, quem:est.quem };
      var resumo = (dados.categoria || tipo) + (dados.descricao ? " (" + dados.descricao.replace(/\.+$/, "") + ")" : "") + ", " + dinheiro(valor) + ", dia " + diaBR(dados.data) + ".";
      // limpa antes de entregar: a página se redesenha dentro do lancar e já pega o formulário vazio
      if (alterando){
        var id = est.editando;
        limpar(est, cfg); est.aberto = true; est.onde = o;
        est.feito = { texto:"Alterado: " + resumo, desfaz:false };
        cfg.alterar(o, id, dados);
      } else {
        var feito = { texto:"Lançado " + (o === "pessoal" ? "em Pessoal" : "na Casa") + ": " + resumo, desfaz:true, desfazer:null };
        est.valor = ""; est.descricao = ""; est.cat[o] = ""; est.erro = ""; est.foco = ""; est.feito = feito;
        feito.desfazer = cfg.lancar(o, dados) || null;
      }
      if (el.isConnected) redesenhar();
    };
  }

  /* abre o formulário daquela tela (o botão flutuante do celular usa) */
  function abrir(cfg){ var est = estadoDa(cfg); limpar(est, cfg); est.aberto = true; est.feito = null; }

  /* abre o formulário com um lançamento que já existe, para alterar */
  function editar(cfg, onde, reg){
    var est = estadoDa(cfg);
    limpar(est, cfg);
    est.aberto = true; est.feito = null; est.onde = onde; est.editando = reg.id;
    est.tipo = reg.tipo || ""; est.data = reg.data || est.data;
    est.cat[onde] = reg.categoria || "";
    est.descricao = reg.descricao && reg.descricao !== "-" ? reg.descricao : "";
    est.valor = reg.valor == null ? "" : mascara((Number(reg.valor) || 0).toFixed(2));
    if (reg.forma) est.forma = reg.forma;
    if (reg.quem) est.quem = reg.quem;
  }

  return { montar:montar, abrir:abrir, editar:editar, comPonto:comPonto };
})();
