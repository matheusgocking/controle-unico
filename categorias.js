/* Categorias do Controle Único e a passagem dos nomes antigos para os novos.
   Regra aprovada por Matheus (28/09/2026): a categoria responde "para que foi o dinheiro"; se o
   gasto é fixo, quem diz é a lista de gastos fixos. Vale só no app: as planilhas congeladas
   continuam com os nomes antigos, com ponto final.

   Duas trocas, uma depois da outra:
   1. dos nomes das planilhas para os de 28/09/2026 (categoriaDinheiro, categoriaCasa);
   2. dos de 28/09 para os de 01/10/2026 (novaDinheiro, novaCasa), quando ele pediu categorias
      novas e mais claras para lançar: Alimentação virou Mercado e Restaurante e bar, Transporte
      virou Carro e transporte e Multas e taxas, Compras virou Equipamentos, Fumo virou Tabacaria,
      e nasceram Presentes, Cuidados pessoais e Outros.
   A troca 2 do Dinheiro olha a descrição e roda uma vez só por caderno (marca categorias:2),
   porque Lazer e Saúde continuam existindo: refeita a cada leitura, ela mudaria de lugar o que
   ele lançou de propósito. A da Casa é só troca de nome e pode rodar sempre.
   Este arquivo é público: só regras. */
