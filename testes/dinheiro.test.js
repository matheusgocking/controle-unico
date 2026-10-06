/* Contas do Dinheiro revistas em 04/10/2026: mês futuro, fixo do dia 31, mês a mês com a reserva,
   veredito sem a Clínica e os campos de valor com a vírgula automática. Cadernos inventados. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: esperado ${b}, veio ${a}`);

async function abrir() {
  const ctx = await nav.newContext({ viewport:{ width:1280, height:900 }, locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const pagina = await ctx.newPage();
  await pagina.clock.install({ time: new Date(D.HOJE) });
  await ctx.addInitScript(([d, c]) => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-dinheiro-cache", d);
    localStorage.setItem("controle-unico-casa-cache", c);
    localStorage.setItem("teste-semeado", "1");
  }, [JSON.stringify(D.dinheiro), JSON.stringify(D.casa)]);
  const erros = [];
  pagina.on("pageerror", e => erros.push(e.message));
  pagina.on("dialog", d => d.accept());
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|accounts\.google\.com/, r => r.abort());
  await pagina.goto(srv.url + "index.html");
  await pagina.waitForTimeout(800);
  const f = pagina.frames().find(x => x.url().includes("app.html"));
  return { ctx, f, erros };
}

test("Mês futuro: os fixos ficam em 'Ainda vai sair', não em 'Gastei'", async () => {
  const { ctx, f, erros } = await abrir();
  const d = await f.evaluate(() => { ref = new Date(2026, 10, 1); return contasDinheiro(); });
  perto(d.fixosMes, 0, "fixos já saídos em novembro");
  perto(d.faltaSair, 1800 + 120 + 110, "fixos de novembro ainda por sair");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Fixo do dia 31 cobra no último dia dos meses mais curtos", async () => {
  const { ctx, f } = await abrir();
  const r = await f.evaluate(() => [diaFixo({ dia:31 }, "2026-09"), diaFixo({ dia:31 }, "2027-02"), diaFixo({ dia:31 }, "2026-10"), diaFixo({ dia:null }, "2026-10")]);
  assert.deepEqual(r, [30, 28, 31, 0]);
  await ctx.close();
});

test("Mês a mês: o que sobrou é a mesma conta do saldo da Situação do mês", async () => {
  const { ctx, f } = await abrir();
  const r = await f.evaluate(() => {
    ref = new Date(2026, 8, 1); const set = contasDinheiro();
    const s = serieMeses().find(m => m.k === "2026-09");
    return { saldo:set.sobra, sobra:s.sobra };
  });
  perto(r.sobra, r.saldo, "setembro, mês fechado");
  const out = await f.evaluate(() => { ref = new Date(2026, 9, 1); return serieMeses().find(m => m.k === "2026-10"); });
  perto(out.sobra, out.entrou - out.saiu - 500, "outubro desconta o aporte de 500");
  await ctx.close();
});

test("Sem a Clínica, o veredito não diz 'Não pode gastar'", async () => {
  const { ctx, f } = await abrir();
  const t = await f.evaluate(() => { janelaClinica = () => null; localStorage.removeItem("controle-unico-clinica-cache"); ref = new Date(2026, 9, 1); aba = "carteira"; vistaDin = "mes"; desenhar(); return document.querySelector(".veredito").innerText; });
  assert.match(t, /Ainda sem previsão/);
  await ctx.close();
});

test("Reserva, fixo e pendência aceitam o valor com a vírgula automática", async () => {
  const { ctx, f, erros } = await abrir();
  await f.evaluate(() => { aba = "carteira"; vistaDin = "mes"; desenhar(); document.querySelector("#fReserva").closest("details").open = true; });
  await f.fill('#fReserva [name="saldoBase"]', "");
  await f.type('#fReserva [name="saldoBase"]', "923456");
  assert.equal(await f.inputValue('#fReserva [name="saldoBase"]'), "9.234,56");
  await f.click('#fReserva [type="submit"]');
  perto(await f.evaluate(() => livro.matheus.reserva.saldoBase), 9234.56, "saldo conferido");
  perto(await f.evaluate(() => livro.matheus.reserva.meta), 20000, "a meta não mudou");

  await f.evaluate(() => { vistaDin = "fixos"; desenhar(); });
  const campo = '[data-valorfixo="g1"]';
  assert.equal(await f.inputValue(campo), "1.800,00");
  await f.fill(campo, "");
  await f.type(campo, "190050");
  await f.dispatchEvent(campo, "change");
  perto(await f.evaluate(() => livro.matheus.gastosFixos.find(g => g.id === "g1").valores["2026-10"]), 1900.5, "aluguel de outubro");
  perto(await f.evaluate(() => livro.matheus.gastosFixos.find(g => g.id === "g1").valores["2026-11"]), 1800, "novembro não muda");

  await f.evaluate(() => { vistaDin = "pend"; desenhar(); document.querySelector("#fPend").closest("details").open = true; });
  await f.fill('#fPend [name="nome"]', "Fulano");
  await f.type('#fPend [name="total"]', "125000");
  await f.click('#fPend [type="submit"]');
  const p = await f.evaluate(() => livro.matheus.pendencias[0]);
  perto(p.total, 1250, "pendência de mil duzentos e cinquenta");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Média da casa: últimos 12 meses fechados, só a partir de agosto de 2026", async () => {
  const { ctx, f } = await abrir();
  const t = await f.evaluate(() => {
    const mk = (data, valor) => ({ id:data + valor, data, quem:"Pessoa Um", descricao:"-", categoria:"Mercado", valor });
    livro.casa.lancamentos.push(mk("2026-07-20", 50), mk("2026-08-10", 1000), mk("2026-09-10", 2000));
    ref = new Date(2026, 9, 1); aba = "casa"; desenhar();
    return document.querySelector(".situ .nums").innerText;
  });
  assert.match(t, /R\$\s?1\.500,00/);           // (1000 + 2000) / 2, julho fica de fora
  assert.match(t, /últimos 2 meses fechados/);
  await ctx.close();
});

test("Recebi mostra embaixo o resgate e o aporte do mês na reserva", async () => {
  const { ctx, f, erros } = await abrir();
  const r = await f.evaluate(() => {
    ref = new Date(2026, 9, 1); aba = "carteira"; vistaDin = "mes"; desenhar();
    const d = contasDinheiro();
    return { d, txt: document.querySelector(".situ .k").innerText };
  });
  if (r.d.aportesMes > 0.005) assert.match(r.txt, /guardados na reserva, não gastos/);
  if (r.d.resgatesMes > 0.005) assert.match(r.txt, /resgatados da reserva/);
  else assert.doesNotMatch(r.txt, /resgatados/);
  assert.ok(r.d.aportesMes > 0.005, "outubro dos dados de teste tem aporte");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Listas do mês: no mesmo dia, o último lançado aparece primeiro", async () => {
  const { ctx, f, erros } = await abrir();
  const r = await f.evaluate(() => {
    ref = new Date(2026, 9, 1);
    const lanc = ordenar(livro.matheus.lancamentos.filter(noMes), "lanc").map(l => l.id);
    ordem.lanc = { c:"data", d:1 };
    const antigos = ordenar(livro.matheus.lancamentos.filter(noMes), "lanc").map(l => l.id);
    ordem.lanc = { c:"data", d:-1 };
    return { lanc, antigos };
  });
  // l2 e l3 são de 02/10, l4 e l5 de 03/10: l3 e l5 foram lançados depois
  assert.deepEqual(r.lanc, ["l6", "l5", "l4", "l3", "l2", "l1"]);
  assert.deepEqual(r.antigos, ["l1", "l2", "l3", "l4", "l5", "l6"]);
  assert.deepEqual(erros, []);
  await ctx.close();
});
