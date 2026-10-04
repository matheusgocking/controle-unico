/* Categorias: as trocas de nome antigas rodam uma vez só por caderno. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Categorias = require("../categorias.js");

test("Casa: a troca de nomes roda uma vez e marca o caderno", () => {
  const velho = { lancamentos: [{ id:"c1", categoria:"Mercado", descricao:"Farmácia do bairro" }, { id:"c2", categoria:"Fumo", descricao:"-" }] };
  const novo = Categorias.cadernoCasa(velho);
  assert.equal(novo.categorias, 2);
  assert.equal(novo.lancamentos[0].categoria, "Farmácia");
  assert.equal(novo.lancamentos[1].categoria, "Tabacaria");
});

test("Casa: depois de marcado, uma escolha feita à mão não muda mais sozinha", () => {
  const marcado = { categorias:2, lancamentos: [{ id:"c1", categoria:"Mercado", descricao:"farmácia e mercado" }] };
  const lido = Categorias.cadernoCasa(marcado);
  assert.equal(lido.lancamentos[0].categoria, "Mercado");
  assert.deepEqual(Categorias.cadernoCasa(lido), lido);
});

test("Dinheiro: aporte e resgate vão sempre para Reserva", () => {
  const d = Categorias.cadernoDinheiro({ categorias:2, lancamentos: [{ id:"l1", tipo:"Resgate", categoria:"Moradia", descricao:"x", valor:10 }], gastosFixos: [] });
  assert.equal(d.lancamentos[0].categoria, "Reserva");
});

test("Dinheiro: caderno já marcado não muda de categoria ao ser lido de novo", () => {
  const d = { categorias:2, lancamentos: [{ id:"l1", tipo:"Despesa", categoria:"Mercado", descricao:"restaurante", forma:"PIX", valor:10 }], gastosFixos: [] };
  const lido = Categorias.cadernoDinheiro(d);
  assert.equal(lido.lancamentos[0].categoria, "Mercado");
  assert.deepEqual(Categorias.cadernoDinheiro(lido), lido);
});
