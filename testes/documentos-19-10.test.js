/* Documentos de 19/10/2026 (ele abriu CNPJ): declaração para reembolso, relatório do ano e nota fiscal.
   Só montam texto a partir do que já existe: nenhuma conta, saldo ou dívida muda.
   Cadernos inventados de dados-de-teste.js, relógio parado em 07/10/2026. Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

/* Paciente Mensal: prontuário até 30/09 com 4 realizadas e 1 falta em setembro; quem paga é a mãe */
function caderno(){
  const c = JSON.parse(JSON.stringify(D.clinica));
  const pA = c.pacientes.find(p => p.id === "pA");
  pA.historico = { ate:"2026-09-30", sessoes:[
    { data:"2026-09-01", n:1, situacao:"realizada" }, { data:"2026-09-08", n:2, situacao:"falta" },
    { data:"2026-09-15", n:3, situacao:"realizada" }, { data:"2026-09-22", n:4, situacao:"realizada" },
    { data:"2026-09-29", n:5, situacao:"realizada" } ] };
  c.cadastros = c.cadastros || {};
  c.cadastros[pA.codigo] = { nomeCompleto:"Paciente Mensal Completo", cpf:"000.000.000-00", pagadorNome:"Mãe de Teste", pagadorCpf:"111.111.111-11" };
  c.pagamentos = (c.pagamentos || []).concat([{ id:"gT1", pacienteId:"pA", data:"2026-09-01", valor:700, meio:"pix", receita:"Prática Clínica." },
    { id:"gT2", pacienteId:"pA", data:"2026-10-05", valor:700, meio:"pix", receita:"Prática Clínica." }]);
  c.profissional = { nome:"Profissional de Teste", crp:"16/00000", cnpjDesde:"2026-10-01", municipio:"Vila Velha" };
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

test("Declaração: só as realizadas do período, sem a falta, no nome de quem paga", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const r = await p.evaluate(() => {
    const pa = dados.pacientes.find(x => x.id === "pA");
    const d = montarDeclaracao(pa, periodoDoc("datas", "2026-09-01", "2026-09-30"));
    return { datas:d.ss.feitas.map(s => s.data), pagador:d.pg.nome, texto:textoDeclaracao(d) };
  });
  assert.deepEqual(r.datas, ["2026-09-01", "2026-09-15", "2026-09-22", "2026-09-29"]);
  assert.equal(r.pagador, "Mãe de Teste");
  assert.match(r.texto, /Paciente Mensal Completo, CPF 000\.000\.000-00/);
  assert.doesNotMatch(r.texto, /CID|sintoma/i);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Declaração abre pela ficha e cabe no celular", async () => {
  const { ctx, p, erros } = await abrir(375);
  await p.evaluate(() => { mostrarView("pacientes"); abrirFicha(dados.pacientes.find(x => x.id === "pA"), null, "pagamento"); });
  await p.locator("#fu-declaracao").click();
  await p.waitForTimeout(200);
  assert.equal(await p.locator("#dc-doc").isVisible(), true);
  const largura = await p.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(largura <= 375, "rolou de lado: " + largura);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Relatório do ano separa pessoa física e CNPJ, e a nota guarda o número sem mexer no valor", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const r = await p.evaluate(() => {
    const rel = relatorioDoAno(2026), antes = JSON.stringify(dados.pagamentos.map(g => [g.id, g.valor, g.data]));
    const g = dados.pagamentos.find(x => x.id === "gT2");
    abrirNota(g);
    document.getElementById("nf-num").value = "77";
    document.getElementById("nf-guardar").click();
    const depois = JSON.stringify(dados.pagamentos.map(g => [g.id, g.valor, g.data]));
    return { soma: rel.linhas.reduce((s, x) => s + x.pf + x.pj, 0),
      total: dados.pagamentos.filter(g => g.data.slice(0,4) === "2026" && (!g.receita || g.receita === "Prática Clínica.")).reduce((s, g) => s + Number(g.valor), 0),
      nota: g.nota && g.nota.numero, igual: antes === depois, emissorNacional: usaEmissorNacional() };
  });
  assert.equal(Math.round(r.soma * 100), Math.round(r.total * 100));
  assert.equal(r.nota, "77");
  assert.equal(r.igual, true);
  assert.equal(r.emissorNacional, false); /* Vila Velha emite no site da prefeitura */
  assert.deepEqual(erros, []);
  await ctx.close();
});
