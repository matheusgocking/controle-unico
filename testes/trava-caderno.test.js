/* A trava do arquivo de cada caderno (06/10/2026). Em 05/10 o caderno do Dinheiro de um aparelho ficou
   ligado ao arquivo da Casa e gravou lá o caderno pessoal inteiro. Aqui: o caderno confere o nome e o
   conteúdo do arquivo e não grava no de outro caderno. Drive falso, cadernos inventados. */
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
const NOME_D = "Controle Único - dinheiro.json", NOME_C = "Controle Único - casa.json";

async function aparelho(drive, { dinheiroArquivo, cacheDinheiro, ana } = {}){
  const ctx = await nav.newContext({ viewport:{ width:1280, height:900 }, locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  await ctx.route(/googleapis\.com/, r => drive.atender(r));
  await ctx.route(/fonts\.gstatic\.com|accounts\.google\.com|apis\.google\.com/, r => r.abort());
  await ctx.addInitScript(([d, c, arq]) => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-token", JSON.stringify({ t:"chave-de-teste", e:Date.now() + 3600000 }));
    if (d) localStorage.setItem("controle-unico-dinheiro-cache", d);
    localStorage.setItem("controle-unico-casa-cache", c);
    if (arq) localStorage.setItem("controle-unico-dinheiro-arquivo", arq);
    localStorage.setItem("teste-semeado", "1");
  }, [ana ? null : JSON.stringify(cacheDinheiro || D.dinheiro), JSON.stringify(D.casa), dinheiroArquivo || null]);
  const pagina = await ctx.newPage();
  const erros = [];
  pagina.on("pageerror", e => erros.push(e.message));
  pagina.on("dialog", d => d.accept());
  await pagina.goto(srv.url + (ana ? "ana.html#casa" : "index.html#casa"));
  const f = () => pagina.frames().find(x => x.url().includes("app.html"));
  await ate(async () => f() && await f().evaluate(() => !Nuvem.algumPendente() && /Salvo|aberto|Conectado/.test(document.getElementById("nuvem-texto").textContent)).catch(() => false));
  return { ctx, pagina, f, erros };
}

test("Dinheiro ligado ao arquivo da Casa: larga o arquivo errado, volta ao seu e não grava mais na Casa", async () => {
  const drive = criarDrive();
  const din = drive.novo({ name:NOME_D }, JSON.stringify(D.dinheiro));
  const casa = drive.novo({ name:NOME_C }, JSON.stringify(D.casa));
  // o aparelho com a chave errada: o Dinheiro aponta para o arquivo da Casa
  const A = await aparelho(drive, { dinheiroArquivo: JSON.stringify({ id:casa.id, modifiedTime:casa.modifiedTime }) });
  assert.ok(await ate(() => A.f().evaluate(() => nuvem.matheus.arquivoId())).then(async () => (await A.f().evaluate(() => nuvem.matheus.arquivoId())) === din.id), "o Dinheiro deveria voltar ao próprio arquivo");
  // o que o aparelho tinha fica guardado à parte, e a tela mostra o Dinheiro do arquivo certo
  assert.ok(await A.f().evaluate(() => !!localStorage.getItem("controle-unico-dinheiro-antes-da-trava")));
  assert.deepEqual((await A.f().evaluate(() => livro.matheus.lancamentos.map(l => l.id))).sort(), D.dinheiro.lancamentos.map(l => l.id).sort());
  await A.f().evaluate(() => { livro.matheus.lancamentos.push({ id:"depois", data:"2026-10-04", tipo:"Despesa", descricao:"Teste", categoria:"Mercado", forma:"PIX", valor:9 }); salvar("matheus"); });
  assert.ok(await ate(() => drive.ler(NOME_D).lancamentos.some(l => l.id === "depois")), "o lançamento novo vai para o Dinheiro");
  const naCasa = drive.ler(NOME_C);
  assert.ok(!naCasa.lancamentos.some(l => l.tipo), "nada pessoal foi gravado na Casa");
  assert.ok(!("gastosFixos" in naCasa));
  assert.deepEqual(A.erros, []);
  await A.ctx.close();
});

test("Arquivo do Dinheiro com conteúdo de outro caderno: não grava nada nele e avisa", async () => {
  const drive = criarDrive();
  const din = drive.novo({ name:NOME_D }, JSON.stringify(Object.assign({}, D.casa, { caderno:"casa" })));
  drive.novo({ name:NOME_C }, JSON.stringify(D.casa));
  const antes = din.conteudo;
  const A = await aparelho(drive, {});
  await espera(1500);
  await A.f().evaluate(() => { livro.matheus.lancamentos.push({ id:"novo", data:"2026-10-04", tipo:"Despesa", descricao:"Teste", categoria:"Mercado", forma:"PIX", valor:9 }); salvar("matheus"); });
  await espera(2500);
  assert.equal(din.conteudo, antes, "o arquivo errado não muda");
  assert.ok(/outro caderno/.test(await A.f().evaluate(() => document.getElementById("nuvem-texto").textContent)));
  await A.ctx.close();
});
