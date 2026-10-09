/* Pagamento avulso de quem está no ciclo mensal (decisão 3, Matheus em 09/10/2026): o registrar pergunta
   se é uma avulsa dentro do pacote (só soma ao saldo, como antes) ou troca de ciclo no fim do pacote (passa
   a pagar por sessão, no valor pago, a partir da primeira sessão que o saldo não cobre).
   Cadernos inventados de dados-de-teste.js, relógio parado em 09/10/2026 14h30. Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

/* Nova: sexta 13h, mensal R$ 500 (R$ 125 a sessão), começou em 09/10 e pagou R$ 500 nesse dia:
   09, 16, 23 e 30/10 pagas, vence em 06/11.
   Atrasada: sexta 11h, mensal R$ 500 desde 11/09, pagou R$ 500 em 11/09 (11, 18, 25/09 e
   02/10); a de 09/10 às 11h já passou e está em aberto. */
function caderno(){
  const c = JSON.parse(JSON.stringify(D.clinica));
  c.pacientes.push(
    { id:"pN", codigo:"T1", nome:"Nova", freq:"semanal", cobranca:"mensal", valor:500, dia:5, hora:13, meet:"", status:"Ativo.",
      inicio:"2026-10-09", ciclos:[{ inicio:"2026-10-09", cobranca:"mensal", valor:500 }] },
    { id:"pT", codigo:"T2", nome:"Atrasada", freq:"semanal", cobranca:"mensal", valor:500, dia:5, hora:11, meet:"", status:"Ativo.",
      inicio:"2026-09-11", ciclos:[{ inicio:"2026-09-11", cobranca:"mensal", valor:500 }] },
    /* conta pela planilha (sem histórico do prontuário): 10 sessões até 01/10, pagou R$ 1.250, deve a de 05/10 */
    { id:"pH", codigo:"T3", nome:"Planilha", freq:"semanal", cobranca:"mensal", valor:500, dia:1, hora:12, meet:"", status:"Ativo.",
      basePlanilha:"2026-10-01", sessoesPlanilha:10, reguaPlanilha:1, inicio:"2026-07-27", ciclos:[{ inicio:"2026-07-27", cobranca:"mensal", valor:500 }] });
  c.pagamentos.push(
    { id:"g1", pacienteId:"pN", nomePlanilha:"", data:"2026-10-09", valor:500, meio:"pix", obs:"", receita:"Prática Clínica." },
    { id:"g2", pacienteId:"pT", nomePlanilha:"", data:"2026-09-11", valor:500, meio:"pix", obs:"", receita:"Prática Clínica." },
    { id:"g3", pacienteId:"pH", nomePlanilha:"", data:"2026-09-30", valor:1250, meio:"pix", obs:"", receita:"Prática Clínica." });
  return c;
}
async function abrir(largura){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:844 }, isMobile: largura < 700, hasTouch: largura < 700,
    locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date("2026-10-09T14:30:00-03:00") });
  await ctx.addInitScript(k => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k);
    localStorage.setItem("teste-semeado", "1");
  }, JSON.stringify(caderno()));
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  page_dialogs(p);
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + "clinica.html");
  await p.waitForTimeout(600);
  return { ctx, p, erros };
}
function page_dialogs(p){ p.on("dialog", d => d.accept()); }
const conta = id => {
  const x = acharPaciente(id), d = devidoDe(x), v = proximoVencimento(x);
  return { venc: v ? chaveData(v) : null, exato:d.exato, sessoes:d.sessoes, cobranca:x.cobranca, valor:x.valor,
    ciclos:ciclosDe(x).map(c => [c.inicio, c.cobranca, c.valor]) };
};

test("Valor do ciclo inteiro (ou múltiplo) não pergunta nada; valor quebrado pergunta", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const r = await p.evaluate(() => { const x = acharPaciente("pN");
    return [500, 1000, 125, 150, 250].map(v => pedeCasoAvulso(x, v)); });
  assert.deepEqual(r, [false, false, true, true, true]);
  // quem paga por sessão nunca vê a pergunta
  assert.equal(await p.evaluate(() => pedeCasoAvulso({ cobranca:"avulsa", valor:150 }, 150)), false);
  assert.deepEqual(erros, []);
  await ctx.close();
});

