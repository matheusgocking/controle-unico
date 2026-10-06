/* Ana (06/10/2026): o × de um gasto fixo ou de uma entrada fixa tira do mês aberto em diante, como no
   app dele. Antes apagava de todos os meses e o mês que já tinha passado mudava de número. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-revisao.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });
const espera = ms => new Promise(r => setTimeout(r, ms));

async function abrir(){
  const ctx = await nav.newContext({ viewport:{ width:390, height:850 }, isMobile:true, hasTouch:true, locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await ctx.addInitScript(s => { if (localStorage.getItem("teste-semeado")) return; for (const k in s) localStorage.setItem(k, s[k]); localStorage.setItem("teste-semeado", "1"); },
    { "controle-unico-ana-cache":JSON.stringify(D.ana), "controle-unico-casa-cache":JSON.stringify(D.casa) });
  const p = await ctx.newPage(); const erros = []; p.on("pageerror", e => erros.push(e.message)); p.on("dialog", d => d.accept());
  await p.clock.install({ time:new Date(D.HOJE) });
  await p.goto(srv.url + "ana.html#mes"); await espera(1200);
  const caderno = () => p.evaluate(() => JSON.parse(localStorage.getItem("controle-unico-ana-cache")));
  return { ctx, p, erros, caderno };
}

test("× da entrada fixa tira de outubro em diante; setembro continua com R$ 2.500", async () => {
  const { ctx, p, erros, caderno } = await abrir();
  const setembroAntes = await p.evaluate(() => entradas("2026-09").total);
  await p.click('[data-apagar="receitasFixas:r1"]'); await espera(300);
  const r = (await caderno()).receitasFixas.find(x => x.id === "r1");
  assert.deepEqual(r.valores, { "2026-09":2500, "2026-10":0 });
  assert.equal(await p.evaluate(() => entradas("2026-09").total), setembroAntes);
  assert.equal(await p.locator('[data-receita="r1"]').count(), 0, "a entrada tirada sai da lista de outubro");
  await p.click('[data-mes="-1"]'); await espera(300);
  assert.equal(await p.inputValue('[data-receita="r1"]'), "2.500,00", "em setembro ela continua");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("× do gasto fixo tira de outubro em diante, e outubro não oferece copiar de volta", async () => {
  const { ctx, p, caderno } = await abrir();
  await p.click('#abas [data-a="gastos"]'); await espera(400);
  await p.click('[data-apagar="gastosFixos:g1"]'); await espera(300);
  assert.deepEqual((await caderno()).gastosFixos[0].valores, { "2026-09":1200, "2026-10":0 });
  assert.equal(await p.locator("#copiarFixos").count(), 0);
  assert.equal(await p.evaluate(() => saidas("2026-09").fixosMes), 1200);
  await ctx.close();
});

test("fixo criado neste mês, sem meses antes, ainda se apaga inteiro", async () => {
  const { ctx, p, caderno } = await abrir();
  await p.click('#abas [data-a="gastos"]'); await espera(400);
  await p.evaluate(() => { cad.gastosFixos.push({ id:"g2", descricao:"Novo", categoria:"Transporte", valores:{ "2026-10":50, "2026-11":50 } }); salvar(); });
  await p.click('[data-apagar="gastosFixos:g2"]'); await espera(300);
  assert.equal((await caderno()).gastosFixos.some(g => g.id === "g2"), false);
  await ctx.close();
});
