/* Compromisso do Lastro guardado no caderno (marca lastro:true) aparece em vinho, também no celular
   (10/11/2026, pedido dele: estava roxo). O dele, sem a marca, continua na cor do app. Dados inventados. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

test("Lastro em vinho no celular: grade, faixa Hoje, menu e janela", async () => {
  const ctx = await nav.newContext({ viewport:{ width:375, height:900 }, isMobile:true, hasTouch:true, locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date("2026-10-07T12:00:00-03:00") });
  await ctx.addInitScript(k => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k);
    localStorage.setItem("teste-semeado", "1");
  }, JSON.stringify(D.clinica));
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + "clinica.html");
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    dados.compromissos = [
      { id:"v1", titulo:"Encontro do clube", data:"2026-10-07", ini:"07:00", fim:"08:00", semanal:false, mensal:"", lastro:true },
      { id:"v2", titulo:"Dentista", data:"2026-10-07", ini:"06:00", fim:"07:00", semanal:false, mensal:"" }
    ];
    var d = compromissosDoDia("2026-10-07");
    return d.map(c => [c.titulo, c.origem, c.vinho]);
  });
  assert.deepEqual(r, [["Dentista", "meu", false], ["Encontro do clube", "meu", true]]);
  await p.evaluate(() => { renderSemana(); renderHoje(); });
  const cores = await p.evaluate(() => {
    var vinho = getComputedStyle(document.documentElement).getPropertyValue("--lastro").trim();
    var cartoes = [].slice.call(document.querySelectorAll("#hoje-cartoes .pcard.cp-card")).map(k => [k.querySelector(".n").textContent, k.classList.contains("lastro"), getComputedStyle(k.querySelector(".n")).color]);
    var celulas = [].slice.call(document.querySelectorAll(".cell.cp-do-lastro")).length;
    return { vinho, cartoes, celulas };
  });
  assert.equal(cores.vinho.toLowerCase(), "#6e1e2b");
  const vin = cores.cartoes.filter(c => c[0] === "Encontro do clube")[0], seu = cores.cartoes.filter(c => c[0] === "Dentista")[0];
  assert.ok(vin && vin[1], "o cartão do Lastro leva a classe vinho");
  assert.equal(vin[2], "rgb(110, 30, 43)");
  assert.ok(seu && !seu[1], "o compromisso dele não leva");
  assert.notEqual(seu[2], "rgb(110, 30, 43)");
  assert.ok(cores.celulas >= 1, "a grade marca a célula do Lastro");
  assert.deepEqual(erros, []);
  await ctx.close();
});
