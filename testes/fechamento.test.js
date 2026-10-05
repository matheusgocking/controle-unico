/* Fechamento do mês (05/10/2026): o resumo de setembro contra os meses de antes e o que fugiu
   do normal. Cadernos inventados, com junho, julho e agosto iguais e setembro diferente. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");

const HOJE = "2026-10-04T12:00:00-03:00";
const L = (id, data, tipo, categoria, valor, descricao) => ({ id, data, tipo, categoria, valor, descricao: descricao || categoria, forma:"PIX" });
const lanc = [];
["06", "07", "08"].forEach(m => {
  lanc.push(L("r" + m, `2026-${m}-05`, "Receita", "Outras entradas", 5000, "Aula"));
  lanc.push(L("m" + m, `2026-${m}-08`, "Despesa", "Mercado", 400));
  lanc.push(L("b" + m, `2026-${m}-12`, "Despesa", "Restaurante e bar", 300));
});
lanc.push(L("r09", "2026-09-05", "Receita", "Outras entradas", 3000, "Aula"));
lanc.push(L("m09", "2026-09-08", "Despesa", "Mercado", 900, "Compra do mês"));
lanc.push(L("b09", "2026-09-12", "Despesa", "Restaurante e bar", 100));
lanc.push(L("v09", "2026-09-20", "Despesa", "Lazer", 600, "Viagem"));
lanc.push(L("x09", "2026-09-28", "Resgate", "Reserva", 1000, "Reserva"));
const dinheiro = { versao:1, caderno:"dinheiro", categorias:2, lancamentos:lanc,
  gastosFixos:[{ id:"g1", descricao:"Luz", categoria:"Casa e contas", dia:10, valores:{ "2026-06":150, "2026-07":150, "2026-08":150, "2026-09":220 } }],
  reserva:{ saldoBase:5000, dataBase:"2026-06-01", meta:0 }, pendencias:[], limites:{ Mercado:700 } };
const casa = { versao:1, caderno:"casa", categorias:2, pessoas:["Pessoa Um","Pessoa Dois"], divisao:0.5, lancamentos:[
  { id:"c1", data:"2026-08-03", quem:"Pessoa Um", descricao:"Feira", categoria:"Mercado", valor:600 },
  { id:"c2", data:"2026-08-10", quem:"Pessoa Dois", descricao:"Luz", categoria:"Energia", valor:400 },
  { id:"c3", data:"2026-09-03", quem:"Pessoa Um", descricao:"Feira", categoria:"Mercado", valor:1000 },
  { id:"c4", data:"2026-09-10", quem:"Pessoa Dois", descricao:"Luz", categoria:"Energia", valor:600 } ] };

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });
const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: esperado ${b}, veio ${a}`);

async function abrir(largura) {
  const ctx = await nav.newContext({ viewport:{ width:largura || 1280, height:900 }, locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const pagina = await ctx.newPage();
  await pagina.clock.install({ time: new Date(HOJE) });
  await ctx.addInitScript(([d, c]) => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-dinheiro-cache", d);
    localStorage.setItem("controle-unico-casa-cache", c);
    localStorage.setItem("teste-semeado", "1");
  }, [JSON.stringify(dinheiro), JSON.stringify(casa)]);
  const erros = [];
  pagina.on("pageerror", e => erros.push(e.message));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|accounts\.google\.com/, r => r.abort());
  await pagina.goto(srv.url + "index.html");
  await pagina.waitForTimeout(800);
  const f = pagina.frames().find(x => x.url().includes("app.html"));
  return { ctx, pagina, f, erros };
}

test("Fechamento de setembro: contas contra o normal e o que fugiu dele", async () => {
  const { ctx, f, erros } = await abrir();
  const r = await f.evaluate(() => { const F = fechamento("2026-09"); return { F, alertas:alertasFechamento(F) }; });
  const { F, alertas } = r;
  assert.equal(F.normal.n, 3);
  perto(F.normal.entrou, 5000, "recebido normal");
  perto(F.normal.saiu, (850 + 850 + 1450) / 3, "gasto normal");
  perto(F.din.saiu, 900 + 100 + 600 + 220 + 1000, "gasto de setembro");
  perto(F.din.sobra, 3000 - 2820 + 1000, "sobra de setembro, com o resgate");
  perto(F.reservaFim, 4000, "reserva no fim de setembro");
  perto(F.mc.media, 1000, "média da casa só com agosto");
  const txt = alertas.map(a => a[0] + " " + a[1]).join("\n");
  assert.match(txt, /warn Gastou .* a mais que o normal/);
  assert.match(txt, /warn Recebeu R\$\s2\.000,00 a menos/);
  assert.match(txt, /warn Tirou R\$\s1\.000,00 da reserva/);
  assert.match(txt, /warn Mercado passou o limite em R\$\s200,00/);
  assert.match(txt, /warn Lazer: R\$\s600,00, sem gasto nos meses anteriores/);
  assert.match(txt, /warn O fixo Luz subiu de R\$\s150,00 para R\$\s220,00/);
  assert.match(txt, /warn A casa gastou R\$\s600,00 acima da média/);
  assert.match(txt, /pos Restaurante e bar: R\$\s100,00, R\$\s200,00 abaixo do normal/);
  assert.ok(!/warn Mercado: /.test(txt), "categoria que passou o limite não aparece duas vezes");
  // os alertas que pedem atenção vêm antes das boas notícias
  assert.ok(alertas.findIndex(a => a[0] === "pos") > alertas.map(a => a[0]).lastIndexOf("warn"));
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Fechamento só lê: abrir a tela não muda os cadernos", async () => {
  const { ctx, f } = await abrir();
  const antes = await f.evaluate(() => JSON.stringify([livro.matheus, livro.casa]));
  await f.click('[data-fech="2026-09"]');
  await f.waitForSelector(".fe-al");
  const depois = await f.evaluate(() => JSON.stringify([livro.matheus, livro.casa]));
  assert.equal(depois, antes);
  await ctx.close();
});

test("Aviso na aba Tudo leva ao fechamento; o mês corrente pede o mês anterior", async () => {
  const { ctx, f, erros } = await abrir();
  assert.match(await f.textContent(".fe-aviso"), /Setembro fechou/);
  await f.click(".fe-aviso [data-fech]");
  await f.waitForSelector(".fe-al");
  assert.equal(await f.evaluate(() => [aba, vistaDin, chaveMes(ref)].join(" ")), "carteira fech 2026-09");
  assert.match(await f.textContent("#tela"), /Como setembro fechou/);
  // no mês corrente, a tela explica e oferece o mês que acabou
  await f.click('[data-mes="1"]');
  assert.match(await f.textContent("#tela"), /Outubro ainda não acabou/);
  // a subaba, aberta com o mês corrente, já cai no mês anterior
  await f.click('[data-vd="mes"]');
  await f.click('[data-vd="fech"]');
  assert.equal(await f.evaluate(() => chaveMes(ref)), "2026-09");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Fechamento cabe no celular sem rolar para o lado", async () => {
  const { ctx, f, erros } = await abrir(390);
  await f.click(".fe-aviso [data-fech]");
  await f.waitForSelector(".fe-al");
  const larg = await f.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(larg[0] <= larg[1], `a página tem ${larg[0]}px numa tela de ${larg[1]}px`);
  assert.deepEqual(erros, []);
  await ctx.close();
});
