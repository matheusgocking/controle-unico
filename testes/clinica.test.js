/* Testes da Clínica e da Formulação de Caso (04/10/2026). Abrem cada página sozinha, num Chromium
   sem tela, com os cadernos inventados de dados-de-teste.js e o relógio parado em 04/10/2026, um
   domingo. Conferem as contas da quinzena e da falta, o que a leitura da planilha preserva e que as
   janelas funcionam pelo teclado. Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

async function abrir(pagina, { largura = 1280, formulacao = null } = {}) {
  const ctx = await nav.newContext({ viewport:{ width:largura, height:900 }, isMobile: largura < 700, hasTouch: largura < 700,
    locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date(D.HOJE) });
  await ctx.addInitScript(([k, f]) => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k);
    if (f){ localStorage.setItem("controle-unico-formulacao-cache", f); localStorage.setItem("controle-unico-formulacao-aberto", "c1"); }
    localStorage.setItem("teste-semeado", "1");
  }, [JSON.stringify(D.clinica), formulacao ? JSON.stringify(formulacao) : null]);
  const erros = [], dialogos = [];
  p.on("pageerror", e => erros.push(e.message));
  p.on("dialog", d => { dialogos.push(d.message()); d.accept(); });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + pagina);
  await p.waitForTimeout(600);
  return { ctx, p, erros, dialogos };
}

test("Clínica: a falta cobrada continua contando quando alguém é encaixado na hora", async () => {
  const { ctx, p, erros } = await abrir("clinica.html");
  const r = await p.evaluate(() => {
    const d = new Date(2026, 9, 5);                       // segunda, 05/10, 9h: Paciente Mensal
    const antes = numerosDoMes(new Date(2026, 9, 1)).previsto;
    marcarSaida("2026-10-05|9", "falta");
    porEntrada("2026-10-05|9", { pacienteId:"pB" });       // o avulso encaixado na hora
    cacheMes = {};
    return { lista: sessoesDoDia(d).filter(s => s.hora === 9).map(s => s.paciente.id + ":" + s.estado),
             antes, depois: numerosDoMes(new Date(2026, 9, 1)).previsto };
  });
  assert.deepEqual(r.lista, ["pA:falta", "pB:sessao"]);
  assert.equal(r.depois, r.antes + 200, "o mensal continua igual e o encaixe avulso soma uma sessão");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Clínica: o previsto de um mês usa o preço do ciclo daquele mês", async () => {
  const { ctx, p } = await abrir("clinica.html");
  const r = await p.evaluate(() => {
    const b = acharPaciente("pB");
    b.ciclos = [{ inicio:"2026-08-01", cobranca:"avulsa", valor:150 }, { inicio:"2026-10-01", cobranca:"avulsa", valor:200, noApp:true }];
    cacheMes = {};
    return { set: numerosDoMes(new Date(2026, 8, 1)).previsto, out: numerosDoMes(new Date(2026, 9, 1)).previsto };
  });
  // setembro de 2026 tem 5 terças; o avulso valia 150 nelas, menos a de 29/09, que já é do ciclo
  // de 01/10 pela folga de 3 dias (cicloEm). O resto do previsto é dos outros três.
  const semB = await p.evaluate(() => { const b = acharPaciente("pB"); b.ciclos = []; b.valor = 0; cacheMes = {}; return numerosDoMes(new Date(2026, 8, 1)).previsto; });
  assert.equal(r.set - semB, 4 * 150 + 200);
  assert.equal(r.out > 0, true);
  await ctx.close();
});

test("Clínica: ler a planilha não apaga a semana da quinzena", async () => {
  const { ctx, p } = await abrir("clinica.html");
  const r = await p.evaluate(() => {
    const leitura = { avisos:[], blocos:[], baseData:"2026-10-04", pacientes: dados.pacientes.map(x => ({
      codigo:x.codigo, nome:x.nome, freq:x.freq, cobranca:x.cobranca, valor:x.valor, dia:x.dia, hora:x.hora })) };
    aplicarLeitura(leitura);
    return dados.pacientes.map(x => x.codigo + ":" + (x.semanaRef || ""));
  });
  assert.deepEqual(r, ["T001:", "T002:", "T003:2026-09-28", "T004:2026-10-05"]);
  await ctx.close();
});

test("Clínica: no domingo, \"nesta semana\" é a semana que a grade mostra", async () => {
  const { ctx, p } = await abrir("clinica.html");
  const r = await p.evaluate(() => {
    abrirFicha(acharPaciente("pC"));
    const sel = document.getElementById("fi-qsem");
    const texto = sel.options[0].textContent;
    sel.value = "esta"; sel.dispatchEvent(new Event("change"));
    return { texto, ref: acharPaciente("pC").semanaRef };
  });
  assert.match(r.texto, /05\/10/);
  assert.equal(r.ref, "2026-10-05");
  await ctx.close();
});

test("Clínica: corrigir o prontuário na ficha não apaga o \"como chegou\" de outro paciente", async () => {
  const { ctx, p } = await abrir("clinica.html");
  const r = await p.evaluate(() => {
    dados.origens = { T001:{ tipo:"indicacao" }, T00:{ tipo:"instagram" } };
    abrirFicha(acharPaciente("pA"));
    const c = document.getElementById("fi-codigo");
    for (const v of ["T00", "T009"]) { c.value = v; c.dispatchEvent(new Event("input")); }
    return dados.origens;
  });
  assert.deepEqual(r, { T00:{ tipo:"instagram" }, T009:{ tipo:"indicacao" } });
  await ctx.close();
});

test("Clínica: as janelas e o menu da grade funcionam pelo teclado", async () => {
  const { ctx, p, erros } = await abrir("clinica.html");
  const cel = p.locator('.cell[data-data="2026-10-05"][data-hora="9"]');
  await cel.focus(); await p.keyboard.press("Enter");
  assert.equal(await p.evaluate(() => !!menuAberto && menuAberto.contains(document.activeElement)), true, "o menu recebe o foco");
  await p.keyboard.press("Escape");
  assert.equal(await p.evaluate(() => document.activeElement.dataset.data + "|" + document.activeElement.dataset.hora), "2026-10-05|9");
  for (const abrirJanela of ["abrirFicha(acharPaciente('pA'))", "abrirMensagem()", "abrirCobranca('Paciente Avulso', 2, 400)"]) {
    await cel.focus();
    const r = await p.evaluate(f => { eval(f); const m = document.querySelector(".overlay .modal");
      return { papel: m.getAttribute("role"), foco: document.activeElement === m }; }, abrirJanela);
    assert.deepEqual(r, { papel:"dialog", foco:true }, abrirJanela);
    await p.keyboard.press("Escape");
    assert.equal(await p.evaluate(() => !document.querySelector(".overlay") && document.activeElement.classList.contains("cell")), true, abrirJanela + " devolve o foco");
  }
  assert.deepEqual(erros, []);
  await ctx.close();
});

const CASO = { versao:2, modelos:[], casos:[{ id:"c1", nome:"Caso de teste", modelo:"integrativo", modulos:[], revisoes:[],
  itens:[{ id:"i1", m:"", c:"", texto:"Evita sair de casa" }, { id:'x"><img src=x onerror="window.invadiu=1">', m:"", c:"", texto:"Hipótese", hip:true }],
  relacoes:[{ id:"r1", de:"i1", para:'x"><img src=x onerror="window.invadiu=1">', tipo:"sustenta" }],
  medidas:[{ id:"m1", nome:"Ansiedade", pontos:[{ data:"2026-10-01", valor:7 }] }] }] };

test("Formulação: id estranho não vira código, desfazer ligação pergunta e a medida tem id", async () => {
  for (const largura of [375, 1280]) {
    const { ctx, p, erros, dialogos } = await abrir("formulacao.html", { largura, formulacao: CASO });
    assert.equal(await p.evaluate(() => !!window.invadiu), false);
    assert.deepEqual(await p.evaluate(() => livro.casos[0].medidas[0].pontos), [{ data:"2026-10-01", valor:7, id:"2026-10-01" }]);
    const x = p.locator("[data-desligar]").first();
    if (await x.count()) {
      await x.click();
      assert.equal(dialogos.length, 1, "pediu confirmação");
      assert.match(dialogos[0], /Desfazer esta ligação/);
    }
    // o ponto de estado fica ao lado do texto, não sozinho numa linha
    const pos = await p.evaluate(() => { const a = document.getElementById("nuvem-ponto").getBoundingClientRect(), b = document.getElementById("nuvem-texto").getBoundingClientRect();
      return { a: a.right, b: b.left, topoA: a.top, baixoB: b.bottom }; });
    assert.ok(pos.a <= pos.b && pos.topoA < pos.baixoB, "ponto ao lado do texto em " + largura + " px");
    assert.deepEqual(erros, []);
    await ctx.close();
  }
});
