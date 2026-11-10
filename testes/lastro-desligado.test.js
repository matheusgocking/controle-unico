/* O Mapa do Lastro vai ser desativado (10/11/2026, pedido dele): os compromissos dele moram no
   Controle Único. Uma cópia antiga da agenda do Lastro, guardada no aparelho, não pode voltar a
   aparecer (duplicaria os compromissos já copiados para cá). Dados inventados, nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

test("Lastro desligado: a cópia antiga some e os compromissos dele vêm só do caderno", async () => {
  const ctx = await nav.newContext({ viewport:{ width:375, height:900 }, isMobile:true, hasTouch:true, locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date("2026-10-07T12:00:00-03:00") });
  const clinica = JSON.parse(JSON.stringify(D.clinica));
  await ctx.addInitScript(([k, velha]) => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k);
    localStorage.setItem("controle-unico-lastro-cache", velha);
    localStorage.setItem("teste-semeado", "1");
  }, [JSON.stringify(clinica), JSON.stringify({ eventos:[{ id:"x", titulo:"Cópia velha", data:"2026-10-07", ini:"10:00", fim:"11:00" }], membro:"eu", lidoEm:1 })]);
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + "clinica.html");
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    dados.compromissos = [{ id:"c1", titulo:"Clube do Livro: Abertura", data:"2026-10-07", ini:"19:30", fim:"20:30", semanal:false, mensal:"" }];
    return { chave: localStorage.getItem("controle-unico-lastro-cache"), eventos: LASTRO.eventos.length,
             dia: compromissosDoDia("2026-10-07").map(c => [c.titulo, c.origem]) };
  });
  assert.equal(r.chave, null, "a cópia guardada no aparelho foi apagada");
  assert.equal(r.eventos, 0);
  assert.deepEqual(r.dia, [["Clube do Livro: Abertura", "meu"]]);
  assert.deepEqual(erros, []);
  await ctx.close();
});
