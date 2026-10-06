/* Cadernos inventados para a revisão de Dinheiro, Casa e Ana (06/10/2026). Nenhum dado de verdade. Hoje é 06/10/2026, 15h. */
const HOJE = "2026-10-06T15:00:00-03:00";
const dinheiro = { versao:1, caderno:"dinheiro", categorias:2,
  lancamentos:[
    { id:"s1", data:"2026-09-05", tipo:"Despesa", descricao:"Curso", categoria:"Formação", forma:"PIX", valor:800 },
    { id:"s2", data:"2026-09-10", tipo:"Receita", descricao:"Aula", categoria:"Outras entradas", forma:"PIX", valor:500 },
    { id:"s3", data:"2026-09-30", tipo:"Resgate", descricao:"Fatura", categoria:"Reserva", forma:"PIX", valor:300 },
    { id:"o1", data:"2026-10-01", tipo:"Despesa", descricao:"Supermercado", categoria:"Mercado", forma:"Crédito", valor:300 },
    { id:"o2", data:"2026-10-02", tipo:"Despesa", descricao:"Condomínio extra", categoria:"Moradia", forma:"PIX", valor:999 },
    { id:"o3", data:"2026-10-03", tipo:"Receita", descricao:"Palestra", categoria:"Outras entradas", forma:"PIX", valor:1000 },
    { id:"o4", data:"2026-10-04", tipo:"Aporte", descricao:"Guardar", categoria:"Reserva", forma:"PIX", valor:500 },
    { id:"o5", data:"2026-10-05", tipo:"Resgate", descricao:"Dentista", categoria:"Reserva", forma:"PIX", valor:200 },
    { id:"o6", data:"2026-10-05", tipo:"Despesa", descricao:"Dentista", categoria:"Saúde", forma:"PIX", valor:150 },
    { id:"o7", data:"2026-10-20", tipo:"Despesa", descricao:"Show (compra marcada)", categoria:"Lazer", forma:"Crédito", valor:50 }
  ],
  gastosFixos:[
    { id:"f1", descricao:"Internet", categoria:"Celular e internet", dia:3, valores:{ "2026-09":120, "2026-10":120, "2026-11":120 } },
    { id:"f2", descricao:"Streaming", categoria:"Lazer", dia:15, valores:{ "2026-09":50, "2026-10":50, "2026-11":50 } },
    { id:"f3", descricao:"Anuidade", categoria:"Formação", dia:null, valores:{ "2026-10":200 } }
  ],
  reserva:{ saldoBase:5000, dataBase:"2026-09-01", meta:10000 }, pendencias:[], limites:{ "Lazer":80 } };
const casa = { versao:1, caderno:"casa", categorias:2, pessoas:["Matheus Teste","Ana Teste"], divisao:0.5,
  lancamentos:[
    { id:"c1", data:"2026-08-03", quem:"Matheus Teste", descricao:"-", categoria:"Mercado", valor:400 },
    { id:"c2", data:"2026-08-10", quem:"Ana Teste", descricao:"-", categoria:"Energia", valor:200 },
    { id:"c3", data:"2026-09-03", quem:"Matheus Teste", descricao:"-", categoria:"Mercado", valor:300 },
    { id:"c4", data:"2026-09-12", quem:"Ana Teste", descricao:"-", categoria:"Gás", valor:100 },
    { id:"c5", data:"2026-10-01", quem:"Matheus Teste", descricao:"Feira", categoria:"Mercado", valor:220 },
    { id:"c6", data:"2026-10-02", quem:"Ana Teste", descricao:"Luz", categoria:"Energia", valor:180 },
    { id:"c7", data:"2026-10-05", quem:"Matheus Teste", descricao:"-", categoria:"Gás", valor:100 }
  ] };
const ana = { versao:1, caderno:"ana", categorias:["Alimentação","Transporte"],
  locais:[{ nome:"Hospital", pagaMesSeguinte:true }, { nome:"Clínica X", pagaMesSeguinte:false }],
  tabelaPlantao:{},
  plantoes:[
    { id:"p1", data:"2026-09-12", periodo:"Diurno", local:"Hospital", tipo:"Regular", valor:900, realizar:true },
    { id:"p2", data:"2026-10-03", periodo:"Noturno", local:"Clínica X", tipo:"Extra", valor:1100, realizar:true },
    { id:"p3", data:"2026-10-10", periodo:"Diurno", local:"Clínica X", tipo:"Regular", valor:700, realizar:false },
    { id:"p4", data:"2026-10-20", periodo:"Diurno", local:"Hospital", tipo:"Regular", valor:900, realizar:true }],
  atendimentos:[{ id:"a1", paciente:"Paciente Inventado", valor:200, data:"2026-10-02" }],
  lancamentos:[{ id:"l1", data:"2026-10-02", descricao:"Almoço", categoria:"Alimentação", forma:"PIX", valor:84.5 }],
  gastosFixos:[{ id:"g1", descricao:"Financiamento", categoria:"Transporte", valores:{ "2026-09":1200, "2026-10":1200, "2026-11":1200 } }],
  receitasFixas:[{ id:"r1", descricao:"Bolsa", valores:{ "2026-09":2500, "2026-10":2500, "2026-11":2500 } }], emprestimos:[], regrasPlantao:[] };
const clinica = JSON.parse(JSON.stringify(require("./dados-de-teste.js").clinica));
clinica.pagamentos = [
  { id:"g1", pacienteId:"pA", data:"2026-10-01", valor:700, meio:"PIX" },
  { id:"g2", pacienteId:"pB", data:"2026-09-20", valor:400, meio:"PIX" },
  { id:"g3", data:"2026-10-02", valor:300, receita:"Pendência.", meio:"PIX" }];
module.exports = { HOJE, dinheiro, casa, ana, clinica };
