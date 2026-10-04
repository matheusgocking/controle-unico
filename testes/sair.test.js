/* Sair deste aparelho: apaga do navegador tudo o que o Controle Único guardou e a chave do
   Google, a partir da casca ou de uma página que abre sozinha (controle da Ana). O Drive não é tocado. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const { criarDrive } = require("./drive-falso.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });
const espera = ms => new Promise(r => setTimeout(r, ms));

async function abrir(pagina){
  const drive = criarDrive();
  drive.novo({ name:"Controle Único - dinheiro.json" }, JSON.stringify(D.dinheiro));
  drive.novo({ name:"Controle Único - casa.json" }, JSON.stringify(D.casa));
  const ctx = await nav.newContext({ locale:"pt-BR" });
  const revogados = [];
  await ctx.route(/oauth2\.googleapis\.com\/revoke/, r => { revogados.push(r.request().url()); r.fulfill({ status:200, body:"{}" }); });
  await ctx.route(/www\.googleapis\.com/, r => drive.atender(r));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|accounts\.google\.com/, r => r.abort());
  await ctx.addInitScript(([d, c]) => {
    if (sessionStorage.getItem("semeado")) return;
    sessionStorage.setItem("semeado", "1");
    localStorage.setItem("controle-unico-token", JSON.stringify({ t:"chave-de-teste", e:Date.now() + 3600000 }));
    localStorage.setItem("controle-unico-dinheiro-cache", d);
    localStorage.setItem("controle-unico-casa-cache", c);
    localStorage.setItem("controle-unico-ana-cache", JSON.stringify({ lancamentos:[{ id:"a1" }] }));
    localStorage.setItem("cu-tema", "dark");
    localStorage.setItem("outro-site", "fica");
  }, [JSON.stringify(D.dinheiro), JSON.stringify(D.casa)]);
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  p.on("dialog", d => d.accept());
  await p.goto(srv.url + pagina);
  await espera(2500);
  return { ctx, p, erros, revogados, drive };
}
const guardado = p => p.evaluate(() => Object.keys(localStorage).filter(k => /^(controle-unico|cu-|cripto-|rede-pbt)/.test(k)));

test("Sair pelo controle da Ana (página sozinha)", async () => {
  const { ctx, p, erros, revogados, drive } = await abrir("ana.html");
  await p.evaluate(() => Nuvem.sair());
  await p.waitForLoadState("load"); await espera(1500);
  assert.deepEqual(await guardado(p), []);
  assert.equal(await p.evaluate(() => localStorage.getItem("outro-site")), "fica");
  assert.equal(revogados.length, 1, "a chave do Google é revogada");
  assert.ok(drive.ler("Controle Único - dinheiro.json"), "o Drive não é tocado");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Sair chamado de dentro de um quadro da casca recarrega a casca e limpa tudo", async () => {
  const { ctx, p, erros } = await abrir("index.html");
  const app = p.frames().find(f => f.url().includes("app.html"));
  await p.evaluate(() => { window.__antes = true; });
  await app.evaluate(() => Nuvem.sair());
  await espera(2500);
  assert.equal(await p.evaluate(() => window.__antes), undefined, "a casca inteira recarregou");
  // depois de recarregar, as páginas abrem vazias e pedem para entrar de novo
  assert.deepEqual((await guardado(p)).filter(k => /token|dinheiro-cache|casa-cache|ana-cache/.test(k)), []);
  const lancs = await p.frames().find(f => f.url().includes("app.html")).evaluate(() => livro.matheus.lancamentos.length);
  assert.equal(lancs, 0);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("O que um quadro gravar enquanto a página fecha é limpo na abertura seguinte", async () => {
  const { ctx, p } = await abrir("ana.html");
  await p.evaluate(() => {
    // simula um quadro gravando a cópia depois da limpeza, durante o fechamento
    window.addEventListener("pagehide", () => localStorage.setItem("controle-unico-clinica-cache", "{\"pacientes\":[1]}"));
    Nuvem.sair();
  });
  await p.waitForLoadState("load"); await espera(1500);
  assert.equal(await p.evaluate(() => localStorage.getItem("controle-unico-clinica-cache")), null);
  await ctx.close();
});
