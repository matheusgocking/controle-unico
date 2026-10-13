/* Saldo em sessões na grade, semana a semana, e o Resumo para o paciente (13/10/2026). O saldo de cada
   sessão é o de quando ela chega: o que foi pago até aquele dia menos o que cobrou antes, contando a
   própria sessão; a remarcada não cobra e não desconta. Só mostra: nada é gravado. Cadernos inventados
   de dados-de-teste.js, relógio parado em 07/10/2026 (quarta). Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

/* Paciente Mensal: segunda 9h, R$ 700 por 4 sessões (R$ 175), ficha começando em 01/09, pagou R$ 700 em
   07/09; remarcou 21/09. Os outros saem da grade para não atrapalhar. */
function caderno(){
  const c = JSON.parse(JSON.stringify(D.clinica));
  c.pacientes = c.pacientes.filter(p => p.id === "pA");
  c.pacientes[0].inicio = "2026-09-01";
  c.pagamentos = [{ id:"g1", pacienteId:"pA", data:"2026-09-07", valor:700, meio:"pix", receita:"Prática Clínica." }];
  c.excecoes = { "2026-09-21|9": { tipo:"remarcada" } };
  return c;
}
async function abrir(largura){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:900 }, isMobile: largura < 700, hasTouch: largura < 700,
    locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date("2026-10-07T12:00:00-03:00") });
  await ctx.addInitScript(k => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k);
    localStorage.setItem("teste-semeado", "1");
  }, JSON.stringify(caderno()));
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + "clinica.html");
  await p.waitForTimeout(600);
  return { ctx, p, erros };
}
/* o saldo escrito na célula da segunda 9h da semana daquela data */
const saldoEm = (p, iso) => p.evaluate(iso => {
  const [a, m, d] = iso.split("-").map(Number);
  semana = inicioSemana(new Date(a, m - 1, d)); renderSemana();
  const c = document.querySelector('.cell[data-data="' + iso + '"][data-hora="9"] .dv');
  return c ? c.textContent : "";
}, iso);

test("Grade: o saldo desconta semana a semana, a remarcada não desconta, para trás pelo dia do pagamento", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const antes = await p.evaluate(() => JSON.stringify(dados));
  assert.equal(await saldoEm(p, "2026-09-07"), "saldo 4 sessões");
  assert.equal(await saldoEm(p, "2026-09-14"), "saldo 3 sessões");
  assert.equal(await saldoEm(p, "2026-09-21"), "", "remarcada não mostra saldo");
  assert.equal(await saldoEm(p, "2026-09-28"), "saldo 2 sessões");
  assert.equal(await saldoEm(p, "2026-10-05"), "saldo 1 sessão");
  assert.equal(await saldoEm(p, "2026-10-12"), "sem saldo");
  assert.equal(await saldoEm(p, "2026-10-19"), "deve 1 sessão");
  /* remarcar a de 12/10 empurra o saldo: a de 19/10 passa a ser a primeira sem saldo */
  await p.evaluate(() => { dados.excecoes["2026-10-12|9"] = { tipo:"remarcada" }; devidoCache = null; vencCache = null; });
  assert.equal(await saldoEm(p, "2026-10-19"), "sem saldo");
  /* o pagamento de 06/10 vale dali em diante: a de 05/10 continua com saldo 1 */
  await p.evaluate(() => {
    delete dados.excecoes["2026-10-12|9"];
    dados.pagamentos.push({ id:"g2", pacienteId:"pA", data:"2026-10-06", valor:700, meio:"pix", receita:"Prática Clínica." });
    devidoCache = null; vencCache = null;
  });
  assert.equal(await saldoEm(p, "2026-10-05"), "saldo 1 sessão");
  assert.equal(await saldoEm(p, "2026-10-12"), "saldo 4 sessões");
  await p.evaluate(() => { dados.pagamentos.pop(); devidoCache = null; vencCache = null; });
  assert.equal(await p.evaluate(() => JSON.stringify(dados)), antes, "nada mudou nos dados");
  assert.deepEqual(erros, []);
  await ctx.close();
});

for (const largura of [390, 1280]) {
  test("Resumo para o paciente (" + largura + "px): sessões, combinado, pagamento e situação, sem gravar", async () => {
    const { ctx, p, erros } = await abrir(largura);
    /* abrir a ficha cria "registros" vazio (de antes do resumo): compara o que guarda conta */
    const conta = () => p.evaluate(() => JSON.stringify([dados.pacientes, dados.pagamentos, dados.excecoes]));
    const antes = await conta();
    await p.evaluate(() => { mostrarView("pacientes"); abrirFicha(dados.pacientes[0]); });
    await p.click("#fu-resumo");
    await p.selectOption("#rp-periodo", "tudo");
    const t = await p.textContent("#rp-cartao");
    assert.match(t, /Tudo pago/);
    assert.match(t, /próximo pagamento é na sessão de 12\/10/);
    assert.match(t, /ciclo mensal de R\$ 700/);
    assert.match(t, /21\/09.*Remarcada.*não cobrada/);
    assert.match(t, /Cobrado ao todoR\$ 700/);
    const caixa = await p.$eval("#rp-cartao", e => { const r = e.getBoundingClientRect(); return { l:r.left, r:r.right, w:document.documentElement.clientWidth }; });
    assert.ok(caixa.l >= 0 && caixa.r <= caixa.w, "o cartão cabe na tela");
    const txt = await p.evaluate(() => textoResumo(resumoDoPaciente(dados.pacientes[0], "tudo")));
    assert.match(txt, /• 07\/09: pagamento recebido, R\$ 700/);
    assert.match(txt, /• 14\/09: sessão realizada, R\$ 175 \(paga\)|• 14\/09: sessão, R\$ 175 \(paga\)/);
    assert.match(txt, /\*Tudo pago\*/);
    await p.click("#rp-fechar");
    assert.equal(await p.$("#rp-cartao"), null);
    assert.equal(await conta(), antes, "nada mudou nos dados");
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}
