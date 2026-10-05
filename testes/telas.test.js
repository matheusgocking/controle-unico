/* A casca e as telas de passagem (05/10/2026): o botão Voltar do celular troca de tela de verdade,
   a aba Tudo sem login pede para entrar em vez de mostrar R$ 0,00 como se fosse o mês, e a página
   de Privacidade volta para a página de onde veio (a Ana volta para o controle dela). */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });
const espera = ms => new Promise(r => setTimeout(r, ms));

async function abrir({ dados = true, largura = 390 } = {}) {
  const ctx = await nav.newContext({ viewport:{ width:largura, height:844 }, isMobile: largura < 700, hasTouch: largura < 700, locale:"pt-BR" });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|accounts\.google\.com/, r => r.abort());
  if (dados) await ctx.addInitScript(([d, c]) => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-dinheiro-cache", d);
    localStorage.setItem("controle-unico-casa-cache", c);
    localStorage.setItem("teste-semeado", "1");
  }, [JSON.stringify(D.dinheiro), JSON.stringify(D.casa)]);
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  await p.clock.install({ time: new Date(D.HOJE) });
  await p.goto(srv.url + "index.html");
  await espera(1200);
  return { ctx, p, erros };
}
const tela = async p => ({
  casca: (await p.evaluate(() => location.hash)).slice(1),
  titulo: await p.textContent("#titulo"),
  app: await p.frames().find(f => f.url().includes("app.html")).evaluate(() => location.hash.slice(1)),
  aberto: await p.evaluate(() => [...document.querySelectorAll("#palco iframe")].find(f => !f.hidden).id)
});

test("Voltar do celular: volta pelas telas abertas, na ordem", async () => {
  const { ctx, p, erros } = await abrir();
  await p.click("[data-p=carteira]"); await espera(400);
  await p.click("[data-v=casa]"); await espera(400);
  await p.click("[data-p=clinica]"); await espera(800);
  assert.equal((await tela(p)).casca, "clinica");

  await p.goBack(); await espera(500);
  let t = await tela(p);
  assert.deepEqual([t.casca, t.titulo, t.app, t.aberto], ["casa", "Carteira", "casa", "q-app"]);
  assert.equal(await p.getAttribute("[data-v=casa]", "aria-pressed"), "true");

  await p.goBack(); await espera(500);
  t = await tela(p);
  assert.deepEqual([t.casca, t.app], ["carteira", "carteira"]);
  assert.equal(await p.getAttribute("[data-v=carteira]", "aria-pressed"), "true");

  await p.goBack(); await espera(500);
  t = await tela(p);
  assert.deepEqual([t.casca, t.titulo, t.app], ["tudo", "Tudo", "tudo"]);
  assert.equal(await p.getAttribute("[data-p=tudo]", "aria-pressed"), "true");

  // e Avançar refaz o caminho
  await p.goForward(); await espera(500);
  assert.equal((await tela(p)).casca, "carteira");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Voltar sai da Conferência para a tela de antes", async () => {
  const { ctx, p } = await abrir({ largura:1280 });
  await p.click("[data-p=clinica]"); await espera(600);
  // a Conferência abre pelo menu ⋯, também no computador
  assert.equal(await p.locator("header > .dir > #conferir").count(), 0);
  await p.click("#menu summary"); await p.click("#conferir"); await espera(600);
  assert.equal(await p.evaluate(() => document.getElementById("menu").open), false);
  assert.equal((await tela(p)).casca, "conferir");
  await p.goBack(); await espera(500);
  const t = await tela(p);
  assert.equal(t.casca, "clinica");
  assert.equal(await p.getAttribute("#conferir", "aria-pressed"), "false");
  await ctx.close();
});

test("Tudo sem login e sem nada guardado pede para entrar", async () => {
  const { ctx, p, erros } = await abrir({ dados:false });
  const f = p.frames().find(x => x.url().includes("app.html"));
  const caixa = await f.textContent(".veredito");
  assert.match(caixa, /Entre para ver o seu mês/);
  assert.doesNotMatch(caixa, /Segure/);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Tudo com dados guardados neste aparelho continua mostrando o mês", async () => {
  const { ctx, p } = await abrir();
  const f = p.frames().find(x => x.url().includes("app.html"));
  assert.match(await f.textContent(".veredito"), /Pode gastar/);
  await ctx.close();
});

test("Privacidade: Voltar leva de volta para a página de onde veio", async () => {
  const ctx = await nav.newContext({ locale:"pt-BR" });
  const p = await ctx.newPage();
  await p.goto(srv.url + "privacidade.html");
  // aberta direto (sem página antes): o link leva ao app
  assert.equal(await p.getAttribute("a.voltar", "href"), "./");
  // aberta a partir do controle da Ana: volta para ana.html, não para a casca do Matheus
  await p.setContent(`<a id="ir" href="${srv.url}privacidade.html">ir</a>`);
  await p.route(srv.url + "ana.html", r => r.fulfill({ status:200, contentType:"text/html", body:"<a id='ir' href='privacidade.html'>Privacidade</a>" }));
  await p.goto(srv.url + "ana.html");
  await p.click("#ir"); await p.waitForURL(/privacidade/);
  assert.equal(await p.getAttribute("a.voltar", "href"), "ana.html");
  await p.click("a.voltar"); await p.waitForURL(/ana\.html/);
  await ctx.close();
});
