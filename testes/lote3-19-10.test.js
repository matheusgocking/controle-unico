/* Lote 3 da revisão (19/10/2026): a mesma pessoa com o mesmo nome, vencimento passado como "venceu em",
   remarcação com a data do contato, menu da célula pelo teclado; Meus lançamentos com todos os meses,
   categorias próprias, "recebi uma parte" sem janelinha, gráfico com a sobra; Ana com "Salvo." e erro junto
   do campo; Cripto lembrando "Esconder valores". Cadernos inventados; nada vai à internet. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

async function contexto(largura){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:900 }, isMobile: largura < 700, hasTouch: largura < 700, locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  return ctx;
}

async function clinica(largura = 1280){
  const ctx = await contexto(largura), p = await ctx.newPage();
  await p.clock.install({ time: new Date(D.HOJE) });
  await ctx.addInitScript(k => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k); localStorage.setItem("teste-semeado", "1");
  }, JSON.stringify(D.clinica));
  const erros = []; p.on("pageerror", e => erros.push(e.message)); p.on("dialog", d => d.accept());
  await p.goto(srv.url + "clinica.html"); await p.waitForTimeout(600);
  return { ctx, p, erros };
}

test("Clínica: um nome só por paciente, vencimento passado em 'venceu em' e a data do contato da remarcação", async () => {
  const { ctx, p, erros } = await clinica();
  const r = await p.evaluate(() => {
    const x = dados.pacientes[0];
    x.nomeCompleto = "Fulana de Tal Inventada";
    return {
      nome: nomeDoPaciente(x), grade: nomeGrade(x), curto: nomeCurto(x),
      passado: textoVencimento(new Date(2026, 8, 20)), futuro: textoVencimento(new Date(2026, 9, 20))
    };
  });
  assert.equal(r.nome, "Fulana Inventada");
  assert.equal(r.grade, r.nome); assert.equal(r.curto, r.nome);
  assert.equal(r.passado, "venceu em 20/09");
  assert.match(r.futuro, /^na sessão de /);
  /* a remarcação guarda o dia em que foi marcada; marcar de novo não troca */
  const em = await p.evaluate(() => {
    marcarSaida("2026-10-05|9", "remarcada"); const a = dados.excecoes["2026-10-05|9"].em;
    marcarSaida("2026-10-05|9", "remarcada"); const b = dados.excecoes["2026-10-05|9"].em;
    marcarSaida("2026-10-05|10", "falta");
    return [a, b, dados.excecoes["2026-10-05|10"].em];
  });
  assert.deepEqual(em, ["2026-10-04", "2026-10-04", undefined]);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Clínica: o menu da célula prende o Tab e o Esc devolve o foco à célula", async () => {
  const { ctx, p, erros } = await clinica();
  const cel = p.locator('.cell[data-data="2026-10-05"][data-hora="9"]');
  assert.equal(await cel.getAttribute("aria-haspopup"), "menu");
  await cel.click();
  assert.equal(await cel.getAttribute("aria-expanded"), "true");
  for (let i = 0; i < 12; i++) await p.keyboard.press("Tab");
  assert.ok(await p.evaluate(() => !!(menuAberto && menuAberto.contains(document.activeElement))), "o foco continua no menu");
  await p.keyboard.press("Shift+Tab");
  assert.ok(await p.evaluate(() => !!(menuAberto && menuAberto.contains(document.activeElement))));
  await p.keyboard.press("Escape");
  assert.ok(await p.evaluate(() => !menuAberto && document.activeElement.matches('.cell[data-data="2026-10-05"][data-hora="9"]')), "Esc volta à célula");
  assert.equal(await cel.getAttribute("aria-expanded"), "false");
  assert.deepEqual(erros, []);
  await ctx.close();
});

async function casca(largura = 1280){
  const ctx = await contexto(largura), p = await ctx.newPage();
  await p.clock.install({ time: new Date(D.HOJE) });
  await ctx.addInitScript(([d, c]) => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-dinheiro-cache", d); localStorage.setItem("controle-unico-casa-cache", c);
    localStorage.setItem("teste-semeado", "1");
  }, [JSON.stringify(D.dinheiro), JSON.stringify(D.casa)]);
  const erros = []; p.on("pageerror", e => erros.push(e.message)); p.on("dialog", d => d.accept());
  await p.goto(srv.url + "index.html"); await p.waitForTimeout(800);
  const f = p.frames().find(x => x.url().includes("app.html"));
  return { ctx, p, f, erros };
}

