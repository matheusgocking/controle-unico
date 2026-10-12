/* Quem saiu da agenda antes do app (12/10/2026, correção dele): a dívida é a da planilha (o app cobrava
   R$ 80 do Caio e dizia R$ 200 do Marcos, que a planilha dá como zero e R$ 300); quem estava na grade em
   setembro continua nela até o dia do encerramento, com o que o prontuário diz onde ele não marcou nada;
   as sessões antigas sem hora aparecem na linha "Sem hora"; e o campo do pagamento aceita qualquer valor,
   mesmo quando o Drive refaz a ficha. Caderno inventado; relógio parado em 12/10/2026. Nenhum dado real. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const servidor = require("./servidor.js");
const D = require("./dados-de-teste.js");

let srv, nav;
before(async () => { srv = await servidor.iniciar(); nav = await chromium.launch(); });
after(async () => { if (nav) await nav.close(); if (srv) srv.fechar(); });

function caderno(){
  const c = JSON.parse(JSON.stringify(D.clinica));
  c.arquivados = [
    { codigo:"T10", nome:"Marta Teste Domingues", status:"Inativo.", valor:400, modalidade:"Mensal.", inicio:"2026-05-04", fim:"2026-09-18", sessoes:12, ciclos:1, aPagar:300 },
    { codigo:"T12", nome:"Caio Teste Ribeiro", status:"Inativo.", valor:150, modalidade:"Semanal.", inicio:"2026-06-01", fim:"2026-07-20", sessoes:6, ciclos:1, aPagar:0 }
  ];
  c.arquivadosEm = "2026-10-09";
  /* a marca que ele fez na grade em setembro, quando a Marta ainda estava na agenda (quinta, 18h) */
  c.excecoes = { "2026-09-17|18":{ tipo:"realizada" }, "2026-09-24|18":{ tipo:"remarcada" } };
  c.config.contarDesde = "2026-09-01";
  return c;
}
const HIST = [
  { codigo:"T10", ate:"2026-10-10", ciclos:[{ inicio:"2026-05-04", cobranca:"mensal", valor:400 }],
    sessoes:[{ data:"2026-08-06", n:10, situacao:"realizada" }, { data:"2026-08-17", n:11, situacao:"realizada" },
             { data:"2026-09-03", n:12, situacao:"avisou" }, { data:"2026-09-17", n:13, situacao:"realizada" }] },
  /* o prontuário do Caio dá uma sessão a mais do que a planilha: o extrato diria que ele deve R$ 150 */
  { codigo:"T12", ate:"2026-10-10", ciclos:[{ inicio:"2026-06-01", cobranca:"avulsa", valor:150 }],
    sessoes:[{ data:"2026-06-01", n:1, situacao:"realizada" }, { data:"2026-06-08", n:2, situacao:"realizada" }] }
];

async function abrir(largura){
  const ctx = await nav.newContext({ viewport:{ width:largura, height:844 }, isMobile: largura < 700, hasTouch: largura < 700,
    locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date("2026-10-12T12:00:00-03:00") });
  await ctx.addInitScript(k => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-clinica-cache", k);
    localStorage.setItem("teste-semeado", "1");
  }, JSON.stringify(caderno()));
  const erros = [];
  p.on("pageerror", e => erros.push(e.message));
  p.on("dialog", d => d.accept());
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(srv.url + "clinica.html");
  await p.waitForTimeout(600);
  return { ctx, p, erros };
}

