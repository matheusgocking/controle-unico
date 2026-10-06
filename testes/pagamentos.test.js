/* Testes do pagamento de cada sessão, da prévia do registrar e da ficha em abas (06/10/2026).
   Cada caminho da conta tem o seu caso: com o histórico do prontuário (em dia, devendo, valor
   quebrado), com a base da planilha e sem base nenhuma. Cadernos inventados de dados-de-teste.js,
   relógio parado em 04/10/2026, um domingo. Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

async function abrir({ largura = 1280 } = {}) {
  const ctx = await nav.newContext({ viewport:{ width:largura, height:900 }, isMobile: largura < 700, hasTouch: largura < 700,
    locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date(D.HOJE) });
  await ctx.addInitScript(k => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k);
    localStorage.setItem("teste-semeado", "1");
  }, JSON.stringify(D.clinica));
  const erros = [], dialogos = [];
  p.on("pageerror", e => erros.push(e.message));
  p.on("dialog", d => { dialogos.push(d.message()); d.accept(); });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + "clinica.html");
  await p.waitForTimeout(600);
  return { ctx, p, erros, dialogos };
}

/* Paciente Mensal (pA): segunda 9h, ciclo de R$ 700, R$ 175 a sessão. O histórico do prontuário vai
   até 30/09 com as sessões passadas dadas; os pagamentos são os da lista. */
const MONTAR = `(function(sessoes, pagamentos){
  const a = acharPaciente("pA");
  a.historico = { ate:"2026-09-30", sessoes: sessoes.map((d, i) => ({ data:d, n:i+1, situacao:"realizada" })) };
  dados.pagamentos = pagamentos.map((x, i) => ({ id:"g"+i, pacienteId:"pA", data:x[0], valor:x[1], meio:"pix", obs:"", receita:"Prática Clínica." }));
  renderTudo();
  return a;
})`;
const SET4 = ["2026-09-07","2026-09-14","2026-09-21","2026-09-28"];
const marca = (data, hora) => `pagamentoDaSessao(acharPaciente("pA"), deISO("${data}"), ${hora}, (estadoSessaoDe(acharPaciente("pA"), deISO("${data}"), ${hora})||{}).estado)`;

