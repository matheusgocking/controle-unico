/* A casca (index.html) e o que ela abre: cada botão faz o que o nome diz (auditoria da casca,
   06/10/2026). Abrem o app num Chromium sem tela, com os cadernos inventados de dados-de-teste.js,
   o relógio parado em 04/10/2026 e a rede de fora bloqueada. Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });
const espera = ms => new Promise(r => setTimeout(r, ms));
const CADERNOS = {
  "controle-unico-dinheiro-cache": JSON.stringify(D.dinheiro), "controle-unico-casa-cache": JSON.stringify(D.casa),
  "controle-unico-clinica-cache": JSON.stringify(D.clinica) };

async function abrir(pagina, largura, extra, escuro){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:844 }, isMobile: largura < 700, hasTouch: largura < 700,
    locale:"pt-BR", timezoneId:"America/Sao_Paulo", colorScheme: escuro ? "dark" : "light" });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await ctx.addInitScript(s => {
    if (localStorage.getItem("teste-semeado")) return;
    for (const k in s) localStorage.setItem(k, s[k]);
    localStorage.setItem("teste-semeado", "1");
  }, Object.assign({}, CADERNOS, extra || {}));
  const p = await ctx.newPage();
  const erros = [], dialogos = [];
  p.on("pageerror", e => erros.push(e.message));
  p.on("dialog", d => { dialogos.push(d.message()); d.dismiss(); });
  await p.clock.install({ time: new Date(D.HOJE) });
  await p.goto(srv.url + pagina);
  await espera(2500);
  return { ctx, p, erros, dialogos };
}
const quadro = (p, nome) => p.frames().find(f => f.url().includes(nome));
const visivel = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== "none" && e.getClientRects().length > 0; }, sel);
const casca = p => p.evaluate(() => ({ titulo:document.getElementById("titulo").textContent, atual,
  aba:[...document.querySelectorAll("#abas button")].find(b => b.getAttribute("aria-pressed") === "true")?.dataset.p || "",
  vistas:!document.getElementById("vistas").classList.contains("hidden") }));
const abrirMenu = async p => { await p.click("#menu > summary"); await espera(150); };

for (const largura of [390, 1280]) {
  test(`1. a ${largura}px, com a ficha aberta o + da casca sai da frente, e volta quando ela fecha`, async () => {
    const { ctx, p, erros } = await abrir("index.html#clinica", largura);
    const k = quadro(p, "clinica.html");
    assert.equal(await visivel(p, "#mais-bt"), true);
    await k.evaluate(() => abrirDoTudo({ tipo:"paciente", id:"pA", aba:"prontuario" })); await espera(300);
    assert.equal(await visivel(p, "#mais-bt"), false, "o + não fica por cima da ficha");
    // o Pronto recebe o toque em toda a largura dele
    const r = await k.evaluate(() => { const b = [...document.querySelectorAll(".overlay button")].find(b => /Pronto/.test(b.textContent));
      b.scrollIntoView({ block:"nearest" }); const r = b.getBoundingClientRect(); return { x:r.left + r.width * 0.75, y:r.top + r.height / 2 }; });
    const off = await p.evaluate(() => { const r = document.getElementById("q-clinica").getBoundingClientRect(); return { x:r.left, y:r.top }; });
    assert.equal(await p.evaluate(([x, y]) => document.elementFromPoint(x, y).tagName, [off.x + r.x, off.y + r.y]), "IFRAME");
    await p.mouse.click(off.x + r.x, off.y + r.y); await espera(300);
    assert.equal(await k.evaluate(() => !!document.querySelector(".overlay")), false, "o Pronto fechou a ficha");
    assert.equal(await p.evaluate(() => document.getElementById("mais-lista").hidden), true, "e não abriu a escolha do +");
    assert.equal(await visivel(p, "#mais-bt"), true);
    // o fim da Clínica não fica atrás do +
    assert.ok(await k.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".wrap")).paddingBottom)) >= 88);
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}

test("2. Privacidade, no rodapé da Clínica, abre fora do quadro, e a Clínica e a Tudo continuam inteiras", async () => {
  const { ctx, p, erros } = await abrir("index.html#clinica", 390);
  const k = quadro(p, "clinica.html");
  assert.equal(await k.getAttribute(".foot a[href='privacidade.html']", "target"), "_top");
  await k.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await k.click(".foot a[href='privacidade.html']"); await p.waitForURL(/privacidade\.html/);
  await p.click("a.volta"); await p.waitForURL(/index\.html/); await espera(2500);
  assert.match(await p.evaluate(() => document.getElementById("q-clinica").contentWindow.location.pathname), /clinica\.html$/);
  await p.click("#abas button[data-p=tudo]"); await espera(1500);
  assert.match(await quadro(p, "app.html").textContent(".veredito"), /Pode gastar/);
  // reforço: se outra página abrir dentro do quadro da Clínica, a casca põe a Clínica de volta
  await p.evaluate(() => document.getElementById("q-clinica").contentWindow.location.href = "privacidade.html"); await espera(2000);
  assert.match(await p.evaluate(() => document.getElementById("q-clinica").contentWindow.location.pathname), /clinica\.html$/);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("3. Sair deste aparelho sem login e com mudança pendente diz que ela se perde, e Cancelar mantém tudo", async () => {
  const { ctx, p, dialogos } = await abrir("index.html#tudo", 390, { "controle-unico-dinheiro-pendente":"1" });
  await abrirMenu(p); await p.click("#sair"); await espera(300);
  assert.equal(dialogos.length, 1);
  assert.match(dialogos[0], /guardadas só neste aparelho/);
  assert.match(dialogos[0], /Toque em Cancelar, entre com o Google/);
  assert.match(dialogos[0], /OK para sair e perder essas mudanças/);
  assert.doesNotMatch(dialogos[0], /tente de novo/);
  assert.ok(await p.evaluate(() => localStorage.getItem("controle-unico-dinheiro-cache")), "Cancelar não apaga nada");
  await ctx.close();
});

for (const largura of [390, 1280]) {
  test(`4. a ${largura}px, Ver o fechamento troca a tela pela casca, e Voltar leva de volta à Tudo`, async () => {
    const { ctx, p, erros } = await abrir("index.html#tudo", largura);
    const app = quadro(p, "app.html");
    await app.click("[data-fech]"); await espera(800);
    assert.deepEqual(await casca(p), { titulo:"Carteira", atual:"carteira", aba:"carteira", vistas:true });
    assert.equal(await p.evaluate(() => location.hash), "#carteira");
    assert.match(await app.textContent("#tela"), /Como setembro fechou/);
    await p.goBack(); await espera(800);
    assert.deepEqual(await casca(p), { titulo:"Tudo", atual:"tudo", aba:"tudo", vistas:false });
    assert.equal(await app.evaluate(() => location.hash), "#tudo");
    assert.match(await app.textContent("#tela"), /outubro 2026/i, "a Tudo volta ao mês em que estava");
    // a Carteira volta a abrir nos lançamentos
    await p.click("#abas button[data-p=carteira]"); await espera(800);
    assert.doesNotMatch(await app.textContent("#tela"), /Como setembro fechou/);
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}

test("5. o aviso do prontuário com dois pacientes diz quem são e abre a lista deles", async () => {
  const { ctx, p, erros } = await abrir("index.html#tudo", 1280);
  const app = quadro(p, "app.html");
  await app.evaluate(() => { const d = document.querySelector(".pv-mais"); if (d) d.open = true; });
  const i = await app.$$eval(".pv .pv-i", l => l.findIndex(b => /registros do prontuário/.test(b.textContent)));
  assert.ok(i >= 0);
  const detalhe = await app.$$eval(".pv .pv-i small", (l, i) => l[i].textContent, i);
  assert.match(detalhe, /De .+ e .+\./, "o detalhe dá os nomes");
  const antes = await p.evaluate(() => localStorage.getItem("controle-unico-clinica-cache"));
  await app.locator(".pv .pv-i").nth(i).click(); await espera(800);
  const k = quadro(p, "clinica.html");
  assert.equal((await casca(p)).atual, "clinica");
  const nomes = await k.$$eval(".overlay .pront-lista button b", l => l.map(b => b.textContent));
  assert.equal(nomes.length, 2);
  for (const n of nomes) assert.ok(detalhe.includes(n), n);
  await k.click(".overlay .pront-lista button"); await espera(400);
  assert.equal(await k.evaluate(() => document.querySelectorAll(".overlay").length), 1);
  assert.equal(await k.textContent(".overlay .ficha h2"), nomes[0]);
  assert.equal(await k.getAttribute("#fi-aba-prontuario", "aria-selected"), "true");
  assert.equal(await p.evaluate(() => localStorage.getItem("controle-unico-clinica-cache")), antes, "só abre telas");
  assert.deepEqual(erros, []);
  await ctx.close();
});

for (const largura of [390, 1280]) {
  test(`6. a ${largura}px, o menu ⋯ fecha com um toque na página do módulo, ao trocar de tela e com Voltar`, async () => {
    const { ctx, p, erros } = await abrir("index.html#tudo", largura);
    const app = quadro(p, "app.html");
    await abrirMenu(p);
    assert.equal(await p.evaluate(() => menu.open), true);
    await app.click(".veredito", { position:{ x:8, y:8 } }); await espera(200);
    assert.equal(await p.evaluate(() => menu.open), false);
    await abrirMenu(p); await p.evaluate(() => mostrar("clinica")); await espera(300);
    assert.equal(await p.evaluate(() => menu.open), false);
    await abrirMenu(p); await p.goBack(); await espera(500);
    assert.equal(await p.evaluate(() => menu.open), false);
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}

test("7. no celular a Cripto tem o +, e a escolha abre colada nele", async () => {
  const { ctx, p, erros } = await abrir("index.html#cripto", 390);
  assert.equal(await visivel(p, "#mais-bt"), true);
  await p.click("#mais-bt"); await espera(200);
  const r = await p.evaluate(() => [document.getElementById("mais-lista").getBoundingClientRect().bottom, document.getElementById("mais-bt").getBoundingClientRect().top]);
  assert.ok(r[0] <= r[1] && r[1] - r[0] < 20, "a lista fica logo acima do +");
  // na Tudo e na Dinheiro continua só o + da própria tela
  await p.keyboard.press("Escape"); await p.evaluate(() => mostrar("tudo")); await espera(300);
  assert.equal(await visivel(p, "#mais-bt"), false);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("8. dentro da casca a Clínica não mostra o botão Tema dela (o tema é o do menu ⋯)", async () => {
  for (const largura of [390, 1280]) {
    const { ctx, p } = await abrir("index.html#clinica", largura);
    const k = quadro(p, "clinica.html");
    assert.equal(await k.evaluate(() => getComputedStyle(document.getElementById("tema")).display), "none");
    await ctx.close();
  }
});

test("9. o aviso do Drive aparece uma vez só: na casca, e não de novo no módulo", async () => {
  for (const largura of [390, 1280]) {
    const { ctx, p } = await abrir("index.html#tudo", largura, { "controle-unico-dinheiro-pendente":"1" });
    assert.match(await p.textContent("#nuvem-texto"), /Entre com o Google para mandar ao Drive/);
    assert.equal(await visivel(p, "#nuvem-texto"), true);
    const app = quadro(p, "app.html");
    assert.equal(await app.evaluate(() => getComputedStyle(document.querySelector(".nuvem")).display), "none");
    await ctx.close();
  }
});

test("10. Voltar ao app, no Guia rápido, volta pelo histórico", async () => {
  const { ctx, p, erros } = await abrir("index.html#tudo", 390);
  await abrirMenu(p); await p.click(".menu-lista a[href='guia.html']"); await p.waitForURL(/guia\.html/);
  await p.click("[data-para=matheus].voltar"); await p.waitForURL(/index\.html/);
  await p.goForward(); await p.waitForURL(/guia\.html/);   // o passo do Guia continua à frente: foi um Voltar, não um passo novo
  await p.goBack(); await p.waitForURL(/index\.html/); await espera(1500);
  assert.equal(await p.evaluate(() => history.length), 3, "o caminho é só app → Guia, sem um passo a mais de volta ao app");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("11 e 14. o Guia descreve o Conferir, o + e o tema como o app está hoje", () => {
  const guia = fs.readFileSync(path.join(__dirname, "..", "guia.html"), "utf8");
  assert.doesNotMatch(guia, /botão <kbd>Conferir<\/kbd> no alto/);
  assert.doesNotMatch(guia, /No celular há também o botão redondo/);
  assert.match(guia, /Fica no menu <kbd>⋯<\/kbd>, em <b>Conferir com as planilhas<\/b>/);
  assert.match(guia, /<b>Lançamento<\/b>[^<]*\(gasto, receita ou compra da casa\) ou <b>Recebimento de paciente<\/b>/);
  assert.match(guia, /<b>Mudar para tema escuro<\/b>/);
  assert.match(guia, /<b>Guia rápido<\/b>/);
});

test("12. dentro da Conferência o item do menu diz Sair da conferência, e depois o Voltar não a abre de novo", async () => {
  const { ctx, p, erros } = await abrir("index.html#tudo", 1280);
  assert.equal(await p.textContent("#conferir"), "Conferir com as planilhas");
  await p.click("#abas button[data-p=carteira]"); await espera(800);
  await abrirMenu(p); await p.click("#conferir"); await espera(800);
  assert.equal((await casca(p)).atual, "conferir");
  await abrirMenu(p);
  assert.equal(await p.textContent("#conferir"), "Sair da conferência");
  await p.click("#conferir"); await espera(800);
  assert.equal((await casca(p)).atual, "carteira", "volta para a tela de antes");
  assert.equal(await p.textContent("#conferir"), "Conferir com as planilhas");
  await p.evaluate(() => history.back()); await espera(800);
  assert.equal((await casca(p)).atual, "tudo", "o Voltar leva à tela anterior, não à Conferência");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("13. Recebimento de paciente abre sem paciente e sem valor, e Registrar espera a escolha", async () => {
  for (const largura of [390, 1280]) {
    const { ctx, p, erros } = await abrir("index.html#tudo", largura);
    if (largura < 700) { const app = quadro(p, "app.html"); await app.evaluate(() => window.scrollTo(0, 1500)); await espera(300); await app.click("#fab"); }
    else await p.click("#mais-bt");
    await p.click("[data-mais=recebimento]"); await espera(1500);
    const k = quadro(p, "clinica.html");
    assert.equal(await k.inputValue("#pg-paciente"), "?");
    assert.equal(await k.evaluate(() => document.getElementById("pg-paciente").selectedOptions[0].textContent), "Escolha quem pagou");
    assert.equal(await k.inputValue("#pg-valor"), "");
    assert.equal(await k.inputValue("#pg-data"), "2026-10-04");
    const antes = await k.evaluate(() => dados.pagamentos.length);
    await k.click("#pg-add"); await espera(200);
    assert.equal(await k.evaluate(() => dados.pagamentos.length), antes, "sem paciente, nada é gravado");
    assert.match(await k.textContent("#pg-feito"), /Escolha quem pagou/);
    assert.equal(await k.evaluate(() => document.getElementById("pg-form").classList.contains("hidden")), false);
    // escolhido o paciente, o valor vem dele, como sempre
    await k.selectOption("#pg-paciente", "pB"); await espera(100);
    assert.equal(await k.inputValue("#pg-valor"), "200");
    assert.deepEqual(erros, []);
    await ctx.close();
  }
});

test("14. o item do tema diz para qual tema ele muda", async () => {
  const { ctx, p } = await abrir("index.html#tudo", 390);
  assert.equal(await p.textContent("#tema-rot"), "Mudar para tema escuro");
  await abrirMenu(p); await p.click("#tema"); await espera(100);
  assert.equal(await p.textContent("#tema-rot"), "Mudar para tema claro");
  await ctx.close();
});

test("lançamento: o botão que descarta o formulário se chama Cancelar", async () => {
  const { ctx, p, erros } = await abrir("index.html#carteira", 1280);
  const app = quadro(p, "app.html");
  await app.click(".lanc-abrir"); await espera(200);
  assert.equal((await app.textContent(".lanc-abrir")).trim(), "Cancelar");
  await app.click(".lanc-abrir"); await espera(200);
  assert.equal((await app.textContent(".lanc-abrir")).trim(), "+ Novo lançamento");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("as telas mexidas não rolam de lado no celular, no tema claro e no escuro", async () => {
  for (const escuro of [false, true]) {
    const { ctx, p, erros } = await abrir("index.html#tudo", 390, null, escuro);
    await quadro(p, "app.html").evaluate(() => window.scrollTo(0, 1500)); await espera(200);
    await quadro(p, "app.html").click("#fab"); await p.click("[data-mais=recebimento]"); await espera(1500);
    const k = quadro(p, "clinica.html");
    assert.equal(await k.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await k.evaluate(() => abrirDoTudo({ tipo:"prontuario" })); await espera(300);
    assert.equal(await k.evaluate(() => document.querySelectorAll(".overlay .pront-lista button").length), 2);
    assert.equal(await k.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.equal(await visivel(p, "#mais-bt"), false);
    assert.deepEqual(erros, []);
    await ctx.close();
  }
});
