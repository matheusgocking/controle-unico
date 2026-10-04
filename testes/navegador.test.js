/* Testes que abrem o app de verdade, num Chromium sem tela, com os cadernos inventados de
   dados-de-teste.js e o relógio parado em 04/10/2026. Conferem as contas que decidem o que
   aparece na tela (Situação do mês, Casa, Clínica), a junção das cópias e que nenhuma página
   quebra no celular ou no computador. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: esperado ${b}, veio ${a}`);

/* abre a casca com os cadernos de teste e devolve a página, os erros e o quadro pedido */
async function abrir({ largura = 1280, altura = 900, escuro = false, quadro = "app.html", clinica = true } = {}) {
  const ctx = await nav.newContext({ viewport:{ width:largura, height:altura }, isMobile: largura < 700, hasTouch: largura < 700,
    colorScheme: escuro ? "dark" : "light", locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const pagina = await ctx.newPage();
  await pagina.clock.install({ time: new Date(D.HOJE) });
  await ctx.addInitScript(([d, c, k]) => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-dinheiro-cache", d);
    localStorage.setItem("controle-unico-casa-cache", c);
    if (k) localStorage.setItem("controle-unico-clinica-cache", k);
    localStorage.setItem("teste-semeado", "1");
  }, [JSON.stringify(D.dinheiro), JSON.stringify(D.casa), clinica ? JSON.stringify(D.clinica) : null]);
  const erros = [];
  pagina.on("pageerror", e => erros.push(e.message));
  pagina.on("dialog", d => d.accept());
  // as fontes do Google não interessam aos testes (e podem não carregar)
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|accounts\.google\.com/, r => r.abort());
  await pagina.goto(srv.url + "index.html");
  await pagina.waitForTimeout(800);
  let f = null;
  if (quadro) {
    if (quadro === "clinica.html") { await pagina.click("[data-p=clinica]"); await pagina.waitForTimeout(800); }
    f = pagina.frames().find(x => x.url().includes(quadro));
  }
  return { ctx, pagina, f, erros };
}

test("Situação do mês: recebi, gastei, saldo, ainda vai sair e fecha em", async () => {
  const { ctx, f, erros } = await abrir({ clinica:false });
  const d = await f.evaluate(() => contasDinheiro());
  perto(d.entrou, 4200, "recebi");
  perto(d.fixosMes, 110, "fixos já vencidos (só o do dia 2)");
  perto(d.minhaCasa, 340, "o que eu paguei na casa");
  perto(d.saiu, 312.40 + 180 + 96.50 + 58.90 + 110 + 340, "gastei");
  perto(d.faltaSair, 1800 + 120, "ainda vai sair (dias 5 e 15)");
  perto(d.sobra, 4200 - 1097.80 - 500, "saldo agora (o aporte sai do saldo)");
  perto(d.fimDoMes, d.sobra + (d.falta || 0) - 1920, "fecha o mês em");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Casa: cada pessoa é comparada com a própria parte", async () => {
  const { ctx, f } = await abrir({ clinica:false });
  const r = await f.evaluate(() => {
    const fora = [];
    for (const div of [0.5, 0.7, 0]) { livro.casa.divisao = div; const c = contasCasa(); fora.push([c.total, c.dif["Pessoa Um"], c.dif["Pessoa Dois"]]); }
    livro.casa.divisao = "abc"; const estranho = parteCasa();
    livro.casa.divisao = undefined; const vazio = parteCasa();
    return { fora, estranho, vazio };
  });
  // Pessoa Um pagou 340, Pessoa Dois 180, total 520
  assert.deepEqual(r.fora[0].map(x => Math.round(x * 100) / 100), [520, 80, -80]);
  assert.deepEqual(r.fora[1].map(x => Math.round(x * 100) / 100), [520, -24, 24]);
  assert.deepEqual(r.fora[2].map(x => Math.round(x * 100) / 100), [520, 340, -340]);
  assert.equal(r.estranho, 0.5);
  assert.equal(r.vazio, 0.5);
  await ctx.close();
});

test("Valor digitado à mão: ponto de milhar e vírgula", async () => {
  const { ctx, f } = await abrir({ clinica:false });
  const v = await f.evaluate(() => ["1.250", "1250.5", "1.250,50", "12.5", "1.000.000", "R$ 80,00", "0,40"].map(lerValorBR));
  assert.deepEqual(v, [1250, 1250.5, 1250.5, 12.5, 1000000, 80, 0.4]);
  await ctx.close();
});

