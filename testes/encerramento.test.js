/* Encerramento e retorno do tratamento (06/10/2026). Cadernos inventados de dados-de-teste.js,
   relógio parado em 07/10/2026 (quarta). Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

async function abrir(largura, mexer){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:844 }, isMobile: largura < 700, hasTouch: largura < 700,
    locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date("2026-10-07T12:00:00-03:00") });
  const c = JSON.parse(JSON.stringify(D.clinica));
  if (mexer) mexer(c);
  await ctx.addInitScript(k => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k);
    localStorage.setItem("teste-semeado", "1");
  }, JSON.stringify(c));
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + "clinica.html");
  await p.waitForTimeout(600);
  return { ctx, p, erros };
}

test("Conta: depois do encerramento o horário sai da agenda; na volta, entra de novo", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const r = await p.evaluate(() => {
    const pa = dados.pacientes.find(x => x.id === "pA");
    const em = iso => { const f = pacienteEm(1, 9, deISO(iso)); return f ? f.id : null; };
    const antes = { d05:em("2026-10-05"), d12:em("2026-10-12"), previstas:numerosDoMes(new Date(2026, 9, 1)).previstas };
    const enc = encerrarTratamento(pa, "2026-10-05", "inativo", "app");
    enc.aplicar(); cacheMes = {}; vencCache = null; devidoCache = null;
    const encerrado = { d05:em("2026-10-05"), d12:em("2026-10-12"), d26:em("2026-10-26"),
      previstas:numerosDoMes(new Date(2026, 9, 1)).previstas, hoje:encerradoHoje(pa), texto:textoTratamento(pa).texto,
      outros:dados.pacientes.filter(x => x.id !== "pA").map(x => encerradoHoje(x)) };
    const erroVolta = registrarRetorno(pa, "2026-10-05");
    registrarRetorno(pa, "2026-10-26"); cacheMes = {};
    const voltou = { d19:em("2026-10-19"), d26:em("2026-10-26"), hoje:encerradoHoje(pa), texto:textoTratamento(pa).texto };
    return { antes, encerrado, erroVolta, voltou, duplo: encerrarTratamento(pa, "2026-10-20", "alta").erro };
  });
  assert.equal(r.antes.d05, "pA"); assert.equal(r.antes.d12, "pA");
  assert.equal(r.encerrado.d05, "pA", "a sessão do último dia ainda vale");
  assert.equal(r.encerrado.d12, null); assert.equal(r.encerrado.d26, null);
  assert.equal(r.antes.previstas - r.encerrado.previstas, 3, "as sessões de 12, 19 e 26/10 saem do previsto");
  assert.equal(r.encerrado.hoje, true);
  assert.equal(r.encerrado.texto, "Encerrado em 05/10/2026 · Inativo");
  assert.deepEqual(r.encerrado.outros, [false, false, false], "os outros pacientes não mudam");
  assert.match(r.erroVolta, /depois do encerramento/);
  assert.equal(r.voltou.d19, null, "antes da volta continua fora");
  assert.equal(r.voltou.d26, "pA", "da volta em diante, de novo na agenda");
  assert.equal(r.voltou.hoje, true, "a volta ainda não chegou (é 26/10)");
  assert.match(r.voltou.texto, /volta em 26\/10\/2026/);
  assert.match(r.duplo, /depois da volta/);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Encerrar com sessão já marcada depois da data pede confirmação e diz quantas", async () => {
  const { ctx, p, erros } = await abrir(1280, c => { c.excecoes = Object.assign(c.excecoes || {}, { "2026-10-06|9":{ tipo:"realizada" } }); });
  const r = await p.evaluate(() => {
    const pb = dados.pacientes.find(x => x.id === "pB");
    return encerrarTratamento(pb, "2026-09-30", "alta").marcadas;
  });
  assert.equal(r, 1);
  assert.deepEqual(erros, []);
  await ctx.close();
});

for (const largura of [390, 1280]) {
  test("Ficha (" + largura + "px): encerrar e registrar a volta pelo Cadastro", async () => {
    const { ctx, p, erros } = await abrir(largura);
    await p.evaluate(() => abrirFicha(dados.pacientes.find(x => x.id === "pA"), null, "cadastro"));
    await p.waitForTimeout(150);
    assert.equal(await p.locator("#fi-trat").isVisible(), false, "sem encerramento, nada no alto");
    assert.match(await p.textContent("#fi-tratamento"), /Começou em/);
    await p.fill("#ft-data", "2026-10-05");
    await p.selectOption("#ft-tipo", "alta");
    await p.click("#ft-encerrar");
    await p.waitForTimeout(150);
    assert.equal(await p.textContent("#fi-trat"), "Encerrado em 05/10/2026 · Alta clínica");
    assert.match(await p.textContent("#fi-tratamento"), /Encerrado em 05\/10\/2026 · Alta clínica/);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), largura);
    const caixa = await p.locator("#ft-voltar").boundingBox();
    assert.ok(caixa.x + caixa.width <= largura, "botão dentro da tela");
    await p.click("#fi-fechar");

    /* na aba Pacientes: sai de "Na agenda" e entra em "Alta clínica", com o cartão que abre a ficha */
    await p.evaluate(() => { filtroPacientes = "agenda"; mostrarView("pacientes"); renderPacientes(); });
    assert.equal(await p.locator("#plist .pcard", { hasText:"Paciente Mensal" }).count(), 0);
    await p.click('#pfiltros [data-f="alta"]');
    const cartao = p.locator('#plist [data-fenc="pA"]');
    assert.equal(await cartao.count(), 1);
    assert.match(await cartao.textContent(), /Encerrado em 05\/10\/2026/);
    await cartao.click();
    await p.waitForTimeout(150);
    await p.fill("#ft-data", "2026-10-07");
    await p.click("#ft-voltar");
    await p.waitForTimeout(150);
    assert.equal(await p.textContent("#fi-trat"), "Voltou em 07/10/2026 · tinha encerrado em 05/10/2026");
    const gravado = await p.evaluate(() => JSON.parse(JSON.stringify(dados.pacientes.find(x => x.id === "pA").encerramentos)));
    assert.deepEqual(gravado, [{ data:"2026-10-05", tipo:"alta", origem:"app", retorno:"2026-10-07" }]);
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}

