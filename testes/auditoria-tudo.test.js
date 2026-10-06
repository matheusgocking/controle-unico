/* Auditoria do Tudo e do Fechamento (06/10/2026): rótulos que diziam uma coisa e mostravam outra.
   Só textos da tela; nenhuma conta mudou. Cadernos inventados de dados-de-teste.js, hoje 04/10/2026. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });
const espera = ms => new Promise(r => setTimeout(r, ms));
const copia = o => JSON.parse(JSON.stringify(o));

async function abrir(){
  const din = copia(D.dinheiro);
  din.lancamentos.push({ id:"r1", data:"2026-10-03", tipo:"Resgate", descricao:"Conserto", categoria:"Reserva", forma:"PIX", valor:300 });
  const cl = copia(D.clinica);
  cl.pagamentos = [{ id:"g1", pacienteId:"pA", data:"2026-09-02", valor:700, meio:"pix", receita:"Prática Clínica." }];
  const semente = { "controle-unico-dinheiro-cache": JSON.stringify(din), "controle-unico-casa-cache": JSON.stringify(D.casa), "controle-unico-clinica-cache": JSON.stringify(cl) };
  const ctx = await nav.newContext({ viewport:{ width:1280, height:900 }, locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await ctx.addInitScript(s => { if (localStorage.getItem("teste-semeado")) return; for (const k in s) localStorage.setItem(k, s[k]); localStorage.setItem("teste-semeado", "1"); }, semente);
  const p = await ctx.newPage(); const erros = [];
  p.on("pageerror", e => erros.push(e.message)); p.on("dialog", d => d.dismiss());
  await p.clock.install({ time:new Date(D.HOJE) });
  await p.goto(srv.url + "index.html#tudo"); await espera(2500);
  return { ctx, p, erros, app:p.frames().find(f => f.url().includes("app.html")) };
}

test("Tudo: o resgate não parece somado ao Recebi, e o mês que acabou não diz 'Saldo agora'", async () => {
  const { ctx, erros, app } = await abrir();
  const card = await app.textContent(".situ");
  assert.match(card, /fora isso, R\$\s300,00 resgatados da reserva/);
  assert.match(card, /Saldo agora/);
  assert.equal(await app.locator("h2:has-text('Patrimônio') .dir").count(), 0, "no mês corrente o patrimônio não precisa dizer 'hoje'");
  await app.click('[data-mes="-1"]'); await espera(300);
  const set = await app.textContent(".situ");
  assert.doesNotMatch(set, /Saldo agora/);
  assert.match(set, /Saldo do mês/);
  assert.match(set, /Setembro terminou com falta de R\$\s1\.990,00/);
  assert.match(await app.textContent("h2:has-text('Patrimônio')"), /hoje, 04\/10/);
  // setembro sem compras da casa: sem o selo "empatado"
  assert.equal(await app.locator("h2:has-text('Casa') .selo-b").count(), 0);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Fechamento: mês negativo diz Faltou e a frase da reserva fica inteira", async () => {
  const { ctx, erros, app } = await abrir();
  await app.evaluate(() => { vistaDin = "fech"; aba = "carteira"; ref = new Date(2026, 8, 1); desenhar(); });
  const t = await app.textContent("#tela");
  assert.match(t, /Faltou\s*R\$\s1\.990,00/);
  assert.doesNotMatch(t, /Sobrou/);
  assert.match(t, /Reserva de emergência: terminou o mês com R\$\s8\.000,00\./);
  assert.deepEqual(erros, []);
  await ctx.close();
});
