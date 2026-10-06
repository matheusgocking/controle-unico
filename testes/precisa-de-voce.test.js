/* "O que precisa de você" no alto da aba Tudo (06/10/2026): os avisos de todas as áreas num lugar
   só, lidos das contas que cada tela já faz. Abrem o app num Chromium sem tela, com os cadernos
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
const copia = o => JSON.parse(JSON.stringify(o));

// sessões sem marca, um paciente atrasado, um que vence amanhã, um limite estourado, uma pendência e uma pool parada
function cadernos(){
  const din = copia(D.dinheiro);
  din.limites = { "Mercado": 300 };
  din.pendencias = [{ id:"x1", tipo:"receber", nome:"Fulano", total:500, pago:100, inicio:"2026-08-01" }];
  const cl = copia(D.clinica);
  cl.pagamentos = [{ id:"g1", pacienteId:"pB", data:"2026-09-01", valor:200, meio:"pix", receita:"Prática Clínica." },
                   { id:"g2", pacienteId:"pA", data:"2026-09-07", valor:700, meio:"pix", receita:"Prática Clínica." }];
  cl.config.contarDesde = "2026-09-28";   // a agenda registra desde setembro: as sessões sem marca aparecem
  return {
    "controle-unico-dinheiro-cache": JSON.stringify(din), "controle-unico-casa-cache": JSON.stringify(D.casa),
    "controle-unico-clinica-cache": JSON.stringify(cl),
    "cripto-v1-vivo": JSON.stringify({ t:Date.parse(D.HOJE) - 3600e3, saldos:[], precos:{}, posicoes:[{ id:"p1", dentro:false, g0:"ETH", g1:"USDC", p:1, pa:2, pb:3 }] })
  };
}

async function abrir(largura, semente){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:900 }, isMobile: largura < 700, hasTouch: largura < 700,
    locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await ctx.addInitScript(s => {
    if (localStorage.getItem("teste-semeado")) return;
    for (const k in s) localStorage.setItem(k, s[k]);
    localStorage.setItem("teste-semeado", "1");
  }, semente);
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  p.on("dialog", d => d.dismiss());
  await p.clock.install({ time: new Date(D.HOJE) });
  await p.goto(srv.url + "index.html#tudo");
  await espera(2500);
  return { ctx, p, erros, app: p.frames().find(f => f.url().includes("app.html")) };
}
const avisos = f => f.evaluate(() => [...document.querySelectorAll(".pv .pv-i")].map(b => b.querySelector("b").textContent));
const cadernosGuardados = p => p.evaluate(() => ["dinheiro", "casa", "clinica"].map(c => localStorage.getItem("controle-unico-" + c + "-cache")));

test("Tudo junta os avisos da Clínica, do Dinheiro e da Cripto, o mais urgente primeiro", async () => {
  const { ctx, p, erros, app } = await abrir(1280, cadernos());
  const antes = await cadernosGuardados(p);
  await app.evaluate(() => document.querySelector(".pv-mais").open = true);
  const l = await avisos(app);
  assert.equal(l[0], "Paciente Avulso: pagamento atrasado");
  assert.equal(l[1], "1 pool fora da faixa");
  for (const t of ["Mercado passou do limite", "1 pendência em aberto", "Paciente Mensal: pagamento vence amanhã", "Aluguel: sai amanhã", "2 registros do prontuário por escrever"])
    assert.ok(l.includes(t), "falta o aviso: " + t);
  assert.ok(l.some(t => /sessões já passaram sem marcar/.test(t)));
  // a mesma conta da tela Falta marcar da Clínica
  const naClinica = await p.frames().find(f => f.url().includes("clinica.html")).evaluate(() => faltaMarcar().length);
  assert.ok(l.includes(naClinica + " sessões já passaram sem marcar o que aconteceu"));
  assert.match(await app.textContent(".pv h2"), /5 pedem ação/);
  // só lê: os cadernos guardados ficam iguais
  assert.deepEqual(await cadernosGuardados(p), antes);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("tocar no aviso leva ao lugar dele: a ficha do paciente e os gastos fixos", async () => {
  const { ctx, p, erros, app } = await abrir(390, cadernos());
  assert.equal(await app.locator(".pv > .pv-l li").count(), 3, "no celular ficam três à vista e o resto em Mais");
  await app.click('.pv-i:has-text("Paciente Avulso")'); await espera(600);
  assert.equal(await p.textContent("#titulo"), "Clínica");
  const cl = p.frames().find(f => f.url().includes("clinica.html"));
  assert.equal(await cl.textContent("#fi-titulo"), "Paciente Avulso");
  assert.equal(await cl.getAttribute("#fi-aba-pagamento", "aria-selected"), "true");
  await cl.evaluate(() => document.querySelector(".overlay").remove());
  await p.goBack(); await espera(600);
  assert.equal(await p.textContent("#titulo"), "Tudo", "Voltar traz de volta ao Tudo");
  await app.evaluate(() => document.querySelector(".pv-mais").open = true);
  await app.click('.pv-i:has-text("Aluguel")'); await espera(600);
  assert.equal(await p.textContent("#titulo"), "Carteira");
  assert.equal(await app.getAttribute('[data-vd="fixos"]', "aria-pressed"), "true");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("sem nada pendente, uma linha só; em outro mês, a lista some", async () => {
  const din = copia(D.dinheiro); din.gastosFixos = [];
  const cl = copia(D.clinica); cl.pacientes = [];
  const { ctx, erros, app } = await abrir(1280, { "controle-unico-dinheiro-cache": JSON.stringify(din),
    "controle-unico-casa-cache": JSON.stringify(D.casa), "controle-unico-clinica-cache": JSON.stringify(cl) });
  assert.match(await app.textContent(".pv"), /Nada precisa de você agora/);
  await app.click('#tela .mes [data-mes="-1"]'); await espera(300);
  assert.equal(await app.locator(".pv").count(), 0);
  assert.deepEqual(erros, []);
  await ctx.close();
});
