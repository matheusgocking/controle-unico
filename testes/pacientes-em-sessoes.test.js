/* Pacientes virou a terceira chave de Sessões (Semana, Mês, Pacientes), decisão dele em 09/10/2026.
   Só tela: nenhuma conta muda e nada é gravado ao trocar de chave. Cadernos inventados de
   dados-de-teste.js. Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

async function abrir(largura){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:844 }, isMobile: largura < 700, hasTouch: largura < 700,
    locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date("2026-10-07T12:00:00-03:00") });
  await ctx.addInitScript(k => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k);
    localStorage.setItem("teste-semeado", "1");
  }, JSON.stringify(D.clinica));
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + "clinica.html");
  await p.waitForTimeout(600);
  return { ctx, p, erros };
}
const visivel = (p, sel) => p.evaluate(s => !document.querySelector(s).closest(".hidden"), sel);

for (const largura of [390, 1280]) {
  test("Pacientes dentro de Sessões (" + largura + "px): chave própria, mesmos caminhos, sem gravar nada", async () => {
    const { ctx, p, erros } = await abrir(largura);
    const copia = () => p.evaluate(() => { const c = JSON.parse(JSON.stringify(dados)); delete c.registros; return JSON.stringify(c); });
    const antes = await copia();
    /* no alto não há mais aba Pacientes; em Sessões, três chaves */
    assert.equal(await p.locator(".top .tabs .tab[data-view=pacientes]").count(), 0);
    assert.deepEqual(await p.$$eval("#subvista .tab", l => l.map(x => x.textContent)), ["Semana", "Mês", "Pacientes"]);
    /* tocar em Pacientes troca a grade e a lista de sessões pela lista de pacientes */
    await p.click("#subvista .tab[data-sub=pacientes]");
    assert.equal(await visivel(p, "#v-pacientes"), true);
    assert.equal(await visivel(p, "#subvista"), true);
    for (const s of ["#v-semana", "#v-mes", "#v-sessoes"]) assert.equal(await visivel(p, s), false, s);
    assert.equal(await p.getAttribute("#subvista .tab[data-sub=pacientes]", "aria-selected"), "true");
    assert.equal(await p.getAttribute(".top .tab[data-view=sessoes]", "aria-selected"), "true");
    assert.ok(await p.locator("#plist .pcard").count() > 0);
    for (const s of ["#add-paciente", "#trazer-dados", "#pfiltros"]) assert.equal(await visivel(p, s), true, s);
    if (process.env.CAPTURAS) await p.screenshot({ path: process.env.CAPTURAS + "/pacientes-" + largura + ".png" });
    /* sem rolagem de lado no celular */
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    /* outra aba e de volta em Sessões: continua em Pacientes */
    await p.click(".top .tab[data-view=painel]");
    assert.equal(await visivel(p, "#subvista"), false);
    assert.equal(await visivel(p, "#v-pacientes"), false);
    await p.click(".top .tab[data-view=sessoes]");
    assert.equal(await visivel(p, "#v-pacientes"), true);
    /* quem leva à lista Falta marcar sai de Pacientes e vai para a agenda */
    await p.evaluate(() => abrirDoTudo({ tipo:"marcar" }));
    assert.equal(await visivel(p, "#v-semana"), true);
    assert.equal(await visivel(p, "#v-sessoes"), true);
    assert.equal(await visivel(p, "#v-pacientes"), false);
    /* pedir "pacientes" por código continua abrindo a lista, e a ficha abre dela */
    await p.evaluate(() => mostrarView("pacientes"));
    assert.equal(await visivel(p, "#v-pacientes"), true);
    await p.locator("#plist .pcard").first().click();
    assert.ok(await p.locator(".overlay").count() > 0);
    /* a Clínica sempre abre na agenda: Pacientes não fica guardada */
    assert.notEqual(await p.evaluate(() => localStorage.getItem("cu-clinica-sub")), "pacientes");
    await p.keyboard.press("Escape");
    await p.click("#subvista .tab[data-sub=mes]");
    if (process.env.CAPTURAS) await p.screenshot({ path: process.env.CAPTURAS + "/mes-" + largura + ".png" });
    assert.equal(await visivel(p, "#v-mes"), true);
    assert.equal(await visivel(p, "#v-pacientes"), false);
    /* abrir a ficha cria a gaveta vazia do prontuário, como sempre fez; o resto fica igual */
    assert.equal(await copia(), antes);
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}
