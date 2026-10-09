/* "Voltar à agenda" para quem saiu (09/10/2026, caso da Sarah). Caderno inventado de
   dados-de-teste.js mais uma paciente inativa da planilha; relógio parado em 09/10/2026 (sexta).
   Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

function comInativa(c){
  c.arquivados = [{ codigo:"T36", nome:"Beatriz Teste Silva", status:"Inativo.", valor:500, modalidade:"Mensal.",
    inicio:"2026-05-07", fim:"2026-08-14", sessoes:13, ciclos:1, aPagar:0 }];
  c.arquivadosEm = "2026-10-01";
  c.pagamentos = c.pagamentos.concat([
    { id:"gv1", pacienteId:"", codigo:"T36", nomePlanilha:"Beatriz Teste Silva", data:"2026-05-13", valor:500, meio:"", obs:"", origem:"planilha", chavePlanilha:"T36|2026-05-13|500" },
    { id:"gv2", pacienteId:"", codigo:"T36", nomePlanilha:"Beatriz Teste Silva", data:"2026-08-16", valor:125, meio:"", obs:"", origem:"planilha", chavePlanilha:"T36|2026-08-16|125" }
  ]);
}

async function abrir(largura){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:844 }, isMobile: largura < 700, hasTouch: largura < 700,
    locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date("2026-10-09T12:00:00-03:00") });
  const c = JSON.parse(JSON.stringify(D.clinica));
  comInativa(c);
  await ctx.addInitScript(k => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k);
    localStorage.setItem("teste-semeado", "1");
  }, JSON.stringify(c));
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  p.on("dialog", d => d.accept());
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + "clinica.html");
  await p.waitForTimeout(600);
  return { ctx, p, erros };
}

for (const largura of [390, 1280]) {
  test("Voltar à agenda cria a ficha ligada ao passado, sem mexer nas contas dos outros (" + largura + ")", async () => {
    const { ctx, p, erros } = await abrir(largura);
    const antes = await p.evaluate(() => ({
      pagos: dados.pagamentos.length,
      outros: dados.pacientes.map(x => JSON.stringify([devidoDe(x), proximoVencimento(x)]))
    }));
    await p.evaluate(() => { mostrarView("pacientes"); filtroPacientes = "inativo"; renderPacientes(); });
    await p.click('[data-voltar="T36"]');
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => {
      const nova = dados.pacientes.find(x => x.codigo === "T36");
      vencCache = null; devidoCache = null;
      return {
        nova: nova && { nome:nova.nome, nomeCompleto:nova.nomeCompleto, cobranca:nova.cobranca, freq:nova.freq, valor:nova.valor, inicio:nova.inicio },
        semPagamento: pagamentosDe(nova.id).length,
        pagos: dados.pagamentos.length,
        ligados: dados.pagamentos.filter(g => g.codigo === "T36" && g.pacienteId).length,
        outros: dados.pacientes.filter(x => x.codigo !== "T36").map(x => JSON.stringify([devidoDe(x), proximoVencimento(x)])),
        ficha: document.getElementById("fi-tratamento").innerText,
        noInativo: arquivadosPorStatus("inativo").length
      };
    });
    assert.deepEqual(r.nova, { nome:"Beatriz", nomeCompleto:"Beatriz Teste Silva", cobranca:"mensal", freq:"semanal", valor:500, inicio:"2026-10-09" });
    assert.equal(r.semPagamento, 0, "a conta da ficha nova começa na volta");
    assert.equal(r.pagos, antes.pagos, "nenhum pagamento novo nem apagado");
    assert.equal(r.ligados, 0, "os recibos antigos não grudam na ficha nova");
    assert.deepEqual(r.outros, antes.outros, "os outros pacientes não mudam");
    assert.match(r.ficha, /Antes: 07\/05\/2026 → 14\/08\/2026 · Inativo · 13 sessões/);
    assert.match(r.ficha, /Voltou em 09\/10\/2026/);
    assert.match(r.ficha, /Tratamento anterior: 2 pagamentos · R\$ 625/);
    assert.equal(r.noInativo, 0, "o cartão antigo sai de Inativos");
    await p.screenshot({ path: require("path").join(process.env.FOTOS || require("os").tmpdir(), "voltar-ficha-" + largura + ".png") });
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}