var Categorias = (function(){
  // os grupos são a ordem em que os botões aparecem no formulário de lançamento
  var GRUPOS_DINHEIRO = [
    ["Dia a dia",  ["Mercado","Restaurante e bar","iFood","Tabacaria"]],
    ["Carro",      ["Carro e transporte","Multas e taxas"]],
    ["Para mim",   ["Saúde","Cuidados pessoais","Lazer","Presentes","Viagens","Equipamentos","Celular e internet"]],
    ["Trabalho",   ["Formação","Clínica: Anúncios","Clínica: Custos"]],
    ["Mais",       ["Família","Outros"]]
  ];
  var GRUPOS_CASA = [
    ["Dia a dia",      ["Mercado","iFood","Restaurante e bar","Tabacaria","Farmácia"]],
    ["Contas da casa", ["Condomínio","Energia","Internet","Gás","IPTU"]],
    ["Casa",           ["Serviços domésticos","Itens da casa","Outros"]]
  ];
  var plano = function(g){ return g.reduce(function(l, x){ return l.concat(x[1]); }, []); };
  // Moradia só serve a gasto fixo (a moradia do mês vem das compras da Casa); Reserva é de
  // aporte e resgate; Outras entradas é a categoria da receita solta
  var DINHEIRO = plano(GRUPOS_DINHEIRO).concat(["Moradia","Reserva","Outras entradas"]);
  var CASA     = plano(GRUPOS_CASA);
  var TIPOS    = ["Despesa","Receita","Aporte","Resgate"];
  var FORMAS   = ["PIX","Crédito","Débito","Dinheiro"];

  // tira o ponto final (as planilhas terminam os valores de lista com ponto)
  function semPonto(s){ return String(s == null ? "" : s).replace(/\.+\s*$/, "").trim(); }
  function chave(s){ return semPonto(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  var tem = function(re, d){ return re.test(d); };

  // 1. nome da planilha (e às vezes a descrição) → nome de 28/09/2026
  function categoriaDinheiro(cat, desc){
    var c = chave(cat), d = chave(desc);
    if (c === "entretenimento"){
      if (tem(/joia|anel|alianca|relogio|notebook|computador|mouse|teclado|monitor|ssd|sdd|home.?studio|microfone|fone|headset|interface|celular/, d)) return "Compras";
      if (tem(/passage|estadia|hotel|hospedagem/, d)) return "Viagens";
      return "Lazer";
    }
    if (c === "pratica clinica"){
      if (tem(/anuncio|trafego|impulsion/, d)) return "Clínica: Anúncios";
      if (tem(/ingresso|passage|congresso|curso|cbpbe|brain|inscri|pos.?gradu|livro|estadia/, d)) return "Formação";
      return "Clínica: Custos";
    }
    if (c === "assinaturas"){
      if (tem(/clube|livro|curso|literatura|filosofia/, d)) return "Formação";
      if (tem(/youtube|netflix|prime|spotify|disney|hbo|globoplay|steam/, d)) return "Lazer";
      return "Clínica: Custos";
    }
    if (c === "contabilidade") return "Clínica: Custos";
    if (c === "gastos mae") return "Família";
    return semPonto(cat);
  }
  function categoriaCasa(cat, desc){
    var c = chave(cat), d = chave(desc);
    if (c === "mercado"){
      if (tem(/farmacia|drogaria|remedio|colirio/, d)) return "Farmácia";
      if (tem(/restaurante/, d)) return "Restaurante";
    }
    return semPonto(cat);
  }

  // 2. nome de 28/09/2026 → nome de 01/10/2026
  function novaDinheiro(cat, desc){
    var d = chave(desc);
    switch (cat){
      case "Alimentação": return tem(/restaurante|\bbar\b|lanche|pizza|hamburg|churras|sushi|cafeteria/, d) ? "Restaurante e bar" : "Mercado";
      case "Ifood": return "iFood";
      case "Lazer":
        if (tem(/fumo|tabaco|\bseda\b|\bcorre\b|isqueiro|piteira/, d)) return "Tabacaria";
        if (tem(/aniversario|presente/, d)) return "Presentes";
        if (tem(/\bbar\b|lanche|restaurante/, d)) return "Restaurante e bar";
        return "Lazer";
      case "Compras": return tem(/alianca|presente|joia|\banel\b/, d) ? "Presentes" : "Equipamentos";
      case "Comunicação": return "Celular e internet";
      case "Saúde": return tem(/cabelo|barbe|estetic|roupa/, d) ? "Cuidados pessoais" : "Saúde";
      case "Transporte": return tem(/multa|pendencia|\btaxa|detran|ipva|licenciamento/, d) ? "Multas e taxas" : "Carro e transporte";
      default: return cat;
    }
  }
  var NOVA_CASA = { "Fumo":"Tabacaria", "Ifood":"iFood", "Restaurante":"Restaurante e bar", "Serviços Domésticos":"Serviços domésticos" };
  function novaCasa(cat){ return NOVA_CASA[cat] || cat; }

  // cópias novas: quem chama decide se guarda. "novas" diz se a troca 2 entra.
  function lancDinheiroCom(l, novas){
    var n = Object.assign({}, l);
    n.tipo = semPonto(l.tipo); n.forma = semPonto(l.forma); n.descricao = semPonto(l.descricao);
    n.categoria = categoriaDinheiro(l.categoria, l.descricao);
    if (novas) n.categoria = novaDinheiro(n.categoria, l.descricao);
    // aporte e resgate são sempre movimento da reserva, seja qual for a categoria escolhida
    // (01/10/2026: um resgate lançado como Moradia não baixava a caixinha)
    if (n.tipo === "Aporte" || n.tipo === "Resgate") n.categoria = "Reserva";
    return n;
  }
  function fixoCom(g, novas){
    var n = Object.assign({}, g);
    n.descricao = semPonto(g.descricao);
    n.categoria = categoriaDinheiro(g.categoria, g.descricao);
    if (novas) n.categoria = novaDinheiro(n.categoria, g.descricao);
    return n;
  }
  // linha que vem de uma planilha (tela Conferir): sempre as duas trocas
  function lancDinheiro(l){ return lancDinheiroCom(l, true); }
  function fixo(g){ return fixoCom(g, true); }
  function lancCasa(l){
    var n = Object.assign({}, l);
    n.descricao = l.descricao === "-" ? "-" : semPonto(l.descricao);
    n.categoria = novaCasa(categoriaCasa(l.categoria, l.descricao));
    return n;
  }
  function cadernoDinheiro(d){
    if (!d) return d;
    var n = Object.assign({}, d), novas = d.categorias !== 2;
    n.lancamentos = (d.lancamentos || []).map(function(l){ return lancDinheiroCom(l, novas); });
    n.gastosFixos = (d.gastosFixos || []).map(function(g){ return fixoCom(g, novas); });
    n.categorias = 2;
    return n;
  }
  // Como no Dinheiro, a troca de nomes roda uma vez só por caderno (marca categorias: 2). Antes rodava
  // a cada abertura e desfazia escolhas feitas depois: uma compra posta em Mercado com "farmácia" na
  // descrição voltava sozinha para Farmácia.
  function cadernoCasa(d){
    if (!d) return d;
    if (d.categorias === 2) return d;
    var n = Object.assign({}, d);
    n.lancamentos = (d.lancamentos || []).map(lancCasa);
    n.categorias = 2;
    return n;
  }

  return { DINHEIRO:DINHEIRO, CASA:CASA, GRUPOS_DINHEIRO:GRUPOS_DINHEIRO, GRUPOS_CASA:GRUPOS_CASA, TIPOS:TIPOS, FORMAS:FORMAS, semPonto:semPonto,
           lancDinheiro:lancDinheiro, fixo:fixo, lancCasa:lancCasa,
           cadernoDinheiro:cadernoDinheiro, cadernoCasa:cadernoCasa };
})();
if (typeof module !== "undefined") module.exports = Categorias;
