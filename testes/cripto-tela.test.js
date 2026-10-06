/* Cripto (06/10/2026): problemas só de tela. "Esconder valores" cobre eixo, Diário, Pools, avisos e sino;
   o Diário não inventa ganho quando falta cotação; a rosca e o "N lugares" do topo contam igual; a dica da
   aba Aportes diz "Aportado líquido"; o eixo do gráfico no celular fica legível. Carteira inventada; nada vai à internet. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

// abre a página e monta uma carteira inventada: aportes, trocas, um saque perdido e uma pool aberta na PulseChain
async function abrir(largura = 1280){
  const pg = await nav.newPage({ viewport:{ width:largura, height:900 } });
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await pg.goto(srv.url + "carteira.html"); await pg.waitForTimeout(400);
  await pg.evaluate(() => {
    const D = s => Date.parse(s + "T15:00:00Z"), precos = { USD:{}, BTC:{} }, hoje = Date.parse(dia(Date.now()));
    for(let t = D("2025-10-01"), i = 0; t <= hoje; t += DIA_MS, i++){ const d = dia(t); precos.USD[d] = 5.4; precos.BTC[d] = 500000 + 1000 * i; }
    const LP = "0xlp", ev = [
      { h:"a1", t:D("2025-10-01"), rede:"binance", k:"BRL", q:10000, op:"aporte", inic:false },
      { h:"b1", t:D("2025-10-02"), rede:"binance", k:"BRL", q:-6000, op:"troca", inic:true },
      { h:"b1", t:D("2025-10-02"), rede:"binance", k:"BTC", q:0.012, op:"troca", inic:true },
      { h:"b2", t:D("2025-10-03"), rede:"binance", k:"BRL", q:-1000, op:"troca", inic:true },
      { h:"b2", t:D("2025-10-03"), rede:"binance", k:"SHIB", q:1e6, op:"troca", inic:true },
      { h:"s1", t:D("2025-10-04"), rede:"binance", k:"BTC", q:-0.001, op:"saque", inic:true },
      { h:"a2", t:D("2026-06-01"), rede:"binance", k:"BRL", q:3000, op:"aporte", inic:false }];
    ev.forEach(e => { if(!e.g) e.g = grupoDe(e); });
    const c = contabilizar(ev, precos, ev), serie = montarSerie(ev, precos);
    HIST = { versao:VERSAO_HIST, geradoEm:Date.now(), serie, pos:c.pos, transito:c.transito, taxas:c.taxas, aportado:c.aportado, resgatado:c.resgatado, mov:c.mov.reverse(),
      pools:[{ par:LP, rede:"pulsechain", nome:"PLS / USD", abertura:D("2025-11-10"), fechamento:null, status:"ativa", lpTotal:10, reserveUSD:200000, totalSupply:10000, t0:"WPLS", t1:"USDC", r0:2e8, r1:1e5, txs:[], rem:[] },
             { par:"0xbase", rede:"base", nome:"AERO / USDC", abertura:D("2025-12-01"), fechamento:null, status:"ativa", lpTotal:1, reserveUSD:0, totalSupply:100, txs:[], rem:[] }],
      recompensas:{ BTC:0.0001 }, farms:[], resultadoPools:c.resultadoPools, golpe:0, golpeLista:[], fim:{}, info:{}, avisos:[] };
    PRECOS = precos;
    // SHIB sem cotação de hoje (não está mais na carteira); BNB com centavos, abaixo de R$ 1
    const p = { BRL:1, USD:5.4, BTC:precoEm(precos.BTC, dia(Date.now())) };
    VIVO = { t:Date.now(), saldos:[{ rede:"binance", g:"BRL", q:6000 }, { rede:"binance", g:"BTC", q:0.011 }, { rede:"base", g:"USD", q:100 }, { rede:"bsc", g:"BNB", q:0.00001 }],
      precos:{ ...p, BNB:3000 }, liq:{}, usd:5.4, erros:[], velhos:[], mercado:{}, posicoes:[] };
    tudo();
  });
  return pg;
}

test("Esconder valores cobre eixo do gráfico, Diário, Pools, avisos e sino", async () => {
  const pg = await abrir();
  const r = await pg.evaluate(() => {
    const borrado = el => !!el.closest('.v');
    const eixoValores = [...document.querySelectorAll('#svg .eixo text')].filter(t => /R\$/.test(t.textContent));
    const diario = document.getElementById('diario');
    const aporte = [...diario.querySelectorAll('li')].find(li => /Aporte de/.test(li.textContent));
    const troca = [...diario.querySelectorAll('li')].find(li => /A troca rendeu|Ficar parado/.test(li.textContent));
    const pools = document.getElementById('pools');
    const pend = document.getElementById('pendencias');
    // alerta com valor em dinheiro no sino
    VIVO.liq = { BTC:1000 }; GRUPOS.BTC = { pulsex:true }; desenharAlertas();
    const liq = [...document.querySelectorAll('#painelAlertas .aviso-item')].find(a => /numa moeda difícil/.test(a.textContent));
    return {
      eixo: eixoValores.length > 0 && eixoValores.every(borrado),
      aporte: [...aporte.querySelectorAll('.v')].some(s => /R\$/.test(s.textContent)),
      qtdTroca: [...diario.querySelectorAll('.v')].some(s => /^0,01/.test(s.textContent)),
      ganho: [...troca.querySelectorAll('.depois .v')].length === 3,
      parte: [...pools.querySelectorAll('.v')].some(s => /WPLS/.test(s.textContent)),
      recompensa: [...pools.querySelectorAll('.nota .v')].some(s => /R\$/.test(s.textContent)),
      valeriam: [...pend.querySelectorAll('small .v')].some(s => /R\$/.test(s.textContent)),
      sino: !!(liq && liq.querySelector('small.v'))
    };
  });
  assert.deepEqual(r, { eixo:true, aporte:true, qtdTroca:true, ganho:true, parte:true, recompensa:true, valeriam:true, sino:true });
  await pg.close();
});

test("Diário não diz que a troca rendeu quando uma das moedas está sem cotação", async () => {
  const pg = await abrir();
  const r = await pg.evaluate(() => {
    const lis = [...document.querySelectorAll('#diario li')];
    const shib = lis.find(li => /SHIB/.test(li.textContent)), btc = lis.find(li => /por <span class="v">0,012/.test(li.innerHTML));
    return { shib:shib.querySelector('.depois').textContent, btc:/A troca rendeu|Ficar parado/.test(btc.querySelector('.depois').textContent) };
  });
  assert.equal(r.shib, "Sem cotação de hoje para comparar.");
  assert.equal(r.btc, true);
  await pg.close();
});

test("O topo e a rosca contam os mesmos lugares (redes abaixo de R$ 1 ficam fora dos dois)", async () => {
  const pg = await abrir();
  const r = await pg.evaluate(() => ({
    topo: document.getElementById('subtotal').textContent.match(/em (\d+) lugares/)[1],
    rosca: document.querySelector('#onde .centro1').textContent,
    legenda: document.querySelectorAll('#onde .leg-r li').length,
    bnb: /BNB Chain/.test(document.getElementById('onde').textContent)
  }));
  assert.deepEqual(r, { topo:"2", rosca:"2 lugares", legenda:2, bnb:false });
  await pg.close();
});

test("A dica do gráfico de Aportes diz Aportado líquido", async () => {
  const pg = await abrir();
  await pg.evaluate(() => abrirAba('aportes'));
  const bb = await pg.locator('#svgAp').boundingBox();
  await pg.mouse.move(bb.x + bb.width * 0.6, bb.y + bb.height / 2);
  const txt = await pg.locator('#dicaAp').textContent();
  assert.match(txt, /Aportado líquido/);
  assert.match(txt, /Resultado sobre o aportado líquido/);
  await pg.close();
});

test("Pool sem valor conhecido mostra — em vez de R$ 0,00; Mapa diz desde quando soma", async () => {
  const pg = await abrir();
  const r = await pg.evaluate(() => {
    const li = [...document.querySelectorAll('#pools .lista > li')].find(l => /AERO/.test(l.textContent));
    return { valor:li.querySelector('.lin').textContent.includes('R$'), nota:/Valor de hoje não disponível/.test(li.textContent), desde:document.getElementById('fluxoDesde').textContent };
  });
  assert.deepEqual(r, { valor:false, nota:true, desde:"01 out 2025" });
  await pg.close();
});

test("Celular: eixo com largura real, sem a caixa de arrastar CSV, e a tabela de Ativos cabe na tela", async () => {
  const pg = await abrir(390);
  await pg.evaluate(() => { HIST.geradoEm = Date.now() - 8 * DIA_MS; desenharPendencias(); });
  const r = await pg.evaluate(() => ({
    viewBox: document.getElementById('svg').getAttribute('viewBox'),
    datas: [...document.querySelectorAll('#svg .eixo text')].filter(t => !/R\$/.test(t.textContent)).length,
    drop: getComputedStyle(document.getElementById('drop')).display,
    texto: /No computador, use Refazer histórico/.test(document.getElementById('pendencias').textContent)
  }));
  assert.deepEqual(r, { viewBox:"0 0 340 300", datas:3, drop:"none", texto:true });
  await pg.evaluate(() => abrirAba('ativos'));
  const t = await pg.evaluate(() => { const x = document.querySelector('.rolaX'); return { cabe:x.scrollWidth <= x.clientWidth, retorno:getComputedStyle(document.querySelector('#cabAtivos [data-col="roi"]')).display }; });
  assert.deepEqual(t, { cabe:true, retorno:"table-cell" });
  await pg.close();
});