test("Fixos em janeiro: copiar de dezembro preenche só janeiro", async () => {
  const { ctx, f } = await abrir({ clinica:false });
  const r = await f.evaluate(() => {
    ref = new Date(2027, 0, 1); aba = "carteira"; vistaDin = "fixos"; desenhar();
    const tinhaBotao = !!document.getElementById("copiarFixos");
    const dezembro = livro.matheus.gastosFixos.map(g => g.valores["2026-12"]);
    document.getElementById("copiarFixos").click();
    return { tinhaBotao, dezembro,
      janeiro: livro.matheus.gastosFixos.map(g => g.valores["2027-01"]),
      dezembroDepois: livro.matheus.gastosFixos.map(g => g.valores["2026-12"]),
      botaoDepois: !!document.getElementById("copiarFixos") };
  });
  assert.equal(r.tinhaBotao, true);
  assert.deepEqual(r.janeiro, [1800, 120, 110]);
  assert.deepEqual(r.dezembroDepois, r.dezembro);
  assert.equal(r.botaoDepois, false);
  await ctx.close();
});

test("Apagar e alterar um lançamento têm desfazer que devolve tudo como estava", async () => {
  const { ctx, f } = await abrir({ clinica:false });
  const antes = await f.evaluate(() => JSON.stringify(livro.matheus.lancamentos));
  await f.click('tr.clic[data-editar="matheus:l4"]');
  await f.click(".lanc-apagar");
  assert.equal(await f.evaluate(() => livro.matheus.lancamentos.some(l => l.id === "l4")), false);
  await f.click("[data-desfazer]");
  assert.equal(await f.evaluate(() => JSON.stringify(livro.matheus.lancamentos)), antes);
  await f.click('tr.clic[data-editar="matheus:l4"]');
  await f.fill("#lanc-desc", "Mudado");
  await f.click(".lanc-ok");
  assert.equal(await f.evaluate(() => livro.matheus.lancamentos.find(l => l.id === "l4").descricao), "Mudado");
  await f.click("[data-desfazer]");
  assert.equal(await f.evaluate(() => JSON.stringify(livro.matheus.lancamentos)), antes);
  await ctx.close();
});

test("Junção das cópias: nada lançado em um aparelho some", async () => {
  const { ctx, pagina } = await abrir({ quadro:null, clinica:false });
  const r = await pagina.evaluate(() => {
    const J = Nuvem.juntar;
    const base = { lancamentos:[{ id:"a", v:1 }, { id:"b", v:2 }], divisao:0.5 };
    return {
      // cada aparelho lançou uma coisa diferente
      somam: J(base, { lancamentos:[...base.lancamentos, { id:"c", v:3 }], divisao:0.5 }, { lancamentos:[...base.lancamentos, { id:"d", v:4 }], divisao:0.5 }),
      // apagado num, intocado no outro: fica apagado
      apaga: J(base, { lancamentos:[base.lancamentos[0]], divisao:0.5 }, base),
      // cada um mudou um campo diferente do mesmo lançamento
      campos: J({ x:{ id:"a", v:1, d:"x" } }, { x:{ id:"a", v:9, d:"x" } }, { x:{ id:"a", v:1, d:"y" } }),
      // os dois mudaram o mesmo valor: vale o deste aparelho
      mesmo: J({ divisao:0.5 }, { divisao:0.6 }, { divisao:0.7 }),
      // apagado lá, mudado aqui: fica (a mudança não se perde)
      mudadoAqui: J(base, { lancamentos:[{ id:"a", v:1 }, { id:"b", v:20 }] }, { lancamentos:[{ id:"a", v:1 }] }),
      // sem base (aparelho novo): as duas listas se somam
      semBase: J(undefined, { l:[{ id:"a" }] }, { l:[{ id:"b" }] }, true)
    };
  });
  assert.deepEqual(r.somam.lancamentos.map(x => x.id).sort(), ["a", "b", "c", "d"]);
  assert.deepEqual(r.apaga.lancamentos.map(x => x.id), ["a"]);
  assert.deepEqual(r.campos.x, { id:"a", v:9, d:"y" });
  assert.equal(r.mesmo.divisao, 0.6);
  assert.deepEqual(r.mudadoAqui.lancamentos.map(x => x.id).sort(), ["a", "b"]);
  assert.deepEqual(r.semBase.l.map(x => x.id).sort(), ["a", "b"]);
  await ctx.close();
});

