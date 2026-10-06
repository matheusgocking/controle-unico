/* Testes das telas da Clínica no celular e da aba Pagamentos (06/10/2026). Só tela: nenhuma conta
   muda. Cadernos inventados de dados-de-teste.js, relógio parado em 07/10/2026. Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

/* o Paciente Mensal com histórico até 30/09 e um ciclo pago em 07/09: deve a sessão de 05/10 */
function caderno(){
  const c = JSON.parse(JSON.stringify(D.clinica));
  c.pacientes.forEach(p => { p.historico = { ate:"2026-09-30", sessoes:[] }; });
  c.pacientes[0].historico.sessoes = ["2026-09-07","2026-09-14","2026-09-21","2026-09-28"].map((d, i) => ({ data:d, n:i+1, situacao:"realizada" }));
  c.pagamentos = [{ id:"g1", pacienteId:"pA", data:"2026-09-07", valor:700, meio:"pix", obs:"", receita:"Prática Clínica." }];
  return c;
}
async function abrir(largura){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:844 }, isMobile: largura < 700, hasTouch: largura < 700,
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

test("Celular: Mês, Sessões, Painel e Pagamentos cabem na tela, sem deslizar para o lado", async () => {
  const { ctx, p, erros } = await abrir(390);
  for (const v of ["mes", "sessoes", "painel", "pagamentos", "semana"]) {
    await p.evaluate(v => mostrarView(v), v); await p.waitForTimeout(200);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390, v);
  }
  /* no Mês a pílula fica só com o número e o dia livre fica em branco */
  await p.evaluate(() => mostrarView("mes"));
  assert.equal(await p.locator("#mes .pill .pw").first().isVisible(), false);
  assert.equal(await p.locator("#mes .pill.vazio").first().isVisible(), false);
  /* em Sessões, a situação e o valor de cada sessão aparecem inteiros */
  const caixa = await p.locator("#ss-marcar tbody tr").first().locator("select.situacao").boundingBox();
  assert.ok(caixa.x + caixa.width <= 390, "situação dentro da tela");
  const valor = await p.locator("#ss-marcar tbody tr").first().locator(".sc-cobra").boundingBox();
  assert.ok(valor.x + valor.width <= 390, "valor dentro da tela");
  /* a legenda da semana fica fechada num toque */
  assert.equal(await p.evaluate(() => document.getElementById("leg-semana").open), false);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Computador: a legenda da semana continua aberta e o Mês continua escrevendo \"sessão\"", async () => {
  const { ctx, p, erros } = await abrir(1280);
  assert.equal(await p.evaluate(() => document.getElementById("leg-semana").open), true);
  await p.evaluate(() => mostrarView("mes"));
  assert.equal(await p.locator("#mes .pill .pw").first().isVisible(), true);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Pagamentos: Registrar pagamento abre a ficha na aba Pagamento, sem gravar nada", async () => {
  const { ctx, p, erros } = await abrir(390);
  await p.evaluate(() => mostrarView("pagamentos"));
  const antes = await p.evaluate(() => dados.pagamentos.length);
  await p.click('#pg-tabela [data-recebi="pA"]');
  await p.waitForTimeout(200);
  assert.equal(await p.locator("#fi-p-pagamento").isVisible(), true);
  assert.equal(await p.inputValue("#fr-valor"), "700");
  assert.match(await p.textContent("#fr-previa"), /R\$ 700 paga 4 sessões: 05\/10, 12\/10, 19\/10 e 26\/10/);
  assert.equal(await p.evaluate(() => dados.pagamentos.length), antes, "abrir a ficha não grava pagamento");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Pagamentos: o registrar da aba diz as mesmas sessões que a ficha, e quem paga por sessão vê \"por sessão\"", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const r = await p.evaluate(() => {
    mostrarView("pagamentos"); abrirFormPagamento(true);
    document.getElementById("pg-paciente").value = "pA"; dicaPagamento(true);
    const a = document.getElementById("pg-dica").textContent;
    document.getElementById("pg-paciente").value = "pB"; dicaPagamento(true);
    return { a, b: document.getElementById("pg-dica").textContent, data: document.getElementById("pg-data").value,
      ficha: textoPrevia(acharPaciente("pA"), document.getElementById("pg-data").value, 700),
      cobrancaB: document.querySelector('#pg-tabela [data-recebi="pB"]').closest("tr").querySelector('[data-rot="Cobrança"]').textContent };
  });
  assert.ok(r.a.endsWith(r.ficha), "a mesma prévia da ficha");
  assert.match(r.b, /R\$ 200 por sessão/);
  assert.match(r.cobrancaB, /R\$ 200 por sessão/);
  assert.deepEqual(erros, []);
  await ctx.close();
});
