/* Resumo da última sessão em 4 partes na ficha (09/10/2026). Só mostra: lê os campos do registro
   do prontuário e a agenda, não grava nada. Cadernos inventados, relógio parado em 09/10/2026. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

/* Paciente Mensal (segunda, 9h): 28/09 e 05/10 realizadas; 05/10 com o prontuário aprovado */
const CAMPOS = { "relatos relevantes":"a briga com o chefe", "realizou/não realizou":"realizou",
  "tema ou alvo clínico":"a ansiedade nas reuniões", "objetivo da intervenção":"reduzir a evitação",
  "técnica específica":"reestruturação cognitiva", "objetivo da técnica":"testar a evidência",
  "atividade":"vai fazer o registro de pensamentos", "objetivo da atividade":"perceber o padrão" };
function caderno(mudar){
  const c = JSON.parse(JSON.stringify(D.clinica));
  c.excecoes = { "2026-09-28|9":{tipo:"realizada"}, "2026-10-05|9":{tipo:"realizada"} };
  c.registros = { "2026-10-05|9|pA": { estado:"aprovado", situacao:"realizada", motivo:"paciente", sem:{}, campos:CAMPOS } };
  c.pacientes[0].genero = "M";
  if (mudar) mudar(c);
  return c;
}
async function abrir(largura, c){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:844 }, isMobile: largura < 700, hasTouch: largura < 700,
    locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date("2026-10-09T12:00:00-03:00") });
  await ctx.addInitScript(k => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k);
    localStorage.setItem("teste-semeado", "1");
  }, JSON.stringify(c || caderno()));
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + "clinica.html");
  await p.waitForTimeout(600);
  return { ctx, p, erros };
}
const ficha = (p, id) => p.evaluate(i => abrirFicha(dados.pacientes.find(x => x.id === i), null, "prontuario"), id || "pA");
const partes = p => p.$$eval("#fi-resumo .fr-parte", l => l.map(x => x.innerText.replace(/\s+/g, " ").trim()));

for (const largura of [390, 1280]) {
  test("Ficha (" + largura + "px): as 4 partes da última sessão, sem gravar nada", async () => {
    const { ctx, p, erros } = await abrir(largura);
    const semVazio = () => JSON.stringify(dados);
    const antes = await p.evaluate(semVazio);
    await ficha(p);
    await p.waitForTimeout(200);
    assert.match(await p.textContent("#fi-resumo .topo"), /Última sessão.*Realizada.*Seg, 05\/10 · 09h.*há 4 dias/);
    assert.deepEqual(await partes(p), [
      "TEMA A ansiedade nas reuniões, com o objetivo de reduzir a evitação Trouxe: a briga com o chefe",
      "FEITO Reestruturação cognitiva, buscando testar a evidência Tarefa anterior: realizou, revisada na sessão",
      "TAREFA DE CASA Vai fazer o registro de pensamentos, buscando perceber o padrão",
      "PARA A PRÓXIMA Próxima sessão: Seg, 12/10 · 09h Revisar a tarefa de casa combinada"]);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), largura, "sem rolagem para o lado");
    /* uma coluna no celular, duas no computador */
    const xs = await p.$$eval("#fi-resumo .fr-parte", l => l.map(x => Math.round(x.getBoundingClientRect().x)));
    assert.equal(new Set(xs).size, largura < 700 ? 1 : 2);
    assert.equal(await p.evaluate(semVazio), antes, "abrir a ficha não muda o caderno");
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}

test("Linha tirada no prontuário: 'nenhuma combinada' e sem revisar tarefa", async () => {
  const { ctx, p, erros } = await abrir(1280, caderno(c => { c.registros["2026-10-05|9|pA"].sem = { atividade:true, tecnica:true, tarefa:true }; }));
  await ficha(p);
  const t = await partes(p);
  assert.equal(t[1], "FEITO sem técnica específica anotada");
  assert.equal(t[2], "TAREFA DE CASA nenhuma combinada");
  assert.equal(t[3], "PARA A PRÓXIMA Próxima sessão: Seg, 12/10 · 09h");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Sessão sem prontuário escrito: 'Escrever agora' abre o registro dela, e digitar atualiza o resumo", async () => {
  const { ctx, p, erros } = await abrir(390, caderno(c => { delete c.registros; }));
  await ficha(p);
  assert.match(await p.textContent("#fi-resumo"), /ainda não foi escrito/);
  await p.click("#fi-resumo [data-escrever]");
  assert.equal(await p.locator("#fi-pront .pitem.aberto").count(), 1);
  assert.match(await p.textContent("#fi-pront .pitem.aberto .quando"), /05\/10/);
  await p.fill('#fi-pront [data-f="tema ou alvo clínico"]', "o luto pelo avô");
  assert.match((await partes(p))[0], /O luto pelo avô/);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Registro que já foi para o Word, histórico antigo e paciente sem sessão", async () => {
  let r = await abrir(1280, caderno(c => { c.registros["2026-10-05|9|pA"] = { estado:"feito", situacao:"realizada", manual:true }; }));
  await ficha(r.p);
  assert.match(await r.p.textContent("#fi-resumo"), /já está no prontuário do Word/);
  assert.equal(await r.p.locator("#fi-resumo .fr-parte").count(), 0);
  assert.deepEqual(r.erros, []); await r.ctx.close();

  r = await abrir(1280, caderno(c => { c.excecoes = {}; c.pacientes[0].historico = { ate:"2026-09-26", sessoes:[
    { data:"2026-09-14", n:7, situacao:"realizada" }, { data:"2026-09-21", n:8, situacao:"falta" } ] }; }));
  await ficha(r.p);
  assert.match(await r.p.textContent("#fi-resumo"), /14\/09.*sessão 7.*de antes do app/);
  assert.deepEqual(r.erros, []); await r.ctx.close();

  r = await abrir(1280, caderno(c => { c.excecoes = {}; }));
  await ficha(r.p, "pB");
  assert.match(await r.p.textContent("#fi-resumo"), /Nenhuma sessão feita registrada ainda/);
  assert.deepEqual(r.erros, []); await r.ctx.close();
});
