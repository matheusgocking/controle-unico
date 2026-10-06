/* Cripto, contas da tela (06/10/2026): pool v2 aberta no Total, "Desde <data>" sem contar aportes, total da aba Tudo
   depois de Atualizar e de refazer o histórico, "Desde ontem" entre 21h e meia-noite, Retorno "Por carteira" e
   variações no modo US$. Carteira inventada, relógio parado em 06/10/2026 12:00 de Brasília; nada vai à internet.
   Nos comentários, o número que a versão anterior mostrava. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");

const AGORA = new Date("2026-10-06T15:00:00Z");   // 12:00 em Brasília
let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });
const espera = ms => new Promise(r => setTimeout(r, ms));

async function abrir(semente = {}, hora = AGORA){
  const ctx = await nav.newContext({ locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await ctx.addInitScript(s => { if (sessionStorage.getItem("semeado")) return; for (const k in s) localStorage.setItem(k, s[k]); sessionStorage.setItem("semeado", "1"); }, semente);
  const pg = await ctx.newPage();
  const erros = []; pg.on("pageerror", e => erros.push(e.message));
  await pg.clock.setFixedTime(hora);
  await pg.goto(srv.url + "carteira.html"); await espera(300);
  await pg.evaluate(MONTAR);
  return { ctx, pg, erros };
}

/* A carteira inventada. Preços: dólar R$ 5; BTC R$ 500 mil, R$ 550 mil a partir de 01/03/2026 e R$ 600 mil a partir
   de 01/09/2026; PLS R$ 0,0005. Aporte de R$ 10.000 (01/10/2025), compra de 0,012 BTC e de 400 USDT, 100 USDT sacados
   para a PulseChain, 1.000.000 PLS chegados de fora (R$ 500), pool PLS/USD aberta com 50 USD e 600.000 PLS, resgate de
   R$ 1.000 para o banco (01/03/2026) e aporte de R$ 3.000 (01/06/2026). Hoje: Binance R$ 12.700 (R$ 4.000 + BTC R$ 7.200
   + 300 USD R$ 1.500), PulseChain R$ 450 na carteira e R$ 550 na pool. Total R$ 13.700; aportado líquido R$ 12.000.
   As funções da página de buscar saldo e cotação são trocadas por respostas fixas. */
