/* Quem já saiu da agenda ganha ficha com o histórico do prontuário (10/10/2026, caso do Marcos: inativo,
   pagou, e o app não tinha onde registrar nem mostrar as sessões). Caderno inventado de dados-de-teste.js
   mais uma paciente inativa da planilha; relógio parado em 10/10/2026 (sábado). Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

function comInativa(c){
  c.arquivados = [{ codigo:"T10", nome:"Marta Teste Domingues", status:"Inativo.", valor:500, modalidade:"Mensal.",
                    inicio:"2026-07-03", fim:"2026-09-18", sessoes:6, ciclos:1, aPagar:250 },
                  { codigo:"T11", nome:"Paulo Suspenso Lima", status:"Suspenso.", valor:500, modalidade:"Mensal.",
                    inicio:"2026-08-01", fim:"2026-09-26", sessoes:3, ciclos:1, aPagar:0 }];
  c.arquivadosEm = "2026-10-01";
  c.pagamentos = c.pagamentos.concat([
    { id:"gf1", pacienteId:"", codigo:"T10", nomePlanilha:"Marta Teste Domingues", data:"2026-07-08", valor:250, meio:"", obs:"", origem:"planilha", chavePlanilha:"T10|2026-07-08|250" },
    /* recibo ligado a uma ficha que a leitura da planilha apagou quando ela saiu: o id não existe mais */
    { id:"gf2", pacienteId:"pApagada", codigo:"T10", nomePlanilha:"Marta Teste Domingues", data:"2026-08-10", valor:250, meio:"", obs:"", origem:"planilha", chavePlanilha:"T10|2026-08-10|250" }
  ]);
}
const HISTORICO = [{ codigo:"T10", ate:"2026-10-10", ciclos:[{ inicio:"2026-07-03", cobranca:"mensal", valor:500 }],
  sessoes:[{ data:"2026-07-03", n:1, situacao:"realizada" }, { data:"2026-07-10", n:2, situacao:"realizada" }, { data:"2026-07-17", n:3, situacao:"falta" },
           { data:"2026-07-24", n:4, situacao:"avisou" }, { data:"2026-08-07", n:5, situacao:"realizada" }, { data:"2026-08-14", n:6, situacao:"realizada" },
           { data:"2026-09-18", n:7, situacao:"realizada" }] },
  { codigo:"NAO-EXISTE", ate:"2026-10-10", sessoes:[] }];

async function abrir(largura){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:844 }, isMobile: largura < 700, hasTouch: largura < 700,
    locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date("2026-10-10T12:00:00-03:00") });
  const c = JSON.parse(JSON.stringify(D.clinica));
  comInativa(c);
  await ctx.addInitScript(k => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k);
    localStorage.setItem("teste-semeado", "1");
  }, JSON.stringify(c));
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  p.on("dialog", d => d.accept());
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + "clinica.html");
  await p.waitForTimeout(600);
  return { ctx, p, erros };
}

