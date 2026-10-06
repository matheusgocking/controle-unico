/* A troca de período que acompanha a rolagem e o botão + com a escolha entre lançamento e
   recebimento (pedido dele, 06/10/2026). Abrem o app num Chromium sem tela, com os cadernos
   inventados de dados-de-teste.js e o relógio parado em 04/10/2026. Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });
const espera = ms => new Promise(r => setTimeout(r, ms));

async function abrir(pagina, largura, semente){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:844 }, isMobile: largura < 700, hasTouch: largura < 700,
    locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await ctx.addInitScript(s => {
    if (localStorage.getItem("teste-semeado")) return;
    for (const k in s) localStorage.setItem(k, s[k]);
    localStorage.setItem("teste-semeado", "1");
  }, semente || {
    "controle-unico-dinheiro-cache": JSON.stringify(D.dinheiro), "controle-unico-casa-cache": JSON.stringify(D.casa),
    "controle-unico-clinica-cache": JSON.stringify(D.clinica) });
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  p.on("dialog", d => d.dismiss());
  await p.clock.install({ time: new Date(D.HOJE) });
  await p.goto(srv.url + pagina);
  await espera(1200);
  return { ctx, p, erros };
}
const quadro = (p, nome) => p.frames().find(f => f.url().includes(nome));
const copia = f => f.evaluate(() => {
  const c = document.querySelector(".cu-periodo");
  return { on: c.classList.contains("on"), nome: c.querySelector("span").textContent };
});

test("Dinheiro: o mês acompanha a rolagem e as setas da cópia trocam o mês", async () => {
  const { ctx, p: casca, erros } = await abrir("index.html#carteira", 390);
  const p = quadro(casca, "app.html");
  assert.equal((await copia(p)).on, false, "com a barra do mês à vista, a cópia fica escondida");
  await p.evaluate(() => window.scrollTo(0, 900)); await espera(300);
  assert.deepEqual(await copia(p), { on:true, nome:"Outubro 2026" });
  await p.click(".cu-periodo button[aria-label='Mês anterior']"); await espera(300);
  assert.equal(await p.textContent("#tela .mes h1"), "setembro 2026", "a seta da cópia aperta a seta de verdade");
  await p.evaluate(() => window.scrollTo(0, 900)); await espera(300);
  assert.equal((await copia(p)).nome, "Setembro 2026");
  await p.evaluate(() => window.scrollTo(0, 0)); await espera(300);
  assert.equal((await copia(p)).on, false);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Clínica: a semana acompanha a rolagem, e embaixo vale o mês da lista de sessões", async () => {
  const { ctx, p, erros } = await abrir("clinica.html", 1280);
  await p.evaluate(() => window.scrollTo(0, 500)); await espera(300);
  assert.deepEqual(await copia(p), { on:true, nome:"4 de outubro a 10 de outubro" });
  await p.click(".cu-periodo button[aria-label='Próxima semana']"); await espera(300);
  assert.equal(await p.textContent("#range-txt"), "11 de outubro a 17 de outubro");
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await espera(300);
  assert.deepEqual(await copia(p), { on:true, nome:"Outubro de 2026" });
  // em Pagamentos vale a barra de Pagamentos
  await p.setViewportSize({ width:1280, height:500 });
  await p.evaluate(() => { mostrarView("pagamentos"); abrirFormPagamento(true); window.scrollTo(0, document.body.scrollHeight); }); await espera(300);
  const c = await copia(p);
  assert.equal(c.on, true);
  await p.click(".cu-periodo button[aria-label='Mês anterior']"); await espera(300);
  assert.equal((await p.textContent("#pg-titulo")).toLowerCase(), "setembro de 2026");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Ana: a cópia do mês fica logo abaixo da barra de cima dela", async () => {
  const ana = { versao:1, caderno:"ana", categorias:["Alimentação"], locais:[], tabelaPlantao:{}, plantoes:[], atendimentos:[],
    lancamentos:Array.from({ length:30 }, (_, i) => ({ id:"l" + i, data:"2026-10-02", descricao:"", categoria:"Alimentação", forma:"PIX", valor:10 + i })),
    gastosFixos:[], receitasFixas:[], emprestimos:[] };
  const { ctx, p, erros } = await abrir("ana.html#gastos", 375, { "controle-unico-ana-cache": JSON.stringify(ana), "controle-unico-casa-cache": JSON.stringify(D.casa) });
  await p.evaluate(() => { document.getElementById("conteudo").scrollTop = 2000; }); await espera(300);
  const r = await p.evaluate(() => ({ topo: document.getElementById("conteudo").getBoundingClientRect().top,
    copia: document.querySelector(".cu-periodo").getBoundingClientRect().top, on: document.querySelector(".cu-periodo").classList.contains("on") }));
  assert.equal(r.on, true);
  assert.ok(r.copia >= r.topo, "a cópia não fica por cima da barra da Ana");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Computador: o + escolhe entre recebimento e lançamento e abre o formulário de sempre", async () => {
  const { ctx, p, erros } = await abrir("index.html", 1280);
  assert.equal(await p.isVisible("#mais-bt"), true);
  await p.click("#mais-bt");
  assert.equal(await p.isVisible("#mais-lista"), true);
  await p.click("[data-mais=recebimento]"); await espera(1500);
  assert.equal(await p.evaluate(() => location.hash), "#clinica");
  const k = quadro(p, "clinica.html");
  assert.equal(await k.evaluate(() => !document.getElementById("pg-form").classList.contains("hidden")), true);
  assert.equal(await k.evaluate(() => !document.getElementById("v-pagamentos").classList.contains("hidden")), true);
  assert.equal(await p.isVisible("#mais-lista"), false);

  await p.click("#mais-bt"); await p.click("[data-mais=lancamento]"); await espera(1200);
  assert.equal(await p.evaluate(() => location.hash), "#carteira", "da Clínica, o lançamento vai para a Carteira");
  assert.equal(await quadro(p, "app.html").evaluate(() => !!document.querySelector(".lanc-form")), true);

  // na Casa, o lançamento abre o formulário da Casa
  await p.click("[data-v=casa]"); await espera(500);
  await p.click("#mais-bt"); await p.click("[data-mais=lancamento]"); await espera(800);
  assert.deepEqual(await quadro(p, "app.html").evaluate(() => [location.hash, !!document.querySelector(".lanc-form")]), ["#casa", true]);
  // Esc fecha a escolha
  await p.click("#mais-bt"); await p.keyboard.press("Escape");
  assert.equal(await p.isVisible("#mais-lista"), false);
  // na Conferência não há +
  await p.click("#menu summary"); await p.click("#conferir"); await espera(500);
  assert.equal(await p.isVisible("#mais-bt"), false);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Celular: o + da tela abre a mesma escolha; na Clínica aparece o + da casca", async () => {
  const { ctx, p, erros } = await abrir("index.html", 390);
  assert.equal(await p.isVisible("#mais-bt"), false, "na Tudo o + é o da própria tela");
  const app = quadro(p, "app.html");
  await app.evaluate(() => window.scrollTo(0, 1500)); await espera(300);
  await app.click("#fab"); await espera(200);
  assert.equal(await p.isVisible("#mais-lista"), true);
  await p.click("[data-mais=recebimento]"); await espera(1500);
  assert.equal(await p.evaluate(() => location.hash), "#clinica");
  assert.equal(await p.isVisible("#mais-bt"), true);
  assert.equal(await quadro(p, "clinica.html").evaluate(() => !document.getElementById("pg-form").classList.contains("hidden")), true);
  // Voltar continua levando para a tela de antes
  await p.goBack(); await espera(500);
  assert.equal(await p.evaluate(() => location.hash), "#tudo");
  assert.deepEqual(erros, []);
  await ctx.close();
});