const MONTAR = `window.__montar = () => {
  const D = s => Date.parse(s + "T15:00:00Z"), hoje = dia(Date.now());
  const precos = { USD:{}, BTC:{}, PLS:{}, ETH:{} };
  for(let t = D("2025-10-01"); dia(t) <= hoje; t += DIA_MS){ const d = dia(t);
    precos.USD[d] = 5; precos.PLS[d] = 0.0005; precos.ETH[d] = 20000; precos.BTC[d] = d < "2026-03-01" ? 500000 : d < "2026-09-01" ? 550000 : 600000; }
  const LP = "0xlppls", USDC = "0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07", pool = { poolTx:"PLS / USD", poolPar:LP };
  const ev = [
    { h:"a1", t:D("2025-10-01"), rede:"binance", k:"BRL", q:10000, op:"aporte", inic:false },
    { h:"b1", t:D("2025-10-02"), rede:"binance", k:"BRL", q:-6000, op:"troca", inic:true },
    { h:"b1", t:D("2025-10-02"), rede:"binance", k:"BTC", q:0.012, op:"troca", inic:true },
    { h:"b2", t:D("2025-10-03"), rede:"binance", k:"BRL", q:-2000, op:"troca", inic:true },
    { h:"b2", t:D("2025-10-03"), rede:"binance", k:"USDT", q:400, op:"troca", inic:true },
    { h:"s3", t:D("2025-11-01"), rede:"binance", k:"USDT", q:-100, op:"saque", inic:true },
    { h:"r3", t:D("2025-11-01") + 600e3, rede:"pulsechain", k:USDC, q:100, de:"0xponte", inic:false },
    { h:"r4", t:D("2025-11-02"), rede:"pulsechain", k:"nativo", q:1000000, de:"0xalguem", inic:false },
    { h:"p1", t:D("2025-11-10"), rede:"pulsechain", k:USDC, q:-50, inic:true, ...pool },
    { h:"p1", t:D("2025-11-10"), rede:"pulsechain", k:"nativo", q:-600000, inic:true, ...pool },
    { h:"p1", t:D("2025-11-10"), rede:"pulsechain", lp:true, k:LP, q:10, de:ZERO, excluido:true },
    { h:"s2", t:D("2026-03-01"), rede:"binance", k:"BRL", q:-1000, op:"saque", inic:true },
    { h:"a2", t:D("2026-06-01"), rede:"binance", k:"BRL", q:3000, op:"aporte", inic:false },
  ];
  ev.forEach(e => e.g = grupoDe(e));
  const conta = contabilizar(ev.filter(e => !e.excluido), precos, ev), saida = {};
  const serie = montarSerie(ev, precos, saida);
  const fim = {}; ev.filter(e => !e.excluido).forEach(e => { const k = e.rede + '|' + e.g; fim[k] = (fim[k] || 0) + e.q; });
  HIST = { versao:VERSAO_HIST, geradoEm:Date.now(), serie, pos:conta.pos, transito:conta.transito, taxas:conta.taxas, aportado:conta.aportado, resgatado:conta.resgatado, mov:conta.mov.reverse(),
    pools:[{ par:LP, rede:"pulsechain", nome:"PLS / USD", abertura:D("2025-11-10"), fechamento:null, status:"ativa", lpTotal:10, reserveUSD:200000, totalSupply:10000, t0:"WPLS", t1:"USDC", r0:200000000, r1:100000, farmMorta:null, txs:["p1"], rem:[] }],
    recompensas:{}, farms:[], resultadoPools:conta.resultadoPools, golpe:0, golpeLista:[], fim, info:{}, avisos:[], emPool:saida.emPool };
  PRECOS = precos;
  // saldos de agora = o que o histórico diz (nenhum movimento novo), cotações = as de hoje
  const carteira = Object.entries(fim).filter(([, q]) => q > 1e-12).map(([k, q]) => ({ rede:k.split('|')[0], g:k.split('|')[1], q }));
  window.__resposta = { erros:[], velhos:[] };
  saldosAgora = async () => ({ saldos:carteira.map(s => ({ ...s })), erros:window.__resposta.erros.slice() });
  precosAgora = async () => ({ precos:{ BRL:1, USD:5, BTC:600000, PLS:0.0005, ETH:20000 }, liq:{}, usd:5, velhos:window.__resposta.velhos.slice() });
  mercadoAgora = async () => ({}); posicoesAbertas = async () => []; atualizarPrecos = async () => PRECOS;
  refazerHistorico = async () => HIST;
};`;
const montar = pg => pg.evaluate(async () => { __montar(); await atualizarVivo(); tudo(); });

