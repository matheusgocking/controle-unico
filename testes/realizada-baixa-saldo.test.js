/* Marcar realizada baixa o saldo na hora (21/10/2026, "quando eu coloco realizado no app, não está baixando
   os saldos"). A realizada e a falta cobram assim que ele marca, mesmo antes do horário passar, e na grade
   a sessão já feita mostra o que sobrou depois dela, o mesmo número da ficha. Cadernos inventados de
   dados-de-teste.js, relógio parado em 07/10/2026 (quarta), 12h. Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

/* Paciente Mensal: segunda 9h, R$ 700 por 4 sessões (R$ 175), ficha começando em 01/09, pagou R$ 700 em 07/09 */
function caderno(){
  const c = JSON.parse(JSON.stringify(D.clinica));
  c.pacientes = c.pacientes.filter(p => p.id === "pA");
  c.pacientes[0].inicio = "2026-09-01";
  c.pagamentos = [{ id:"g1", pacienteId:"pA", data:"2026-09-07", valor:700, meio:"pix", receita:"Prática Clínica." }];
  c.excecoes = {};
  return c;
}
async function abrir(hora){
  const ctx = await nav.newContext({ viewport:{ width:1280, height:900 }, locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date(hora || "2026-10-07T12:00:00-03:00") });
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
const saldoEm = (p, iso) => p.evaluate(iso => {
  const [a, m, d] = iso.split("-").map(Number);
  semana = inicioSemana(new Date(a, m - 1, d)); renderSemana();
  const c = document.querySelector('.cell[data-data="' + iso + '"][data-hora="9"] .dv');
  return c ? c.textContent : "";
}, iso);
const ficha = p => p.evaluate(() => { devidoCache = null; vencCache = null; return saldoDe(dados.pacientes[0]).texto; });

test("Realizada baixa o saldo da grade e da ficha, mesmo antes do horário passar", async () => {
  const { ctx, p, erros } = await abrir();
  /* 07/09, 14/09, 21/09, 28/09 e 05/10 já passaram: 5 sessões para 4 pagas */
  assert.equal(await ficha(p), "deve R$ 175");
  /* a de 05/10, sem marca, conta a si mesma; marcada realizada, mostra o que sobrou depois dela */
  assert.equal(await saldoEm(p, "2026-09-28"), "saldo 1 sessão");
  await p.evaluate(() => { dados.excecoes["2026-09-28|9"] = { tipo:"realizada" }; devidoCache = null; vencCache = null; });
  assert.equal(await saldoEm(p, "2026-09-28"), "sem saldo", "a última paga, feita, não deixa saldo");
  await p.evaluate(() => { dados.excecoes["2026-09-07|9"] = { tipo:"realizada" }; devidoCache = null; vencCache = null; });
  assert.equal(await saldoEm(p, "2026-09-07"), "saldo 3 sessões", "depois da primeira, sobram 3");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Realizada de hoje cobra antes de o horário acabar", async () => {
  /* segunda 12/10, 9h30: a sessão das 9h está acontecendo; sem marca, só conta às 10h */
  const { ctx, p, erros } = await abrir("2026-10-12T09:30:00-03:00");
  await p.evaluate(() => {
    dados.pagamentos.push({ id:"g2", pacienteId:"pA", data:"2026-10-06", valor:700, meio:"pix", receita:"Prática Clínica." });
  });
  assert.equal(await ficha(p), "saldo: 3 sessões");
  await p.evaluate(() => { dados.excecoes["2026-10-12|9"] = { tipo:"realizada" }; });
  assert.equal(await ficha(p), "saldo: 2 sessões", "a realizada cobra assim que é marcada");
  assert.equal(await saldoEm(p, "2026-10-12"), "saldo 2 sessões", "grade e ficha com o mesmo número");
  assert.equal(await saldoEm(p, "2026-10-19"), "saldo 2 sessões", "a seguinte, sem marca, conta a si mesma");
  /* desfazer a marca devolve a sessão */
  await p.evaluate(() => { delete dados.excecoes["2026-10-12|9"]; });
  assert.equal(await ficha(p), "saldo: 3 sessões");
  assert.deepEqual(erros, []);
  await ctx.close();
});
