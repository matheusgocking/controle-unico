/* Cópias da semana: só as últimas 12 semanas (09/10/2026).
   Tudo num Drive de mentira (drive-falso.js), nunca no Drive de verdade. Confere que a limpeza
   só manda para a lixeira cópias da semana do próprio caderno mais antigas que 12 semanas, depois
   de a cópia nova estar gravada, e que nunca toca no caderno, nas cópias "antes de separar" ou em
   outro arquivo. */
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
/* a segunda-feira de uma data, e n semanas antes, do jeito que o app conta */
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
function segunda(d){ const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; }
const semanasAntes = (s, n) => { const [a, m, d] = s.split("-").map(Number); return iso(new Date(a, m - 1, d - 7 * n)); };
const nomeCopia = (c, s) => `Controle Único - ${c} - semana de ${s}.json`;

async function aparelho(drive){
  const ctx = await nav.newContext({ viewport:{ width:1280, height:900 }, locale:"pt-BR", timezoneId:"America/Sao_Paulo" });
  await ctx.route(/googleapis\.com/, r => drive.atender(r));
  await ctx.route(/fonts\.gstatic\.com|accounts\.google\.com/, r => r.abort());
  await ctx.addInitScript(([d, c]) => {
    if (localStorage.getItem("teste-semeado")) return;
    localStorage.setItem("controle-unico-token", JSON.stringify({ t:"chave-de-teste", e:Date.now() + 3600000 }));
    localStorage.setItem("controle-unico-dinheiro-cache", d);
    localStorage.setItem("controle-unico-casa-cache", c);
    localStorage.setItem("teste-semeado", "1");
  }, [JSON.stringify(D.dinheiro), JSON.stringify(D.casa)]);
  const pagina = await ctx.newPage();
  const erros = [];
  pagina.on("pageerror", e => erros.push(e.message));
  pagina.on("dialog", d => d.accept());
  await pagina.goto(srv.url + "index.html");
  const f = () => pagina.frames().find(x => x.url().includes("app.html"));
  await ate(async () => f() && await f().evaluate(() => typeof Nuvem !== "undefined").catch(() => false));
  return { ctx, pagina, f, erros };
}

