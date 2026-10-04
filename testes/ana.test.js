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

test("Ana, Casa: sem Importar dados e sem trocar a ordem das pessoas às cegas", async () => {
  const { ctx, p, erros } = await abrir();
  await p.click('#abas [data-a="casa"]'); await p.waitForTimeout(800);
  const f = p.frames().find(x => x.url().includes("app.html"));
  assert.equal(await f.isVisible("#importarJson"), false);
  assert.equal(await f.isVisible("#exportarJson"), false);
  assert.equal(await f.isVisible("#exportar"), true);
  assert.match(await f.textContent("#fPessoas + .nota"), /A ordem conta/);
  assert.deepEqual(erros, []);
  await ctx.close();
});