test("Tudo: Meus lançamentos abre com todos os meses, separados por mês, e volta a um mês só", async () => {
  const { ctx, f, erros } = await casca();
  await f.evaluate(() => { aba = "tudo"; desenhar(); });
  const todos = await f.evaluate(() => livro.matheus.lancamentos.length + livro.casa.lancamentos.filter(l => l.quem === livro.casa.pessoas[0]).length);
  const cab = await f.locator("section.painel", { hasText:"Meus lançamentos" }).locator("h2 .dir").textContent();
  assert.equal(cab, todos + " ao todo");
  const meses = await f.locator("tr.mes-cab").count();
  assert.ok(meses >= 2, "uma faixa por mês: " + meses);
  await f.click('[data-meus="mes"]');
  assert.match(await f.locator("section.painel", { hasText:"Meus lançamentos" }).locator("h2 .dir").textContent(), /no mês$/);
  assert.equal(await f.locator("tr.mes-cab").count(), 0);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Dinheiro: categoria própria entra no formulário; recebi uma parte sem janelinha, com erro junto do campo", async () => {
  const { ctx, f, erros } = await casca();
  await f.evaluate(() => { aba = "carteira"; vistaDin = "mes"; desenhar(); });
  await f.evaluate(() => document.querySelector("#fCategoria").closest("details").open = true);
  await f.fill('#fCategoria [name="nome"]', "Pets");
  await f.selectOption('#fCategoria [name="grupo"]', "Para mim");
  await f.click('#fCategoria button[type="submit"]');
  assert.ok(await f.evaluate(() => gruposDinheiro().find(g => g[0] === "Para mim")[1].includes("Pets")));
  assert.ok(await f.evaluate(() => catsDinheiro().includes("Pets")));
  assert.match(await f.locator(".cat-minhas").textContent(), /Pets/);
  /* nome repetido: erro junto do campo, nada gravado */
  await f.evaluate(() => document.querySelector("#fCategoria").closest("details").open = true);
  await f.fill('#fCategoria [name="nome"]', "mercado");
  await f.click('#fCategoria button[type="submit"]');
  assert.equal(await f.locator("#fCategoria .form-erro").textContent(), "Essa categoria já existe.");
  assert.equal(await f.evaluate(() => livro.matheus.categoriasExtras.length), 1);
  /* tirar só esconde */
  await f.click('[data-cat-tirar]');
  assert.ok(await f.evaluate(() => !catsDinheiro().includes("Pets") && livro.matheus.categoriasExtras[0].oculta === true));

  await f.evaluate(() => { livro.matheus.pendencias = [{ id:"pd1", nome:"Pessoa Inventada", tipo:"receber", total:300, pago:0 }]; vistaDin = "pend"; desenhar(); });
  await f.click('[data-pend-pago="pd1"]');
  await f.click('[data-pend-parte="pd1"] button[type="submit"]');
  assert.equal(await f.locator('[data-pend-parte="pd1"] .form-erro').textContent(), "Falta o valor.");
  await f.fill('[data-pend-parte="pd1"] input', "120,00");
  await f.click('[data-pend-parte="pd1"] button[type="submit"]');
  assert.equal(await f.evaluate(() => livro.matheus.pendencias[0].pago), 120);
  assert.equal(await f.locator("[data-pend-parte]").count(), 0, "o formulário fecha depois de registrar");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Mês a mês: em cima de cada mês, o que sobrou ou faltou", async () => {
  const { ctx, f, erros } = await casca();
  await f.evaluate(() => { aba = "carteira"; vistaDin = "hist"; desenhar(); });
  const n = await f.locator(".gm-sobra").count();
  assert.ok(n >= 1, "rótulos de sobra: " + n);
  assert.match(await f.locator(".gm-sobra").first().textContent(), /^[+−]/);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Ana: 'Salvo.' depois de gravar e o erro junto do campo, sem janelinha", async () => {
  const ctx = await contexto(375), p = await ctx.newPage();
  await p.clock.install({ time: new Date(D.HOJE) });
  const ANA = { versao:1, caderno:"ana", categorias:["Alimentação"], locais:[{ nome:"Local A" }], tabelaPlantao:{}, plantoes:[],
    atendimentos:[], lancamentos:[], gastosFixos:[], receitasFixas:[], emprestimos:[] };
  await ctx.addInitScript(([a, c]) => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-ana-cache", a); localStorage.setItem("controle-unico-casa-cache", c); localStorage.setItem("teste-semeado", "1");
  }, [JSON.stringify(ANA), JSON.stringify(D.casa)]);
  const erros = [], dialogos = []; p.on("pageerror", e => erros.push(e.message)); p.on("dialog", d => { dialogos.push(d.message()); d.accept(); });
  await p.goto(srv.url + "ana.html#atendimentos"); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelectorAll("#fAtend").forEach(f => { const d = f.closest("details"); if (d) d.open = true; }));
  /* o campo vazio o próprio navegador segura (required); valor zero chega ao app, que avisa junto do campo */
  await p.fill('#fAtend [name="paciente"]', "Paciente Inventado");
  await p.evaluate(() => { const f = document.querySelector("#fAtend"); f.elements.valor.value = "0,00"; f.requestSubmit(); });
  assert.equal(await p.locator("#fAtend .form-erro").textContent(), "Falta o valor.");
  await p.fill('#fAtend [name="data"]', "2026-10-03");
  await p.fill('#fAtend [name="valor"]', "200,00");
  await p.click('#fAtend button[type="submit"]');
  assert.equal(await p.locator("p.salvo").textContent(), "Atendimento salvo.");
  assert.deepEqual(dialogos, []);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Cripto: 'Esconder valores' fica lembrado e cobre o preço médio", async () => {
  const ctx = await contexto(1280), pg = await ctx.newPage();
  await pg.goto(srv.url + "carteira.html"); await pg.waitForTimeout(400);
  await pg.click("#btnOlho");
  assert.equal(await pg.evaluate(() => localStorage.getItem("cu-privado")), "1");
  await pg.reload(); await pg.waitForTimeout(400);
  assert.ok(await pg.evaluate(() => document.body.classList.contains("privado")));
  assert.equal(await pg.textContent("#btnOlho"), "Mostrar valores");
  await pg.click("#btnOlho");
  assert.ok(await pg.evaluate(() => !document.body.classList.contains("privado")));
  await ctx.close();
});

test("theme-color: duas cores (claro e escuro) em cada página", async () => {
  const fs = require("fs"), path = require("path");
  for (const arq of ["index.html", "ana.html", "app.html", "clinica.html", "carteira.html", "formulacao.html", "conferir.html", "guia.html", "privacidade.html"]) {
    const s = fs.readFileSync(path.join(__dirname, "..", arq), "utf8");
    assert.equal((s.match(/name="theme-color"[^>]*media="\(prefers-color-scheme: (light|dark)\)"/g) || []).length, 2, arq);
  }
});
