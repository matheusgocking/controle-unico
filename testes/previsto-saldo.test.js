/* Previsto do mês igual ao saldo (decisões 2 e 7 da crítica, 09/10/2026): o mensal é pacote de 4
   sessões, então o previsto conta cada sessão que cobra pelo preço do ciclo do dia dela, como o
   saldo. Mês com 5 segundas prevê 5 sessões; "remarcada" e "não haverá" não entram. Cadernos
   inventados de dados-de-teste.js, relógio parado em 04/10/2026. Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

async function abrir(quando = D.HOJE) {
  const ctx = await nav.newContext({ viewport:{ width:1280, height:900 }, locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date(quando) });
  await ctx.addInitScript(k => { localStorage.setItem("controle-unico-clinica-cache", k); }, JSON.stringify(D.clinica));
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + "clinica.html");
  await p.waitForTimeout(600);
  return { ctx, p, erros };
}

/* só o Paciente Mensal (segunda 9h, R$ 700 = R$ 175 a sessão) */
const SO_MENSAL = `dados.pacientes = dados.pacientes.filter(x => x.id === "pA"); cacheMes = {};`;

test("Previsto: mês com 5 segundas prevê 5 sessões do mensal, como o saldo cobra", async () => {
  const { ctx, p, erros } = await abrir();
  const r = await p.evaluate(`(() => { ${SO_MENSAL}
    return { out: numerosDoMes(new Date(2026, 9, 1)).previsto, nov: numerosDoMes(new Date(2026, 10, 1)).previsto }; })()`);
  assert.equal(r.out, 4 * 175, "outubro/2026 tem 4 segundas");
  assert.equal(r.nov, 5 * 175, "novembro/2026 tem 5 segundas: R$ 875, não R$ 700");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Previsto: remarcada e não haverá saem; falta sem aviso fica", async () => {
  const { ctx, p, erros } = await abrir();
  const r = await p.evaluate(`(() => { ${SO_MENSAL}
    marcarSaida("2026-11-02|9", "remarcada"); marcarSaida("2026-11-09|9", "cancelada"); marcarSaida("2026-11-16|9", "falta");
    cacheMes = {}; return numerosDoMes(new Date(2026, 10, 1)).previsto; })()`);
  assert.equal(r, 3 * 175);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Previsto: num mês que já passou, é igual ao que o extrato do saldo cobrou", async () => {
  const { ctx, p, erros } = await abrir("2026-12-01T12:00:00-03:00");
  const r = await p.evaluate(`(() => { ${SO_MENSAL}
    const a = acharPaciente("pA"); a.inicio = "2026-09-01"; marcarSaida("2026-11-09|9", "remarcada"); marcarSaida("2026-11-16|9", "falta");
    cacheMes = {};
    const cobrado = extratoDe(a).linhas.filter(l => l.data.slice(0, 7) === "2026-11").reduce((s, l) => s + l.cobrado, 0);
    return { previsto: numerosDoMes(new Date(2026, 10, 1)).previsto, cobrado }; })()`);
  assert.equal(r.previsto, r.cobrado);
  assert.equal(r.previsto, 4 * 175);
  assert.deepEqual(erros, []);
  await ctx.close();
});
