/* Dívida à vista na semana (06/10/2026): quanto cada paciente deve aparece na sessão da grade
   (computador) e nos cartões do dia, com os sete dias da semana abaixo da grade (celular e
   computador). Só mostra: nenhuma conta muda. Cadernos inventados de dados-de-teste.js,
   relógio parado em 07/10/2026 (quarta). Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

/* Mensal (seg 9h) e Avulso (ter 9h) devem; Quinzenal Ímpar (qua 10h, a desta semana) deve 2;
   Quinzenal Par fica sem base. */
function caderno(){
  const c = JSON.parse(JSON.stringify(D.clinica));
  const base = (id, s) => Object.assign(c.pacientes.find(p => p.id === id), { basePlanilha:"2026-09-30", sessoesPlanilha:s });
  base("pA", 0); base("pB", 2); base("pD", 1);
  return c;
}
async function abrir(largura){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:844 }, isMobile: largura < 700, hasTouch: largura < 700,
    locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date("2026-10-07T12:00:00-03:00") });
  await ctx.addInitScript(k => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k);
    localStorage.setItem("teste-semeado", "1");
  }, JSON.stringify(caderno()));
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + "clinica.html");
  await p.waitForTimeout(600);
  return { ctx, p, erros };
}
const cartoes = p => p.$$eval("#hoje-cartoes .pcard", cs => cs.map(c => c.querySelector(".n").textContent + " | " + c.querySelector(".selo").textContent));

for (const largura of [390, 1280]) {
  test("Semana (" + largura + "px): hoje aberto, os outros dias num toque, a dívida no cartão, nada gravado", async () => {
    const { ctx, p, erros } = await abrir(largura);
    const antes = await p.evaluate(() => JSON.stringify(dados));
    assert.equal(await p.isVisible("#hoje-faixa"), true);
    assert.equal(await p.$$eval("#hoje-dias .dia-chip", cs => cs.length), 7);
    assert.match(await p.textContent("#hoje-titulo"), /^Hoje · quarta-feira, 07\/10$/);
    assert.deepEqual(await cartoes(p), ["Quinzenal Ímpar | deve 2 sessões · R$ 400"]);
    /* o ponto vermelho nos dias de quem deve: seg, ter e qua */
    assert.deepEqual(await p.$$eval("#hoje-dias .dia-chip", cs => cs.map(c => !!c.querySelector(".ponto"))),
      [false, true, true, true, false, false, false]);
    /* terça */
    await p.click("#hoje-dias .dia-chip:nth-child(3)");
    assert.match(await p.textContent("#hoje-titulo"), /^Terça-feira, 06\/10$/);
    assert.deepEqual(await cartoes(p), ["Paciente Avulso | deve 3 sessões · R$ 600"]);
    /* quinta, sem sessão */
    await p.click("#hoje-dias .dia-chip:nth-child(5)");
    assert.match(await p.textContent("#hoje-cartoes"), /Nenhuma sessão neste dia/);
    /* o cartão continua abrindo a ficha */
    await p.click("#hoje-dias .dia-chip:nth-child(2)");
    await p.click("#hoje-cartoes .pcard");
    await p.waitForTimeout(200);
    assert.equal(await p.evaluate(() => JSON.stringify(dados).replace(/,"registros":\{\}/, "")), antes.replace(/,"registros":\{\}/, ""));
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}

test("Grade: a dívida escrita na sessão no computador, escondida no celular; bolinha e tarja continuam", async () => {
  for (const largura of [1280, 390]) {
    const { ctx, p, erros } = await abrir(largura);
    const cel = await p.evaluate(() => [...document.querySelectorAll("#grade .cell")].filter(c => c.querySelector(".dv"))
      .map(c => c.dataset.data + " " + c.dataset.hora + "h " + c.querySelector(".dv").textContent + " " + (getComputedStyle(c.querySelector(".dv")).display !== "none") + " " + !!c.querySelector(".pgm")));
    const vis = largura >= 700;
    assert.deepEqual(cel, ["2026-10-05 9h deve R$ 175 "+vis+" true", "2026-10-06 9h deve R$ 600 "+vis+" true", "2026-10-07 10h deve R$ 400 "+vis+" true"]);
    assert.deepEqual(erros, []);
    await ctx.close();
  }
});
