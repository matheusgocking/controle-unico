/* Categorias do Controle Único e a passagem dos nomes antigos para os novos (28/09/2026).
   Regra aprovada por Matheus: a categoria responde "para que foi o dinheiro"; se o gasto é
   fixo, quem diz é a lista de gastos fixos. Vale só no app: as planilhas continuam com os
   nomes antigos, com ponto final, e a tela Conferir passa as duas pela mesma troca.
   A troca é refeita a cada leitura e não muda o que já está no nome novo, então tanto faz
   se o caderno do Drive ainda tem os nomes antigos. Este arquivo é público: só regras. */
var Categorias = (function(){
  var DINHEIRO = ["Moradia","Alimentação","Ifood","Transporte","Saúde","Lazer","Compras","Viagens",
                  "Comunicação","Família","Formação","Clínica: Anúncios","Clínica: Custos","Reserva"];
  var CASA     = ["Mercado","Farmácia","Restaurante","Ifood","Fumo","Serviços Domésticos",
                  "Condomínio","Energia","Internet","Gás","IPTU"];
  var TIPOS    = ["Despesa","Receita","Aporte","Resgate"];
  var FORMAS   = ["PIX","Crédito","Débito","Dinheiro"];

  // tira o ponto final (as planilhas terminam os valores de lista com ponto)
  function semPonto(s){ return String(s == null ? "" : s).replace(/\.+\s*$/, "").trim(); }
  function chave(s){ return semPonto(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  var tem = function(re, d){ return re.test(d); };

  // nome antigo (e às vezes a descrição) → nome novo
  function categoriaDinheiro(cat, desc){
    var c = chave(cat), d = chave(desc);
    if (c === "entretenimento"){
      if (tem(/alianca|notebook|computador|mouse|teclado|monitor|ssd|sdd|home.?studio|microfone|fone|headset|interface|celular/, d)) return "Compras";
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
    if (c === "entretenimento") return "Lazer";
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

  // cópias novas: quem chama decide se guarda
  function lancDinheiro(l){
    var n = Object.assign({}, l);
    n.tipo = semPonto(l.tipo); n.forma = semPonto(l.forma); n.descricao = semPonto(l.descricao);
    n.categoria = categoriaDinheiro(l.categoria, l.descricao);
    return n;
  }
  function fixo(g){
    var n = Object.assign({}, g);
    n.descricao = semPonto(g.descricao);
    n.categoria = categoriaDinheiro(g.categoria, g.descricao);
    return n;
  }
  function lancCasa(l){
    var n = Object.assign({}, l);
    n.descricao = l.descricao === "-" ? "-" : semPonto(l.descricao);
    n.categoria = categoriaCasa(l.categoria, l.descricao);
    return n;
  }
  function cadernoDinheiro(d){
    if (!d) return d;
    var n = Object.assign({}, d);
    n.lancamentos = (d.lancamentos || []).map(lancDinheiro);
    n.gastosFixos = (d.gastosFixos || []).map(fixo);
    return n;
  }
  function cadernoCasa(d){
    if (!d) return d;
    var n = Object.assign({}, d);
    n.lancamentos = (d.lancamentos || []).map(lancCasa);
    return n;
  }

  return { DINHEIRO:DINHEIRO, CASA:CASA, TIPOS:TIPOS, FORMAS:FORMAS, semPonto:semPonto,
           lancDinheiro:lancDinheiro, fixo:fixo, lancCasa:lancCasa,
           cadernoDinheiro:cadernoDinheiro, cadernoCasa:cadernoCasa };
})();
if (typeof module !== "undefined") module.exports = Categorias;
