/* Auditoria da Clínica (06/10/2026): o mesmo número em todas as telas. Só tela: nenhuma conta
   nem dado gravado muda. Cadernos inventados de dados-de-teste.js, relógio em 04/10/2026. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

async function abrir() {
  const ctx = await nav.newContext({ viewport:{ width:1280, height:900 }, locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date(D.HOJE) });
  await ctx.addInitScript(k => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k);
    localStorage.setItem("teste-semeado", "1");
  }, JSON.stringify(D.clinica));
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  p.on("dialog", d => d.accept());
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + "clinica.html");
  await p.waitForTimeout(600);
  return { ctx, p, erros };
}
/* Paciente Mensal (R$ 700, R$ 175 a sessão): 4 sessões em setembro e R$ 600 pagos: deve R$ 100 */
const MONTAR = `(() => {
  const a = acharPaciente("pA");
  a.historico = { ate:"2026-09-30", sessoes:["2026-09-07","2026-09-14","2026-09-21","2026-09-28"].map((d,i)=>({data:d,n:i+1,situacao:"realizada"})) };
  dados.pagamentos = [{id:"g1",pacienteId:"pA",data:"2026-10-01",valor:600,meio:"",obs:"",receita:"Prática Clínica."}];
  renderTudo();
})()`;

test("Auditoria: o Painel mostra a dívida em reais exatos, igual à ficha, e o Cobrar pede esse valor", async () => {
  const { ctx, p, erros } = await abrir();
  await p.evaluate(MONTAR);
  const r = await p.evaluate(() => {
    document.querySelector("#v-painel [data-cobrar]").click();
    const txt = document.getElementById("cob-txt").value;
    return { ficha: textoDevido(acharPaciente("pA")).texto, painel: document.getElementById("pn-divida").textContent,
      linha: document.querySelector("#pn-devendo tbody tr").innerText, cobrar: txt,
      atraso: document.getElementById("pg-atraso").parentNode.title,
      ultimo: document.querySelector("#pg-tabela tbody tr td[data-rot='Último']").innerText };
  });
  assert.equal(r.ficha, "deve R$ 100");
  assert.equal(r.painel, "R$ 100");
  assert.match(r.linha, /R\$ 100/);
  assert.doesNotMatch(r.linha, /R\$ 175/);
  assert.match(r.cobrar, /R\$ 100,00/);
  assert.equal(r.atraso, "Devem R$ 100 ao todo.", "antes somava o preço do ciclo (R$ 700)");
  assert.doesNotMatch(r.ultimo, /·\s*$/, "sem o ponto solto quando o pagamento não tem meio");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Auditoria: o Painel conta só quem está em atendimento, e o seletor marca quem encerrou", async () => {
  const { ctx, p, erros } = await abrir();
  const r = await p.evaluate(() => {
    acharPaciente("pA").encerramentos = [{data:"2026-09-28", tipo:"inativo", origem:"app"}];
    renderTudo();
    return { carteira: document.getElementById("pn-carteira").innerText.replace(/\s+/g," "),
      dias: document.getElementById("pn-dias").innerText, sub: document.getElementById("pn-sub").textContent,
      opcao: [...document.querySelectorAll("#pg-paciente option")].find(o => o.value === "pA").textContent };
  });
  assert.equal(r.sub, "3 pacientes na agenda");
  assert.match(r.carteira, /^0 ?Ciclo mensal/);
  assert.match(r.carteira, /Semanais e quinzenais ?1 e 2/);
  assert.doesNotMatch(r.dias, /Segunda/);
  assert.equal(r.opcao, "Paciente Mensal · tratamento encerrado");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Auditoria: a aba Sessões diz o mesmo total de sessões do Mês", async () => {
  const { ctx, p, erros } = await abrir();
  const r = await p.evaluate(() => {
    marcarSaida("2026-10-05|9", "remarcada"); marcarSaida("2026-10-06|9", "cancelada"); renderTudo();
    return { mes: document.getElementById("m-sessoes").textContent, sub: document.getElementById("ss-sub").textContent };
  });
  assert.ok(r.sub.startsWith(r.mes + " sessões no mês"), r.mes + " / " + r.sub);
  assert.match(r.sub, /2 desmarcadas/);
  assert.deepEqual(erros, []);
  await ctx.close();
});
