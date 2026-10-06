/* O caderno da Casa com o pessoal dele dentro (06/10/2026). Em 05/10 o caderno do Dinheiro de um aparelho
   ficou ligado ao arquivo da Casa e gravou lá o caderno pessoal inteiro. Aqui: o botão que separa o
   que já se misturou (a trava que impede de novo está em trava-caderno.test.js). Drive falso,
   cadernos inventados. */
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

/* a Casa como ficou no Drive: as compras com tipo e forma vazios, o Dinheiro inteiro junto, mais um
   lançamento pessoal novo que só existe lá (o Dinheiro deste aparelho gravava na Casa) */
function casaMisturada(){
  const novo = { id:"soNaCasa", data:"2026-10-05", tipo:"Despesa", descricao:"Anúncio", categoria:"Clínica: Anúncios", forma:"Crédito", valor:1000 };
  return Object.assign({}, D.casa, {
    lancamentos: D.casa.lancamentos.map(l => Object.assign({}, l, { tipo:"", forma:"" })).concat(D.dinheiro.lancamentos, [novo]),
    gastosFixos: D.dinheiro.gastosFixos, reserva: Object.assign({}, D.dinheiro.reserva, { meta:99999 }), pendencias: D.dinheiro.pendencias, limites: {}
  });
}

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

test("Casa misturada: o aviso aparece, Separar devolve cada lançamento ao seu caderno e guarda cópia antes", async () => {
  const drive = criarDrive();
  const din = drive.novo({ name:NOME_D }, JSON.stringify(D.dinheiro));
  const casa = drive.novo({ name:NOME_C }, JSON.stringify(casaMisturada()));
  // o aparelho afetado: o Dinheiro apontava para a Casa e o livro dele tem as compras da casa
  const sujo = Object.assign({}, casaMisturada(), { caderno:"casa" });
  const A = await aparelho(drive, { dinheiroArquivo: JSON.stringify({ id:casa.id, modifiedTime:casa.modifiedTime }), cacheDinheiro:sujo });
  assert.ok(await ate(() => A.f().evaluate(() => !!document.getElementById("separarAgora"))), "o botão Separar deveria aparecer na Casa");
  const antes = await A.f().evaluate(() => contasCasa("2026-10").total);
  await A.f().evaluate(() => document.getElementById("separarAgora").click());
  assert.ok(await ate(() => { const c = drive.ler(NOME_C); return c && !c.lancamentos.some(l => l.tipo) && !("reserva" in c); }), "a Casa no Drive sem o pessoal");
  assert.ok(await ate(() => { const d = drive.ler(NOME_D); return d && d.lancamentos.some(l => l.id === "soNaCasa") && !d.lancamentos.some(l => l.quem); }), "o Dinheiro no Drive com o pessoal e sem a casa");
  const c = drive.ler(NOME_C), d = drive.ler(NOME_D);
  // nada some: as compras da casa ficam todas na Casa e os pessoais todos no Dinheiro, com os mesmos valores
  assert.deepEqual(c.lancamentos.map(l => l.id).sort(), D.casa.lancamentos.map(l => l.id).sort());
  for (const l of D.casa.lancamentos) assert.equal(c.lancamentos.find(x => x.id === l.id).valor, l.valor);
  assert.deepEqual(d.lancamentos.map(l => l.id).sort(), D.dinheiro.lancamentos.map(l => l.id).concat("soNaCasa").sort());
  assert.equal(d.reserva.meta, 99999, "a reserva mais nova (a que estava na Casa) vale");
  assert.deepEqual(d.gastosFixos.map(g => g.id).sort(), D.dinheiro.gastosFixos.map(g => g.id).sort());
  // a cópia de antes, uma de cada caderno, na pasta das cópias
  const copias = drive.nomes().filter(n => /antes de separar/.test(n));
  assert.equal(copias.length, 2, copias.join(", "));
  const copiaCasa = Object.values(drive.arquivos).find(a => /casa - antes de separar/.test(a.name));
  assert.equal(JSON.parse(copiaCasa.conteudo).lancamentos.length, casaMisturada().lancamentos.length);
  // a Casa do mês volta a somar só as compras da casa
  const depois = await A.f().evaluate(() => contasCasa("2026-10").total);
  const certo = D.casa.lancamentos.filter(l => l.data.startsWith("2026-10")).reduce((s, l) => s + l.valor, 0);
  assert.ok(antes > certo + 0.5, "antes o total estava inflado");
  assert.ok(Math.abs(depois - certo) < 0.005, `total da casa: ${depois} x ${certo}`);
  // Desfazer volta como estava
  assert.ok(await A.f().evaluate(() => !!document.getElementById("desfazerSeparar")));
  await A.f().evaluate(() => document.getElementById("desfazerSeparar").click());
  assert.ok(await ate(() => drive.ler(NOME_C).lancamentos.some(l => l.id === "soNaCasa")), "desfazer devolve à Casa");
  assert.deepEqual(A.erros, []);
  await A.ctx.close();
});

test("Aparelho que não tinha a chave errada também separa, e a Ana não vê o botão", async () => {
  const drive = criarDrive();
  drive.novo({ name:NOME_D }, JSON.stringify(D.dinheiro));
  drive.novo({ name:NOME_C }, JSON.stringify(casaMisturada()));
  const Ana = await aparelho(drive, { ana:true });
  await espera(1500);
  assert.ok(await Ana.f().evaluate(() => !document.getElementById("painelSeparar")), "no controle da Ana não há aviso nem botão");
  await Ana.ctx.close();
  const B = await aparelho(drive, {});
  assert.ok(await ate(() => B.f().evaluate(() => !!document.getElementById("separarAgora"))));
  await B.f().evaluate(() => document.getElementById("separarAgora").click());
  assert.ok(await ate(() => { const c = drive.ler(NOME_C); return !c.lancamentos.some(l => l.tipo) && !("gastosFixos" in c); }));
  assert.ok(await ate(() => drive.ler(NOME_D).lancamentos.some(l => l.id === "soNaCasa")));
  assert.equal(drive.ler(NOME_D).reserva.meta, 99999);
  assert.deepEqual(B.erros, []);
  await B.ctx.close();
});

test("Lançamento pessoal que só ficou neste aparelho quando a trava agiu também volta ao Dinheiro", async () => {
  const drive = criarDrive();
  drive.novo({ name:NOME_D }, JSON.stringify(D.dinheiro));
  const casa = drive.novo({ name:NOME_C }, JSON.stringify(casaMisturada()));
  const soAqui = { id:"soAqui", data:"2026-10-06", tipo:"Despesa", descricao:"Só neste aparelho", categoria:"Mercado", forma:"PIX", valor:12 };
  const sujo = Object.assign({}, casaMisturada(), { lancamentos: casaMisturada().lancamentos.concat([soAqui]) });
  const A = await aparelho(drive, { dinheiroArquivo: JSON.stringify({ id:casa.id, modifiedTime:casa.modifiedTime }), cacheDinheiro:sujo });
  assert.ok(await ate(() => A.f().evaluate(() => !!document.getElementById("separarAgora"))));
  await A.f().evaluate(() => document.getElementById("separarAgora").click());
  assert.ok(await ate(() => { const d = drive.ler(NOME_D); return ["soAqui", "soNaCasa"].every(i => d.lancamentos.some(l => l.id === i)); }), "os dois pessoais chegam ao Dinheiro");
  assert.ok(!drive.ler(NOME_C).lancamentos.some(l => l.id === "soAqui"));
  assert.deepEqual(A.erros, []);
  await A.ctx.close();
});
