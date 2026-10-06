/* Revisão de Dinheiro, Casa e Ana (06/10/2026): rótulos que diziam uma coisa e o número era outra.
   Só textos da tela; nenhuma conta muda. Cadernos inventados de dados-revisao.js. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-revisao.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });
const espera = ms => new Promise(r => setTimeout(r, ms));
const copia = o => JSON.parse(JSON.stringify(o));

async function abrir(pagina, semente, largura = 1280){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:900 }, isMobile:largura < 700, hasTouch:largura < 700, locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await ctx.addInitScript(s => { if (localStorage.getItem("teste-semeado")) return; for (const k in s) localStorage.setItem(k, s[k]); localStorage.setItem("teste-semeado", "1"); }, semente);
  const p = await ctx.newPage(); const erros = [];
  p.on("pageerror", e => erros.push(e.message)); p.on("dialog", d => d.accept());
  await p.clock.install({ time:new Date(D.HOJE) });
  await p.goto(srv.url + pagina); await espera(1800);
  return { ctx, p, erros, app:p.frames().find(f => f.url().includes("app.html")) };
}
const semente = (din = D.dinheiro, casa = D.casa) => ({ "controle-unico-dinheiro-cache":JSON.stringify(din), "controle-unico-casa-cache":JSON.stringify(casa),
  "controle-unico-clinica-cache":JSON.stringify(D.clinica), "controle-unico-ana-cache":JSON.stringify(D.ana) });
const k = (f, rotulo) => f.evaluate(r => { const x = [...document.querySelectorAll(".situ .k")].find(e => e.querySelector("span").textContent.trim() === r); return x ? x.innerText.replace(/\s+/g, " ").trim() : null; }, rotulo);

test("Ainda vai sair: o fixo sem dia marcado é dito como já contado em Gastei", async () => {
  const { ctx, app, erros } = await abrir("index.html#tudo", semente());
  const t = await k(app, "Ainda vai sair");
  assert.match(t, /R\$ 50,00/);
  assert.match(t, /o fixo sem dia marcado já conta em Gastei/);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Fechamento: mês que fechou no vermelho diz Faltou, com o normal negativo no mesmo sinal do app", async () => {
  const { ctx, app } = await abrir("index.html#carteira", semente());
  await app.evaluate(() => { ref = new Date(2026, 8, 1); vistaDin = "fech"; desenhar(); });
  const t = await k(app, "Faltou");
  assert.ok(t, "o número do fechamento de setembro se chama Faltou");
  assert.match(t, /^Faltou R\$ 70,00/);
  assert.match(t, /\(−R\$ 400,00\)/);
  assert.equal(await k(app, "Sobrou"), null);
  await ctx.close();
});

test("Casa: mês que gastou exatamente a média não diz 'Faltam R$ 0,00'", async () => {
  const { ctx, app } = await abrir("index.html#casa", semente());
  const v = await app.evaluate(() => document.querySelector(".situ .veredito").innerText.replace(/\s+/g, " ").trim());
  assert.match(v, /Chegou à média/);
  assert.doesNotMatch(v, /Faltam R\$ 0,00/);
  // fora do caso exato, continua como antes
  const casa = copia(D.casa); casa.lancamentos.push({ id:"c9", data:"2026-10-06", quem:"Ana Teste", descricao:"-", categoria:"Mercado", valor:10 });
  const b = await abrir("index.html#casa", semente(D.dinheiro, casa));
  assert.match(await b.app.evaluate(() => document.querySelector(".situ .veredito").innerText), /Já passou da média/);
  await b.ctx.close(); await ctx.close();
});

test("Ana: o valor dos plantões do mês não se chama 'feito' nem 'total do mês'", async () => {
  const { ctx, p, erros } = await abrir("ana.html#mes", semente(), 390);
  const txt = await p.evaluate(() => document.getElementById("tela").innerText.replace(/\s+/g, " "));
  assert.match(txt, /Plantões de outubro/);
  assert.match(txt, /Valor dos plantões\s*R\$ 2\.000,00/);
  assert.doesNotMatch(txt, /Valor feito|Plantões feitos/);
  await p.click('#abas [data-a="plantoes"]'); await espera(500);
  const t2 = await p.evaluate(() => document.getElementById("tela").innerText.replace(/\s+/g, " "));
  assert.doesNotMatch(t2, /Total do mês/);
  assert.match(t2, /Valor dos plantões\s*R\$ 2\.000,00/);
  assert.deepEqual(erros, []);
  await ctx.close();
});