for (const largura of [390, 1280]) {
  test("Ficha (" + largura + "px): troca de ciclo no fim do pacote passa a cobrar R$ 150 por sessão desde 06/11", async () => {
    const { ctx, p, erros } = await abrir(largura);
    const antes = await p.evaluate(`(${conta})("pN")`);
    assert.deepEqual(antes, { venc:"2026-11-06", exato:-375, sessoes:-3, cobranca:"mensal", valor:500, ciclos:[["2026-10-09","mensal",500]] });
    await p.evaluate(() => abrirFicha(acharPaciente("pN")));
    await p.fill("#fr-valor", "150");
    assert.equal(await p.locator('#fr-caso input[name="fr-caso"]').count(), 2);
    assert.match(await p.textContent("#fr-caso"), /Nova está no ciclo mensal \(R\$ 500, R\$ 125 por sessão\)/);
    assert.match(await p.textContent("#fr-caso"), /A partir da sessão de 06\/11\/2026 ele paga por sessão, R\$ 150 cada/);
    assert.match(await p.textContent("#fr-previa"), /Escolha acima qual é o caso/);
    // sem escolher, não grava
    await p.click("#fr-registrar");
    assert.match(await p.textContent("#fr-feito"), /Escolha qual é o caso/);
    assert.equal(await p.evaluate(() => dados.pagamentos.filter(g => g.pacienteId === "pN").length), 1);
    // a prévia da troca não grava nada
    await p.click('#fr-caso input[value="troca"]');
    assert.match(await p.textContent("#fr-previa"),
      /Muda para sessão avulsa de R\$ 150 a partir de 06\/11\/2026\. R\$ 150 paga 1 sessão: 06\/11\. Próximo pagamento: na sessão de 13\/11\/2026\./);
    assert.deepEqual(await p.evaluate(`(${conta})("pN")`), antes, "a prévia não muda nada");
    if (largura === 390) await p.locator("#fi-reg").screenshot({ path: "/tmp/claude-0/avulso-pergunta-390.png" });
    else await p.locator("#fi-reg").screenshot({ path: "/tmp/claude-0/avulso-pergunta-1280.png" });
    await p.click("#fr-registrar");
    assert.match(await p.textContent("#fr-feito"), /Registrado: R\$ 150 em 09\/10\/2026\. Passa a pagar por sessão, R\$ 150 cada, desde 06\/11\/2026\. Próximo pagamento na sessão de 13\/11\/2026\./);
    const depois = await p.evaluate(`(${conta})("pN")`);
    assert.deepEqual(depois, { venc:"2026-11-13", exato:-525, sessoes:-4, cobranca:"avulsa", valor:150,
      ciclos:[["2026-10-09","mensal",500], ["2026-11-06","avulsa",150]] });
    // a frase do saldo conta cada sessão no preço dela: 3 × 125 + 1 × 150 = 525, sem sobra nem crédito negativo
    assert.deepEqual(await p.evaluate(() => { const x = acharPaciente("pN"); return [textoDevido(x).texto, devidoDe(x).valor, devidoDe(x).sobra]; }),
      ["4 sessões adiantadas", -525, 0]);
    assert.match(await p.textContent("#fi-situ"), /4 sessões adiantadas/);
    assert.doesNotMatch(await p.textContent("#fi-situ"), /-/);
    // o que já estava pago continua no preço do pacote
    assert.deepEqual(await p.evaluate(() => { const x = acharPaciente("pN");
      return ["2026-10-09","2026-10-30","2026-11-06","2026-11-13"].map(d => valorSessaoEm(x, d)); }), [125, 125, 150, 150]);
    assert.equal(await p.locator('#fr-caso input').count(), 0, "o campo volta ao valor do ciclo novo, sem pergunta");
    assert.equal(await p.inputValue("#fr-valor"), "150");
    // apagar o pagamento desfaz a troca
    await p.locator('#fi-pag [data-fapagar]').first().click();
    assert.deepEqual(await p.evaluate(`(${conta})("pN")`), antes);
    if (largura < 700) {
      const sobra = await p.evaluate(() => { const m = document.querySelector(".overlay .modal"); return m.scrollWidth - m.clientWidth; });
      assert.equal(sobra <= 1, true, "a ficha não rola para o lado");
    }
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}

test("Ficha: avulsa de R$ 125 dentro do pacote só soma ao saldo, sem mudar o ciclo", async () => {
  const { ctx, p, erros } = await abrir(1280);
  await p.evaluate(() => abrirFicha(acharPaciente("pN")));
  await p.fill("#fr-valor", "125");
  await p.click('#fr-caso input[value="pacote"]');
  assert.match(await p.textContent("#fr-previa"), /R\$ 125 paga 1 sessão: 06\/11\. Próximo pagamento: na sessão de 13\/11\/2026\./);
  await p.click("#fr-registrar");
  assert.deepEqual(await p.evaluate(`(${conta})("pN")`),
    { venc:"2026-11-13", exato:-500, sessoes:-4, cobranca:"mensal", valor:500, ciclos:[["2026-10-09","mensal",500]] });
  assert.equal(await p.evaluate(() => (acharPaciente("pN").ciclos || []).some(c => c.pagamento)), false);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Aba Pagamentos: troca de quem tem sessão em aberto começa nessa sessão, que passa a valer o que ele pagou", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const antes = await p.evaluate(`(${conta})("pT")`);
  assert.deepEqual(antes, { venc:"2026-10-09", exato:125, sessoes:1, cobranca:"mensal", valor:500, ciclos:[["2026-09-11","mensal",500]] });
  await p.evaluate(() => { mostrarView("pagamentos"); abrirFormPagamento(true);
    document.getElementById("pg-paciente").value = "pT"; dicaPagamento(true); });
  await p.fill("#pg-valor", "150");
  assert.match(await p.textContent("#pg-caso"), /A partir da sessão de 09\/10\/2026 ele paga por sessão, R\$ 150 cada/);
  await p.click("#pg-add");
  assert.match(await p.textContent("#pg-feito"), /Escolha qual é o caso/);
  await p.click('#pg-caso input[value="troca"]');
  assert.match(await p.textContent("#pg-dica"), /Muda para sessão avulsa de R\$ 150 a partir de 09\/10\/2026\. R\$ 150 paga 1 sessão: 09\/10\. Próximo pagamento: na sessão de 16\/10\/2026\./);
  await p.click("#pg-add");
  assert.match(await p.textContent("#pg-feito"), /Atrasada · R\$ 150 em 09\/10\/2026 · passa a pagar por sessão desde 09\/10\/2026\. Próximo vencimento: 16\/10\/2026\./);
  assert.deepEqual(await p.evaluate(`(${conta})("pT")`),
    { venc:"2026-10-16", exato:0, sessoes:0, cobranca:"avulsa", valor:150, ciclos:[["2026-09-11","mensal",500], ["2026-10-09","avulsa",150]] });
  // as quatro do pacote continuam a R$ 125 no extrato
  assert.deepEqual(await p.evaluate(() => extratoDe(acharPaciente("pT")).linhas.filter(l => l.cobrado).map(l => [l.data, l.cobrado])),
    [["2026-09-11",125],["2026-09-18",125],["2026-09-25",125],["2026-10-02",125],["2026-10-09",150]]);
  // a pergunta some depois de registrar e não volta marcada para outro paciente
  assert.equal(await p.locator("#pg-caso input").count(), 0);
  // apagar pelo histórico desfaz a troca
  const id = await p.evaluate(() => dados.pagamentos.filter(g => g.pacienteId === "pT" && g.valor === 150)[0].id);
  await p.locator('[data-apagar="' + id + '"]').click();
  assert.deepEqual(await p.evaluate(`(${conta})("pT")`), antes);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Sem sessão para começar ou com ciclo novo já marcado, a troca fica desligada e explica o porquê", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const r = await p.evaluate(() => {
    const x = acharPaciente("pT");
    abrirCiclo(x, "2026-10-09", "mensal", 600); vencCache = null; devidoCache = null; // ciclo novo começa na sessão em aberto
    return inicioDaTroca(x).erro;
  });
  assert.match(r, /Já existe um ciclo começando em 09\/10\/2026/);
  await p.evaluate(() => abrirFicha(acharPaciente("pT")));
  await p.fill("#fr-valor", "150");
  assert.equal(await p.locator('#fr-caso input[value="troca"]').isDisabled(), true);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Conta pela planilha (sem histórico): a troca fica desligada, porque mudaria o preço das sessões antigas", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const r = await p.evaluate(() => { const x = acharPaciente("pH"), d = devidoDe(x);
    return { extrato:!!d.extrato, exato:d.exato, erro:inicioDaTroca(x).erro }; });
  assert.equal(r.extrato, false);
  assert.equal(r.exato, 125);
  assert.match(r.erro, /ainda não tem o histórico de sessões no app/);
  await p.evaluate(() => abrirFicha(acharPaciente("pH")));
  await p.fill("#fr-valor", "150");
  assert.equal(await p.locator('#fr-caso input[value="troca"]').isDisabled(), true);
  assert.equal(await p.locator('#fr-caso input[value="pacote"]').isDisabled(), false);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Dois pacotes adiantados e troca: frase sem crédito negativo (7 × R$ 125 + 1 × R$ 150)", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const r = await p.evaluate(() => {
    const x = acharPaciente("pN");
    dados.pagamentos.push({ id:"g9", pacienteId:"pN", nomePlanilha:"", data:"2026-10-09", valor:500, meio:"pix", obs:"", receita:"Prática Clínica." });
    vencCache = null; devidoCache = null;
    const ini = inicioDaTroca(x).inicio;
    dados.pagamentos.push({ id:"g10", pacienteId:"pN", nomePlanilha:"", data:"2026-10-09", valor:150, meio:"pix", obs:"", receita:"Prática Clínica." });
    trocarParaAvulsa(x, ini, 150, "g10");
    const d = devidoDe(x);
    return { ini, texto:textoDevido(x).texto, valor:d.valor, venc:chaveData(proximoVencimento(x)) };
  });
  assert.deepEqual(r, { ini:"2026-12-04", texto:"8 sessões adiantadas", valor:-1025, venc:"2026-12-11" });
  assert.deepEqual(erros, []);
  await ctx.close();
});