test("Ler a planilha: quem ela dá como inativo fica no app encerrado, com ficha e pagamentos", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const r = await p.evaluate(() => {
    const pagsB = dados.pagamentos.filter(g => g.pacienteId === "pB").length;
    const fica = dados.pacientes.filter(x => x.id !== "pB").map(x => ({ codigo:x.codigo, nome:x.nome, freq:x.freq, cobranca:x.cobranca, valor:x.valor, dia:x.dia, hora:x.hora, status:"Ativo." }));
    const leitura = { pacientes:fica, blocos:dados.blocos, avisos:[], baseData:"2026-10-07",
      arquivados:[{ codigo:"T002", nome:"Paciente Avulso Completo", status:"Inativo.", inicio:"2026-07-01", fim:"2026-09-29", sessoes:10, ciclos:2,
        linhas:[{ inicio:"2026-07-01", fim:"2026-07-20", status:"", modalidade:"Semanal.", sessoes:3 },
                { inicio:"2026-09-01", fim:"2026-09-29", status:"Inativo.", modalidade:"Semanal.", sessoes:4 }] }] };
    const cmp = compararLeitura(leitura);
    aplicarLeitura(leitura);
    const pb = dados.pacientes.find(x => x.id === "pB");
    return { encerram:cmp.encerram.length, sairam:cmp.sairam.length, existe:!!pb, enc:pb && pb.encerramentos,
      pags:dados.pagamentos.filter(g => g.pacienteId === "pB").length, pagsB, arquivado:dados.arquivados.some(a => a.codigo === "T002"),
      voltas:voltasDasLinhas(pb.linhasPlanilha), d06:(pacienteEm(2, 9, deISO("2026-10-06")) || {}).id || null };
  });
  assert.equal(r.encerram, 1); assert.equal(r.sairam, 0);
  assert.equal(r.existe, true);
  assert.deepEqual(r.enc, [{ data:"2026-09-29", tipo:"inativo", origem:"planilha" }]);
  assert.equal(r.pags, r.pagsB);
  assert.equal(r.arquivado, false, "não aparece duas vezes");
  assert.deepEqual(r.voltas, [{ parou:"2026-07-20", voltou:"2026-09-01", dias:43 }]);
  assert.equal(r.d06, null);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Ler a planilha: quem estava encerrado e voltou lá com linha nova ganha a data da volta", async () => {
  const { ctx, p, erros } = await abrir(1280, c => { c.pacientes.find(x => x.id === "pA").encerramentos = [{ data:"2026-08-31", tipo:"suspenso", origem:"app" }]; });
  const r = await p.evaluate(() => {
    const todos = dados.pacientes.map(x => ({ codigo:x.codigo, nome:x.nome, freq:x.freq, cobranca:x.cobranca, valor:x.valor, dia:x.dia, hora:x.hora, status:"Ativo.",
      linhas: x.id === "pA" ? [{ inicio:"2026-06-01", fim:"2026-08-31" }, { inicio:"2026-10-05", fim:"" }] : [] }));
    aplicarLeitura({ pacientes:todos, blocos:dados.blocos, avisos:[], baseData:"2026-10-07" });
    return dados.pacientes.find(x => x.id === "pA").encerramentos;
  });
  assert.deepEqual(r, [{ data:"2026-08-31", tipo:"suspenso", origem:"app", retorno:"2026-10-05", retornoOrigem:"planilha" }]);
  assert.deepEqual(erros, []);
  await ctx.close();
});
