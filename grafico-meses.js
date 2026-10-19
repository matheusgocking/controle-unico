/* Gráfico "entrou e saiu, mês a mês" (pedido de Matheus, 01/10/2026), usado no Dinheiro dele
   (app.html) e no Mês da Ana (ana.html). Duas barras por mês, com o valor ao passar o mouse ou
   tocar, e o mês aberto destacado; clicar num mês leva a tela para ele (data-irmes).
   serie: [{ k:"2026-09", entrou:1234.5, saiu:987.6 }], do mês mais antigo ao mais novo.
   Usa as cores da página (--c2, --c3, --line, --muted, --text). Este arquivo é público: só desenho. */
var GraficoMeses = (function(){
  var CURTOS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  var din = function(v){ return (Number(v) || 0).toLocaleString("pt-BR", { style:"currency", currency:"BRL" }); };
  var mil = function(v){ return v >= 1000 ? (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits:1 }) + " mil" : String(Math.round(v)); };
  // a sobra do mês, curta, para caber em cima das duas barras: +1,2 mil, −350, +12 mil
  var curto = function(v){
    var a = Math.abs(v), t = a >= 10000 ? Math.round(a / 1000) + " mil" : a >= 1000 ? (a / 1000).toLocaleString("pt-BR", { maximumFractionDigits:1 }) + " mil" : String(Math.round(a));
    return (v < -0.5 ? "−" : "+") + t;
  };

  // teto redondo para o eixo: 1, 2, 2,5 ou 5 vezes uma potência de dez
  function teto(v){
    if (v <= 0) return 100;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  function desenhar(serie, opcoes){
    opcoes = opcoes || {};
    var rotE = opcoes.entrou || "Entrou", rotS = opcoes.saiu || "Saiu";
    if (!serie.some(function(m){ return m.entrou > 0.005 || m.saiu > 0.005; })) return '<p class="vazio">Ainda não há meses com lançamento.</p>';
    // no celular cabem seis meses sem rolar de lado (o eixo ficava escondido); a lista embaixo traz todos
    var estreito = window.matchMedia && window.matchMedia("(max-width:700px)").matches, cortou = estreito && serie.length > 6;
    if (cortou) serie = serie.slice(-6);
    // topo maior: em cima de cada mês vai a sobra (ou o que faltou), o número que mais importa (19/10/2026)
    var W = 44 * serie.length + 56, H = 232, esq = 50, topo = 30, base = 188;
    var max = teto(Math.max.apply(null, serie.map(function(m){ return Math.max(m.entrou, m.saiu); })));
    var y = function(v){ return base - (v / max) * (base - topo); };
    var grade = [0, 0.5, 1].map(function(f){
      var yy = y(max * f).toFixed(1);
      return '<line x1="' + esq + '" x2="' + (W - 4) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--line)" stroke-width="1"/>' +
             '<text x="' + (esq - 6) + '" y="' + (Number(yy) + 4) + '" text-anchor="end" class="gm-eixo">' + mil(max * f) + '</text>';
    }).join("");
    var grupos = serie.map(function(m, i){
      var x = esq + 6 + i * 44, mes = Number(m.k.slice(5, 7)) - 1, sel = m.k === opcoes.aberto;
      var sobra = m.sobra != null ? m.sobra : m.entrou - m.saiu;   // quem manda a sobra (o Dinheiro, com a reserva) é quem sabe a conta
      var dica = CURTOS[mes] + "/" + m.k.slice(0, 4) + ": " + rotE.toLowerCase() + " " + din(m.entrou) + ", " + rotS.toLowerCase() + " " + din(m.saiu) +
                 " (" + (sobra < 0 ? "faltou " + din(-sobra) : "sobrou " + din(sobra)) + ")";
      return '<g class="gm-mes' + (sel ? " on" : "") + '" data-irmes="' + m.k + '" tabindex="0" role="button" aria-label="' + dica + '">' +
        '<title>' + dica + '</title>' +
        '<rect class="gm-fundo" x="' + (x - 3) + '" y="' + topo + '" width="38" height="' + (H - topo - 4) + '" rx="5"/>' +
        '<rect x="' + x + '" y="' + y(m.entrou).toFixed(1) + '" width="14" height="' + Math.max(base - y(m.entrou), m.entrou > 0.005 ? 1.5 : 0).toFixed(1) + '" rx="2" fill="var(--c3)"/>' +
        '<rect x="' + (x + 17) + '" y="' + y(m.saiu).toFixed(1) + '" width="14" height="' + Math.max(base - y(m.saiu), m.saiu > 0.005 ? 1.5 : 0).toFixed(1) + '" rx="2" fill="var(--c2)"/>' +
        (m.entrou > 0.005 || m.saiu > 0.005 ? '<text x="' + (x + 15.5) + '" y="' + (Math.min(y(m.entrou), y(m.saiu)) - 6).toFixed(1) + '" text-anchor="middle" class="gm-sobra ' + (sobra < -0.5 ? "neg" : "pos") + '">' + curto(sobra) + '</text>' : '') +
        '<text x="' + (x + 15.5) + '" y="' + (base + 16) + '" text-anchor="middle" class="gm-rot">' + CURTOS[mes] + '</text>' +
        (mes === 0 || i === 0 ? '<text x="' + (x + 15.5) + '" y="' + (base + 30) + '" text-anchor="middle" class="gm-eixo">' + m.k.slice(0, 4) + '</text>' : '') +
        '</g>';
    }).join("");
    return '<style>.gm-rolar{overflow-x:auto}.gm-rolar svg{display:block;margin:0 auto;font-family:inherit}' +
      '.gm-eixo{fill:var(--muted);font-size:11px}.gm-rot{fill:var(--muted);font-size:12px}' +
      '.gm-sobra{font-size:10.5px;font-weight:600;font-variant-numeric:tabular-nums}.gm-sobra.pos{fill:var(--pos)}.gm-sobra.neg{fill:var(--neg)}' +
      '.gm-mes{cursor:pointer}.gm-mes:focus-visible{outline:none}.gm-mes:focus-visible .gm-fundo{stroke:var(--accent);stroke-width:2}' +
      '.gm-fundo{fill:transparent}.gm-mes:hover .gm-fundo,.gm-mes:focus-visible .gm-fundo{fill:var(--surface-2)}' +
      '.gm-mes.on .gm-fundo{fill:var(--surface-2);stroke:var(--line)}.gm-mes.on .gm-rot{fill:var(--text);font-weight:700}' +
      '.gm-leg{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--muted);margin:0 0 8px}' +
      '.gm-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px}</style>' +
      '<p class="gm-leg"><span><i style="background:var(--c3)"></i>' + rotE + '</span><span><i style="background:var(--c2)"></i>' + rotS + '</span><span>Em cima: o que sobrou (+) ou faltou (−)</span></p>' +
      '<div class="gm-rolar"><svg width="' + W + '" height="' + H + '" style="max-width:100%;height:auto" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + rotE + ' e ' + rotS.toLowerCase() + ' em cada mês">' +
      grade + grupos + '</svg></div>' + (cortou ? '<p class="gm-leg" style="margin-top:6px">Aqui, os últimos 6 meses. A lista embaixo traz todos.</p>' : '');
  }

  // os n meses que terminam no mês de hoje (ou no mês aberto, se ele for depois)
  function meses(n, aberto){
    var d = new Date(), k = function(x){ return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0"); };
    var fim = aberto && aberto > k(d) ? new Date(Number(aberto.slice(0, 4)), Number(aberto.slice(5, 7)) - 1, 1) : new Date(d.getFullYear(), d.getMonth(), 1);
    var lista = [];
    for (var i = n - 1; i >= 0; i--) lista.push(k(new Date(fim.getFullYear(), fim.getMonth() - i, 1)));
    return lista;
  }

  // depois de pôr o gráfico na tela: rola até o mês mais novo e liga o clique de cada mês
  function ligar(raiz, aoEscolher){
    raiz.querySelectorAll(".gm-rolar").forEach(function(r){ r.scrollLeft = r.scrollWidth; });
    raiz.querySelectorAll("[data-irmes]").forEach(function(g){
      var ir = function(){ aoEscolher(g.getAttribute("data-irmes")); };
      g.onclick = ir;
      g.onkeydown = function(e){ if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir(); } };
    });
  }

  return { desenhar:desenhar, meses:meses, ligar:ligar };
})();