test("Pagamento: em dia com crédito, as sessões pagas adiantado ficam pagas e a seguinte não", async () => {
  const { ctx, p, erros } = await abrir();
  const r = await p.evaluate(`(() => { const a = ${MONTAR}(${JSON.stringify(SET4)}, [["2026-09-07",700],["2026-09-28",700]]);
    return { venc: chaveData(proximoVencimento(a)), texto: textoDevido(a).texto,
      m: ["2026-09-28","2026-10-05","2026-10-12","2026-10-19","2026-10-26","2026-11-02"].map(d => pagamentoDaSessao(a, deISO(d), 9, (estadoSessaoDe(a, deISO(d), 9)||{}).estado)) }; })()`);
  assert.equal(r.venc, "2026-11-02");
  assert.equal(r.texto, "4 sessões adiantadas");
  assert.deepEqual(r.m, ["paga", "paga", "paga", "paga", "paga", ""]);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Pagamento: devendo, a sessão que o saldo não cobre fica em aberto e as anteriores pagas", async () => {
  const { ctx, p, erros } = await abrir();
  const r = await p.evaluate(`(() => { const a = ${MONTAR}(["2026-08-31", ...${JSON.stringify(SET4)}], [["2026-08-31",700]]);
    return { venc: chaveData(proximoVencimento(a)), texto: textoDevido(a).texto, sit: situacaoPagamento(a).chave,
      m: ["2026-09-21","2026-09-28","2026-10-05"].map(d => pagamentoDaSessao(a, deISO(d), 9, (estadoSessaoDe(a, deISO(d), 9)||{}).estado)) }; })()`);
  assert.equal(r.venc, "2026-09-28");
  assert.equal(r.texto, "deve 1 sessão · R$ 175");
  assert.equal(r.sit, "atraso");
  assert.deepEqual(r.m, ["paga", "aberta", ""], "a futura não tem marca: ainda não foi paga, e isso é normal");
  // na grade da semana de 27/09, a célula de 28/09 9h leva a bolinha de em aberto
  const cel = await p.evaluate(() => { semana = deISO("2026-09-27"); renderSemana();
    const c = document.querySelector('.cell[data-data="2026-09-28"][data-hora="9"]');
    return { classe: c.querySelector(".pgm").className, rotulo: c.getAttribute("aria-label") }; });
  assert.equal(cel.classe, "pgm pgm-aberta");
  assert.match(cel.rotulo, /em aberto/);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Pagamento: valor quebrado aparece em reais exatos; sessões inteiras mantêm o texto de antes", async () => {
  const { ctx, p, erros } = await abrir();
  const r = await p.evaluate(`(() => {
    const deve = ${MONTAR}(["2026-08-31", ...${JSON.stringify(SET4)}], [["2026-08-31",700],["2026-09-28",100]]);
    const t1 = textoDevido(deve).texto, v1 = chaveData(proximoVencimento(deve)), m1 = pagamentoDaSessao(deve, deISO("2026-09-28"), 9, "realizada");
    const cred = ${MONTAR}(${JSON.stringify(SET4)}, [["2026-09-07",700],["2026-09-28",950]]);
    const t2 = textoDevido(cred).texto;
    const pouco = ${MONTAR}(${JSON.stringify(SET4)}, [["2026-09-07",775]]);
    const t3 = textoDevido(pouco).texto;
    return { t1, v1, m1, t2, t3 }; })()`);
  assert.equal(r.t1, "deve R$ 75", "antes: deve 1 sessão · R$ 175");
  assert.equal(r.v1, "2026-09-28", "a sessão paga só em parte continua sendo o vencimento");
  assert.equal(r.m1, "aberta");
  assert.equal(r.t2, "5 sessões adiantadas e R$ 75 de crédito", "antes: 5 sessões adiantadas");
  assert.equal(r.t3, "R$ 75 de crédito", "antes: nada a pagar");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Pagamento: com a base da planilha, a marca segue a mesma dívida", async () => {
  const { ctx, p, erros } = await abrir();
  const r = await p.evaluate(() => {
    // Paciente Avulso (pB): terça 9h, R$ 200. A planilha contou 3 sessões até 30/09; ele pagou 400.
    const b = acharPaciente("pB");
    b.basePlanilha = "2026-09-30"; b.sessoesPlanilha = 3;
    dados.pagamentos = [{ id:"g1", pacienteId:"pB", data:"2026-09-20", valor:400, meio:"pix", receita:"Prática Clínica." }];
    renderTudo();
    return { texto: textoDevido(b).texto, venc: chaveData(proximoVencimento(b)),
      m: ["2026-09-22","2026-09-29","2026-10-06"].map(d => pagamentoDaSessao(b, deISO(d), 9, "sessao")) };
  });
  assert.equal(r.texto, "deve 1 sessão · R$ 200");
  assert.equal(r.venc, "2026-09-29");
  assert.deepEqual(r.m, ["paga", "aberta", ""]);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Pagamento: sem base nenhuma, o passado fica sem marca e o futuro pago aparece pago", async () => {
  const { ctx, p, erros } = await abrir();
  const r = await p.evaluate(() => {
    const b = acharPaciente("pB");
    dados.pagamentos = [{ id:"g1", pacienteId:"pB", data:"2026-10-01", valor:400, meio:"pix", receita:"Prática Clínica." }];
    renderTudo();
    return { base: devidoDe(b), venc: chaveData(proximoVencimento(b)),
      m: ["2026-09-29","2026-10-06","2026-10-13","2026-10-20"].map(d => pagamentoDaSessao(b, deISO(d), 9, "sessao")) };
  });
  assert.equal(r.base, null);
  assert.equal(r.venc, "2026-10-20");
  assert.deepEqual(r.m, ["", "paga", "paga", ""], "sem saber desde quando cobrar, o app não diz se o passado está pago");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Prévia do registrar: diz as sessões que o valor paga e não grava nada", async () => {
  const { ctx, p, erros } = await abrir();
  const r = await p.evaluate(`(() => {
    const a = ${MONTAR}(${JSON.stringify(SET4)}, [["2026-09-07",700],["2026-09-28",700]]);
    const antes = JSON.stringify(dados.pagamentos), vAntes = chaveData(proximoVencimento(a));
    const pr = previaPagamento(a, "2026-10-04", 700);
    const t1 = textoPrevia(a, "2026-10-04", 700), t2 = textoPrevia(a, "2026-10-04", 250);
    const depois = JSON.stringify(dados.pagamentos), vDepois = chaveData(proximoVencimento(a));
    const deve = ${MONTAR}(["2026-08-31", ...${JSON.stringify(SET4)}], [["2026-08-31",700]]);
    const t3 = textoPrevia(deve, "2026-10-04", 700), t4 = textoPrevia(deve, "2026-10-04", 100);
    return { pagas: pr.pagas.map(chaveData), depoisDe: chaveData(pr.depois), t1, t2, t3, t4, igual: antes === depois, vAntes, vDepois }; })()`);
  assert.deepEqual(r.pagas, ["2026-11-02","2026-11-09","2026-11-16","2026-11-23"]);
  assert.equal(r.depoisDe, "2026-11-30");
  assert.match(r.t1, /^R\$ 700 paga 4 sessões: 02\/11, 09\/11, 16\/11 e 23\/11\. Próximo pagamento: na sessão de 30\/11\/2026\.$/);
  assert.match(r.t2, /R\$ 250 paga 1 sessão: 02\/11\. Sobram R\$ 75 de crédito/);
  assert.match(r.t3, /R\$ 700 paga 4 sessões: 28\/09, 05\/10, 12\/10 e 19\/10/, "quem deve paga primeiro a sessão mais antiga");
  assert.match(r.t4, /não chega a pagar uma sessão inteira\. Continua devendo R\$ 75/);
  assert.equal(r.igual, true, "a prévia não deixa pagamento nenhum gravado");
  assert.equal(r.vAntes, r.vDepois);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Receita da semana: a falta sem aviso cobra e entra no preço do ciclo do dia", async () => {
  const { ctx, p, erros } = await abrir();
  const r = await p.evaluate(() => {
    renderSemana();
    const normal = document.getElementById("s-receita").textContent;
    dados.excecoes["2026-10-05|9"] = { tipo:"falta" };
    renderTudo();
    const comFalta = document.getElementById("s-receita").textContent;
    dados.excecoes["2026-10-05|9"] = { tipo:"remarcada" };
    renderTudo();
    return { normal, comFalta, remarcada: document.getElementById("s-receita").textContent };
  });
  assert.equal(r.comFalta, r.normal, "a falta sem aviso cobra como a sessão");
  assert.notEqual(r.remarcada, r.normal, "a remarcada não cobra");
  assert.deepEqual(erros, []);
  await ctx.close();
});

