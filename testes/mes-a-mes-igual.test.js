/* Mês a mês igual à Situação do mês (06/10/2026): no mês em andamento a lista descontava também os
   fixos que ainda vão vencer e dizia "sobrou" menos que o "Saldo agora". Agora o mesmo mês tem o
   mesmo número nas duas telas. Os meses que já passaram não mudam. Cadernos inventados. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-revisao.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });
const espera = ms => new Promise(r => setTimeout(r, ms));
const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: esperado ${b}, veio ${a}`);

async function abrir(){
  const ctx = await nav.newContext({ viewport:{ width:1280, height:900 }, locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await ctx.addInitScript(s => { if (localStorage.getItem("teste-semeado")) return; for (const k in s) localStorage.setItem(k, s[k]); localStorage.setItem("teste-semeado", "1"); },
    { "controle-unico-dinheiro-cache":JSON.stringify(D.dinheiro), "controle-unico-casa-cache":JSON.stringify(D.casa), "controle-unico-clinica-cache":JSON.stringify(D.clinica) });
  const p = await ctx.newPage(); const erros = []; p.on("pageerror", e => erros.push(e.message));
  await p.clock.install({ time:new Date(D.HOJE) });
  await p.goto(srv.url + "index.html#carteira"); await espera(2000);
  return { ctx, p, erros, app:p.frames().find(f => f.url().includes("app.html")) };
}

test("Outubro em andamento: o Mês a mês tem o mesmo Gastei e o mesmo Saldo agora da Situação do mês", async () => {
  const { ctx, app, erros } = await abrir();
  const r = await app.evaluate(() => { ref = new Date(2026, 9, 1); const d = contasDinheiro(); const m = serieMeses().find(x => x.k === "2026-10"); return { d, m }; });
  // à mão: entrou 1.000 de palestra + 700 de paciente + 300 de acerto = 2.000; saiu 300 + 150 + 50 lançados
  // (o condomínio de Moradia fica fora) + 120 internet (dia 3) + 200 anuidade (sem dia) + 320 da casa = 1.140;
  // o streaming do dia 15 ainda não saiu. Saldo: 2.000 − 1.140 − 500 de aporte + 200 de resgate = 560.
  perto(r.d.saiu, 1140, "Gastei"); perto(r.m.saiu, 1140, "saiu no Mês a mês");
  perto(r.d.sobra, 560, "Saldo agora"); perto(r.m.sobra, 560, "sobrou no Mês a mês");
  perto(r.m.entrou, r.d.entrou, "entrou");
  // na tela
  await app.evaluate(() => { vistaDin = "hist"; desenhar(); });
  const linha = await app.evaluate(() => document.querySelector('.hm[data-irmes="2026-10"]').innerText.replace(/\s+/g, " "));
  assert.match(linha, /saiu R\$ 1\.140,00/); assert.match(linha, /sobrou ?R\$ 560,00/);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Setembro, que já fechou, não muda: todos os fixos do mês contam", async () => {
  const { ctx, app } = await abrir();
  const m = await app.evaluate(() => { ref = new Date(2026, 9, 1); return serieMeses().find(x => x.k === "2026-09"); });
  // 800 de curso + 120 + 50 de fixos + 300 da casa = 1.270; entrou 500 + 400 = 900; resgate 300 → −70
  perto(m.saiu, 1270, "saiu em setembro"); perto(m.sobra, -70, "faltou em setembro");
  const f = await app.evaluate(() => fechamento("2026-09").din);
  perto(f.sobra, -70, "fechamento de setembro");
  await ctx.close();
});

test("Novembro, que ainda não começou: nenhum fixo saiu, como no Gastei da Situação", async () => {
  const { ctx, app } = await abrir();
  const r = await app.evaluate(() => { ref = new Date(2026, 10, 1); return { d:contasDinheiro(), m:serieMeses().find(x => x.k === "2026-11") }; });
  perto(r.m.saiu, r.d.saiu, "saiu em novembro"); perto(r.m.sobra, r.d.sobra, "sobra de novembro");
  perto(r.d.faltaSair, 170, "fixos de novembro ainda por sair");
  await ctx.close();
});
