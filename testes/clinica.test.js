/* Testes da Clínica e da Formulação de Caso (04/10/2026). Abrem cada página sozinha, num Chromium
   sem tela, com os cadernos inventados de dados-de-teste.js e o relógio parado em 04/10/2026, um
   domingo. Conferem as contas da quinzena e da falta, o que a leitura da planilha preserva e que as
   janelas funcionam pelo teclado. Nenhum dado de verdade. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

async function abrir(pagina, { largura = 1280, formulacao = null } = {}) {
  const ctx = await nav.newContext({ viewport:{ width:largura, height:900 }, isMobile: largura < 700, hasTouch: largura < 700,
    locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date(D.HOJE) });
  await ctx.addInitScript(([k, f]) => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k);
    if (f){ localStorage.setItem("controle-unico-formulacao-cache", f); localStorage.setItem("controle-unico-formulacao-aberto", "c1"); }
    localStorage.setItem("teste-semeado", "1");
  }, [JSON.stringify(D.clinica), formulacao ? JSON.stringify(formulacao) : null]);
  const erros = [], dialogos = [];
  p.on("pageerror", e => erros.push(e.message));
  p.on("dialog", d => { dialogos.push(d.message()); d.accept(); });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + pagina);
  await p.waitForTimeout(600);
  return { ctx, p, erros, dialogos };
}

test("Clínica: a falta cobrada continua contando quando alguém é encaixado na hora", async () => {
  const { ctx, p, erros } = await abrir("clinica.html");
  const r = await p.evaluate(() => {
    const d = new Date(2026, 9, 5);                       // segunda, 05/10, 9h: Paciente Mensal
    const antes = numerosDoMes(new Date(2026, 9, 1)).previsto;
    marcarSaida("2026-10-05|9", "falta");
    porEntrada("2026-10-05|9", { pacienteId:"pB" });       // o avulso encaixado na hora
    cacheMes = {};
    return { lista: sessoesDoDia(d).filter(s => s.hora === 9).map(s => s.paciente.id + ":" + s.estado),
             antes, depois: numerosDoMes(new Date(2026, 9, 1)).previsto };
  });
  assert.deepEqual(r.lista, ["pA:falta", "pB:sessao"]);
  assert.equal(r.depois, r.antes + 200, "o mensal continua igual e o encaixe avulso soma uma sessão");
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Clínica: o previsto de um mês usa o preço do ciclo daquele mês", async () => {
  const { ctx, p } = await abrir("clinica.html");
  const r = await p.evaluate(() => {
    const b = acharPaciente("pB");
    b.ciclos = [{ inicio:"2026-08-01", cobranca:"avulsa", valor:150 }, { inicio:"2026-10-01", cobranca:"avulsa", valor:200, noApp:true }];
    cacheMes = {};
    return { set: numerosDoMes(new Date(2026, 8, 1)).previsto, out: numerosDoMes(new Date(2026, 9, 1)).previsto };
  });
  // setembro de 2026 tem 5 terças; o avulso valia 150 nelas, menos a de 29/09, que já é do ciclo
  // de 01/10 pela folga de 3 dias (cicloEm). O resto do previsto é dos outros três.
  const semB = await p.evaluate(() => { const b = acharPaciente("pB"); b.ciclos = []; b.valor = 0; cacheMes = {}; return numerosDoMes(new Date(2026, 8, 1)).previsto; });
  assert.equal(r.set - semB, 4 * 150 + 200);
  assert.equal(r.out > 0, true);
  await ctx.close();
});

test("Clínica: ler a planilha não apaga a semana da quinzena", async () => {
  const { ctx, p } = await abrir("clinica.html");
  const r = await p.evaluate(() => {
    const leitura = { avisos:[], blocos:[], baseData:"2026-10-04", pacientes: dados.pacientes.map(x => ({
      codigo:x.codigo, nome:x.nome, freq:x.freq, cobranca:x.cobranca, valor:x.valor, dia:x.dia, hora:x.hora })) };
    aplicarLeitura(leitura);
    return dados.pacientes.map(x => x.codigo + ":" + (x.semanaRef || ""));
  });
  assert.deepEqual(r, ["T001:", "T002:", "T003:2026-09-28", "T004:2026-10-05"]);
  await ctx.close();
});

test("Clínica: no domingo, \"nesta semana\" é a semana que a grade mostra", async () => {
  const { ctx, p } = await abrir("clinica.html");
  const r = await p.evaluate(() => {
    abrirFicha(acharPaciente("pC"));
    const sel = document.getElementById("fi-qsem");
    const texto = sel.options[0].textContent;
    sel.value = "esta"; sel.dispatchEvent(new Event("change"));
    return { texto, ref: acharPaciente("pC").semanaRef };
  });
  assert.match(r.texto, /05\/10/);
  assert.equal(r.ref, "2026-10-05");
  await ctx.close();
});

test("Clínica: corrigir o prontuário na ficha não apaga o \"como chegou\" de outro paciente", async () => {
  const { ctx, p } = await abrir("clinica.html");
  const r = await p.evaluate(() => {
    dados.origens = { T001:{ tipo:"indicacao" }, T00:{ tipo:"instagram" } };
    abrirFicha(acharPaciente("pA"));
    const c = document.getElementById("fi-codigo");
    for (const v of ["T00", "T009"]) { c.value = v; c.dispatchEvent(new Event("input")); }
    return dados.origens;
  });
  assert.deepEqual(r, { T00:{ tipo:"instagram" }, T009:{ tipo:"indicacao" } });
  await ctx.close();
});

test("Clínica: a aba Marketing mostra o ranking, os cartões e o aviso de quem falta marcar, sem mexer nos dados", async () => {
  for (const largura of [375, 1280]) {
    const { ctx, p, erros } = await abrir("clinica.html", { largura });
    const r = await p.evaluate(() => {
      dados.anuncios = [
        { id:"a1", post:"Reels A", inicio:"2026-08-01", fim:"2026-08-07", colocado:70, gasto:66.4, conversas:9 },
        { id:"a2", post:"Carrossel B", inicio:"2026-09-05", fim:"2026-09-12", colocado:100, gasto:98.1, conversas:6 },
        { id:"a3", post:"Reels A", inicio:"2026-09-20", fim:"2026-09-27", colocado:80, gasto:79.5, conversas:11 },
        { id:"a4", post:"Story C", inicio:"2026-10-04", fim:"2026-10-10", colocado:50 },
        { id:"a5", post:"Antigo D", inicio:"2026-07-01", fim:"2026-07-05", colocado:30, gasto:30, conversas:2 }];
      dados.origens = { T001:{ tipo:"anuncio", anuncio:"a1" } };
      const antes = JSON.stringify(dados);
      document.querySelector("[data-view=marketing]").click(); renderMarketing();
      const posts = [...document.querySelectorAll("#mk-rank .mk-post .cab b")].map(b => b.textContent);
      const cartoes = document.querySelectorAll("#mk-lista .mk-an").length;
      document.getElementById("mk-todos").click();
      const todos = document.querySelectorAll("#mk-lista .mk-an").length;
      const aviso = document.getElementById("mk-aviso");
      const avisoTexto = aviso.classList.contains("hidden") ? "" : aviso.textContent;
      document.getElementById("mk-marcar").click();
      const faltando = document.querySelectorAll("#mk-origens .mk-origem.falta").length;
      const linhas = document.querySelectorAll("#mk-origens .mk-origem").length;
      return { posts, cartoes, todos, avisoTexto, faltando, linhas, mudou: JSON.stringify(dados) !== antes,
        larga: document.documentElement.scrollWidth > window.innerWidth + 1 };
    });
    assert.deepEqual(r.posts, ["Reels A", "Antigo D", "Carrossel B", "Story C"], "o mais barato por conversa primeiro; o sem métrica no fim");
    assert.equal(r.cartoes, 4, "só os quatro mais recentes de início");
    assert.equal(r.todos, 5, "\"Ver os anteriores\" mostra todos");
    assert.match(r.avisoTexto, /3 pacientes sem marcar/);
    assert.equal(r.faltando, 3, "\"Marcar agora\" filtra quem falta");
    assert.equal(r.linhas, 3);
    assert.equal(r.mudou, false, "olhar a aba não muda os dados");
    assert.equal(r.larga, false, "nada passa da largura da tela");
    assert.deepEqual(erros, []);
    await ctx.close();
  }
});

test("Clínica: as janelas e o menu da grade funcionam pelo teclado", async () => {
  const { ctx, p, erros } = await abrir("clinica.html");
  const cel = p.locator('.cell[data-data="2026-10-05"][data-hora="9"]');
  await cel.focus(); await p.keyboard.press("Enter");
  assert.equal(await p.evaluate(() => !!menuAberto && menuAberto.contains(document.activeElement)), true, "o menu recebe o foco");
  await p.keyboard.press("Escape");
  assert.equal(await p.evaluate(() => document.activeElement.dataset.data + "|" + document.activeElement.dataset.hora), "2026-10-05|9");
  for (const abrirJanela of ["abrirFicha(acharPaciente('pA'))", "abrirMensagem()", "abrirCobranca('Paciente Avulso', 2, 400)"]) {
    await cel.focus();
    const r = await p.evaluate(f => { eval(f); const m = document.querySelector(".overlay .modal");
      return { papel: m.getAttribute("role"), foco: document.activeElement === m }; }, abrirJanela);
    assert.deepEqual(r, { papel:"dialog", foco:true }, abrirJanela);
    await p.keyboard.press("Escape");
    assert.equal(await p.evaluate(() => !document.querySelector(".overlay") && document.activeElement.classList.contains("cell")), true, abrirJanela + " devolve o foco");
  }
  assert.deepEqual(erros, []);
  await ctx.close();
});

const CASO = { versao:2, modelos:[], casos:[{ id:"c1", nome:"Caso de teste", modelo:"integrativo", modulos:[], revisoes:[],
  itens:[{ id:"i1", m:"", c:"", texto:"Evita sair de casa" }, { id:'x"><img src=x onerror="window.invadiu=1">', m:"", c:"", texto:"Hipótese", hip:true }],
  relacoes:[{ id:"r1", de:"i1", para:'x"><img src=x onerror="window.invadiu=1">', tipo:"sustenta" }],
  medidas:[{ id:"m1", nome:"Ansiedade", pontos:[{ data:"2026-10-01", valor:7 }] }] }] };

test("Formulação: id estranho não vira código, desfazer ligação pergunta e a medida tem id", async () => {
  for (const largura of [375, 1280]) {
    const { ctx, p, erros, dialogos } = await abrir("formulacao.html", { largura, formulacao: CASO });
    assert.equal(await p.evaluate(() => !!window.invadiu), false);
    assert.deepEqual(await p.evaluate(() => livro.casos[0].medidas[0].pontos), [{ data:"2026-10-01", valor:7, id:"2026-10-01" }]);
    const x = p.locator("[data-desligar]").first();
    if (await x.count()) {
      await x.click();
      assert.equal(dialogos.length, 1, "pediu confirmação");
      assert.match(dialogos[0], /Desfazer esta ligação/);
    }
    // o ponto de estado fica ao lado do texto, não sozinho numa linha
    const pos = await p.evaluate(() => { const a = document.getElementById("nuvem-ponto").getBoundingClientRect(), b = document.getElementById("nuvem-texto").getBoundingClientRect();
      return { a: a.right, b: b.left, topoA: a.top, baixoB: b.bottom }; });
    assert.ok(pos.a <= pos.b && pos.topoA < pos.baixoB, "ponto ao lado do texto em " + largura + " px");
    assert.deepEqual(erros, []);
    await ctx.close();
  }
});

test("Clínica: o vencimento segue o saldo de sessões, não a data do pagamento", async () => {
  const { ctx, p, erros } = await abrir("clinica.html");
  const r = await p.evaluate(() => {
    const venc = id => { vencCache = null; devidoCache = null; const v = proximoVencimento(acharPaciente(id)); return v ? chaveData(v) : null; };
    const out = {};
    // mensal (4 sessões) pago na segunda 28/09: cobre 28/09, 05/10, 12/10 e 19/10
    registrarPagamento("pA", "2026-09-28", 700, "pix", "");
    out.mensal = venc("pA");
    // quinzenal (2 sessões) que vem a cada duas semanas, pago em 30/09: cobre 30/09 e 14/10
    registrarPagamento("pC", "2026-09-30", 400, "pix", "");
    out.quinzenal = venc("pC");
    out.quinzenalSituacao = situacaoPagamento(acharPaciente("pC")).chave;
    // com a base da planilha: quitado, vence na próxima sessão; com duas de crédito, na terceira
    const b = acharPaciente("pB");
    b.basePlanilha = "2026-09-30"; b.sessoesPlanilha = 10;
    registrarPagamento("pB", "2026-09-01", 2000, "pix", "");
    out.quitado = venc("pB");
    registrarPagamento("pB", "2026-10-02", 400, "pix", "");
    out.credito = venc("pB");
    // devendo duas: atrasado desde a penúltima terça
    b.sessoesPlanilha = 14;
    out.devendo = venc("pB");
    out.devendoSituacao = situacaoPagamento(b).chave;
    return out;
  });
  assert.deepEqual(r, { mensal:"2026-10-26", quinzenal:"2026-10-28", quinzenalSituacao:"ok",
    quitado:"2026-10-06", credito:"2026-10-20", devendo:"2026-09-22", devendoSituacao:"atraso" });
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Clínica: mudar o horário fixo vale dali em diante e não mexe no passado", async () => {
  const { ctx, p, erros } = await abrir("clinica.html");
  const r = await p.evaluate(() => {
    const a = acharPaciente("pA");                                   // segunda, 9h
    marcarSaida("2026-09-28|9", "realizada");
    const antes = sessoesDoPaciente(a, new Date(2026, 8, 21), new Date(2026, 9, 3)).map(s => chaveData(s.data) + "|" + s.hora + "|" + s.estado);
    abrirFicha(a);
    const dia = document.getElementById("fi-dia"), hora = document.getElementById("fi-hora");
    dia.value = "4"; dia.dispatchEvent(new Event("input"));           // quinta
    hora.value = "15"; hora.dispatchEvent(new Event("input"));
    fichaAberta.fechar();
    const depoisPassado = sessoesDoPaciente(a, new Date(2026, 8, 21), new Date(2026, 9, 3)).map(s => chaveData(s.data) + "|" + s.hora + "|" + s.estado);
    const futuro = sessoesDoPaciente(a, new Date(2026, 9, 5), new Date(2026, 9, 11)).map(s => chaveData(s.data) + "|" + s.hora);
    return { antes, depoisPassado, futuro, antigos: a.horariosAntigos };
  });
  assert.deepEqual(r.depoisPassado, r.antes);
  assert.deepEqual(r.antes, ["2026-09-21|9|sessao", "2026-09-28|9|realizada"]);
  assert.deepEqual(r.futuro, ["2026-10-08|15"]);
  assert.deepEqual(r.antigos, [{ ate:"2026-10-05", dia:1, hora:9, freq:"semanal" }]);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Clínica: o previsto da tela Mês é o mesmo da aba Pagamentos", async () => {
  const { ctx, p, erros } = await abrir("clinica.html");
  const r = await p.evaluate(() => {
    // um paciente em triagem e um preço que muda no meio do mês: antes as duas telas divergiam
    dados.pacientes.push({ id:"pE", codigo:"T005", nome:"Em Triagem", freq:"semanal", cobranca:"avulsa", valor:180, dia:4, hora:14, status:"Triagem." });
    const b = acharPaciente("pB");
    b.ciclos = [{ inicio:"2026-08-01", cobranca:"avulsa", valor:150 }, { inicio:"2026-10-10", cobranca:"avulsa", valor:200, noApp:true }];
    b.valor = 200;
    mesRef = new Date(2026, 9, 1); mesPag = new Date(2026, 9, 1);
    renderTudo();
    return { mes: document.getElementById("m-receita").textContent, mesTri: document.getElementById("m-receita-tri").textContent,
             pag: document.getElementById("pg-previsto").textContent, pagTri: document.getElementById("pg-previsto-tri").textContent };
  });
  assert.equal(r.mes, r.pag);
  assert.equal(r.mesTri, r.pagTri);
  assert.match(r.pagTri, /em triagem/);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Clínica: o histórico de pagamentos vem do mais recente para o mais antigo", async () => {
  const { ctx, p, erros } = await abrir("clinica.html");
  const r = await p.evaluate(() => {
    dados.pagamentos = [
      { id:"g1", pacienteId:"pA", data:"2026-10-01", valor:700, meio:"pix", receita:"Prática Clínica." },
      { id:"g2", pacienteId:"pB", data:"2026-10-03", valor:200, meio:"pix", receita:"Prática Clínica." },
      { id:"g3", pacienteId:"pC", data:"2026-10-01", valor:400, meio:"pix", receita:"Prática Clínica." },
      { id:"g4", pacienteId:"", nomePlanilha:"Acerto", data:"2026-09-20", valor:50, meio:"pix", receita:"Pendência." }
    ];
    mesPag = new Date(2026, 9, 1); mostrarView("pagamentos"); renderTudo();
    const sec = [...document.querySelectorAll("#v-pagamentos > .panel")].filter(x => !x.classList.contains("hidden")).map(x => x.querySelector("h2").textContent);
    return { ids: [...document.querySelectorAll("#pg-historico [data-apagar]")].map(b => b.dataset.apagar), sec,
             form: document.getElementById("pg-form").classList.contains("hidden") };
  });
  assert.deepEqual(r.ids, ["g2", "g3", "g1"], "no mesmo dia, o último registrado primeiro; setembro fica fora");
  assert.match(r.sec[0], /^Histórico de pagamentos/, "o histórico é o primeiro quadro da aba");
  assert.equal(r.form, true, "o formulário começa fechado");
  await p.click("#pg-abrir");
  assert.equal(await p.locator("#pg-form").isVisible(), true);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Clínica: no mensal, um pagamento avulso soma ao que o mês já pagou", async () => {
  const { ctx, p, erros } = await abrir("clinica.html");
  const r = await p.evaluate(() => {
    // Paciente Mensal (segunda 9h, R$ 700 o ciclo, R$ 175 a sessão), sem base da planilha
    dados.pagamentos = [{ id:"g1", pacienteId:"pA", data:"2026-09-28", valor:700, meio:"pix", receita:"Prática Clínica." }];
    vencCache = null; devidoCache = null;
    const soMes = chaveData(proximoVencimento(acharPaciente("pA")));
    dados.pagamentos.push({ id:"g2", pacienteId:"pA", data:"2026-10-04", valor:175, meio:"pix", receita:"Prática Clínica." });
    vencCache = null; devidoCache = null;
    const comAvulso = chaveData(proximoVencimento(acharPaciente("pA")));
    mostrarView("pagamentos"); renderTudo();
    document.getElementById("pg-paciente").value = "pA";
    dicaPagamento(true);
    const campo = document.getElementById("pg-valor");
    campo.value = "175"; campo.dispatchEvent(new Event("input"));
    return { soMes, comAvulso, dica: document.getElementById("pg-dica").textContent };
  });
  // o mês pago cobre 28/09, 05, 12 e 19/10; a sessão avulsa cobre 26/10; vence em 02/11
  assert.equal(r.soMes, "2026-10-26");
  assert.equal(r.comAvulso, "2026-11-02");
  assert.match(r.dica, /R\$ 175 equivale a 1 sessão de R\$ 175/);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test("Clínica: \"não haverá\" deixa o nome na grade, apagado, e o menu volta ao normal", async () => {
  for (const largura of [1280, 390]) {
    const { ctx, p, erros } = await abrir("clinica.html", { largura });
    await p.evaluate(() => { dados.blocos = { "1-9":"divulgado" }; marcarSaida("2026-10-05|9", "cancelada"); renderTudo(); });
    const cel = p.locator('.cell[data-data="2026-10-05"][data-hora="9"]');
    assert.equal(await cel.getAttribute("class").then(c => c.includes("cancelada")), true);
    assert.equal(await cel.locator(".nm").textContent(), "Paciente Mensal");
    assert.equal(await cel.locator(".lab").textContent(), "Não haverá");
    // o horário divulgado continua contando como livre e entrando na mensagem, como antes
    assert.equal(await p.evaluate(() => horasDivulgadasSemana()), 1);
    assert.match(await p.evaluate(() => textoDivulgacao()), /Segunda-feira:\* 09:00h/);
    // tocar abre a escolha com "Não haverá" marcado; "Normal" desfaz
    await cel.click();
    assert.equal(await p.locator('.menu .op.on').textContent().then(t => t.startsWith("Não haverá")), true);
    assert.equal(await p.locator('.menu .op').count(), 6);
    await p.locator('.menu .op', { hasText:"Normal" }).click();
    assert.equal(await p.evaluate(() => dados.excecoes["2026-10-05|9"]), undefined);
    assert.equal(await cel.getAttribute("class").then(c => c.includes("cancelada")), false);
    // tocar de novo na situação marcada também volta ao normal
    await cel.click(); await p.locator('.menu .op', { hasText:"Faltou" }).click();
    assert.equal(await p.evaluate(() => dados.excecoes["2026-10-05|9"].tipo), "falta");
    await cel.click(); await p.locator('.menu .op', { hasText:"Faltou" }).click();
    assert.equal(await p.evaluate(() => dados.excecoes["2026-10-05|9"]), undefined);
    assert.deepEqual(erros, []);
    await ctx.close();
  }
});

test("Clínica: quem volta atrás do \"não haverá\" volta ao horário normal, sem virar encaixe", async () => {
  for (const largura of [1280, 390]) {
    const { ctx, p, erros } = await abrir("clinica.html", { largura });
    const k = "2026-10-05|9";                                // segunda 9h: Paciente Mensal
    const cel = p.locator('.cell[data-data="2026-10-05"][data-hora="9"]');
    const venc = () => p.evaluate(() => { vencCache = null; devidoCache = null; return chaveData(proximoVencimento(acharPaciente("pA"))); });
    const vencNormal = await venc();
    // o registro que ficou no caso real: "não haverá" e o próprio paciente encaixado por cima
    await p.evaluate(k => { marcarSaida(k, "cancelada"); porEntrada(k, { pacienteId:"pA" }); renderTudo(); }, k);
    assert.equal(await cel.getAttribute("class").then(c => c.includes("encaixe")), true);
    await cel.click();
    await p.locator('.menu button[data-acao="voltar-proprio"]').click();
    assert.equal(await p.evaluate(k => dados.excecoes[k], k), undefined);
    assert.equal(await cel.getAttribute("class").then(c => c.includes("encaixe") || c.includes("cancelada")), false);
    assert.equal(await cel.locator(".nm").textContent(), "Paciente Mensal");
    assert.equal(await venc(), vencNormal, "o saldo volta a contar a sessão como antes");
    // escolher o próprio paciente no "Encaixar alguém" também só desfaz o "não haverá"
    await p.evaluate(k => { marcarSaida(k, "cancelada"); renderTudo(); }, k);
    await cel.click();
    await p.selectOption("#sel-extra", "pA");
    assert.equal(await p.evaluate(k => dados.excecoes[k], k), undefined);
    // outro paciente no lugar continua sendo encaixe, como antes
    await p.evaluate(k => { marcarSaida(k, "cancelada"); renderTudo(); }, k);
    await cel.click();
    await p.selectOption("#sel-extra", "pB");
    assert.deepEqual(await p.evaluate(k => dados.excecoes[k], k), { tipo:"cancelada", entra:{ pacienteId:"pB" } });
    assert.deepEqual(erros, []);
    await ctx.close();
  }
});