test("1. Pool v2 aberta entra no Total como no gráfico, sem queda no último dia e sem contar duas vezes", async () => {
  const { ctx, pg, erros } = await abrir();
  await montar(pg);
  const r = await pg.evaluate(async () => {
    const s = serieVisivel(0), ontem = s[s.length - 2].v, hoje = s[s.length - 1].v, hist = HIST.serie[HIST.serie.length - 1].v;
    const primeiro = totalVivo();
    await atualizarVivo(); tudo();   // segunda leitura: as moedas da pool não podem entrar de novo
    const pend = document.getElementById("pendencias").textContent;
    return { ontem, hoje, hist, primeiro, segundo:totalVivo(), pulse:linhasVivas().filter(x => x.rede === "pulsechain").reduce((a, x) => a + x.v, 0),
      rend:document.getElementById("resumoAtivos").textContent.match(/Rendimento total([^G]+)/)[1], diferenca:/Diferença de/.test(pend), emPool:HIST.emPool };
  });
  assert.equal(r.ontem, 13700);
  assert.equal(r.hist, 13700);         // o próprio histórico conta a pool hoje
  assert.equal(r.hoje, 13700);         // antes: 13150, o gráfico caía R$ 550 no último dia
  assert.equal(r.primeiro, 13700);     // antes: Total R$ 13.150,00
  assert.equal(r.segundo, 13700);      // lida duas vezes, continua 13.700 (não 14.250)
  assert.equal(r.pulse, 1000);         // PulseChain: R$ 450 na carteira + R$ 550 na pool (antes: 450)
  assert.equal(r.rend, "+14,2%");      // 13.700 / 12.000 − 1 (antes: +9,6%, 13.150 / 12.000 − 1)
  assert.equal(r.diferenca, false);    // o aviso "saldo de agora x histórico" não vê a pool como diferença
  assert.deepEqual(r.emPool, [{ par:"0xlppls", rede:"pulsechain", q:{ USD:50, PLS:600000 } }]);
  // pool retirada inteira: o LP queimado zera as moedas guardadas e nada sobra para o Total
  const fechada = await pg.evaluate(() => {
    const D = s => Date.parse(s + "T15:00:00Z"), LP = "0xlp2", par = { poolTx:"X", poolPar:LP };
    const ev = [{ h:"x0", t:D("2026-01-01"), rede:"pulsechain", g:"PLS", k:"nativo", q:1000, inic:false },
      { h:"x1", t:D("2026-01-02"), rede:"pulsechain", g:"PLS", k:"nativo", q:-1000, inic:true, ...par },
      { h:"x1", t:D("2026-01-02"), rede:"pulsechain", lp:true, k:LP, q:5, de:ZERO, excluido:true },
      { h:"x2", t:D("2026-02-01"), rede:"pulsechain", g:"PLS", k:"nativo", q:900, inic:true, ...par, poolRem:true },
      { h:"x2", t:D("2026-02-01"), rede:"pulsechain", lp:true, k:LP, q:-5, para:LP, excluido:true }];
    const saida = {}; montarSerie(ev, { PLS:{ "2026-01-01":1 } }, saida); return saida.emPool;
  });
  assert.deepEqual(fechada, []);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("2. \"Desde <data>\" desconta aportes e resgates do período, como o Rendimento total", async () => {
  const { ctx, pg, erros } = await abrir();
  await montar(pg);
  const ler = p => pg.evaluate(p => { est.periodo = p; desenharTopo(); return { rot:document.getElementById("rotPeriodo").textContent, v:document.getElementById("periodoVar").textContent }; }, p);
  // 6 meses: começa em 07/04/2026 com R$ 10.100 (aportado líquido 9.000). No período entrou o aporte de R$ 3.000.
  // Base = 10.100 + 3.000 = 13.100; hoje 13.700 → +4,6%. Antes: 13.150 / 10.100 − 1 = +30,2% (o aporte contado como ganho).
  assert.deepEqual(await ler(182), { rot:"Desde 07 abr 26, sem contar aportes", v:"+4,6%" });
  // 1 ano: começa em 06/10/2025 com R$ 10.000; no período, resgate de 1.000 e aporte de 3.000. Base 12.000 → +14,2%.
  // Antes: 13.150 / 10.000 − 1 = +31,5%.
  assert.deepEqual(await ler(365), { rot:"Desde 06 out 25, sem contar aportes", v:"+14,2%" });
  // desde o primeiro dia, dá o mesmo que o Rendimento total da aba Ativos
  const tudoP = await ler(400), rend = await pg.evaluate(() => document.getElementById("resumoAtivos").textContent.match(/Rendimento total([^G]+)/)[1]);
  assert.equal(tudoP.v, rend);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("3. A aba Tudo recebe o total novo depois de Atualizar e de refazer o histórico; a última visita não muda", async () => {
  const visita = { t:Date.parse("2026-10-03T15:00:00Z"), total:9999, precos:{ BTC:500000 } };
  const { ctx, pg, erros } = await abrir({ "cripto-v1-visita":JSON.stringify(visita) });
  await pg.evaluate(() => __montar());
  const guardado = () => pg.evaluate(() => ({ total:JSON.parse(localStorage.getItem("cripto-v1-total")), visita:JSON.parse(localStorage.getItem("cripto-v1-visita")), texto:document.getElementById("visita").textContent }));
  // Atualizar
  await pg.click("#btnAtualizar"); await pg.waitForFunction(() => !ocupado);
  let g = await guardado();
  assert.deepEqual(g.total, { t:AGORA.getTime(), total:13700 });   // antes: a chave não existia e a aba Tudo seguia com R$ 9.999
  assert.deepEqual(g.visita, visita);                                // "Desde a sua última visita" continua comparando com a abertura
  assert.match(g.texto, /Você esteve aqui em 03 out 2026.*R\$\s9\.999,00.*R\$\s13\.700,00/);
  // CSV novo ou "não é golpe": o histórico é refeito e o total vai junto (aqui o BTC subiu para R$ 700 mil)
  await pg.evaluate(async () => { const p = precosAgora; precosAgora = async () => { const r = await p(); r.precos.BTC = 700000; return r; }; await refazerTudo(); });
  g = await guardado();
  assert.equal(g.total.total, 14900);                                // 13.700 + 0,012 × 100 mil
  assert.deepEqual(g.visita, visita);
  // leitura com rede fora do ar: não grava (fica o 14.900 da leitura completa)
  await pg.evaluate(async () => { window.__resposta.erros = ["Solana"]; precosAgora = async () => ({ precos:{ BRL:1, USD:5, BTC:1, PLS:0.0005 }, liq:{}, usd:5, velhos:[] }); document.getElementById("btnAtualizar").click(); await new Promise(r => setTimeout(r, 50)); });
  await pg.waitForFunction(() => !ocupado);
  assert.equal((await guardado()).total.total, 14900);
  assert.deepEqual(erros, []);
  await ctx.close();

  // a aba Tudo lê o total novo; sem ele (Carteira de antes desta versão), lê o da última visita
  const tudo = async semente => {
    const c = await nav.newContext({ locale:"pt-BR", timezoneId:"America/Sao_Paulo", viewport:{ width:1280, height:900 } });
    await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await c.addInitScript(s => { for (const k in s) localStorage.setItem(k, s[k]); }, semente);
    const p = await c.newPage(); await p.clock.setFixedTime(AGORA);
    await p.goto(srv.url + "index.html#tudo"); await espera(2000);
    const app = p.frames().find(f => f.url().includes("app.html"));
    const txt = await app.evaluate(() => document.body.textContent.replace(/\s+/g, " "));
    await c.close(); return txt;
  };
  const novo = await tudo({ "cripto-v1-visita":JSON.stringify(visita), "cripto-v1-total":JSON.stringify({ t:AGORA.getTime() - 600e3, total:14900 }) });
  assert.match(novo, /14\.900,00/); assert.doesNotMatch(novo, /9\.999,00/);
  assert.match(await tudo({ "cripto-v1-visita":JSON.stringify(visita) }), /9\.999,00/);
});

test("5. \"Desde ontem\" e a coluna 24 h comparam com o fechamento de ontem também entre 21h e meia-noite", async () => {
  // Fechamentos diários (21h de Brasília): 05/10 R$ 500 mil, 06/10 R$ 590 mil. Agora: R$ 600 mil.
  const ver = async hora => {
    const { ctx, pg, erros } = await abrir({}, hora);
    const r = await pg.evaluate(() => {
      HIST = null; PRECOS = { BTC:{ "2026-10-04":480000, "2026-10-05":500000, "2026-10-06":590000, "2026-10-07":600000 } };
      VIVO = { t:Date.now(), saldos:[{ rede:"binance", g:"BTC", q:0.1 }], precos:{ BRL:1, USD:5, BTC:600000 }, liq:{}, usd:5, erros:[], velhos:[], mercado:{}, posicoes:[] };
      tudo();
      return { ontem:document.getElementById("mudou").textContent.match(/Desde ontem(.*?\))/)[1], col:document.querySelector("#ativos tr td:nth-child(5)").textContent };
    });
    assert.deepEqual(erros, []); await ctx.close(); return r;
  };
  // 20:00 de 06/10 em Brasília: compara com o fechamento de 05/10 (antes também)
  assert.deepEqual(await ver(new Date("2026-10-06T23:00:00Z")), { ontem:"+R$ 10.000,00 (+20%)", col:"+20%" });
  // 22:00 de 06/10 em Brasília: continua o fechamento de 05/10. Antes: o de 06/10, de uma hora atrás: +R$ 1.000,00 (+1,7%)
  assert.deepEqual(await ver(new Date("2026-10-07T01:00:00Z")), { ontem:"+R$ 10.000,00 (+20%)", col:"+20%" });
  // 00:30 de 07/10 em Brasília: o dia virou, "ontem" é 06/10
  assert.deepEqual(await ver(new Date("2026-10-07T03:30:00Z")), { ontem:"+R$ 1.000,00 (+1,7%)", col:"+1,7%" });
});

test("6. Por carteira: o Retorno de cada linha é o da moeda, e o \"vendido\" não se repete", async () => {
  const { ctx, pg, erros } = await abrir();
  // 2 ETH comprados por R$ 20.000 que ainda estão na carteira (1 na Binance, 1 na Base), mais ETH que custou R$ 10.000
  // e foi vendido com R$ 4.000 de lucro. Hoje o ETH vale R$ 15.000.
  // Retorno da moeda: (20.000 + 10.000 + 10.000 em aberto + 4.000 vendido) / 30.000 − 1 = +46,7%.
  const r = await pg.evaluate(() => {
    HIST = { versao:VERSAO_HIST, geradoEm:Date.now(), serie:[], pos:{ ETH:{ q:2, custo:20000, custoVendido:10000, realizado:4000 } }, mov:[], pools:[], fim:{}, aportado:0, resgatado:0 };
    PRECOS = {};
    VIVO = { t:Date.now(), saldos:[{ rede:"binance", g:"ETH", q:1 }, { rede:"base", g:"ETH", q:1 }], precos:{ BRL:1, USD:5, ETH:15000 }, liq:{}, usd:5, erros:[], velhos:[], mercado:{}, posicoes:[] };
    const linhas = modo => { est.agrupar = modo; desenharAtivos(); return [...document.querySelectorAll("#ativos tr:not(.grupo)")].map(tr => ({ aberto:tr.children[6].textContent, ret:tr.children[7].textContent })); };
    return { ativo:linhas("ativo"), carteira:linhas("carteira") };
  });
  assert.deepEqual(r.ativo, [{ aberto:"R$ 10.000,00+50%, vendido: R$ 4.000,00", ret:"+46,7%" }]);
  // antes: cada linha "+30%" e "vendido: R$ 4.000,00" nas duas (parecia R$ 8.000 vendidos)
  assert.deepEqual(r.carteira, [{ aberto:"R$ 5.000,00+50%", ret:"+46,7%" }, { aberto:"R$ 5.000,00+50%", ret:"+46,7%" }]);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("13. No modo US$, as variações são em dólar", async () => {
  // Ontem e há 30 dias: dólar R$ 5,00 e BTC R$ 500 mil (US$ 100 mil). Agora: dólar R$ 5,50 e BTC R$ 550 mil (US$ 100 mil).
  // Em reais tudo subiu 10%; em dólar nada mudou.
  const { ctx, pg, erros } = await abrir();
  const r = await pg.evaluate(() => {
    PRECOS = { USD:{}, BTC:{} }; const serie = [];
    for(let t = Date.parse("2026-09-01"); t <= Date.parse("2026-10-05"); t += DIA_MS){ const d = dia(t); PRECOS.USD[d] = 5; PRECOS.BTC[d] = 500000; serie.push({ d, v:55000, a:55000, r:{ binance:55000 }, usd:5 }); }
    HIST = { versao:VERSAO_HIST, geradoEm:Date.now(), serie, pos:{}, mov:[], pools:[], fim:{}, aportado:55000, resgatado:0 };
    VIVO = { t:Date.now(), saldos:[{ rede:"binance", g:"BTC", q:0.1 }, { rede:"binance", g:"USD", q:1000 }], precos:{ BRL:1, USD:5.5, BTC:550000 }, liq:{}, usd:5.5, erros:[], velhos:[], mercado:{}, posicoes:[] };
    est.periodo = 30;
    const ler = moeda => { est.moeda = moeda; tudo();
      return { ontem:document.getElementById("mudou").textContent.match(/Desde ontem(.*?\))/)[1], periodo:document.getElementById("periodoVar").textContent,
        col:[...document.querySelectorAll("#ativos tr")].map(tr => tr.children[0].querySelector("b").textContent + " " + tr.children[4].textContent),
        rend:[...document.querySelectorAll("#rendimento li")].map(li => li.querySelector("b").textContent + " " + li.children[2].textContent) }; };
    return { brl:ler("BRL"), usd:ler("USD") };
  });
  assert.deepEqual(r.brl, { ontem:"+R$ 5.500,00 (+10%)", periodo:"+10%", col:["BTC +10%", "USD +10%"], rend:["BTC +10%", "USD +10%"] });
  // antes, em US$: "+US$ 1.000,00 (+10%)", período +10%, o próprio dólar com +10% em 24 h e em 30 dias
  assert.deepEqual(r.usd, { ontem:"US$ 0,00 (0%)", periodo:"0%", col:["BTC 0%", "USD 0%"], rend:["BTC 0%", "USD 0%"] });
  assert.deepEqual(erros, []);
  await ctx.close();
});
