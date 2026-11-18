/* Botão "Buscar do Nubank" (18/11/2026): a ponte no Apps Script devolve dois OFX (conta e cartão)
   e o app junta os dois num painel só, pelo mesmo importador. A ponte é falsa aqui; dados inventados. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

const lin = (d, v, id, m) => `<STMTTRN>\n<TRNTYPE>${v < 0 ? "DEBIT" : "CREDIT"}</TRNTYPE>\n<DTPOSTED>${d.replace(/-/g, "")}000000[-3:BRT]</DTPOSTED>\n<TRNAMT>${v.toFixed(2)}</TRNAMT>\n<FITID>${id}</FITID>\n<MEMO>${m}</MEMO>\n</STMTTRN>`;
const ofx = (cartao, linhas) => `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nENCODING:UTF-8\nCHARSET:NONE\n<OFX>\n${cartao ? "<CREDITCARDMSGSRSV1>\n<CCSTMTTRNRS>\n<CCSTMTRS>" : "<BANKMSGSRSV1>\n<STMTTRNRS>\n<STMTRS>"}\n<CURDEF>BRL</CURDEF>\n<BANKTRANLIST>\n<DTSTART>20260901000000[-3:BRT]</DTSTART>\n<DTEND>20261004000000[-3:BRT]</DTEND>\n${linhas.join("\n")}\n</BANKTRANLIST>\n${cartao ? "</CCSTMTRS>\n</CCSTMTTRNRS>\n</CREDITCARDMSGSRSV1>" : "</STMTRS>\n</STMTTRNRS>\n</BANKMSGSRSV1>"}\n</OFX>\n`;
const CONTA = ofx(false, [lin("2026-10-02", -45.5, "c1", "Compra no débito - Padaria Teste")]);
const CARTAO = ofx(true, [lin("2026-10-03", -88.9, "k1", "Livraria Teste"), lin("2026-10-01", -12, "k2", "Banca Teste")]);

async function abrir(resposta) {
  const ctx = await nav.newContext({ viewport:{ width:375, height:812 }, locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const pagina = await ctx.newPage();
  await pagina.clock.install({ time: new Date(D.HOJE) });
  await ctx.addInitScript(([d, c]) => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-dinheiro-cache", d);
    localStorage.setItem("controle-unico-casa-cache", c);
    localStorage.setItem("teste-semeado", "1");
  }, [JSON.stringify(D.dinheiro), JSON.stringify(D.casa)]);
  const erros = [], pedidos = [];
  pagina.on("pageerror", e => erros.push(e.message));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|accounts\.google\.com/, r => r.abort());
  await ctx.route(/script\.google\.com\/macros/, r => { pedidos.push(r.request().postData()); r.fulfill({ contentType:"application/json", body:JSON.stringify(resposta) }); });
  await pagina.goto(srv.url + "index.html#carteira");
  await pagina.waitForTimeout(800);
  const f = pagina.frames().find(x => x.url().includes("app.html"));
  await f.evaluate(() => { Nuvem.chave = () => "chave-de-teste"; aba = "carteira"; desenhar(); });
  return { ctx, pagina, f, erros, pedidos };
}

test("Buscar do Nubank junta conta e cartão num painel, com a chave do Google no pedido", async () => {
  const { ctx, pagina, f, erros, pedidos } = await abrir({ ok:true, desde:"2026-09-01", ate:"2026-10-04", conta:CONTA, cartao:CARTAO });
  if (process.env.CU_FOTO) await f.locator(".imp-barra").screenshot({ path:process.env.CU_FOTO.replace(".png", "-antes.png") });
  await f.click("#impNubank");
  await f.waitForSelector(".imp h3");
  const r = await f.evaluate(() => ({ titulo:document.querySelector(".imp h3").textContent, fonte:imp.r.fonte,
    novos:imp.linhas.filter(x => x.grupo === "novo").map(x => [x.data, x.valor]) }));
  assert.match(r.titulo, /Nubank, conta e cartão/);
  assert.equal(r.fonte, "nubank");
  assert.deepEqual(r.novos.map(x => x[0]), ["2026-10-01", "2026-10-02", "2026-10-03"], "em ordem de data");
  assert.deepEqual(JSON.parse(pedidos[0]), { token:"chave-de-teste" });
  if (process.env.CU_FOTO) await f.locator(".imp").screenshot({ path:process.env.CU_FOTO });
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Erro da ponte vira recado na tela e o botão volta", async () => {
  const { ctx, f, erros } = await abrir({ ok:false, erro:"O login do Google venceu: entre de novo no app." });
  await f.click("#impNubank");
  await f.waitForSelector(".recado.erro");
  const r = await f.evaluate(() => ({ recado:document.querySelector(".recado").textContent, botao:document.getElementById("impNubank").textContent, imp }));
  assert.match(r.recado, /login do Google venceu/);
  assert.equal(r.botao, "Buscar do Nubank");
  assert.equal(r.imp, null);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Sem login, o botão pede para entrar e não chama a ponte", async () => {
  const { ctx, f, pedidos } = await abrir({ ok:true });
  await f.evaluate(() => { Nuvem.chave = () => null; });
  await f.click("#impNubank");
  await f.waitForSelector(".recado.erro");
  assert.equal(pedidos.length, 0);
  await ctx.close();
});
