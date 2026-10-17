/* Liga cada <label> ao campo que vem logo depois dele (irmão), para o leitor de tela dizer o nome do campo.
   Os formulários do Dinheiro, da Casa e da Ana escrevem <label>Valor</label><input> lado a lado, sem "for".
   Roda na abertura e de novo quando a página muda (formulário que abre, tela redesenhada). Não muda o visual. */
(function(){
  var n = 0, espera = 0;
  function ligar(){
    espera = 0;
    var rots = document.querySelectorAll("label:not([for])");
    for (var i = 0; i < rots.length; i++){
      var r = rots[i];
      if (r.querySelector("input,select,textarea")) continue;
      var c = r.nextElementSibling;
      if (!c || !/^(INPUT|SELECT|TEXTAREA)$/.test(c.tagName) || c.type === "hidden" || c.getAttribute("aria-label") || c.getAttribute("aria-labelledby")) continue;
      if (!c.id) c.id = "campo-auto-" + (++n);
      r.setAttribute("for", c.id);
    }
  }
  function agendar(){ if (!espera) espera = setTimeout(ligar, 150); }
  function iniciar(){
    ligar();
    new MutationObserver(agendar).observe(document.body, {childList:true, subtree:true});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