test("Clínica: quinzenais alternando o mesmo horário, previsto e valores com centavos", async () => {
  const { ctx, f, erros } = await abrir({ quadro:"clinica.html" });
  const r = await f.evaluate(() => {
    const quem = d => { const p = pacienteEm(3, 10, d); return p ? p.id : null; };
    const n = numerosDoMes(new Date(2026, 9, 1));
    return {
      semanas: [new Date(2026, 9, 7), new Date(2026, 9, 14), new Date(2026, 9, 21), new Date(2026, 9, 28)].map(quem),
      previsto: n.previsto,
      moedas: [moeda(0.4), moeda(700), moeda(1250.5)]
    };
  });
  // pC na semana de 28/09 (e as pares depois dela), pD na semana de 05/10
  assert.deepEqual(r.semanas, ["pD", "pC", "pD", "pC"]);
  // mensal 700 + avulso 4 terças de outubro x 200 + dois quinzenais de 400
  assert.equal(r.previsto, 700 + 800 + 400 + 400);
  assert.deepEqual(r.moedas, ["R$ 0,40", "R$ 700", "R$ 1.250,50"]);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Clínica: números internos repetidos ganham número novo, igual em qualquer aparelho", async () => {
  const { ctx, f } = await abrir({ quadro:"clinica.html" });
  const r = await f.evaluate(() => {
    const mk = () => ({ pacientes:[{ id:"p1", codigo:"A" }, { id:"p1", codigo:"B" }],
      pagamentos:[{ id:"g1", pacienteId:"p1", codigo:"A", valor:1 }, { id:"g1", pacienteId:"p1", codigo:"B", valor:2 }, { valor:3 }] });
    const x = mk(), y = mk();
    const trocas = consertarIds(x); consertarIds(y);
    return { trocas, igual: JSON.stringify(x) === JSON.stringify(y), segunda: consertarIds(x), x };
  });
  assert.equal(r.trocas, 3);
  assert.equal(r.igual, true);
  assert.equal(r.segunda, 0);
  assert.deepEqual(r.x.pagamentos.map(g => g.valor), [1, 2, 3]);           // nenhum valor muda
  assert.equal(new Set(r.x.pagamentos.map(g => g.id)).size, 3);           // números únicos
  assert.equal(r.x.pagamentos[1].pacienteId, r.x.pacientes[1].id);        // o pagamento de B segue B
  await ctx.close();
});

test("Formulação: apóstrofo não vira hashtag", async () => {
  const ctx = await nav.newContext();
  const p = await ctx.newPage();
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|accounts\.google\.com/, r => r.abort());
  await p.goto(srv.url + "formulacao.html");
  const h = await p.evaluate(() => comTags("copo d'água #ansiedade <b>"));
  assert.ok(!/>#39</.test(h) && !h.includes('data-tag="39"'), h);   // "&#39;" é o apóstrofo escapado; o erro era virar botão
  assert.equal((h.match(/class="tag"/g) || []).length, 1);
  assert.ok(h.includes("&lt;b&gt;"));
  await ctx.close();
});

/* nenhuma página quebra nem passa da largura da tela, no celular e no computador, claro e escuro */
for (const [nome, largura] of [["celular", 375], ["computador", 1280]]) for (const escuro of [false, true]) {
  test(`Páginas abrem sem erro: ${nome}, ${escuro ? "escuro" : "claro"}`, async () => {
    const { ctx, pagina, erros } = await abrir({ largura, escuro, quadro:null });
    const largos = [];
    for (const aba of ["tudo", "carteira", "clinica"]) {
      await pagina.click(`[data-p=${aba}]`); await pagina.waitForTimeout(500);
      for (const fr of pagina.frames()) {
        const w = await fr.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 ? document.documentElement.scrollWidth : 0).catch(() => 0);
        if (w) largos.push(`${aba} ${fr.url()} ${w}`);
      }
    }
    for (const pg of ["ana.html", "formulacao.html", "conferir.html", "privacidade.html"]) {
      await pagina.goto(srv.url + pg); await pagina.waitForTimeout(400);
      const w = await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 ? document.documentElement.scrollWidth : 0);
      if (w) largos.push(`${pg} ${w}`);
    }
    assert.deepEqual(erros, []);
    assert.deepEqual(largos, []);
    await ctx.close();
  });
}
