/* Testes do controle da Ana (ana.html), com um caderno inventado e o relógio parado em 04/10/2026:
   as contas do mês, os valores digitados só com números, alterar um plantão e a Casa dentro dela. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

const ANA = {
  versao:1, caderno:"ana", categorias:["Alimentação","Transporte"],
  locais:[{ nome:"Local A", pagaMesSeguinte:true }, { nome:"Local B", pagaMesSeguinte:false }],
  tabelaPlantao:{ "Local B":{ 0:500, 1:500, 2:500, 3:500, 4:500, 5:500, 6:500 } },
  plantoes:[
    { id:"p1", data:"2026-09-12", periodo:"Diurno", local:"Local A", tipo:"Regular", valor:900, realizar:true },
    { id:"p2", data:"2026-10-03", periodo:"Noturno", local:"Local B", tipo:"Extra", valor:1100, realizar:true },
    { id:"p3", data:"2026-10-10", periodo:"Diurno", local:"Local B", tipo:"Regular", valor:700, realizar:false }],
  atendimentos:[{ id:"a1", paciente:"Paciente Inventado", valor:200, data:"2026-10-02" }],
  lancamentos:[{ id:"l1", data:"2026-10-02", descricao:"", categoria:"Alimentação", forma:"PIX", valor:84.5 }],
  gastosFixos:[{ id:"g1", descricao:"Fixo inventado", categoria:"Transporte", valores:{ "2026-10":1200 } }],
  receitasFixas:[{ id:"r1", descricao:"Entrada inventada", valores:{ "2026-10":2500 } }], emprestimos:[]
};

async function abrir(largura = 375){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:850 }, isMobile: largura < 700, hasTouch: largura < 700, locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date(D.HOJE) });
  await ctx.addInitScript(([a, c]) => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-ana-cache", a); localStorage.setItem("controle-unico-casa-cache", c);
    localStorage.setItem("teste-semeado", "1");
  }, [JSON.stringify(ANA), JSON.stringify(D.casa)]);
  const erros = []; p.on("pageerror", e => erros.push(e.message)); p.on("dialog", d => d.accept());
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|accounts\.google\.com/, r => r.abort());
  await p.goto(srv.url + "ana.html#mes"); await p.waitForTimeout(800);
  const caderno = () => p.evaluate(() => JSON.parse(localStorage.getItem("controle-unico-ana-cache")));
  return { ctx, p, erros, caderno };
}

test("Ana, Mês: entra soma fixas, plantões no mês em que caem e atendimentos", async () => {
  const { ctx, p, erros } = await abrir();
  const e = await p.evaluate(() => entradas("2026-10"));
  assert.equal(e.total, 2500 + 900 + 1100 + 200);   // Local A de setembro cai em outubro; o desmarcado não entra
  const nota = await p.locator("p.nota", { hasText:"mês seguinte" }).textContent();
  assert.match(nota, /Local A entra no mês seguinte/);
  assert.equal(await p.inputValue('[data-receita="r1"]'), "2.500,00");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Ana: valor digitado só com números grava em reais", async () => {
  const { ctx, p, erros, caderno } = await abrir();
  await p.click('#abas [data-a="gastos"]');
  await p.click('[data-fixo="g1"]'); await p.keyboard.type("135075"); await p.keyboard.press("Tab"); await p.waitForTimeout(200);
  assert.equal((await caderno()).gastosFixos[0].valores["2026-10"], 1350.75);
  // sem descrição, a linha de baixo do celular não repete a categoria
  assert.equal((await p.textContent('tr:has([data-editar="l1"]) .so-cel')).trim(), "PIX.");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Ana, Plantões: o lápis altera o plantão sem duplicar, e Cancelar volta ao novo", async () => {
  const { ctx, p, erros, caderno } = await abrir();
  await p.click('#abas [data-a="plantoes"]');
  await p.click('[data-editar-plantao="p3"]');
  assert.equal(await p.inputValue("#fPlantao [name=valor]"), "700,00");
  assert.equal(await p.textContent("[data-botao-plantao]"), "Guardar alteração");
  await p.fill("#fPlantao [name=valor]", ""); await p.type("#fPlantao [name=valor]", "75000");
  await p.click("[data-botao-plantao]"); await p.waitForTimeout(200);
  let c = await caderno();
  assert.equal(c.plantoes.length, 3);
  assert.deepEqual(c.plantoes.find(x => x.id === "p3"), { ...ANA.plantoes[2], valor:750 });
  // novo plantão: o valor vem da tabela do local
  await p.selectOption("#fPlantao [name=local]", "Local B"); await p.waitForTimeout(100);
  assert.equal(await p.inputValue("#fPlantao [name=valor]"), "500,00");
  await p.click('[data-editar-plantao="p2"]'); await p.click('[data-cancelar="fPlantao"]'); await p.waitForTimeout(200);
  assert.equal(await p.inputValue("#fPlantao [name=id]"), "");
  assert.equal(await p.textContent("[data-botao-plantao]"), "Lançar plantão");
  c = await caderno();
  assert.equal(c.plantoes.length, 3);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Ana, Casa: sem Importar dados, a divisão só aparece e ela mexe só nas compras dela", async () => {
  const { ctx, p, erros } = await abrir();
  await p.click('#abas [data-a="casa"]'); await p.waitForTimeout(800);
  const f = p.frames().find(x => x.url().includes("app.html"));
  assert.equal(await f.isVisible("#importarJson"), false);
  assert.equal(await f.isVisible("#exportarJson"), false);
  assert.equal(await f.isVisible("#exportar"), true);
  // a divisão e os nomes só aparecem: quem muda é ele, no app dele
  assert.equal(await f.locator("#fDivisao").count(), 0);
  assert.equal(await f.locator("#fPessoas").count(), 0);
  assert.match(await f.locator("text=só se mudam no app").textContent(), /50%/);
  // ela altera e apaga só as compras dela; as dele ela só vê
  assert.equal(await f.locator('[data-editar="casa:c2"]').count(), 1);
  assert.equal(await f.locator('[data-apagar="casa:lancamentos:c2"]').count(), 1);
  assert.equal(await f.locator('[data-editar="casa:c1"], [data-apagar="casa:lancamentos:c1"]').count(), 0);
  assert.equal(await f.evaluate(() => configLancamento().apagar("casa", "c1")), null);
  assert.equal(await f.evaluate(() => livro.casa.lancamentos.length), 3);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Ana: Sair deste aparelho apaga a cópia do caderno guardada no navegador", async () => {
  const { ctx, p, erros } = await abrir();
  assert.equal(await p.isVisible("#sair"), true);
  await p.click("#sair"); await p.waitForLoadState("load"); await p.waitForTimeout(800);
  const guardado = await p.evaluate(() => localStorage.getItem("controle-unico-ana-cache"));
  assert.ok(!guardado || !JSON.parse(guardado).plantoes.length, "a cópia do caderno ficou no navegador");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Ana, Mês: a moradia é só o que ela pagou na casa, não metade do total", async () => {
  const { ctx, p, erros } = await abrir();
  const s = await p.evaluate(() => saidas("2026-10"));
  assert.equal(s.casa.valor, 180);                 // só a compra dela, não (220 + 180 + 120) / 2
  assert.deepEqual(s.porCat.find(e => e[0] === "Moradia (casa)"), ["Moradia (casa)", 180]);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Ana, Plantões fixos: a regra lança os que faltam, sem repetir, e Desfazer tira", async () => {
  const { ctx, p, erros, caderno } = await abrir(1280);
  await p.click('#abas [data-a="plantoes"]');
  await p.click("#dRegras > summary");
  const regra = async (local, periodo, dia, quando) => {
    await p.selectOption("#fRegra [name=local]", local); await p.selectOption("#fRegra [name=periodo]", periodo);
    await p.selectOption("#fRegra [name=dia]", String(dia)); await p.selectOption("#fRegra [name=quando]", quando);
    await p.click("#fRegra [type=submit]"); await p.waitForTimeout(150);
  };
  await regra("Local B", "Noturno", 5, "toda");    // toda sexta à noite
  await regra("Local A", "Diurno", 6, "1");        // primeiro sábado do mês
  assert.match(await p.textContent("ul.regras"), /Local B, noturno, toda sexta/);
  assert.match(await p.textContent("ul.regras"), /Local A, diurno, 1º sábado do mês/);
  // a primeira sexta da regra já tem plantão lançado: não pode repetir
  await p.evaluate(() => { cad.plantoes.push({ id:"p4", data:"2026-10-09", periodo:"Noturno", local:"Local B", tipo:"Regular", valor:999, realizar:false }); salvar(); });
  await p.selectOption("#fLancarRegras [name=ate]", "2026-12");
  await p.click("#fLancarRegras [type=submit]"); await p.waitForTimeout(200);
  let c = await caderno();
  const novos = c.plantoes.filter(x => !["p1", "p2", "p3", "p4"].includes(x.id));
  // sextas de 16/10 a 25/12 (11) e os primeiros sábados de novembro e dezembro (2); 03/10 já passou
  assert.equal(novos.length, 13);
  assert.ok(novos.every(x => x.data >= "2026-10-04" && x.realizar && x.tipo === "Regular"));
  assert.deepEqual(novos.filter(x => x.local === "Local A").map(x => x.data), ["2026-11-07", "2026-12-05"]);
  assert.ok(novos.filter(x => x.local === "Local B").every(x => x.valor === 500 && new Date(x.data + "T12:00").getDay() === 5));
  assert.equal(c.plantoes.find(x => x.id === "p4").valor, 999);   // o que já existia não muda
  // lançar de novo não repete nada
  await p.click("#fLancarRegras [type=submit]"); await p.waitForTimeout(200);
  assert.equal((await caderno()).plantoes.length, 4 + 13);
  await p.click("#desfazerRegras"); await p.waitForTimeout(200);
  assert.equal((await caderno()).plantoes.length, 4);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Ana, Plantões fixos: semana sim, semana não e última do mês", async () => {
  const { ctx, p } = await abrir();
  const r = await p.evaluate(() => {
    const alt = { dia:6, quando:"alternada", inicio:"2026-10-10" }, ult = { dia:5, quando:"ultima", inicio:"2026-10-01" };
    const sabados = ["2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31"], sextas = ["2026-10-23", "2026-10-30", "2026-11-27"];
    return { alt: sabados.filter(d => regraNoDia(alt, d)), ult: sextas.filter(d => regraNoDia(ult, d)) };
  });
  assert.deepEqual(r.alt, ["2026-10-10", "2026-10-24"]);
  assert.deepEqual(r.ult, ["2026-10-30", "2026-11-27"]);
  await ctx.close();
});

test("Ana, Plantões fixos: semana sim, semana não começa no primeiro dia escolhido, mesmo com a data no meio da semana", async () => {
  const { ctx, p, erros, caderno } = await abrir(1280);
  await p.click('#abas [data-a="plantoes"]');
  await p.click("#dRegras > summary");
  // "a partir de" numa segunda (05/10), regra de sábado: o primeiro é o sábado 10/10, não o 17/10
  await p.selectOption("#fRegra [name=local]", "Local A"); await p.selectOption("#fRegra [name=periodo]", "Diurno");
  await p.selectOption("#fRegra [name=dia]", "6"); await p.selectOption("#fRegra [name=quando]", "alternada");
  await p.fill("#fRegra [name=inicio]", "2026-10-05");
  await p.click("#fRegra [type=submit]"); await p.waitForTimeout(150);
  assert.match(await p.textContent("ul.regras"), /sábados alternados, a partir de 10\/10/);
  const g = (await caderno()).regrasPlantao[0];
  assert.equal(g.inicio, "2026-10-10");
  assert.deepEqual(await p.evaluate(() => plantoesDasRegras("2026-10").map(x => x.data)), ["2026-10-10", "2026-10-24"]);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Ana, Plantões fixos: o plantão apagado ou mudado de dia não volta ao lançar de novo", async () => {
  const { ctx, p, erros, caderno } = await abrir(1280);
  await p.evaluate(() => { cad.regrasPlantao.push({ id:"g1", local:"Local B", periodo:"Noturno", dia:5, quando:"toda", inicio:"2026-10-09", valor:0 }); salvar(); });
  await p.click('#abas [data-a="plantoes"]');
  await p.click("#dRegras > summary");
  await p.selectOption("#fLancarRegras [name=ate]", "2026-10");
  await p.click("#fLancarRegras [type=submit]"); await p.waitForTimeout(200);
  let c = await caderno();
  const sextas = c.plantoes.filter(x => x.local === "Local B" && x.periodo === "Noturno" && x.id !== "p2").map(x => x.data).sort();
  assert.deepEqual(sextas, ["2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"]);
  // apaga a de 16/10 e muda a de 23/10 para o sábado 24/10
  const id16 = c.plantoes.find(x => x.data === "2026-10-16" && x.local === "Local B").id;
  await p.click(`[data-apagar="plantoes:${id16}"]`); await p.waitForTimeout(150);
  const id23 = c.plantoes.find(x => x.data === "2026-10-23" && x.local === "Local B").id;
  await p.click(`[data-editar-plantao="${id23}"]`);
  await p.fill("#fPlantao [name=data]", "2026-10-24");
  await p.click("#fPlantao [type=submit]"); await p.waitForTimeout(150);
  assert.deepEqual(await p.evaluate(() => plantoesDasRegras("2026-10").map(x => x.data)), []);
  c = await caderno();
  assert.deepEqual(c.regrasPlantao[0].pular.sort(), ["2026-10-16", "2026-10-23"]);
  assert.deepEqual(c.plantoes.filter(x => x.local === "Local B" && x.periodo === "Noturno" && x.id !== "p2").map(x => x.data).sort(), ["2026-10-09", "2026-10-24", "2026-10-30"]);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Ana, Mês: o texto do Entra conta as entradas fixas também", async () => {
  const { ctx, p, erros } = await abrir();
  const t = await p.textContent(".k:has(> span:text-is('Entra')) small");
  assert.equal(t.replace(/\s/g, " "), "R$ 2.500,00 de entradas fixas, R$ 2.000,00 de plantões e R$ 200,00 de atendimentos");
  assert.deepEqual(erros, []);
  await ctx.close();
});
