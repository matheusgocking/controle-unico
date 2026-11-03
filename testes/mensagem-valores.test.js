// Mensagem de divulgação: os valores avulso e mensal se trocam na própria caixa (03/11/2026)
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

test("Clínica: trocar o valor na mensagem muda o texto e a Meta, sem perder a edição à mão", async () => {
  for (const largura of [1280, 375]) {
    const ctx = await nav.newContext({ viewport:{ width:largura, height:800 }, isMobile: largura < 700, hasTouch: largura < 700,
      locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
    const p = await ctx.newPage();
    await p.clock.install({ time: new Date(D.HOJE) });
    await ctx.addInitScript(k => {
      if (localStorage.getItem("teste-semeado")) return;
      localStorage.setItem("controle-unico-clinica-cache", k);
      localStorage.setItem("teste-semeado", "1");
    }, JSON.stringify(D.clinica));
    const erros = []; p.on("pageerror", e => erros.push(e.message));
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await p.goto(srv.url + "clinica.html");
    await p.waitForTimeout(600);
    await p.click("#msg");
    const ta = p.locator("#msg-txt");
    await ta.evaluate(t => { t.value = "Oi, tudo bem?\n" + t.value; });
    await p.fill("#msg-avulsa", "235");
    await p.fill("#msg-mensal", "780");
    const texto = await ta.inputValue();
    assert.match(texto, /^Oi, tudo bem\?/);
    assert.match(texto, /\*Sessão avulsa:\* R\$235,00\./);
    assert.match(texto, /\*Ciclo mensal:\* R\$780,00 - inclui 4 sessões\./);
    assert.deepEqual(await p.evaluate(() => [dados.config.avulsa, dados.config.mensal,
      document.getElementById("f-avulsa").value, document.getElementById("f-mensal").value]), [235, 780, "235", "780"]);
    // reabrir a caixa já mostra os valores novos
    await p.click("#msg-fechar"); await p.click("#msg");
    assert.equal(await p.inputValue("#msg-avulsa"), "235");
    assert.match(await p.inputValue("#msg-txt"), /R\$780,00/);
    // no celular nada passa da largura
    assert.equal(await p.evaluate(() => document.querySelector(".modal").scrollWidth <= document.querySelector(".modal").clientWidth), true);
    if (process.env.FOTO) await p.screenshot({ path: process.env.FOTO + "/msg-" + largura + ".png" });
    assert.deepEqual(erros, []);
    await ctx.close();
  }
});
