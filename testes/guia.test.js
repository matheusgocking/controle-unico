/* Guia rápido: abre sem erro no celular e no computador, nada rola de lado, a versão da Ana
   mostra só o que vale para ela, e o app e a página da Ana levam até ele. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

async function abrir(endereco, largura, escuro){
  const ctx = await nav.newContext({ locale:"pt-BR", viewport:{ width:largura, height:800 }, colorScheme: escuro ? "dark" : "light" });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|accounts\.google\.com|www\.googleapis\.com/, r => r.abort());
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  await p.goto(srv.url + endereco);
  return { ctx, p, erros };
}
const visiveis = (p, sel) => p.$$eval(sel, l => l.filter(e => e.offsetParent !== null).map(e => e.textContent.trim()));

for (const largura of [375, 1280]) for (const escuro of [false, true]) {
  test(`Guia do Matheus a ${largura}px${escuro ? ", escuro" : ""}`, async () => {
    const { ctx, p, erros } = await abrir("guia.html", largura, escuro);
    const h2 = await visiveis(p, "section h2");
    for (const nome of ["Tudo", "Dinheiro", "Casa", "Cripto", "Clínica", "Conferir"]) assert.ok(h2.some(t => t.startsWith(nome)), nome);
    assert.ok(!h2.includes("Plantões"), "as telas da Ana ficam no guia dela");
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, "nada rola de lado");
    // cada botão do índice leva a uma tela que existe
    const alvos = await p.$$eval("[data-para=matheus] .indice a", l => l.map(a => a.getAttribute("href")));
    for (const a of alvos) assert.ok(await p.$(a), a);
    assert.equal(await p.getAttribute("[data-para=matheus].voltar", "href"), "./");
    assert.deepEqual(erros, []);
    await ctx.close();
  });

  test(`Guia da Ana a ${largura}px${escuro ? ", escuro" : ""}`, async () => {
    const { ctx, p, erros } = await abrir("guia.html?para=ana", largura, escuro);
    const h2 = await visiveis(p, "section h2");
    for (const nome of ["Mês", "Plantões", "Atendimentos", "Gastos", "Casa"]) assert.ok(h2.includes(nome), nome);
    for (const nome of ["Clínica", "Cripto", "Conferir", "Tudo"]) assert.ok(!h2.some(t => t.startsWith(nome)), "a Ana não vê " + nome);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, "nada rola de lado");
    const alvos = await p.$$eval("[data-para=ana] .indice a", l => l.map(a => a.getAttribute("href")));
    for (const a of alvos) assert.ok(await p.$(a), a);
    assert.equal(await p.getAttribute("[data-para=ana].voltar", "href"), "ana.html");
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}

test("O menu do app e o pé da página da Ana levam ao guia", async () => {
  const fs = require("fs"), path = require("path");
  const ler = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  assert.match(ler("index.html"), /<div class="menu-lista">[\s\S]*href="guia\.html"[\s\S]*<\/details>/);
  assert.match(ler("ana.html"), /<div class="pe">[^\n]*href="guia\.html\?para=ana"/);
});
