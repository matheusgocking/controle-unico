/* Dívida de quem saiu da agenda calculada pelo app (decisão dele, 09/10/2026). Caderno inventado de
   dados-de-teste.js e um arquivo de sessões inventado; relógio parado em 09/10/2026. Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

/* T50: avulsa R$ 150 e depois mensal R$ 500 (R$ 125 a sessão). Sessões: 2 avulsas, 3 mensais, 1 falta
   cobrada e 1 "avisou" (não cobra) = R$ 300 + R$ 500 = R$ 800. Pagou 150 + 150 + 375 (este com ficha que
   não existe mais) = R$ 675. Deve R$ 125 = 1 sessão; a planilha diz o mesmo.
   T51: avulsa R$ 100, 3 sessões, com cortesia (R$ 200 cobrados), pagou R$ 300: R$ 100 de crédito; a planilha dizia 0.
   T52: pendente (espera a decisão dele): continua com os R$ 300 da planilha.
   T53: tem ficha na agenda com o mesmo prontuário; o pagamento da ficha não entra na conta antiga. */
function caderno(){
  const c = JSON.parse(JSON.stringify(D.clinica));
  c.arquivados = [
    { codigo:"T50", nome:"Alice Teste", status:"Inativo.", valor:500, modalidade:"Mensal.", inicio:"2026-05-01", fim:"2026-06-12", sessoes:6, ciclos:2, aPagar:125, linhas:[] },
    { codigo:"T51", nome:"Bruno Teste", status:"Alta clínica.", valor:100, modalidade:"Avulsa.", inicio:"2026-04-01", fim:"2026-04-15", sessoes:3, ciclos:1, aPagar:0, linhas:[] },
    { codigo:"T52", nome:"Carla Teste", status:"Inativo.", valor:100, modalidade:"Avulsa.", inicio:"2026-03-01", fim:"2026-03-20", sessoes:3, ciclos:1, aPagar:300, linhas:[] }
  ];
  const pg = (id, codigo, data, valor, pacienteId) => ({ id, pacienteId:pacienteId || "", codigo, nomePlanilha:"", data, valor, meio:"pix", obs:"", receita:"Prática Clínica." });
  c.pagamentos.push(pg("g1", "T50", "2026-05-01", 150), pg("g2", "T50", "2026-05-08", 150), pg("g3", "T50", "2026-05-15", 375, "pSumiu"),
    pg("g4", "T51", "2026-04-01", 300), pg("g5", "T50", "2026-10-01", 999, "pAgenda"));
  c.pacientes.push({ id:"pAgenda", codigo:"T99", nome:"Outra", freq:"semanal", cobranca:"avulsa", valor:100, dia:2, hora:9, meet:"", status:"Ativo.", inicio:"2026-10-01" });
  return c;
}
const ARQUIVO = {
  tipo:"sessoes-de-quem-saiu", gerado:"2026-10-09",
  pacientes:[
    { codigo:"T50", ate:"2026-06-12", cortesia:0,
      ciclos:[{ inicio:"2026-05-01", cobranca:"avulsa", valor:150 }, { inicio:"2026-05-15", cobranca:"mensal", valor:500 }],
      sessoes:[{ data:"2026-05-01", n:1, situacao:"realizada" }, { data:"2026-05-08", n:2, situacao:"realizada" },
        { data:"2026-05-15", n:3, situacao:"realizada" }, { data:"2026-05-22", n:4, situacao:"realizada" }, { data:"2026-05-29", n:5, situacao:"realizada" },
        { data:"2026-06-05", n:6, situacao:"falta" }, { data:"2026-06-12", n:7, situacao:"avisou" }] },
    { codigo:"T51", ate:"2026-04-15", cortesia:1, ciclos:[{ inicio:"2026-04-01", cobranca:"avulsa", valor:100 }],
      sessoes:[{ data:"2026-04-01", n:1, situacao:"realizada" }, { data:"2026-04-08", n:2, situacao:"realizada" }, { data:"2026-04-15", n:3, situacao:"realizada" }] },
    { codigo:"T52", ate:"2026-03-20", ciclos:[{ inicio:"2026-03-01", cobranca:"avulsa", valor:100 }], sessoes:[{ data:"2026-03-01", n:1, situacao:"realizada" }] }
  ],
  pendentes:[{ codigo:"T52", motivo:"esperando sua decisão" }]
};