for (const largura of [390, 1280]) {
  test("Quem saiu ganha ficha com histórico, saldo e pagamento, sem mexer na grade nem nas contas dos outros (" + largura + ")", async () => {
    const { ctx, p, erros } = await abrir(largura);
    const antes = await p.evaluate(() => {
      const meses = [5, 6, 7, 8, 9].map(m => JSON.stringify(numerosDoMes(new Date(2026, m, 1))));
      return { meses, outros:dados.pacientes.map(x => JSON.stringify([devidoDe(x), proximoVencimento(x)])), faltaMarcar:faltaMarcar().length };
    });
    const r = await p.evaluate(h => {
      const n = importarHistoricoFora(h);
      const f = dados.pacientes.find(x => x.codigo === "T10"), susp = dados.pacientes.find(x => x.codigo === "T11");
      const d = devidoDe(f);
      return {
        n, nome:f.nome, nomeCompleto:f.nomeCompleto, cobranca:f.cobranca, valor:f.valor, enc:f.encerramentos, grade:foraDaGrade(f),
        arquivados:dados.arquivados.map(x => x.codigo), suspensoVirouFicha:!!susp,
        pagamentoLigado:pagamentosDe(f.id).length, exato:d.exato, extrato:d.extrato, encerrado:encerradoHoje(f),
        total:totalSessoesDe(f), situ:saldoDe(f).texto,
        ultimas:ultimasSessoesDe(f).map(x => x.texto)
      };
    }, HISTORICO);
    assert.equal(r.n, 1, "o código desconhecido não entra");
    assert.equal(r.nome, "Marta");
    assert.equal(r.nomeCompleto, "Marta Teste Domingues");
    assert.equal(r.cobranca, "mensal");
    assert.deepEqual(r.enc, [{ data:"2026-09-18", tipo:"inativo", origem:"planilha" }]);
    assert.equal(r.grade, true);
    assert.deepEqual(r.arquivados, ["T11"], "a suspensa continua cartão simples");
    assert.equal(r.suspensoVirouFicha, false);
    assert.equal(r.pagamentoLigado, 2, "os recibos antigos da planilha, soltos ou de ficha apagada, passam para a ficha");
    /* 6 sessões cobradas (5 feitas e 1 falta; a que avisou não cobra) a R$ 125 = R$ 750; pagou R$ 250 solto e R$ 250 de uma ficha apagada = R$ 500 */
    assert.equal(r.extrato, true);
    assert.equal(r.exato, 250);
    assert.equal(r.total.feitas, 5);
    assert.equal(r.total.faltas, 1);
    assert.equal(r.encerrado, true);
    assert.match(r.situ, /deve R\$ 250/);
    assert.equal(r.ultimas.length, 7, "as sete linhas do prontuário, a que avisou incluída");

    /* a grade não ganha sessão nenhuma, e nada dos outros mudou */
    const depois = await p.evaluate(() => {
      vencCache = null; devidoCache = null; cacheMes = {};
      return { meses:[5, 6, 7, 8, 9].map(m => JSON.stringify(numerosDoMes(new Date(2026, m, 1)))),
        outros:dados.pacientes.filter(x => x.codigo !== "T10").map(x => JSON.stringify([devidoDe(x), proximoVencimento(x)])),
        faltaMarcar:faltaMarcar().length,
        fantasmas:[5, 6, 7, 8, 9].reduce((t, m) => t + sessoesDoMes(new Date(2026, m, 1)).filter(s => s.paciente.codigo === "T10").length, 0) };
    });
    assert.deepEqual(depois.meses, antes.meses, "o previsto e o recebido dos meses passados não mudam");
    assert.deepEqual(depois.outros, antes.outros.slice(0, depois.outros.length));
    assert.equal(depois.faltaMarcar, antes.faltaMarcar);
    assert.equal(depois.fantasmas, 0);

    /* o cartão em Inativos abre a ficha na aba Pagamento, com o que ele deve */
    await p.evaluate(() => { mostrarView("pacientes"); filtroPacientes = "inativo"; renderPacientes(); });
    const cartao = p.locator("#plist [data-fenc]", { hasText:"Marta Teste Domingues" });
    assert.equal(await cartao.count(), 1);
    assert.match(await cartao.textContent(), /6 sessões cobradas \(5 feitas\)/);
    assert.match(await cartao.textContent(), /Deve R\$ 250/);
    await cartao.click();
    await p.waitForTimeout(200);
    assert.equal(await p.locator("#fi-p-pagamento").isVisible(), true);
    assert.match(await p.textContent("#fi-sub"), /fora da agenda/);
    assert.match(await p.textContent("#fi-situ"), /Deve R\$ 250/);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), largura);

    /* registrar o pagamento de quem saiu: a dívida zera */
    await p.fill("#fr-valor", "250");
    await p.click("#fr-registrar");
    await p.waitForTimeout(200);
    assert.match(await p.textContent("#fi-situ"), /Nada a pagar/);
    await p.click("#fi-fechar");
    const quitado = await p.evaluate(() => { const f = dados.pacientes.find(x => x.codigo === "T10"); devidoCache = null; return devidoDe(f).exato; });
    assert.equal(quitado, 0);

    /* a volta liga a grade na data dela, e o passado continua sem sessão */
    const volta = await p.evaluate(() => {
      const f = dados.pacientes.find(x => x.codigo === "T10");
      const erro = registrarRetorno(f, "2026-10-14"); cacheMes = {}; vencCache = null; devidoCache = null;
      return { erro, gradeDesde:f.gradeDesde, fora:foraDaGrade(f),
        passado:[5, 6, 7, 8].reduce((t, m) => t + sessoesDoMes(new Date(2026, m, 1)).filter(s => s.paciente.codigo === "T10").length, 0),
        naVolta:pacienteEm(f.dia, f.hora, deISO("2026-10-21")) === f };
    });
    assert.equal(volta.erro, "");
    assert.equal(volta.gradeDesde, "2026-10-14");
    assert.equal(volta.fora, false);
    assert.equal(volta.passado, 0);
    assert.equal(volta.naVolta, true);
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}