/* ---------- a escolha, sem Drive ---------- */
test("Escolha das cópias: só as do caderno, mais antigas que 12 semanas, e nada na dúvida", async () => {
  const ctx = await nav.newContext();
  const p = await ctx.newPage();
  await p.goto(srv.url + "app.html").catch(() => {});
  await ate(() => p.evaluate(() => typeof Nuvem !== "undefined"));
  const r = await p.evaluate(() => {
    const S = "2026-10-05", P = "pasta";
    const semanas = []; for (let n = 0; n < 20; n++){ const d = new Date(2026, 9, 5 - 7 * n); semanas.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")); }
    const cp = (id, nome, pais = [P], extra = {}) => Object.assign({ id, name:nome, mimeType:"application/json", parents:pais, trashed:false }, extra);
    const din = semanas.map((s, i) => cp("d" + i, "Controle Único - dinheiro - semana de " + s + ".json"));
    const outros = [
      cp("casa", "Controle Único - casa - semana de 2026-05-04.json"),                       // outro caderno
      cp("sep", "Controle Único - dinheiro - antes de separar 2026-05-04 23-13.json"),       // cópia da separação
      cp("viva", "Controle Único - dinheiro.json"),                                          // o caderno
      cp("fora", "Controle Único - dinheiro - semana de 2026-05-04.json", ["outra-pasta"]),  // fora da pasta
      cp("parecido", "Controle Único - dinheiro - semana de 2026-05-04 (1).json"),           // nome diferente
    ];
    const ids = l => l.map(c => c.id).sort();
    const escolha = (arqs, novo = "d0", s = S) => ids(Nuvem.copiasParaLimpar("Controle Único - dinheiro.json", s, P, novo, arqs));
    return {
      normal: escolha(din.concat(outros)),
      semNova: escolha(din.concat(outros), "nao-existe"),
      novaDeOutraSemana: escolha(din, "d3"),
      futuro: escolha(din.concat([cp("fut", "Controle Único - dinheiro - semana de 2026-10-12.json")])),
      naoSegunda: escolha(din.concat([cp("ter", "Controle Único - dinheiro - semana de 2026-05-05.json")])),
      // aparelho que ficou meses sem abrir: só 5 cópias, todas antigas menos a nova. As 12 mais novas ficam.
      poucas: escolha([din[0], din[14], din[15], din[16], din[17]]),
      // 13 semanas com cópia, mas com buraco: a 13ª mais nova sai mesmo assim só se for antiga
      clinica: ids(Nuvem.copiasParaLimpar("Controle Único - clínica.json", S, P, "c0",
        [cp("c0", "Controle Único - clínica - semana de 2026-10-05.json"), cp("c1", "Controle Único - clínica - semana de 2026-01-05.json"),
         cp("dz", "Controle Único - dinheiro - semana de 2026-01-05.json")]))
    };
  });
  // d0 é esta semana; d1..d11 são as 11 anteriores (12 no total); d12..d19 vão para a lixeira
  assert.deepEqual(r.normal, ["d12","d13","d14","d15","d16","d17","d18","d19"]);
  assert.deepEqual(r.semNova, [], "sem a cópia nova na lista, não limpa nada");
  assert.deepEqual(r.novaDeOutraSemana, [], "a cópia nova tem de ser desta semana");
  assert.deepEqual(r.futuro, [], "data depois desta semana: na dúvida, nada");
  assert.deepEqual(r.naoSegunda, [], "data que não é segunda: na dúvida, nada");
  assert.deepEqual(r.poucas, [], "as 12 mais novas ficam sempre");
  assert.deepEqual(r.clinica, [], "com só 2 cópias, nada sai; e a do dinheiro nem é olhada");
  await ctx.close();
});

/* ---------- de ponta a ponta, com o Drive de mentira ---------- */
function driveComCopias(){
  const drive = criarDrive();
  const viva = drive.novo({ name:"Controle Único - dinheiro.json" }, JSON.stringify(D.dinheiro));
  const casa = drive.novo({ name:"Controle Único - casa.json" }, JSON.stringify(D.casa));
  const pasta = drive.novo({ name:"Controle Único - cópias", mimeType:"application/vnd.google-apps.folder" }, "");
  const S = iso(segunda(new Date()));
  const antigas = {}, recentes = {};
  for (let n = 1; n <= 16; n++){   // semanas passadas, sem a desta
    const s = semanasAntes(S, n);
    const a = drive.novo({ name:nomeCopia("dinheiro", s), parents:[pasta.id] }, JSON.stringify(D.dinheiro));
    (n >= 12 ? antigas : recentes)[a.id] = a.name;
  }
  const intocaveis = [viva, casa, pasta,
    drive.novo({ name:nomeCopia("casa", semanasAntes(S, 20)), parents:[pasta.id] }, JSON.stringify(D.casa)),   // a da casa só sai quando a casa grava a dela
    drive.novo({ name:"Controle Único - casa - antes de separar 2026-10-06 23-13.json", parents:[pasta.id] }, "{}"),
    drive.novo({ name:"Controle Único - dinheiro - antes de separar 2026-10-06 23-13.json", parents:[pasta.id] }, "{}"),
    drive.novo({ name:nomeCopia("dinheiro", semanasAntes(S, 30)) }, "{}")   // fora da pasta das cópias
  ].map(a => a.id);
  return { drive, pasta, S, antigas, recentes, intocaveis };
}

test("Depois da cópia nova, as do dinheiro com mais de 12 semanas vão para a lixeira e o resto fica", async () => {
  const { drive, pasta, S, antigas, recentes, intocaveis } = driveComCopias();
  const A = await aparelho(drive);
  await A.f().evaluate(() => { livro.matheus.lancamentos.push({ id:"x1", data:"2026-10-04", tipo:"Despesa", descricao:"Teste", categoria:"Mercado", forma:"PIX", valor:5 }); salvar("matheus"); });
  assert.ok(await ate(() => drive.nomes().includes(nomeCopia("dinheiro", S))), "fez a cópia desta semana");
  assert.ok(await ate(() => Object.keys(antigas).every(id => drive.arquivos[id].trashed)), "as antigas foram para a lixeira");
  await espera(1500);
  // foram para a lixeira, não sumiram
  for (const id of Object.keys(antigas)) assert.ok(drive.arquivos[id], "a cópia continua na lixeira do Drive");
  for (const id of Object.keys(recentes)) assert.equal(drive.arquivos[id].trashed, false, "ficou: " + recentes[id]);
  for (const id of intocaveis) assert.equal(drive.arquivos[id].trashed, false, "não podia mexer: " + drive.arquivos[id].name);
  const nova = Object.values(drive.arquivos).filter(a => a.name === nomeCopia("dinheiro", S));
  assert.equal(nova.length, 1); assert.equal(nova[0].trashed, false); assert.deepEqual(nova[0].parents, [pasta.id]);
  // 11 semanas passadas + esta = 12 cópias do dinheiro na pasta
  assert.equal(Object.values(drive.arquivos).filter(a => !a.trashed && a.parents.includes(pasta.id) && /dinheiro - semana de/.test(a.name)).length, 12);
  // o caderno continua igual ao que o app gravou
  assert.ok(drive.ler("Controle Único - dinheiro.json").lancamentos.some(l => l.id === "x1"));
  // o pé da página diz o que foi limpo
  const pe = await A.f().evaluate(() => ({ texto:document.getElementById("copiasLimpas").textContent, itens:[...document.querySelectorAll("#copiasLimpas li")].map(li => li.textContent) }));
  assert.match(pe.texto, /últimas 12 semanas/);
  assert.match(pe.texto, /5 cópias antigas foram para a lixeira do Drive/);
  assert.deepEqual(pe.itens.sort(), Object.values(antigas).sort());
  assert.deepEqual(A.erros, []);
  await A.ctx.close();
});

test("Se a cópia nova não for gravada, nada é apagado", async () => {
  const { drive, S, antigas } = driveComCopias();
  const atender = drive.atender;
  drive.atender = async route => {   // o Drive recusa criar a cópia desta semana
    const req = route.request();
    if (req.method() === "POST" && req.url().includes("/upload/drive/v3/files") && (req.postData() || "").includes("semana de"))
      return route.fulfill({ status:500, contentType:"application/json", body:"{}" });
    return atender(route);
  };
  const A = await aparelho(drive);
  await A.f().evaluate(() => { livro.matheus.lancamentos.push({ id:"x2", data:"2026-10-04", tipo:"Despesa", descricao:"Teste", categoria:"Mercado", forma:"PIX", valor:6 }); salvar("matheus"); });
  assert.ok(await ate(() => (drive.ler("Controle Único - dinheiro.json") || { lancamentos:[] }).lancamentos.some(l => l.id === "x2")), "o caderno foi salvo");
  await espera(3000);
  assert.ok(!drive.nomes().includes(nomeCopia("dinheiro", S)));
  for (const id of Object.keys(antigas)) assert.equal(drive.arquivos[id].trashed, false, "não podia apagar sem cópia nova");
  const pe = await A.f().evaluate(() => document.getElementById("copiasLimpas").textContent);
  assert.doesNotMatch(pe, /lixeira/);
  await A.ctx.close();
});

test("Se outro aparelho já fez a cópia desta semana, este não apaga nada", async () => {
  const { drive, pasta, S, antigas } = driveComCopias();
  drive.novo({ name:nomeCopia("dinheiro", S), parents:[pasta.id] }, JSON.stringify(D.dinheiro));
  const A = await aparelho(drive);
  await A.f().evaluate(() => { livro.matheus.lancamentos.push({ id:"x3", data:"2026-10-04", tipo:"Despesa", descricao:"Teste", categoria:"Mercado", forma:"PIX", valor:7 }); salvar("matheus"); });
  assert.ok(await ate(() => A.f().evaluate(() => !!localStorage.getItem("controle-unico-matheus-copia") || !!localStorage.getItem("controle-unico-dinheiro-copia"))), "o app viu a cópia já feita");
  await espera(1500);
  for (const id of Object.keys(antigas)) assert.equal(drive.arquivos[id].trashed, false);
  await A.ctx.close();
});
