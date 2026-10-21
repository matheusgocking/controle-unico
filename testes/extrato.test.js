/* Regras do importador do extrato (19/10/2026), só no Node, com extratos inventados no formato do Nubank. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Extrato = require("../extrato.js");

const FATURA = `OFXHEADER:100
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST><DTSTART>20261003000000[-3:BRT]<DTEND>20261019000000[-3:BRT]
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005000000[-3:BRT]<TRNAMT>-45.90<FITID>a1<MEMO>IFOOD *RESTAURANTE TESTE</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261006000000[-3:BRT]<TRNAMT>-120.00<FITID>a2<MEMO>Posto Teste</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261007000000[-3:BRT]<TRNAMT>-30.00<FITID>a3<MEMO>Compra Internacional</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261007000000[-3:BRT]<TRNAMT>-1.05<FITID>a3<MEMO>IOF de "Compra Internacional"</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261008000000[-3:BRT]<TRNAMT>-29.90<FITID>a4<MEMO>Assinatura Fixa</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261009000000[-3:BRT]<TRNAMT>500.00<FITID>a5<MEMO>Pagamento recebido</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261010000000[-3:BRT]<TRNAMT>-80.00<FITID>a6<MEMO>Loja do Arthur</STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;

const CONTA = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST><DTSTART>20261001<DTEND>20261019
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261001<TRNAMT>-1736.66<FITID>c1<MEMO>Pagamento de fatura</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261001<TRNAMT>1736.66<FITID>c2<MEMO>Resgate RDB</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261006<TRNAMT>500.00<FITID>c3<MEMO>Transferência recebida pelo Pix - FULANO - •••.000.000-•• - BANCO</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261012<TRNAMT>75.00<FITID>c4<MEMO>Transferência recebida pelo Pix - OUTRO - •••.111.111-••</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261013<TRNAMT>-200.00<FITID>c5<MEMO>Aplicação RDB</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261014<TRNAMT>-18.50<FITID>c6<MEMO>Compra no débito - Padaria Teste</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test("Fatura: lê as linhas, casa o que ele já lançou, separa fixo, pagamento e Arthur", () => {
  const ex = Extrato.ler(FATURA);
  assert.equal(ex.fonte, "fatura");
  assert.equal(ex.linhas.length, 7);
  /* o IOF repete o FITID da compra, mas a chave é outra */
  assert.notEqual(Extrato.chave(ex.linhas[2]), Extrato.chave(ex.linhas[3]));
  const r = Extrato.classificar(ex, {
    din:[{ id:"m1", data:"2026-10-07", tipo:"Despesa", descricao:"Posto", categoria:"Carro e transporte", valor:120 }],
    casa:[], clinica:[], importados:[], regras:{},
    fixosDoMes: () => [{ descricao:"Assinatura", categoria:"Lazer", dia:8, valor:29.9 }]
  });
  assert.deepEqual(r.jaLancados.map(x => x.linha.fitid), ["a2"]);
  assert.deepEqual(r.novos.map(x => x.linha.fitid), ["a1", "a3", "a3"]);
  assert.equal(r.novos[0].categoria, "iFood");
  assert.equal(r.novos[0].forma, "Crédito");
  assert.deepEqual(r.ignorados.map(x => x.linha.fitid).sort(), ["a4", "a5", "a6"]);
});

test("Fatura importada de novo: nada repete", () => {
  const ex = Extrato.ler(FATURA);
  const r = Extrato.classificar(ex, { importados: ex.linhas.map(Extrato.chave), fixosDoMes: () => [] });
  assert.equal(r.repetidos, 7);
  assert.equal(r.novos.length + r.jaLancados.length + r.ignorados.length, 0);
});

test("Conta: resgate que paga a fatura vai para 30/09, Pix de paciente fica na Clínica, regra aprendida vale", () => {
  const ex = Extrato.ler(CONTA);
  assert.equal(ex.fonte, "conta");
  const r = Extrato.classificar(ex, { clinica:[{ data:"2026-10-05", valor:500 }], fixosDoMes: () => [],
    regras:{ "padaria teste":{ onde:"casa", categoria:"Mercado" } } });
  const resg = r.novos.find(x => x.linha.fitid === "c2");
  assert.equal(resg.tipo, "Resgate");
  assert.equal(resg.data, "2026-09-30");
  assert.match(resg.descricao, /Fatura setembro\/2026 \(no banco, 01\/10\)/);
  assert.equal(r.novos.find(x => x.linha.fitid === "c5").tipo, "Aporte");
  const pad = r.novos.find(x => x.linha.fitid === "c6");
  assert.equal(pad.onde, "casa"); assert.equal(pad.categoria, "Mercado"); assert.equal(pad.forma, "Débito");
  assert.equal(pad.descricao, "Padaria Teste");
  const ign = r.ignorados.map(x => x.linha.fitid).sort();
  assert.deepEqual(ign, ["c1", "c3", "c4"]);
  /* o Pix sem par na Clínica vem como receita sugerida, para ele decidir */
  assert.equal(r.ignorados.find(x => x.linha.fitid === "c4").tipo, "Receita");
  assert.doesNotMatch(r.ignorados.find(x => x.linha.fitid === "c4").descricao, /111/);
});

test("Conta: compra no débito pela NuPay fica com o nome da loja (extrato real de outubro)", () => {
  const l = { memo:"Compra no débito via NuPay - EBW*Meta", valor:-1000 };
  assert.equal(Extrato.descricao(l, "conta"), "EBW*Meta");
  assert.equal(Extrato.sugestaoPorPalavra(Extrato.descricao(l, "conta")), "Clínica: Anúncios");
});

test("Arquivo que não é OFX avisa", () => {
  assert.throws(() => Extrato.ler("data,title,amount"), /não parece um extrato/);
});

test("Conta: a caixinha que acompanha o dinheiro do Arthur fica fora (extrato real de 01 a 18/10/2026)", () => {
  const ex = Extrato.ler(`<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST><DTSTART>20261001<DTEND>20261018
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261003<TRNAMT>132.00<FITID>d1<MEMO>Transferência recebida pelo Pix - ARTHUR TESTE</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261014<TRNAMT>100.00<FITID>d2<MEMO>Transferência recebida pelo Pix - ARTHUR TESTE</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261015<TRNAMT>-132.00<FITID>d3<MEMO>Aplicação RDB</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261015<TRNAMT>-100.00<FITID>d4<MEMO>Aplicação RDB</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261016<TRNAMT>-100.00<FITID>d5<MEMO>Aplicação RDB</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261017<TRNAMT>80.00<FITID>d6<MEMO>Resgate RDB</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261017<TRNAMT>-80.00<FITID>d7<MEMO>Transferência enviada pelo Pix - ARTHUR TESTE</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`);
  const r = Extrato.classificar(ex, {});
  assert.deepEqual(r.ignorados.map(x => x.linha.fitid).sort(), ["d1", "d2", "d3", "d4", "d6", "d7"]);
  /* cada Pix do Arthur cobre uma aplicação só: a segunda de R$ 100 é dele */
  assert.deepEqual(r.novos.map(x => x.linha.fitid), ["d5"]);
  assert.equal(r.novos[0].tipo, "Aporte");
  const ap = r.ignorados.find(x => x.linha.fitid === "d3");
  assert.equal(ap.tipo, "Aporte"); assert.equal(ap.categoria, "Reserva"); assert.match(ap.motivo, /Arthur/);
});
