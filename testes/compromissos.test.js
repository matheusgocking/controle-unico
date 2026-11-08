/* Compromissos na agenda (08/11/2026): os do Lastro, lidos do site do Lastro, e os dele, criados
   pelo "+ Compromisso". Nenhum entra em conta: sessões, receita e saldo ficam iguais. Cadernos
   inventados de dados-de-teste.js, relógio parado em 07/10/2026 (quarta). Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

async function abrir(largura){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:900 }, isMobile: largura < 700, hasTouch: largura < 700,
    locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date("2026-10-07T12:00:00-03:00") });
  await ctx.addInitScript(k => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k);
    localStorage.setItem("teste-semeado", "1");
  }, JSON.stringify(D.clinica));
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + "clinica.html");
  await p.waitForTimeout(600);
  return { ctx, p, erros };
}
const LASTRO_TESTE = [
  { id:"e1", titulo:"Intervisão de segunda", data:"2026-09-28", ini:"08:00", fim:"09:30", semanal:true, quem:["eu"], proj:"pj" },
  { id:"e2", titulo:"Stories", data:"2026-10-06", ini:"18:00", fim:"18:15", semanal:true, quem:["outra"] },
  { id:"e3", titulo:"Sala", data:"2026-10-05", ini:"10:00", fim:"11:00", sala:true }
];

test("Compromissos: os do Lastro e os dele aparecem na grade, no menu e no Hoje, sem mudar conta", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const contasAntes = await p.evaluate(() => [document.getElementById("s-sessoes").textContent, document.getElementById("s-receita").textContent]);
  const r = await p.evaluate(L => {
    lastroReceber(L, { membro:"eu", nomes:{ eu:"Pessoa", outra:"Outra" }, projetos:{ pj:"Intervisão" }, estado:"teste" });
    dados.compromissos = [{ id:"c1", titulo:"Dentista", data:"2026-10-07", ini:"10:00", fim:"11:00", semanal:false, mensal:"" },
                          { id:"c2", titulo:"Aula", data:"2026-10-05", ini:"21:00", fim:"22:00", semanal:true, mensal:"" }];
    semana = inicioSemana(new Date(2026, 9, 7)); renderSemana();
    const cel = (d, h) => document.querySelector('.cell[data-data="' + d + '"][data-hora="' + h + '"]');
    return {
      int8: cel("2026-10-05", 8).textContent, int9: !!cel("2026-10-05", 9).classList.contains("tem-cp"), int10: cel("2026-10-05", 10).classList.contains("tem-cp"),
      naoMeu: cel("2026-10-06", 18).classList.contains("cp-nao-meu"),
      dentista: cel("2026-10-07", 10).getAttribute("aria-label"),
      fora: [...document.querySelectorAll(".cell-cp .cp-b")].map(b => b.textContent),
      sala: compromissosDoDia("2026-10-05").some(x => x.titulo === "Sala"),
      hoje: [...document.querySelectorAll("#hoje-cartoes .pcard.cp-card .n")].map(x => x.textContent)
    };
  }, LASTRO_TESTE);
  assert.match(r.int8, /Intervisão de segunda/);
  assert.equal(r.int9, true, "a intervisão vai até 9h30, então ocupa as 9h também");
  assert.equal(r.int10, false);
  assert.equal(r.naoMeu, true, "do Lastro sem ele fica mais clara");
  assert.match(r.dentista, /compromisso: Dentista 10h às 11h/);
  assert.deepEqual(r.fora, ["Aula21h às 22h"], "fora das horas da grade vai para a linha de cima");
  assert.equal(r.sala, false, "sala aberta na hora não é compromisso");
  assert.deepEqual(r.hoje, ["Dentista"], "o Hoje abre na quarta 07/10 com o compromisso do dia");
  const contasDepois = await p.evaluate(() => [document.getElementById("s-sessoes").textContent, document.getElementById("s-receita").textContent]);
  assert.deepEqual(contasDepois, contasAntes, "compromisso não entra em sessão nem receita");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Compromissos: criar pelo menu da hora, repetir por mês, mudar e apagar; desfazer volta", async () => {
  const { ctx, p, erros } = await abrir(375);
  const r = await p.evaluate(() => {
    semana = inicioSemana(new Date(2026, 9, 7)); renderSemana();
    document.querySelector('.cell[data-data="2026-10-08"][data-hora="17"]').click();
    document.querySelector('.menu button[data-acao="novo-cp"]').click();
    const f = document.getElementById("cp-form"), out = { previa:[f.data.value, f.ini.value, f.fim.value] };
    f.requestSubmit(); out.erro = document.getElementById("cp-erro").textContent;
    f.titulo.value = "Supervisão"; f.rep.value = "semana"; f.requestSubmit();
    const c = dados.compromissos[0];
    out.salvo = [c.titulo, c.data, c.ini, c.fim, c.mensal];
    out.vezes = ["2026-10-08", "2026-11-12", "2026-12-10", "2026-10-15"].map(d => cpOcorreEm(c, d));
    desfazer(); out.desfeito = dados.compromissos.length; refazer();
    abrirCompromisso(compromissosDoDia("2026-10-08")[0]);
    const g = document.getElementById("cp-form"); out.padrao = g.querySelector('input[name="qual"]:checked').value;
    g.querySelector('input[value="todas"]').click(); g.titulo.value = "Supervisão de grupo"; g.requestSubmit();
    out.mudado = dados.compromissos.map(x => x.titulo);
    abrirCompromisso(compromissosDoDia("2026-10-08")[0]);
    const ap = document.getElementById("cp-apagar"); ap.click(); out.umToque = dados.compromissos.length; ap.click();
    out.apagado = dados.compromissos.length;
    return out;
  });
  assert.deepEqual(r.previa, ["2026-10-08", "17:00", "18:00"]);
  assert.equal(r.erro, "Escreva o que é o compromisso.");
  assert.deepEqual(r.salvo, ["Supervisão", "2026-10-08", "17:00", "18:00", "semana"]);
  assert.deepEqual(r.vezes, [true, true, true, false], "2ª quinta de cada mês");
  assert.equal(r.desfeito, 0);
  assert.deepEqual(r.mudado, ["Supervisão de grupo"]);
  assert.equal(r.umToque, 1, "o primeiro toque em Apagar só pede certeza");
  assert.equal(r.apagado, 0);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Compromissos do Lastro: vez movida vai para o dia novo, vez cancelada some", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const r = await p.evaluate(L => {
    L[0].marcas = { "2026-10-05": { st:"movido", data:"2026-10-06", ini:"08:00", fim:"09:00" }, "2026-10-12": { st:"cancelado" } };
    lastroReceber(L, { membro:"eu", estado:"teste" });
    const n = d => compromissosDoDia(d).filter(x => x.id === "e1").map(x => x.ini + "-" + x.fim);
    return { seg05:n("2026-10-05"), ter06:n("2026-10-06"), seg12:n("2026-10-12"), seg19:n("2026-10-19") };
  }, LASTRO_TESTE);
  assert.deepEqual(r, { seg05:[], ter06:["08:00-09:00"], seg12:[], seg19:["08:00-09:30"] });
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Compromissos do Lastro (09/11/2026): vinho, mudar só nesta vez ou todas, arrastar e apagar gravam no Lastro", async () => {
  const { ctx, p, erros } = await abrir(1280);
  const r = await p.evaluate(L => {
    lastroReceber(JSON.parse(JSON.stringify(L)), { membro:"eu", estado:"teste" });
    dados.compromissos = [{ id:"c1", titulo:"Dentista", data:"2026-10-07", ini:"07:00", fim:"08:00", semanal:false, mensal:"" }];
    salvar();
    semana = inicioSemana(new Date(2026, 9, 7)); renderSemana();
    const cel = (d, h) => document.querySelector('.cell[data-data="' + d + '"][data-hora="' + h + '"]');
    const out = { vinho: cel("2026-10-05", 8).classList.contains("cp-do-lastro"), seuNao: cel("2026-10-07", 7).classList.contains("cp-do-lastro") };
    /* só nesta vez: passa a segunda 05/10 para terça 14h */
    abrirCompromisso(compromissosDoDia("2026-10-05").find(x => x.id === "e1"));
    let f = document.getElementById("cp-form");
    out.padrao = f.querySelector('input[name="qual"]:checked').value; out.titulo = f.titulo.disabled;
    f.data.value = "2026-10-06"; f.ini.value = "14:00"; f.fim.value = "15:30"; f.requestSubmit();
    out.esc1 = LASTRO.escritas[LASTRO.escritas.length - 1];
    out.dia12 = compromissosDoDia("2026-10-12").filter(x => x.id === "e1").length;
    /* todas as vezes: nova hora para a série */
    abrirCompromisso(compromissosDoDia("2026-10-12").find(x => x.id === "e1"));
    f = document.getElementById("cp-form"); f.querySelector('input[value="todas"]').click(); f.ini.value = "08:30"; f.fim.value = "10:00"; f.requestSubmit();
    out.esc2 = LASTRO.escritas[LASTRO.escritas.length - 1].campos;
    /* arrastar o dele (não repete) para cima de uma sessão é aceito */
    semana = inicioSemana(new Date(2026, 9, 7)); renderSemana();
    const dt = new DataTransfer(), dst = cel("2026-10-08", 15);
    cel("2026-10-07", 7).dispatchEvent(new DragEvent("dragstart", { bubbles:true, dataTransfer:dt }));
    const ov = new DragEvent("dragover", { bubbles:true, cancelable:true, dataTransfer:dt }); dst.dispatchEvent(ov); out.aceita = ov.defaultPrevented;
    dst.dispatchEvent(new DragEvent("drop", { bubbles:true, cancelable:true, dataTransfer:dt }));
    out.dentista = dados.compromissos[0].data + " " + dados.compromissos[0].ini;
    desfazer(); out.desfeito = dados.compromissos[0].data + " " + dados.compromissos[0].ini;
    /* apagar do Lastro: dois toques */
    abrirCompromisso(compromissosDoDia("2026-10-06").find(x => x.id === "e2"));
    const ap = document.getElementById("cp-apagar"); ap.click(); out.certeza = ap.textContent; ap.click();
    out.esc3 = LASTRO.escritas[LASTRO.escritas.length - 1];
    return out;
  }, LASTRO_TESTE);
  assert.equal(r.vinho, true); assert.equal(r.seuNao, false);
  assert.equal(r.padrao, "vez"); assert.equal(r.titulo, true, "só nesta vez trava o resto");
  assert.deepEqual(r.esc1, { id:"e1", campos:{ "marcas.2026-10-05": { st:"movido", data:"2026-10-06", ini:"14:00", fim:"15:30" } } });
  assert.equal(r.dia12, 1, "a semana seguinte continua igual");
  assert.equal(r.esc2.ini, "08:30"); assert.equal(r.esc2.data, "2026-09-28", "a série não muda de começo");
  assert.equal(r.aceita, true);
  assert.equal(r.dentista, "2026-10-08 15:00"); assert.equal(r.desfeito, "2026-10-07 07:00");
  assert.equal(r.certeza, "Apagar do Lastro mesmo?");
  assert.deepEqual(r.esc3, { id:"e2", apagado:true });
  assert.deepEqual(erros, []);
  await ctx.close();
});
