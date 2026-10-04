/* Cripto (04/10/2026): retirada parcial da pool, saque em reais como resgate para o banco e junção
   dos CSVs da Binance. Chama as funções da página com eventos inventados; nada vai à internet. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");

let srv, nav, pg;
before(async () => {
  srv = await servidor.iniciar(); nav = await chromium.launch(); pg = await nav.newPage();
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await pg.goto(srv.url + "carteira.html"); await pg.waitForTimeout(500);
});
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

test("Pool: retirada parcial abate só a parte do custo", async () => {
  const r = await pg.evaluate(() => {
    const LP = "0xlp", D = Date.parse("2024-01-10T12:00:00Z"), pool = { poolTx:"A/B", poolPar:LP };
    const precos = { A:{ "2024-01-09":10 } };
    const ev = [
      { h:"t0", t:D - 864e5, rede:"base", g:"A", k:"A", q:100, inic:false },
      { h:"t1", t:D, rede:"base", g:"A", k:"A", q:-100, ...pool },
      { h:"t1", t:D, rede:"base", lp:true, k:LP, q:50, de:ZERO, excluido:true },
      { h:"t2", t:D + 31 * 864e5, rede:"base", g:"A", k:"A", q:60, ...pool, poolRem:true },
      { h:"t2", t:D + 31 * 864e5, rede:"base", lp:true, k:LP, q:-25, para:LP, excluido:true }];
    return contabilizar(ev.filter(e => !e.excluido), precos, ev).resultadoPools[LP];
  });
  assert.deepEqual(r, { resultado:100, aberto:500 });
});

test("Saque em reais da Binance é resgate para o banco, não saque perdido", async () => {
  const r = await pg.evaluate(() => {
    const D = Date.parse("2024-01-10T12:00:00Z");
    const ev = [
      { h:"a", t:D, rede:"binance", g:"BRL", k:"BRL", q:1000, op:"aporte", inic:false },
      { h:"s", t:D + 864e5, rede:"binance", g:"BRL", k:"BRL", q:-300, op:"saque", inic:true }];
    const c = contabilizar(ev, {}, ev);
    return { aportado:c.aportado, resgatado:c.resgatado, transito:Object.keys(c.transito), tipo:c.mov.find(m => m.id === "s").tipo };
  });
  assert.deepEqual(r, { aportado:1000, resgatado:300, transito:[], tipo:"saqueBanco" });
});

test("CSV da Binance: junta sem repetir e mantém operações iguais do mesmo arquivo", async () => {
  const r = await pg.evaluate(() => {
    const cab = "Tempo,Operação,Moeda,Alterar";
    const velho = [cab, "2024-01-01 10:00:00,Deposit,BRL,100", "2024-01-02 10:00:00,Buy,BTC,0.001", "2024-01-02 10:00:00,Buy,BTC,0.001"].join("\n");
    const novo = [cab, "2024-01-02 10:00:00,Buy,BTC,0.001", "2024-01-02 10:00:00,Buy,BTC,0.001", "2024-02-01 10:00:00,Deposit,BRL,50"].join("\r\n");
    const j = juntarCsvBinance(velho, novo), nada = juntarCsvBinance(velho, velho), outro = juntarCsvBinance(velho, "Data,Coisa\n1,2");
    return { novas:j.novas, linhas:j.txt.split("\n").length, nada:nada.novas, outro };
  });
  assert.deepEqual(r, { novas:1, linhas:5, nada:0, outro:null });
});
