/* A Clínica na planilha baixada (05/10/2026): o "Baixar planilha" da Carteira passa a levar os
   pacientes, os ciclos e as sessões, para a Clínica também ter a volta em planilha. Cadernos
   inventados de dados-de-teste.js, relógio parado em 04/10/2026. Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

/* um paciente com histórico do prontuário, um que já saiu e marcas na agenda */
function clinica() {
  const c = JSON.parse(JSON.stringify(D.clinica));
  c.config.contarDesde = "2026-09-01";
  c.pacientes[0].historico = { ate:"2026-09-21", sessoes:[
    { data:"2026-09-14", n:1, situacao:"realizada" }, { data:"2026-09-21", n:2, situacao:"avisou" } ] };
  c.excecoes = { "2026-09-29|9": { tipo:"falta" }, "2026-09-22|9": { tipo:"remarcada" } };
  c.arquivados = [{ codigo:"T009", nome:"Paciente Antigo", status:"Inativo.", valor:150, modalidade:"avulsa",
    inicio:"2026-01-05", fim:"2026-06-30", aPagar:300 }];
  c.arquivadosEm = "2026-10-01";
  return c;
}

async function abrir(pagina) {
  const ctx = await nav.newContext({ viewport:{ width:1280, height:900 }, locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date(D.HOJE) });
  await ctx.addInitScript(([k, d, c]) => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k);
    localStorage.setItem("controle-unico-dinheiro-cache", d);
    localStorage.setItem("controle-unico-casa-cache", c);
    localStorage.setItem("teste-semeado", "1");
  }, [JSON.stringify(clinica()), JSON.stringify(D.dinheiro), JSON.stringify(D.casa)]);
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + pagina);
  await p.waitForTimeout(800);
  return { ctx, p, erros };
}

test("Clínica: as abas da planilha trazem pacientes, ciclos e sessões sem mexer nos dados", async () => {
  const { ctx, p, erros } = await abrir("clinica.html");
  const r = await p.evaluate(() => {
    const antes = JSON.stringify(dados);
    const abas = abasParaPlanilha();
    return { abas, igual: antes === JSON.stringify(dados) };
  });
  assert.ok(r.igual, "montar as abas não grava nada");
  assert.deepEqual(r.abas.map(a => a.nome), ["Pacientes", "Ciclos", "Sessões"]);

  const [pac, cic, ses] = r.abas.map(a => a.linhas);
  assert.equal(pac.length, 1 + 4 + 1, "cabeçalho, os quatro da agenda e o que já saiu");
  const antigo = pac.find(l => l[0] === "T009");
  assert.equal(antigo[3], "Fora da agenda");
  assert.equal(antigo[4], "Inativo");
  assert.equal(antigo[15], 300, "a dívida de quem saiu vem do número da planilha");
  assert.equal(pac.find(l => l[0] === "T001")[8], "Segunda-feira");
  assert.equal(cic.length, 1 + 4, "sem ciclos guardados, cada um tem o ciclo da ficha");

  const linha = (data, cod) => ses.find(l => l[0] === data && l[2] === cod);
  assert.deepEqual(linha("2026-09-14", "T001").slice(4), ["Realizada", 175, "Prontuário"]);
  assert.deepEqual(linha("2026-09-21", "T001").slice(4), ["Avisou e não veio", 0, "Prontuário"]);
  assert.equal(ses.filter(l => l[2] === "T001" && l[0] <= "2026-09-21" && l[6] === "Agenda").length, 0,
    "o que o prontuário já tem não se repete pela agenda");
  assert.deepEqual(linha("2026-09-29", "T002").slice(1), ["9h", "T002", "Paciente Avulso", "Não compareceu (cobrada)", 200, "Agenda"]);
  assert.deepEqual(linha("2026-09-22", "T002").slice(4), ["Remarcada", 0, "Agenda"]);
  assert.equal(ses.slice(1).filter(l => l[0] > "2026-10-04").length, 0, "sessão que ainda não aconteceu fica de fora");
  const datas = ses.slice(1).map(l => l[0]);
  assert.deepEqual(datas, [...datas].sort(), "da mais antiga para a mais recente");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Carteira: o Baixar planilha leva as abas da Clínica junto", async () => {
  const { ctx, p, erros } = await abrir("index.html");
  const f = p.frames().find(x => x.url().includes("app.html"));
  const nomes = await f.evaluate(() => new Promise(ok => {
    window.xlsx = abas => { ok(abas.map(a => a.nome)); return new Blob([""]); };
    window.URL.createObjectURL = () => "blob:teste";
    document.getElementById("exportar").click();
  }));
  assert.deepEqual(nomes.slice(-5), ["Recebimentos", "Anúncios", "Pacientes", "Ciclos", "Sessões"]);
  assert.deepEqual(erros, []);
  await ctx.close();
});
