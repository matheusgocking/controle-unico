/* Dados do paciente no Cadastro (09/10/2026, "não faz sentido não ter"). Caderno inventado de
   dados-de-teste.js e uma aba Registro inventada; relógio parado em 09/10/2026. Nenhum dado de verdade. */
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
  await p.clock.install({ time: new Date("2026-10-09T12:00:00-03:00") });
  const c = JSON.parse(JSON.stringify(D.clinica));
  c.arquivados = [{ codigo:"T36", nome:"Beatriz Teste Silva", status:"Inativo.", valor:500, modalidade:"Mensal.",
    inicio:"2026-05-07", fim:"2026-08-14", sessoes:13, ciclos:1, aPagar:0 }];
  await ctx.addInitScript(k => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k);
    localStorage.setItem("teste-semeado", "1");
  }, JSON.stringify(c));
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  p.on("dialog", d => d.accept());
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + "clinica.html");
  await p.waitForTimeout(600);
  return { ctx, p, erros };
}

/* a aba Registro como o leitor de .xlsx devolve: {ref: {v}}, cabeçalho com quebra de linha e ponto final */
function registroInventado(codigoA){
  const cab = ["OQ® Measures","Prontuário","Nome Completo","Data de\nNascimento","Idade","CPF","Nacionalidade.","Estado (UF).","Cidade.",
    "Identidade de\nGênero","Estado Civíl","Escolaridade.","Ocupação.","Contato de Emergência\n(Nome).","Contato de Emergência\n(Relação ou Parentesco).",
    "Contato de Emergência (Celular).","Contato do\nPsiquiatra.","Telefone\nCelular.","E-mail (Opcional).","Tipo de\nPsicoterapia","Tipo de\nPagamento","Status"];
  const linhas = [
    ["01", codigoA, "Ana Teste Antiga", "36000", "28", "-", "Brasileira.", "ES.", "Vitória.", "Mulher cis.", "Solteiro(a).", "Superior.", "Antiga.",
      "-", "-", "-", "-", "(27) 90000-0000", "-", "Individual.", "Regular.", "-"],
    ["01", codigoA, "Ana Teste Souza", "36526", "26", "000.000.000-00", "Brasileira.", "ES.", "Vila Velha.", "Mulher cis.", "Solteiro(a).", "Superior.", "Designer.",
      "Maria Teste", "Mãe.", "(27) 91111-1111", "-", "(27) 92222-2222", "ana@teste.invalido", "Individual.", "Valor Social.", "Ativo."],
    ["02", "T36", "Beatriz Teste Silva", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "Dra. Teste", "(31) 93333-3333", "-", "Individual.", "Regular.", "Inativo."]
  ];
  const col = i => String.fromCharCode(65 + i);
  const cel = {};
  cab.forEach((v, i) => { cel[col(i) + "1"] = { v }; });
  linhas.forEach((l, n) => l.forEach((v, i) => { cel[col(i) + (n + 2)] = { v }; }));
  return cel;
}

