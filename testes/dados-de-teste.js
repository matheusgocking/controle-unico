/* Cadernos inventados para os testes. Nenhum dado de verdade. Hoje é 04/10/2026, meio-dia. */
const HOJE = "2026-10-04T12:00:00-03:00";

const dinheiro = {
  versao:1, caderno:"dinheiro", categorias:2,
  lancamentos: [
    { id:"l1", data:"2026-10-01", tipo:"Despesa", descricao:"Supermercado", categoria:"Mercado", forma:"Crédito", valor:312.40 },
    { id:"l2", data:"2026-10-02", tipo:"Receita", descricao:"Aula", categoria:"Outras entradas", forma:"PIX", valor:4200 },
    { id:"l3", data:"2026-10-02", tipo:"Despesa", descricao:"Gasolina", categoria:"Carro e transporte", forma:"Débito", valor:180 },
    { id:"l4", data:"2026-10-03", tipo:"Despesa", descricao:"Jantar", categoria:"Restaurante e bar", forma:"Crédito", valor:96.50 },
    { id:"l5", data:"2026-10-03", tipo:"Despesa", descricao:"Farmácia", categoria:"Saúde", forma:"PIX", valor:58.90 },
    { id:"l6", data:"2026-10-04", tipo:"Aporte", descricao:"Reserva", categoria:"Reserva", forma:"PIX", valor:500 },
    { id:"l7", data:"2026-09-10", tipo:"Despesa", descricao:"Curso", categoria:"Formação", forma:"Crédito", valor:890 }
  ],
  gastosFixos: [
    { id:"g1", descricao:"Aluguel", categoria:"Moradia", dia:5, valores:{ "2026-09":1800, "2026-10":1800, "2026-11":1800, "2026-12":1800 } },
    { id:"g2", descricao:"Internet", categoria:"Celular e internet", dia:15, valores:{ "2026-10":120, "2026-11":120, "2026-12":120 } },
    { id:"g3", descricao:"Streaming", categoria:"Lazer", dia:2, valores:{ "2026-10":110, "2026-11":110, "2026-12":110 } }
  ],
  reserva:{ saldoBase:8000, dataBase:"2026-09-30", meta:20000 }, pendencias:[]
};

const casa = {
  versao:1, caderno:"casa", categorias:2, pessoas:["Pessoa Um","Pessoa Dois"], divisao:0.5,
  lancamentos: [
    { id:"c1", data:"2026-10-01", quem:"Pessoa Um", descricao:"Feira", categoria:"Mercado", valor:220 },
    { id:"c2", data:"2026-10-02", quem:"Pessoa Dois", descricao:"Luz", categoria:"Energia", valor:180 },
    { id:"c3", data:"2026-10-03", quem:"Pessoa Um", descricao:"Gás", categoria:"Gás", valor:120 }
  ]
};

/* Clínica: um mensal na segunda, um avulso na terça e dois quinzenais alternando a quarta às 10h. */
const clinica = {
  versao:2,
  config:{ horaInicio:7, horaFim:20, mensal:700, avulsa:200, meta:8000, custos:0, imposto:0, falta:8, horas:33, semanaRefQuinzenal:"2026-09-28T03:00:00.000Z" },
  pacientes: [
    { id:"pA", codigo:"T001", nome:"Paciente Mensal", freq:"semanal", cobranca:"mensal", valor:700, dia:1, hora:9 },
    { id:"pB", codigo:"T002", nome:"Paciente Avulso", freq:"semanal", cobranca:"avulsa", valor:200, dia:2, hora:9 },
    { id:"pC", codigo:"T003", nome:"Quinzenal Par", freq:"quinzenal", cobranca:"quinzenal", valor:400, dia:3, hora:10, semanaRef:"2026-09-28" },
    { id:"pD", codigo:"T004", nome:"Quinzenal Ímpar", freq:"quinzenal", cobranca:"quinzenal", valor:400, dia:3, hora:10, semanaRef:"2026-10-05" }
  ],
  blocos:[], pagamentos:[], arquivados:[], formulacoes:{}, excecoes:{}
};

module.exports = { HOJE, dinheiro, casa, clinica };
