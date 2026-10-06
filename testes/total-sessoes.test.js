/* Total de sessões no alto da ficha do paciente (06/10/2026). Só mostra: nenhuma conta muda.
   Cadernos inventados de dados-de-teste.js, relógio parado em 07/10/2026. Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

/* Paciente Mensal (segunda, 9h): prontuário até 30/09 com 4 realizadas e 1 falta desde 01/09;
   na agenda, 06/10 marcada realizada. Os outros ficam sem histórico. */
function caderno(){
  const c = JSON.parse(JSON.stringify(D.clinica));
  const pA = c.pacientes.find(p => p.id === "pA");
  pA.historico = { ate:"2026-09-30", sessoes:[
    { data:"2026-09-01", n:1, situacao:"realizada" }, { data:"2026-09-08", n:2, situacao:"falta" },
    { data:"2026-09-15", n:3, situacao:"realizada" }, { data:"2026-09-22", n:4, situacao:"realizada" },
    { data:"2026-09-29", n:5, situacao:"realizada" } ] };
  return c;
}
async function abrir(largura, escuro){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:844 }, isMobile: largura < 700, hasTouch: largura < 700,
    locale:"pt-BR", timezoneId:"America/Sao_Paulo", colorScheme: escuro ? "dark" : "light" });
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

test("Conta: prontuário até a data dele e agenda depois; falta e a confirmar à parte", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const t = await p.evaluate(() => {
    const pa = dados.pacientes.find(x => x.id === "pA");
    const pr = d => d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate();
    /* sem marcar 06/10: fica a confirmar */
    const a = totalSessoesDe(pa);
    return { feitas:a.feitas, faltas:a.faltas, aConfirmar:a.aConfirmar, primeira:pr(a.primeira) };
  });
  assert.deepEqual(t, { feitas:4, faltas:1, aConfirmar:1, primeira:"2026-9-1" });
  assert.deepEqual(erros, []);
  await ctx.close();
});

for (const largura of [390, 1280]) {
  test("Ficha (" + largura + "px): o total aparece ao abrir, sem trocar de aba, e não grava nada", async () => {
    const { ctx, p, erros } = await abrir(largura);
    /* a ficha já criava "registros" vazio ao abrir (antes desta mudança); fora isso, nada muda */
    const semVazio = () => { const c = JSON.parse(JSON.stringify(dados)); if (c.registros && !Object.keys(c.registros).length) delete c.registros; return JSON.stringify(c); };
    const antes = await p.evaluate(semVazio);
    await p.evaluate(() => abrirFicha(dados.pacientes.find(x => x.id === "pA")));
    await p.waitForTimeout(200);
    assert.equal(await p.locator("#fi-p-pagamento").isVisible(), true);
    assert.equal(await p.locator("#fi-total").isVisible(), true);
    assert.equal(await p.textContent("#fi-total .n"), "4");
    assert.match(await p.textContent("#fi-total"), /sessões feitas1 falta cobrada · 1 a confirmar/);
    assert.match(await p.textContent("#fi-sub"), /desde 01\/09\/2026/);
    const caixa = await p.locator("#fi-total").boundingBox();
    assert.ok(caixa.x + caixa.width <= largura, "total dentro da tela");
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), largura);
    assert.equal(await p.evaluate(semVazio), antes, "abrir a ficha não muda o caderno");
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}

test("Paciente sem histórico: conta a agenda e não quebra", async () => {
  const { ctx, p, erros } = await abrir(390);
  await p.evaluate(() => abrirFicha(dados.pacientes.find(x => x.id !== "pA")));
  await p.waitForTimeout(200);
  assert.match(await p.textContent("#fi-total .n"), /^\d+$/);
  assert.deepEqual(erros, []);
  await ctx.close();
});
