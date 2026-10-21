/* Importador do extrato do Nubank (OFX), só no app dele (19/10/2026; aprovado em 01/10/2026).
   Desenho fechado em 15/10/2026 e o que os melhores apps de finanças fazem (pesquisa de 19/10/2026:
   YNAB e Actual casam o lançado à mão com a linha do extrato; Actual e Monarch criam a regra de
   categoria a partir da escolha dele; Copilot põe o que veio do banco numa fila para revisar).
   Este arquivo só lê e classifica: quem grava é a tela, depois que ele confere linha por linha.
   Regras do controle (nota do app, seção 4):
   - fatura: o FITID não é único (o IOF repete o da compra); a chave é FITID + descrição + valor;
   - conta: "Pagamento de fatura" é ignorado (as compras vêm da fatura); "Aplicação RDB" e "Resgate RDB"
     são a caixinha (aporte e resgate da reserva); Pix recebido é da Clínica quando bate com um
     recebimento registrado lá; tudo com "Arthur" fica fora do controle;
   - o resgate do dia 1 a 3 que paga a fatura vai para o último dia do mês anterior (cada mês começa do zero).
   Este arquivo é público: só regras, nenhum dado. */
var Extrato = (function(){
  function semAcento(s){ return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function norm(s){ return semAcento(s).toLowerCase().replace(/\s+/g, " ").trim(); }
  function tag(bloco, nome){
    var m = bloco.match(new RegExp("<" + nome + ">([^<\\r\\n]*)", "i"));
    return m ? m[1].trim() : "";
  }
  function dataOFX(s){ var m = String(s || "").match(/^(\d{4})(\d{2})(\d{2})/); return m ? m[1] + "-" + m[2] + "-" + m[3] : ""; }
  function valorOFX(s){ var n = Number(String(s || "").replace(",", ".")); return isFinite(n) ? Math.round(n * 100) / 100 : 0; }

  /* o texto do arquivo vira {fonte:"fatura"|"conta", inicio, fim, linhas:[{fitid,data,valor,memo}]} */
  function ler(texto){
    texto = String(texto || "");
    var fonte = /<CREDITCARDMSGSRSV1>|<CCSTMTRS>/i.test(texto) ? "fatura" : (/<BANKMSGSRSV1>|<STMTRS>/i.test(texto) ? "conta" : "");
    if (!fonte) throw new Error("Este arquivo não parece um extrato OFX do banco.");
    var linhas = [], re = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi, m;
    while ((m = re.exec(texto))){
      var b = m[1];
      var l = { fitid:tag(b, "FITID"), data:dataOFX(tag(b, "DTPOSTED")), valor:valorOFX(tag(b, "TRNAMT")), memo:tag(b, "MEMO") || tag(b, "NAME"), tipo:tag(b, "TRNTYPE") };
      if (l.data && l.valor) linhas.push(l);
    }
    return { fonte:fonte, inicio:dataOFX(tag(texto, "DTSTART")), fim:dataOFX(tag(texto, "DTEND")), linhas:linhas };
  }
  function chave(l){ return [l.fitid, norm(l.memo), l.valor.toFixed(2)].join("|"); }
  /* a chave curta que se guarda no caderno (sem barra nem dado do extrato): "i" + número */
  function hash(s){ var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return "i" + h.toString(36) + s.length.toString(36); }

  /* a descrição limpa para a lista: sem o prefixo do tipo, sem CPF, CNPJ, agência e conta */
  /* compra no débito pela NuPay (extrato real de 01 a 05/10/2026): "Compra no débito via NuPay - EBW*Meta" vira "EBW*Meta" */
  function descricao(l, fonte){
    var d = String(l.memo || "");
    if (fonte === "conta"){
      d = d.replace(/^(Transfer[eê]ncia (enviada|recebida) pelo Pix|Compra no d[eé]bito(\s+via\s+NuPay)?|Pagamento de boleto efetuado|Transfer[eê]ncia (enviada|recebida)|Reembolso recebido pelo Pix)\s*-?\s*/i, "");
      d = d.split(/\s+-\s+/)[0];
    }
    d = d.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "").replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "").replace(/•+/g, "");
    d = d.replace(/\s+/g, " ").trim();
    return d || String(l.memo || "").slice(0, 60);
  }
  /* a palavra que vira regra: o começo do estabelecimento, sem números ("IFOOD *RESTAURANTE X" -> "ifood") */
  function palavraChave(desc){
    var p = norm(desc).replace(/[*#]/g, " ").replace(/\d+/g, " ").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim().split(" ");
    var util = p.filter(function(w){ return w.length >= 3 && ["dos","das","com","ltda","eireli","pag","pagseguro","mercadopago"].indexOf(w) < 0; });
    return util.slice(0, 2).join(" ");
  }
  /* sugestão de categoria quando não há regra nem histórico: palavras comuns do estabelecimento */
  var PALAVRAS = [
    [/ifood/, "iFood"], [/uber|\b99\b|posto|combust|shell|ipiranga|petrobras|estacion|sem parar|pedagio/, "Carro e transporte"],
    [/detran|multa|ipva|licenciamento/, "Multas e taxas"],
    [/supermerc|mercado|atacad|carrefour|assai|extrabom|epa\b|hortifruti|padaria|acougue/, "Mercado"],
    [/restaurante|lanchonete|\bbar\b|pizza|burger|hamburg|sushi|cafe|cafeteria|boteco|churras/, "Restaurante e bar"],
    [/tabac|charut|fumo/, "Tabacaria"],
    [/farmac|drogaria|droga|pague menos|panvel|laborat|clinica|hospital|medic/, "Saúde"],
    [/barbear|salao|cabelei|estetic|perfum|boticario|natura/, "Cuidados pessoais"],
    [/netflix|spotify|youtube|prime video|disney|hbo|globoplay|steam|cinema|ingresso|show/, "Lazer"],
    [/vivo|claro|\btim\b|oi\b|nucel|internet|icloud|apple\.com/, "Celular e internet"],
    [/hotel|pousada|airbnb|booking|latam|gol linhas|azul linhas|passagem/, "Viagens"],
    [/kalunga|kabum|amazon|mercadolivre|magalu|americanas|terabyte|pichau/, "Equipamentos"],
    [/meta|facebook|instagram ads|facebk/, "Clínica: Anúncios"],
    [/udemy|hotmart|curso|livraria|amazon kindle|kindle/, "Formação"]
  ];
  function sugestaoPorPalavra(desc){
    var d = norm(desc);
    for (var i = 0; i < PALAVRAS.length; i++) if (PALAVRAS[i][0].test(d)) return PALAVRAS[i][1];
    return "";
  }
  function diasEntre(a, b){ return Math.round((new Date(a + "T00:00:00") - new Date(b + "T00:00:00")) / 86400000); }
  function ultimoDiaDoMesAnterior(iso){ var d = new Date(iso + "T00:00:00"); d.setDate(0); return d.toISOString().slice(0, 10); }
  var MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

  /* Classifica cada linha do arquivo. ctx: {din:[lançamentos do Dinheiro], casa:[lançamentos da Casa só dele],
     fixos:[{descricao, categoria, dia, valor}] do mês de cada linha (função fixosDoMes(km)), clinica:[{data, valor}],
     importados:[chaves], regras:{palavra:{onde, categoria}}}
     Devolve {fonte, novos, jaLancados, ignorados, repetidos} e cada item traz a linha e a sugestão. */
  function classificar(ex, ctx){
    ctx = ctx || {};
    var usados = {}, importados = {}, regras = ctx.regras || {}, fonte = ex.fonte;
    /* importados: lista de chaves ou o mapa {hash: data} que o app guarda */
    if (Array.isArray(ctx.importados)) ctx.importados.forEach(function(k){ importados[hash(k)] = true; });
    else Object.keys(ctx.importados || {}).forEach(function(k){ importados[k] = true; });
    var manuais = (ctx.din || []).map(function(l){ return { l:l, onde:"pessoal" }; })
      .concat((ctx.casa || []).map(function(l){ return { l:l, onde:"casa" }; }));
    var pagFatura = ex.linhas.filter(function(l){ return /pagamento de fatura/i.test(l.memo); });
    /* o dinheiro do Arthur passa pela caixinha: a aplicação com o valor de um Pix que ele mandou, e o resgate
       com o valor de um Pix que voltou para ele, também ficam fora (extrato real de 01 a 18/10/2026) */
    var doArthur = ex.linhas.filter(function(l){ return /arthur/.test(norm(l.memo)); }), arthurUsado = {};
    function caixinhaDoArthur(l, aplicacao){
      var par = doArthur.filter(function(a, i){
        return !arthurUsado[i] && (aplicacao ? a.valor > 0 : a.valor < 0) && Math.abs(Math.abs(a.valor) - Math.abs(l.valor)) < 0.005 && Math.abs(diasEntre(a.data, l.data)) <= 31;
      })[0];
      if (par) arthurUsado[doArthur.indexOf(par)] = true;
      return !!par;
    }
    var r = { fonte:fonte, inicio:ex.inicio, fim:ex.fim, novos:[], jaLancados:[], ignorados:[], repetidos:0 };
    /* histórico: a última categoria que ele deu a uma descrição com a mesma palavra-chave */
    var hist = {};
    manuais.forEach(function(x){ var k = palavraChave(x.l.descricao); if (k && x.l.categoria && x.l.categoria !== "Reserva") hist[k] = { onde:x.onde, categoria:x.l.categoria }; });

    ex.linhas.forEach(function(l){
      var k = chave(l);
      if (importados[hash(k)]){ r.repetidos++; return; }
      var memo = norm(l.memo), desc = descricao(l, fonte), item = { chave:k, hash:hash(k), linha:l, data:l.data, valor:Math.abs(l.valor), descricao:desc };
      if (/arthur/.test(memo)){ item.motivo = "Fora do controle (dinheiro do Arthur)."; r.ignorados.push(item); return; }
      if (fonte === "fatura" && l.valor > 0){ item.motivo = /pagamento/.test(memo) ? "Pagamento da fatura (as compras já entram uma a uma)." : "Estorno ou crédito na fatura."; r.ignorados.push(item); return; }
      if (fonte === "conta" && /pagamento de fatura/.test(memo)){ item.motivo = "Pagamento da fatura (as compras vêm da fatura)."; r.ignorados.push(item); return; }
      if (fonte === "conta" && /^(aplicacao|resgate) rdb/.test(memo) && caixinhaDoArthur(l, /^aplicacao/.test(memo))){
        item.tipo = /^aplicacao/.test(memo) ? "Aporte" : "Resgate"; item.categoria = "Reserva"; item.onde = "pessoal"; item.forma = "PIX";
        item.descricao = item.tipo === "Aporte" ? "Aplicação na caixinha" : "Resgate da caixinha";
        item.motivo = "Caixinha com o dinheiro do Arthur (mesmo valor do Pix dele), fora do controle."; r.ignorados.push(item); return; }

      /* tipo e categoria */
      if (fonte === "conta" && /aplicacao rdb/.test(memo)){ item.tipo = "Aporte"; item.categoria = "Reserva"; item.onde = "pessoal"; item.descricao = "Aplicação na caixinha"; }
      else if (fonte === "conta" && /resgate rdb/.test(memo)){
        item.tipo = "Resgate"; item.categoria = "Reserva"; item.onde = "pessoal"; item.descricao = "Resgate da caixinha";
        var dia = Number(l.data.slice(8, 10));
        var paga = pagFatura.filter(function(f){ return Math.abs(Math.abs(f.valor) - Math.abs(l.valor)) < 0.005; })[0];
        if (dia <= 3 && paga){
          var ant = ultimoDiaDoMesAnterior(l.data);
          item.data = ant; item.descricao = "Fatura " + MESES[Number(ant.slice(5, 7)) - 1] + "/" + ant.slice(0, 4) + " (no banco, " + l.data.slice(8, 10) + "/" + l.data.slice(5, 7) + ")";
          item.nota = "Resgate que paga a fatura: datado no último dia do mês anterior, como a regra do app.";
        }
      }
      else if (l.valor > 0){
        /* entrada: Pix de paciente é da Clínica */
        var clin = (ctx.clinica || []).filter(function(g){ return Math.abs(Number(g.valor) - l.valor) < 0.005 && Math.abs(diasEntre(g.data, l.data)) <= 3; })[0];
        if (clin){ item.motivo = "Recebimento de paciente, já registrado na Clínica."; r.ignorados.push(item); return; }
        if (/pix/.test(memo)){ item.motivo = "Pix recebido sem recebimento igual na Clínica: se for de paciente, registre lá; se não, marque para lançar como receita."; item.tipo = "Receita"; item.categoria = "Outras entradas"; item.onde = "pessoal"; r.ignorados.push(item); return; }
        item.tipo = "Receita"; item.categoria = "Outras entradas"; item.onde = "pessoal";
      } else {
        item.tipo = "Despesa";
        var pc = palavraChave(desc), regra = regras[pc], h = hist[pc];
        if (regra){ item.onde = regra.onde; item.categoria = regra.categoria; item.origem = "regra"; }
        else if (h){ item.onde = h.onde; item.categoria = h.categoria; item.origem = "histórico"; }
        else { item.onde = "pessoal"; item.categoria = sugestaoPorPalavra(desc); item.origem = item.categoria ? "palavra" : ""; }
        item.palavra = pc;
      }
      item.forma = fonte === "fatura" ? "Crédito" : (/debito/.test(memo) ? "Débito" : "PIX");

      /* gasto fixo do mês, que já conta: mesmo valor e dia perto */
      var fixos = ctx.fixosDoMes ? ctx.fixosDoMes(item.data.slice(0, 7)) : [];
      var fx = item.tipo === "Despesa" && fixos.filter(function(g){ return Math.abs(g.valor - item.valor) < 0.005 && (!g.dia || Math.abs(Number(item.data.slice(8, 10)) - g.dia) <= 3); })[0];
      if (fx){ item.motivo = "Gasto fixo do mês (" + fx.descricao + "), que já conta."; r.ignorados.push(item); return; }

      /* já lançado à mão: mesmo valor, até 2 dias de diferença, cada lançamento casa uma vez */
      var par = manuais.filter(function(x){
        return !usados[x.l.id] && Math.abs(Number(x.l.valor) - item.valor) < 0.005 && Math.abs(diasEntre(x.l.data, item.data)) <= 2 &&
          (item.tipo === "Despesa" ? (x.onde === "casa" || x.l.tipo === "Despesa") : x.l.tipo === item.tipo);
      })[0];
      if (par){ usados[par.l.id] = true; item.par = { onde:par.onde, id:par.l.id, data:par.l.data, descricao:par.l.descricao, categoria:par.l.categoria }; r.jaLancados.push(item); return; }
      r.novos.push(item);
    });
    return r;
  }
  return { ler:ler, chave:chave, hash:hash, descricao:descricao, palavraChave:palavraChave, sugestaoPorPalavra:sugestaoPorPalavra, classificar:classificar };
})();
if (typeof module !== "undefined") module.exports = Extrato;