for (const largura of [390, 1280]) {
  test("Dados do paciente: traz da aba Registro só o que falta, sem mexer nas contas (" + largura + ")", async () => {
    const { ctx, p, erros } = await abrir(largura);
    const codigo = await p.evaluate(() => dados.pacientes[0].codigo);
    const r = await p.evaluate((cel) => {
      const contas = () => { vencCache = null; devidoCache = null;
        return JSON.stringify(dados.pacientes.map(x => [devidoDe(x), proximoVencimento(x), situacaoPagamento(x).chave])); };
      const alvo = dados.pacientes[0];
      const antes = contas(), pagos = JSON.stringify(dados.pagamentos), agenda = JSON.stringify(dados.pacientes);
      const lidos = lerDadosDoRegistro(cel);
      /* ele já tinha escrito o celular no app: a planilha não passa por cima */
      dados.cadastros = {}; dados.cadastros[alvo.codigo] = { celular:"(27) 98888-8888" };
      const conta = juntarDados(lidos);
      const deNovo = juntarDados(lidos);
      return { lidos, conta, deNovo, cad: dados.cadastros, contasIguais: contas() === antes,
        pagosIguais: JSON.stringify(dados.pagamentos) === pagos, agendaIgual: JSON.stringify(dados.pacientes) === agenda,
        grade: nomeGrade(alvo) };
    }, registroInventado(codigo));
    assert.equal(r.lidos[codigo].nomeCompleto, "Ana Teste Souza", "a linha mais recente manda");
    assert.equal(r.lidos[codigo].nascimento, "2000-01-01");
    assert.equal(r.lidos[codigo].cidade, "Vila Velha", "sem o ponto final da planilha");
    assert.equal(r.lidos[codigo].email, "ana@teste.invalido");
    assert.equal(r.lidos[codigo].emergRelacao, "Mãe");
    assert.equal(r.lidos[codigo].psiquiatra, undefined, "o traço da planilha é vazio");
    assert.equal(r.lidos.T36.psiquiatra, "Dra. Teste");
    assert.equal(r.cad[codigo].celular, "(27) 98888-8888", "o que ele escreveu no app fica");
    assert.deepEqual({ p:r.conta.pacientes, a:r.conta.naAgenda, f:r.conta.fora }, { p:2, a:1, f:1 });
    assert.equal(r.deNovo.campos, 0, "trazer de novo não muda nada");
    assert.ok(r.contasIguais, "dívida, vencimento e situação iguais");
    assert.ok(r.pagosIguais, "pagamentos iguais");
    assert.ok(r.agendaIgual, "fichas da agenda iguais");
    assert.equal(r.grade, "Ana Souza", "a grade usa o nome completo do cadastro");

    /* a ficha mostra e grava os dados na aba Dados (09/10/2026: antes ficavam no fim do Cadastro) */
    await p.evaluate(() => { abrirFicha(dados.pacientes[0], null, "dados"); });
    await p.waitForTimeout(200);
    assert.equal(await p.inputValue("#dp-nomeCompleto"), "Ana Teste Souza");
    assert.equal(await p.textContent("#dp-idade"), "26 anos");
    assert.equal(await p.getAttribute('[data-whats="celular"]', "href"), "https://wa.me/5527988888888");
    await p.fill("#dp-psiquiatra", "Dr. Inventado");
    await p.waitForTimeout(700);
    assert.equal(await p.evaluate(c => dados.cadastros[c].psiquiatra, codigo), "Dr. Inventado");
    await p.fill("#dp-psiquiatra", "");
    await p.waitForTimeout(700);
    assert.equal(await p.evaluate(c => "psiquiatra" in dados.cadastros[c], codigo), false, "campo apagado sai do caderno");
    await p.screenshot({ path: require("path").join(process.env.FOTOS || require("os").tmpdir(), "dados-ficha-" + largura + ".png") });

    /* trocar o prontuário leva os dados junto */
    await p.click("#fi-aba-cadastro");
    await p.fill("#fi-codigo", "T99");
    await p.waitForTimeout(700);
    const mov = await p.evaluate(c => ({ velho: !!dados.cadastros[c], novo: dados.cadastros.T99 && dados.cadastros.T99.nomeCompleto }), codigo);
    assert.deepEqual(mov, { velho:false, novo:"Ana Teste Souza" });
    await p.evaluate(() => fichaAberta.fechar());

    /* quem já saiu: botão Dados no cartão */
    await p.evaluate(() => { mostrarView("pacientes"); filtroPacientes = "inativo"; renderPacientes(); });
    await p.click('[data-dados="T36"]');
    await p.waitForTimeout(200);
    assert.equal(await p.inputValue("#dp-psiquiatra"), "Dra. Teste");
    await p.screenshot({ path: require("path").join(process.env.FOTOS || require("os").tmpdir(), "dados-saiu-" + largura + ".png") });
    await p.click("#dp-fechar");

    /* vai junto na cópia da planilha */
    const aba = await p.evaluate(() => abasParaPlanilha().filter(a => a.nome === "Dados dos pacientes")[0]);
    assert.equal(aba.linhas.length, 3);
    assert.equal(aba.linhas[0][0], "Prontuário");
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}
