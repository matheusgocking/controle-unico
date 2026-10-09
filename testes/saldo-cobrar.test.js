/* Saldo de sessões, bloco "Cobrar", últimas sessões na ficha e aba Dados (09/10/2026). Só tela:
   nenhuma conta muda e nada é gravado ao abrir. Cadernos inventados de dados-de-teste.js, relógio
   parado em 07/10/2026 12h. Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

/* Mensal (segunda 9h, R$ 700 = R$ 175 a sessão): pagou 4 sessões de setembro; a de 05/10 ficou sem pagar.
   Avulso (terça 9h, R$ 200): pagou R$ 600 em 29/09, sessões 29/09 e 06/10: sobra uma sessão paga. */
function caderno(){
  const c = JSON.parse(JSON.stringify(D.clinica));
  const pA = c.pacientes.find(p => p.id === "pA"), pB = c.pacientes.find(p => p.id === "pB");
  pA.historico = { ate:"2026-09-30", sessoes:["07","14","21","28"].map((d, i) => ({ data:"2026-09-" + d, n:i + 1, situacao:"realizada" })) };
  pB.historico = { ate:"2026-09-30", sessoes:[{ data:"2026-09-29", n:1, situacao:"realizada" }] };
  c.pagamentos.push({ id:"g1", pacienteId:"pA", nomePlanilha:"", data:"2026-09-07", valor:700, meio:"pix", obs:"", receita:"Prática Clínica." },
    { id:"g2", pacienteId:"pB", nomePlanilha:"", data:"2026-09-29", valor:600, meio:"pix", obs:"", receita:"Prática Clínica." });
  return c;
}
async function abrir(largura){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:844 }, isMobile: largura < 700, hasTouch: largura < 700,
    locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date("2026-10-07T12:00:00-03:00") });
  await ctx.addInitScript(k => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k);
    localStorage.setItem("teste-semeado", "1");
  }, JSON.stringify(caderno()));
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + "clinica.html");
  await p.waitForTimeout(600);
  return { ctx, p, erros };
}

test("Saldo: deve em vermelho, uma sessão paga em amarelo, sem conta fica de fora do Cobrar", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const r = await p.evaluate(() => ({
    a: (s => [s.classe, s.texto])(saldoDe(acharPaciente("pA"))),
    b: (s => [s.classe, s.texto])(saldoDe(acharPaciente("pB"))),
    c: saldoDe(acharPaciente("pC")).classe,
    cobrar: cobrancasAFazer().map(x => x.p.id) }));
  assert.deepEqual(r, { a:["atraso", "deve R$ 175"], b:["atencao", "saldo: 1 sessão"], c:"sem", cobrar:["pA", "pB"] });
  assert.deepEqual(erros, []);
  await ctx.close();
});

for (const largura of [390, 1280]) {
  test("Telas (" + largura + "px): Cobrar em Pacientes e Pagamentos, anel na semana, ficha com últimas sessões e aba Dados, sem gravar nada", async () => {
    const { ctx, p, erros } = await abrir(largura);
    const antes = await p.evaluate(() => { const c = JSON.parse(JSON.stringify(dados)); delete c.registros; return JSON.stringify(c); });
    await p.evaluate(() => mostrarView("pacientes"));
    assert.equal(await p.locator("#pcobrar .cobrar-it").count(), 2);
    assert.match(await p.textContent("#pcobrar .cobrar-it.atraso"), /deve R\$ 175/);
    assert.equal(await p.locator(".pcard .selo.saldo.atraso").count(), 1);
    await p.evaluate(() => mostrarView("pagamentos"));
    assert.equal(await p.locator("#pg-cobrar .cobrar-it").count(), 2);
    /* semana que vem: a sessão de 12/10 do Mensal não está paga (anel); a de 13/10 do Avulso, sim */
    await p.evaluate(() => { mostrarView("semana"); semana = somaDias(semana, 7); renderSemana(); });
    assert.equal(await p.locator('.cell[data-data="2026-10-12"][data-hora="9"] .pgm-apagar').count(), 1);
    assert.equal(await p.locator('.cell[data-data="2026-10-13"][data-hora="9"] .pgm-paga').count(), 1);
    /* a ficha: a próxima sessão e a de 05/10 sem pagar; setembro pago */
    await p.evaluate(() => abrirFicha(acharPaciente("pA")));
    const linhas = await p.$$eval("#fi-ultimas .fu", l => l.map(x => x.textContent));
    assert.match(linhas[0], /19\/10.*ainda não paga/);
    assert.match(linhas[1], /12\/10.*ainda não paga/);
    assert.match(linhas[2], /05\/10.*não paga/);
    assert.match(linhas[3], /28\/09.*paga/);
    /* as quatro abas cabem na largura, e a de Dados avisa que está vazia */
    const caber = await p.evaluate(() => { const a = document.querySelector(".fi-abas"); return a.scrollWidth <= a.clientWidth + 1; });
    assert.ok(caber, "abas da ficha cabem sem rolar");
    assert.ok(await p.locator("#fi-aba-dados.vazio").count());
    await p.click("#fi-aba-dados");
    assert.ok(await p.isVisible("#dp-nomeCompleto"));
    assert.ok(await p.isVisible("[data-trazer-dados]"));
    await p.click("#fi-fechar");
    const depois = await p.evaluate(() => { const c = JSON.parse(JSON.stringify(dados)); delete c.registros; return JSON.stringify(c); });
    assert.equal(depois, antes, "abrir as telas não grava nada");
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}