for (const largura of [375, 1280]) {
  test("Quem saiu: dívida da planilha, grade até o encerramento, Sem hora e campo de valor livre (" + largura + ")", async () => {
    const { ctx, p, erros } = await abrir(largura);
    const antesOutros = await p.evaluate(() => dados.pacientes.map(x => JSON.stringify(devidoDe(x))));

    const r = await p.evaluate(h => {
      importarHistoricoFora(h);
      const m = dados.pacientes.find(x => x.codigo === "T10"), c = dados.pacientes.find(x => x.codigo === "T12");
      const antes = { marta:devidoDe(m).exato, caio:devidoDe(c).exato, caioExtrato:extratoDe(c).saldo };
      acertarQuemSaiu({ T10:300 }, "2026-10-09", { T10:{ dia:4, hora:18, freq:"semanal", desde:"2026-09-01" } });
      devidoCache = null;
      const est = d => { const x = estadoCelula(4, 18, deISO(d)); return x.paciente === m ? x.classe : "outro:" + x.classe; };
      return {
        antes, marta:devidoDe(m).exato, caio:devidoDe(c).exato, caioFora:foraDaGrade(c),
        c0903:est("2026-09-03"), c0910:est("2026-09-10"), c0917:est("2026-09-17"), c0924:est("2026-09-24"), c0827:est("2026-08-27"),
        semHora0817:semHoraDoDia(deISO("2026-08-17")).map(x => x.paciente.codigo + ":" + x.situacao),
        semHora0806:semHoraDoDia(deISO("2026-08-06")).map(x => x.paciente.codigo),
        semHora0917:semHoraDoDia(deISO("2026-09-17")).length,
        semHoraCaio:semHoraDoDia(deISO("2026-06-01")).map(x => x.paciente.codigo),
        faltaMarcar:faltaMarcar().filter(s => s.paciente === m).length,
        extratoSessoes:sessoesDoPaciente(m, deISO("2026-09-01"), deISO("2026-09-30")).map(s => chaveData(s.data) + ":" + s.estado)
      };
    }, HIST);
    assert.equal(r.antes.marta, 300, "a carga já nasce com o Valor a Pagar da planilha");
    assert.equal(r.antes.caio, 0, "o Caio não deve nada pela planilha");
    assert.equal(r.antes.caioExtrato, 300, "pelo prontuário seriam R$ 300, que não valem mais para quem saiu");
    assert.equal(r.marta, 300);
    assert.equal(r.caio, 0);
    assert.equal(r.caioFora, true, "quem não teve horário no app continua fora da grade");
    assert.equal(r.c0903, "remarcada", "sem marca na grade, vale o prontuário: avisou");
    assert.equal(r.c0910, "cancelada", "sem marca e sem registro no prontuário: não houve sessão");
    assert.equal(r.c0917, "sessao realizada", "a marca dele na grade continua");
    assert.notEqual(r.c0924.indexOf("outro"), -1, "depois do encerramento (18/09) a hora não é mais dela");
    assert.notEqual(r.c0827.indexOf("outro"), -1, "antes do horário conhecido (01/09) a grade não inventa sessão");
    assert.deepEqual(r.semHora0817, ["T10:realizada"], "a sessão de agosto, sem hora, vai para a linha Sem hora");
    assert.deepEqual(r.semHora0806, ["T10"]);
    assert.equal(r.semHora0917, 0, "a de setembro já está na grade, não repete");
    assert.deepEqual(r.semHoraCaio, ["T12"]);
    assert.equal(r.faltaMarcar, 0, "nada dela fica em Falta marcar: o prontuário responde");
    assert.deepEqual(r.extratoSessoes, ["2026-09-03:remarcada", "2026-09-10:cancelada", "2026-09-17:realizada"]);

    const outros = await p.evaluate(() => { devidoCache = null; return dados.pacientes.filter(x => !/^T1[02]$/.test(x.codigo)).map(x => JSON.stringify(devidoDe(x))); });
    assert.deepEqual(outros, antesOutros, "quem está na agenda não muda");

    /* a grade da semana de 17/08 mostra a linha Sem hora; a de 14/09 mostra a Marta na quinta 18h */
    await p.evaluate(() => { mostrarView("semana"); semana = inicioSemana(deISO("2026-08-17")); renderSemana(); });
    assert.equal(await p.locator("#grade .hour.sh").count(), 1);
    assert.match(await p.locator("#grade .cell-sh button").first().textContent(), /Marta/);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), largura, "nada rola de lado");
    await p.evaluate(() => { semana = inicioSemana(deISO("2026-09-14")); renderSemana(); });
    assert.equal(await p.locator("#grade .hour.sh").count(), 0, "semana sem sessão antiga não ganha a linha");
    assert.match(await p.locator('#grade .cell[data-data="2026-09-17"][data-hora="18"]').textContent(), /Marta/);

    /* a ficha: campo vazio, atalho com a dívida, valor digitado sobrevive à ficha refeita pelo Drive */
    await p.evaluate(() => abrirFicha(dados.pacientes.find(x => x.codigo === "T10"), null, "pagamento"));
    await p.waitForTimeout(150);
    assert.equal(await p.inputValue("#fr-valor"), "");
    assert.match(await p.textContent("#fi-chips"), /Tudo o que deve · R\$ 300/);
    assert.match(await p.textContent("#fi-situ"), /Deve R\$ 300/);
    await p.fill("#fr-valor", "250");
    await p.evaluate(() => reabrirFicha());
    await p.waitForTimeout(150);
    assert.equal(await p.inputValue("#fr-valor"), "250", "o valor digitado não volta para o do ciclo");
    assert.match(await p.textContent("#fr-previa"), /continua devendo R\$ 50/);
    await p.fill("#fr-valor", "300");
    await p.click("#fr-registrar");
    await p.waitForTimeout(150);
    assert.match(await p.textContent("#fi-situ"), /Nada a pagar, pela planilha/);
    assert.equal(await p.inputValue("#fr-valor"), "");
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), largura);
    await p.click("#fi-fechar");

    /* ler a planilha de novo renova o valor da planilha para quem saiu */
    const releitura = await p.evaluate(() => {
      const m = dados.pacientes.find(x => x.codigo === "T10");
      const l = { pacientes:dados.pacientes.filter(x => !encerradoHoje(x)).map(x => Object.assign({}, x, { linhas:[] })),
        arquivados:[{ codigo:"T10", nome:"Marta Teste Domingues", status:"Inativo.", fim:"2026-09-18", aPagar:0, linhas:[] },
                    { codigo:"T12", nome:"Caio Teste Ribeiro", status:"Inativo.", fim:"2026-07-20", aPagar:0, linhas:[] }],
        blocos:dados.blocos, avisos:[], baseData:"2026-10-12" };
      aplicarLeitura(l);
      devidoCache = null;
      const m2 = dados.pacientes.find(x => x.codigo === "T10");
      return { mesmaFicha:m2 && m2.id === m.id, deve:m2 && m2.devePlanilha, exato:m2 && devidoDe(m2).exato, hora:m2 && m2.hora };
    });
    assert.equal(releitura.mesmaFicha, true);
    assert.deepEqual(releitura.deve, { valor:0, data:"2026-10-12" });
    assert.equal(releitura.exato, 0);
    assert.equal(releitura.hora, 18, "o horário de setembro continua");
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}
