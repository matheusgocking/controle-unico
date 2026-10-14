/* Clínica de 14/10/2026: Painel e Meta escondidos, ficha com Dados primeiro, linha do tempo do
   prontuário e quem pagou digitando. Só tela: nenhuma conta muda.
   Cadernos inventados de dados-de-teste.js, relógio parado em 07/10/2026. Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

/* Paciente Mensal (segunda, 9h): prontuário até 30/09 com 4 realizadas e 1 falta desde 01/09;
   na agenda, 06/10 marcada realizada. Os outros ficam sem histórico. */
function caderno(){
  const c = JSON.parse(JSON.stringify(D.clinica));
  const pA = c.pacientes.find(p => p.id === "pA");
  pA.historico = { ate:"2026-09-30", sessoes:[
    { data:"2026-09-01", n:1, situacao:"realizada" }, { data:"2026-09-08", n:2, situacao:"falta" },
    { data:"2026-09-15", n:3, situacao:"realizada" }, { data:"2026-09-22", n:4, situacao:"realizada" },
    { data:"2026-09-29", n:5, situacao:"realizada" } ] };
  return c;
}
async function abrir(largura, escuro){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:844 }, isMobile: largura < 700, hasTouch: largura < 700,
    locale:"pt-BR", timezoneId:"America/Sao_Paulo", colorScheme: escuro ? "dark" : "light" });
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

test("Painel e Meta escondidos, sem selo de formulação", async () => {
  const { ctx, p, erros } = await abrir(390);
  assert.equal(await p.locator('.tabs .tab[data-view="painel"]').isVisible(), false);
  assert.equal(await p.locator('.tabs .tab[data-view="meta"]').isVisible(), false);
  assert.equal(await p.locator('.tabs .tab[data-view="pacientes"]').isVisible(), true);
  await p.evaluate(() => { dados.formulacoes = { T001:{ situacao:"Revisada" } }; mostrarView("pacientes"); renderPacientes(); });
  assert.equal(await p.locator("#plist .selo", { hasText:"Formulação" }).count(), 0);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Linha do tempo do prontuário: Word até a data dele, agenda depois, a próxima no alto", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const r = await p.evaluate(() => {
    const pa = dados.pacientes.find(x => x.id === "pA"), l = linhaDoTempoDe(pa);
    const iso = d => chaveData(d);
    return { primeira:l[0].futura, textos:l.filter(x => !x.futura).map(x => iso(x.d) + " " + x.texto + " " + x.word),
      ordem: l.every((x, i) => i === 0 || x.d <= l[i-1].d) };
  });
  assert.equal(r.primeira, true, "a próxima sessão vem no alto");
  assert.ok(r.ordem, "da mais nova para a mais antiga");
  assert.ok(r.textos.includes("2026-09-08 Não compareceu no Word"));
  assert.ok(r.textos.includes("2026-09-29 Realizada no Word"));
  assert.ok(r.textos.some(t => /^2026-10-0[5-6] A confirmar/.test(t)), "depois do Word, a agenda: " + r.textos.slice(0, 3).join(" | "));
  await p.evaluate(() => abrirFicha(dados.pacientes.find(x => x.id === "pA"), null, "prontuario"));
  assert.match(await p.textContent("#fi-sess"), /4 realizadas · 1 falta/);
  assert.match(await p.textContent("#fi-pr-topo"), /sessões feitas/);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Quem pagou: sem digitar, encerrado sem dívida some; digitando, aparece marcado", async () => {
  const { ctx, p, erros } = await abrir(390);
  const r = await p.evaluate(() => {
    const pb = acharPaciente("pB");
    pb.encerramentos = [{ data:"2026-09-01", tipo:"inativo", origem:"app" }];
    devidoCache = null; vencCache = null; atrasoCache = null;
    const devePb = (devidoDe(pb) || {exato:0}).exato;
    const semTexto = candidatosPagamento("");
    const comTexto = candidatosPagamento("avul");
    return { devePb, semTexto: semTexto.map(x => [x.p.id, x.enc, x.deve > 0]), comTexto: comTexto.map(x => [x.p.id, x.enc]),
      encSemDivida: semTexto.filter(x => x.enc && !x.deve).length,
      devedoresPrimeiro: semTexto.every((x, i) => i === 0 || !x.deve || semTexto[i-1].deve >= x.deve) };
  });
  assert.equal(r.encSemDivida, 0, "quem encerrou sem dever não aparece sem digitar");
  assert.ok(r.devedoresPrimeiro, "quem deve vem primeiro, do maior para o menor");
  assert.deepEqual(r.comTexto, [["pB", true]], "digitando, acha quem encerrou");
  if (r.devePb <= 0.005) assert.ok(!r.semTexto.some(x => x[0] === "pB"));
  assert.deepEqual(erros, []);
  await ctx.close();
});
