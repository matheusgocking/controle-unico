/* A troca de semana ou de mês acompanha a rolagem (pedido dele, 06/10/2026: a página é comprida e,
   para passar de mês, ele tinha de subir até o topo). Quando a barra ‹ mês › da tela sai da vista,
   uma cópia pequena dela aparece fixa no alto, com o mesmo nome do período e as mesmas setas.
   As setas da cópia apertam as setas de verdade: as contas e o que é desenhado continuam os de cada
   página, este arquivo não sabe nada de dinheiro nem de agenda.

   A página chama PeriodoFixo.iniciar(achar), em que achar() devolve as barras de período da tela
   aberta (uma lista, que pode vir vazia). Com mais de uma na tela (na Clínica, a semana em cima e a
   lista de sessões do mês embaixo), vale a última que já passou pelo alto na rolagem. As barras podem ser
   trocadas a cada desenho: elas são procuradas de novo sempre que a página muda.
   opcoes.topo(): onde começa a área que rola, quando a página tem uma barra própria fixa em cima
   (a página da Ana); sem ela, é o alto da janela.
   Este arquivo é público: só desenho, nenhum dado. */
var PeriodoFixo = (function(){
  var CSS =
    ".cu-periodo{position:fixed;top:8px;left:50%;transform:translate(-50%,-8px);z-index:40;display:flex;align-items:center;gap:4px;" +
      "padding:4px;border-radius:99px;background:var(--surface,#fff);color:var(--text,#1a1920);border:1px solid var(--line,var(--border,#d8d5e0));" +
      "box-shadow:0 6px 20px rgba(0,0,0,.14);opacity:0;pointer-events:none;transition:opacity .15s,transform .15s;max-width:calc(100% - 24px)}" +
    ".cu-periodo.on{opacity:1;transform:translate(-50%,0);pointer-events:auto}" +
    ".cu-periodo button{flex:none;width:34px;height:34px;border:0;border-radius:50%;background:transparent;color:inherit;font:inherit;font-size:18px;line-height:1;cursor:pointer;display:grid;place-items:center}" +
    ".cu-periodo button:hover{background:var(--bg,rgba(0,0,0,.06))}" +
    ".cu-periodo button:focus-visible{outline:2px solid var(--accent,#7030A0);outline-offset:1px}" +
    ".cu-periodo span{padding:0 6px;font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;min-width:120px;text-transform:none}" +
    "@media (max-width:700px){.cu-periodo{top:6px;width:calc(100% - 24px);justify-content:space-between}.cu-periodo button{width:40px;height:40px}}" +
    /* o que a página leva para a vista (o formulário que o + abre) para logo abaixo da cópia, não embaixo dela */
    "html{scroll-padding-top:64px}" +
    "@media (prefers-reduced-motion:reduce){.cu-periodo{transition:none}}" +
    "@media print{.cu-periodo{display:none}}";

  var achar = function(){ return []; }, topoDe = function(){ return 0; };
  var pf, rot, pedido = false;

  /* a barra que vale agora: a última que já passou do alto da área que rola. Se ela ainda está à
     vista, a cópia não aparece; se já saiu inteira, a cópia mostra o período dela. */
  function barraAtual(){
    var lista = Array.prototype.slice.call(achar() || []), melhor = null, topo = -Infinity, alto = topoDe();
    for (var i = 0; i < lista.length; i++){
      var b = lista[i];
      if (!b || b.offsetParent === null) continue;
      var r = b.getBoundingClientRect();
      if (r.top < alto && r.top > topo){ topo = r.top; melhor = b; }
    }
    return melhor && melhor.getBoundingClientRect().bottom < alto ? melhor : null;
  }

  function setaDa(barra, qual){
    var bs = barra.querySelectorAll("button[aria-label]");
    for (var i = 0; i < bs.length; i++){
      var r = bs[i].getAttribute("aria-label");
      if (qual < 0 ? /anterior$/i.test(r) : /^pr[oó]xim/i.test(r)) return bs[i];
    }
    return null;
  }
  function nomeDa(barra){
    var n = barra.querySelector("h1, .range > span");
    var t = n ? n.textContent.replace(/\s+/g, " ").trim() : "";
    return t.charAt(0).toUpperCase() + t.slice(1);   // "Outubro 2026", como na barra de verdade
  }
  function atualizar(){
    pedido = false;
    // só aparece depois que a barra de verdade saiu inteira pelo alto
    var barra = barraAtual(), fora = !!barra;
    if (fora){
      pf.style.top = topoDe() ? (topoDe() + 8) + "px" : "";
      var nome = nomeDa(barra);
      if (rot.textContent !== nome) rot.textContent = nome;
      var a = setaDa(barra, -1), p = setaDa(barra, 1);
      pf.children[0].setAttribute("aria-label", a ? a.getAttribute("aria-label") : "Anterior");
      pf.children[2].setAttribute("aria-label", p ? p.getAttribute("aria-label") : "Próximo");
    }
    pf.classList.toggle("on", fora);
    pf.setAttribute("aria-hidden", fora ? "false" : "true");
    pf.children[0].tabIndex = pf.children[2].tabIndex = fora ? 0 : -1;
  }
  function pedir(){ if (!pedido){ pedido = true; requestAnimationFrame(atualizar); } }
  function apertar(qual){
    var barra = barraAtual(); if (!barra) return;
    var b = setaDa(barra, qual); if (b) b.click();
    pedir();
  }

  function iniciar(fn, opcoes){
    if (typeof fn === "function") achar = fn;
    if (opcoes && typeof opcoes.topo === "function") topoDe = opcoes.topo;
    if (pf) { pedir(); return; }
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    pf = document.createElement("div");
    pf.className = "cu-periodo"; pf.setAttribute("role", "group"); pf.setAttribute("aria-label", "Trocar o período");
    pf.innerHTML = '<button type="button" tabindex="-1">‹</button><span aria-live="polite"></span><button type="button" tabindex="-1">›</button>';
    rot = pf.children[1];
    pf.children[0].addEventListener("click", function(){ apertar(-1); });
    pf.children[2].addEventListener("click", function(){ apertar(1); });
    document.body.appendChild(pf);
    // a rolagem da página e a de qualquer caixa que role por dentro dela
    document.addEventListener("scroll", pedir, { passive:true, capture:true });
    window.addEventListener("resize", pedir);
    // a página se redesenha a qualquer hora (Drive, outra aba, troca de tela): a barra é procurada de novo
    new MutationObserver(function(ms){
      for (var i = 0; i < ms.length; i++) if (!pf.contains(ms[i].target)) { pedir(); return; }
    }).observe(document.body, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:["class","hidden"] });
    pedir();
  }
  return { iniciar:iniciar, atualizar:atualizar };
})();