for (const largura of [375, 1280]) {
  test("Ficha em abas (" + largura + "px): Pagamento primeiro, registrar com o valor editável", async () => {
    const { ctx, p, erros } = await abrir({ largura });
    await p.evaluate(`(() => { ${MONTAR}(${JSON.stringify(SET4)}, []); abrirFicha(acharPaciente("pA")); })()`);
    assert.equal(await p.locator("#fi-p-pagamento").isVisible(), true);
    assert.equal(await p.locator("#fi-p-prontuario").isVisible(), false);
    assert.equal(await p.locator("#fi-p-cadastro").isVisible(), false);
    assert.equal(await p.inputValue("#fr-valor"), "700", "já vem com o valor do ciclo");
    assert.match(await p.textContent("#fi-situ"), /Deve R\$ 700, desde a sessão de 07\/09\/2026/);
    await p.click('[data-fvalor="175"]');
    assert.equal(await p.inputValue("#fr-valor"), "175");
    await p.fill("#fr-valor", "150");
    assert.match(await p.textContent("#fr-previa"), /R\$ 150 não chega a pagar uma sessão inteira\. Continua devendo R\$ 550/);
    await p.selectOption("#fr-meio", "dinheiro");
    await p.click("#fr-registrar");
    const g = await p.evaluate(() => dados.pagamentos.filter(x => x.pacienteId === "pA").map(x => [x.data, x.valor, x.meio]));
    assert.deepEqual(g, [["2026-10-04", 150, "dinheiro"]]);
    assert.match(await p.textContent("#fr-feito"), /Registrado: R\$ 150 em 04\/10\/2026/);
    assert.match(await p.textContent("#fi-situ"), /Deve R\$ 550/);
    assert.equal(await p.inputValue("#fr-valor"), "700", "o campo volta para o valor do ciclo");
    // a aba escolhida continua aberta quando a ficha se redesenha
    await p.click("#fi-aba-cadastro");
    await p.evaluate(() => reabrirFicha());
    assert.equal(await p.locator("#fi-p-cadastro").isVisible(), true);
    // o pagamento sai pela ficha também
    await p.click("#fi-aba-pagamento");
    await p.locator('#fi-pag [data-fapagar]').first().click();
    assert.equal(await p.evaluate(() => dados.pagamentos.filter(x => x.pacienteId === "pA").length), 0);
    assert.match(await p.textContent("#fi-situ"), /Deve R\$ 700/, "apagar volta a conta ao que era");
    // nada passa da largura da tela
    const sobra = await p.evaluate(() => { const m = document.querySelector(".overlay .modal"); return m.scrollWidth - m.clientWidth; });
    assert.equal(sobra <= 1, true, "a ficha não rola para o lado");
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}

test("Ficha: quem chega pelo prontuário cai na aba Prontuário, com a Formulação junto", async () => {
  const { ctx, p, erros } = await abrir();
  await p.evaluate(() => abrirFicha(acharPaciente("pA"), "2026-10-05|9|pA"));
  assert.equal(await p.locator("#fi-p-prontuario").isVisible(), true);
  assert.equal(await p.locator("#fi-p-pagamento").isVisible(), false);
  assert.equal(await p.locator("#fi-p-prontuario #fi-form").count(), 1);
  assert.equal(await p.getAttribute("#fi-aba-prontuario", "aria-selected"), "true");
  await p.focus("#fi-aba-prontuario");
  await p.keyboard.press("ArrowRight");
  assert.equal(await p.locator("#fi-p-cadastro").isVisible(), true, "as setas trocam de aba");
  assert.deepEqual(erros, []);
  await ctx.close();
});
