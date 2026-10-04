/* Dois aparelhos, um Drive (de mentira): o que cada um lança chega ao outro e nada some.
   Também confere a cópia da semana, que é feita uma vez só, mesmo com dois aparelhos. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const { criarDrive } = require("./drive-falso.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

const espera = ms => new Promise(r => setTimeout(r, ms));
async function ate(cond, ms = 10000){
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (await cond()) return true; await espera(200); }
  return false;
}

/* um aparelho: o app aberto, já com a chave do Google guardada e o caderno do jeito que o aparelho tinha */
async function aparelho(drive, nome){
  const ctx = await nav.newContext({ viewport:{ width:1280, height:900 }, locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  await ctx.route(/googleapis\.com/, r => drive.atender(r));
  await ctx.route(/fonts\.gstatic\.com|accounts\.google\.com/, r => r.abort());
  await ctx.addInitScript(([d, c]) => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-token", JSON.stringify({ t:"chave-de-teste", e:Date.now() + 3600000 }));
    localStorage.setItem("controle-unico-dinheiro-cache", d);
    localStorage.setItem("controle-unico-casa-cache", c);
    localStorage.setItem("teste-semeado", "1");
  }, [JSON.stringify(D.dinheiro), JSON.stringify(D.casa)]);
  const pagina = await ctx.newPage();
  const erros = [];
  pagina.on("pageerror", e => erros.push(nome + ": " + e.message));
  pagina.on("dialog", d => d.accept());
  await pagina.goto(srv.url + "index.html");
  const f = () => pagina.frames().find(x => x.url().includes("app.html"));
  await ate(async () => f() && await f().evaluate(() => !Nuvem.algumPendente() && /Salvo|aberto|Conectado/.test(document.getElementById("nuvem-texto").textContent)).catch(() => false));
  return { ctx, pagina, f, erros };
}
const lancar = (f, id, valor) => f().evaluate(([id, valor]) => {
  livro.matheus.lancamentos.push({ id, data:"2026-10-04", tipo:"Despesa", descricao:"Teste " + id, categoria:"Mercado", forma:"PIX", valor });
  salvar("matheus");
}, [id, valor]);
const ids = (f) => f().evaluate(() => livro.matheus.lancamentos.map(l => l.id).sort());

test("Dois aparelhos lançando ao mesmo tempo: os dois lançamentos ficam", async () => {
  const drive = criarDrive();
  drive.novo({ name:"Controle Único - dinheiro.json" }, JSON.stringify(D.dinheiro));
  drive.novo({ name:"Controle Único - casa.json" }, JSON.stringify(D.casa));
  const A = await aparelho(drive, "A"), B = await aparelho(drive, "B");

  await Promise.all([lancar(A.f, "doA", 11), lancar(B.f, "doB", 22)]);
  // os dois mandam; o segundo encontra o Drive mudado, junta e manda de novo
  assert.ok(await ate(() => { const d = drive.ler("Controle Único - dinheiro.json"); return d && ["doA", "doB"].every(i => d.lancamentos.some(l => l.id === i)); }),
    "o Drive deveria ter os dois lançamentos");
  // quem mandou primeiro traz o do outro ao voltar para a tela
  await A.f().evaluate(() => Nuvem.redesenhar());
  for (const X of [A, B]) await X.f().evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); });
  for (const X of [A, B]) assert.ok(await ate(async () => (await ids(X.f)).includes("doA") && (await ids(X.f)).includes("doB")), "cada aparelho termina com os dois");
  // nada do que já existia sumiu
  for (const id of D.dinheiro.lancamentos.map(l => l.id)) assert.ok((await ids(A.f)).includes(id), "sumiu " + id);

  // apagar num aparelho apaga no outro (e não volta)
  await A.f().evaluate(() => { livro.matheus.lancamentos = livro.matheus.lancamentos.filter(l => l.id !== "l7"); salvar("matheus"); });
  assert.ok(await ate(() => !drive.ler("Controle Único - dinheiro.json").lancamentos.some(l => l.id === "l7")));
  await B.f().evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  assert.ok(await ate(async () => !(await ids(B.f)).includes("l7")), "o apagado some no outro aparelho");

  assert.deepEqual([...A.erros, ...B.erros], []);
  await A.ctx.close(); await B.ctx.close();
});

test("Cópia da semana: uma por caderno, numa pasta própria, igual ao caderno", async () => {
  const drive = criarDrive();
  drive.novo({ name:"Controle Único - dinheiro.json" }, JSON.stringify(D.dinheiro));
  drive.novo({ name:"Controle Único - casa.json" }, JSON.stringify(D.casa));
  const A = await aparelho(drive, "A");
  await lancar(A.f, "x1", 5);
  const B = await aparelho(drive, "B");
  await lancar(B.f, "x2", 6);
  assert.ok(await ate(() => drive.nomes().some(n => /^Controle Único - dinheiro - semana de \d{4}-\d{2}-\d{2}\.json$/.test(n))), "fez a cópia");
  await espera(1500);
  const pasta = Object.values(drive.arquivos).filter(a => a.name === "Controle Único - cópias");
  assert.equal(pasta.length, 1, "uma pasta só");
  const copias = Object.values(drive.arquivos).filter(a => /dinheiro - semana de/.test(a.name));
  assert.equal(copias.length, 1, "uma cópia por semana, mesmo com dois aparelhos");
  assert.deepEqual(copias[0].parents, [pasta[0].id]);
  assert.ok(JSON.parse(copias[0].conteudo).lancamentos.length >= D.dinheiro.lancamentos.length);
  // o caderno em si continua um só e não foi trocado pela cópia
  assert.equal(drive.nomes().filter(n => n === "Controle Único - dinheiro.json").length, 1);
  await A.ctx.close(); await B.ctx.close();
});