async function abrir(largura){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:900 }, isMobile: largura < 700, hasTouch: largura < 700,
    locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date("2026-10-09T12:00:00-03:00") });
  await ctx.addInitScript(k => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k);
    localStorage.setItem("teste-semeado", "1");
  }, JSON.stringify(caderno()));
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  p.on("dialog", d => d.accept());
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + "clinica.html");
  await p.waitForTimeout(600);
  return { ctx, p, erros };
}
async function carregar(p){
  await p.evaluate(() => { mostrarView("pacientes"); });
  await p.setInputFiles("#arquivo-saidos", { name:"sessoes-de-quem-saiu.json", mimeType:"application/json", buffer:Buffer.from(JSON.stringify(ARQUIVO)) });
  await p.waitForSelector("#sqs-aplicar");
}

test("Antes da carga, a dívida de quem saiu continua a da planilha", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const r = await p.evaluate(() => dados.arquivados.map(a => [a.codigo, contaArquivado(a).exato, contaArquivado(a).app]));
  assert.deepEqual(r, [["T50", 125, false], ["T51", 0, false], ["T52", 300, false]]);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Prévia mostra planilha e app; carregar passa a conta para o app; o pendente fica pela planilha", async () => {
  const { ctx, p, erros } = await abrir(1280);
  await carregar(p);
  const previa = await p.locator(".modal").innerText();
  assert.match(previa, /1 de 2/);
  assert.match(previa, /Alice Teste[\s\S]*R\$\s?125[\s\S]*igual/);
  assert.match(previa, /Bruno Teste[\s\S]*diferente/);
  assert.match(previa, /Carla Teste \(T52, esperando sua decisão\)/);
  /* nada gravado enquanto a prévia está aberta */
  assert.equal(await p.evaluate(() => dados.arquivados.filter(a => a.conta).length), 0);
  await p.click("#sqs-aplicar");
  const r = await p.evaluate(() => dados.arquivados.map(a => { const c = contaArquivado(a); return [a.codigo, c.exato, c.sessoes, c.app]; }));
  assert.deepEqual(r, [["T50", 125, 1, true], ["T51", -100, -1, true], ["T52", 300, 0, false]]);
  const ext = await p.evaluate(() => { const c = contaArquivado(dados.arquivados[0]); return [c.cobrado, c.pago]; });
  assert.deepEqual(ext, [800, 675], "a falta cobra, o 'avisou' não; o pagamento da ficha da agenda (T99) não entra");
  /* Painel: os dois que devem, cada um com a origem certa */
  await p.evaluate(() => { mostrarView("painel"); renderTudo(); });
  const painel = await p.locator(".pn-fora-t + table").innerText();
  assert.match(painel, /Carla Teste[\s\S]*R\$\s?300[\s\S]*pela planilha/);
  assert.match(painel, /Alice Teste[\s\S]*R\$\s?125/);
  assert.doesNotMatch(painel, /Bruno/);
  assert.match(painel, /R\$\s?425/);
  /* cartão: crédito e extrato */
  await p.evaluate(() => { filtroPacientes = "alta"; mostrarView("pacientes"); renderPacientes(); });
  assert.match(await p.locator("#plist").innerText(), /R\$\s?100 de crédito/);
  await p.click('[data-extrato-fora="T51"]');
  assert.match(await p.locator(".modal").innerText(), /cortesia[\s\S]*Tem R\$\s?100|Tem R\$\s?100[\s\S]*cortesia/);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Desfazer a carga volta tudo para a planilha", async () => {
  const { ctx, p, erros } = await abrir(390);
  await carregar(p);
  await p.click("#sqs-aplicar");
  await p.evaluate(() => { filtroPacientes = "inativo"; renderPacientes(); });
  assert.equal(await p.locator("#desfazer-saidos").isVisible(), true);
  await p.click("#desfazer-saidos");
  const r = await p.evaluate(() => dados.arquivados.map(a => [a.codigo, contaArquivado(a).exato, !!a.conta]));
  assert.deepEqual(r, [["T50", 125, false], ["T51", 0, false], ["T52", 300, false]]);
  assert.equal(await p.locator("#desfazer-saidos").isVisible(), false);
  const largura = await p.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(largura <= 390, "sem rolagem de lado no celular: " + largura);
  assert.deepEqual(erros, []);
  await ctx.close();
});
