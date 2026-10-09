/* Ficha criada no app, sem prontuário e sem planilha (09/10/2026, caso da Sarah): a conta do saldo
   começa no dia em que a ficha começou. Antes ficava "sem base": sem bolinha, sem saldo, sem dívida.
   Cadernos inventados de dados-de-teste.js, relógio parado em 09/10/2026 14h30. Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

/* Nova: sexta 13h, mensal R$ 500 (R$ 125 a sessão), começou em 09/10 e pagou R$ 500 nesse dia.
   Devedora: sexta 15h, por sessão R$ 150, começou em 25/09 e nunca pagou (25/09 e 02/10 já passaram; 09/10 às 15h ainda não).
   Antiga: igual à Nova, mas sem data de início (como ficavam as fichas antes): a conta antiga continua. */
function caderno(){
  const c = JSON.parse(JSON.stringify(D.clinica));
  c.pacientes.push(
    { id:"pN", codigo:"T1", nome:"Nova", freq:"semanal", cobranca:"mensal", valor:500, dia:5, hora:13, meet:"", status:"Ativo.",
      inicio:"2026-10-09", ciclos:[{ inicio:"2026-10-09", cobranca:"mensal", valor:500 }] },
    { id:"pV", codigo:"T2", nome:"Devedora", freq:"semanal", cobranca:"avulsa", valor:150, dia:5, hora:15, meet:"", status:"Ativo.",
      inicio:"2026-09-25", ciclos:[{ inicio:"2026-09-25", cobranca:"avulsa", valor:150 }] },
    { id:"pS", codigo:"T3", nome:"Antiga", freq:"semanal", cobranca:"mensal", valor:500, dia:4, hora:13, meet:"", status:"Ativo." });
  c.pagamentos.push({ id:"g1", pacienteId:"pN", nomePlanilha:"", data:"2026-10-09", valor:500, meio:"pix", obs:"", receita:"Prática Clínica." });
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
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + "clinica.html");
  await p.waitForTimeout(600);
  return { ctx, p, erros };
}

test("Ficha do app que pagou o ciclo: 3 sessões de saldo, vence na 5ª sessão, bolinha verde hoje", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const r = await p.evaluate(() => {
    const n = acharPaciente("pN"), d = devidoDe(n), v = proximoVencimento(n);
    return { exato:d.exato, sessoes:d.sessoes, venc:chaveData(v), txt:textoDevido(n).texto,
      hoje:pagamentoDaSessao(n, new Date(2026, 9, 9), 13, "sessao"), prox:pagamentoDaSessao(n, new Date(2026, 9, 16), 13, "sessao"),
      antes:estadoSessaoDe(n, new Date(2026, 9, 2), 13) };
  });
  assert.deepEqual(r, { exato:-375, sessoes:-3, venc:"2026-11-06", txt:"3 sessões adiantadas", hoje:"paga", prox:"paga", antes:null });
  const bola = await p.locator('.cell[data-data="2026-10-09"][data-hora="13"] .pgm-paga').count();
  assert.equal(bola, 1);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Ficha do app que nunca pagou: deve as 2 sessões desde o início, a mais antiga em aberto", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const r = await p.evaluate(() => {
    const x = acharPaciente("pV"), d = devidoDe(x);
    return { exato:d.exato, venc:chaveData(proximoVencimento(x)), sit:situacaoPagamento(x).chave, txt:textoDevido(x).texto,
      antes:estadoSessaoDe(x, new Date(2026, 8, 18), 15) };
  });
  assert.deepEqual(r, { exato:300, venc:"2026-09-25", sit:"atraso", txt:"deve 2 sessões · R$ 300", antes:null });
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Ficha sem data de início continua com a conta de antes (sem base)", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const r = await p.evaluate(() => devidoDe(acharPaciente("pS")));
  assert.equal(r, null);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Adicionar paciente: a ficha nasce começando hoje, e o Começou em muda o início e o primeiro ciclo", async () => {
  const { ctx, p, erros } = await abrir(390);
  await p.evaluate(() => mostrarView("pacientes"));
  await p.click("#add-paciente");
  await p.click("#fi-aba-cadastro");
  assert.equal(await p.inputValue("#fi-inicio"), "2026-10-09");
  await p.fill("#fi-inicio", "2026-10-02");
  await p.dispatchEvent("#fi-inicio", "change");
  const r = await p.evaluate(() => { const n = dados.pacientes[dados.pacientes.length - 1]; return { inicio:n.inicio, ciclo:n.ciclos[0].inicio }; });
  assert.deepEqual(r, { inicio:"2026-10-02", ciclo:"2026-10-02" });
  /* quem veio da planilha não tem o campo: o começo dele é o da planilha */
  await p.click("#fi-fechar");
  assert.deepEqual(erros, []);
  await ctx.close();
});
