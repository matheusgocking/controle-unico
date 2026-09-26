// Le um arquivo .xlsx dentro do navegador, sem biblioteca nenhuma.
// Par do exportar-xlsx.js: serve para restaurar um caderno a partir da planilha.
// Aceita o arquivo como o app gera (ZIP sem compressao) e tambem depois de
// o Excel salvar por cima (ZIP comprimido, textos em sharedStrings.xml).
//
// Uso:
//   const abas = await lerXlsx(await arquivo.arrayBuffer());
//   // [{ nome: "Lançamentos", linhas: [["Data","Valor"], ["2026-09-01", 21.9]] }]

async function descomprimir(bytes) {
  const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

// Le o indice central do ZIP e devolve { "caminho/arquivo.xml": Uint8Array }.
async function unzip(buffer) {
  const b = new Uint8Array(buffer);
  const v = new DataView(buffer);
  let fim = -1;
  for (let i = b.length - 22; i >= 0; i--) {
    if (v.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error("O arquivo não é uma planilha .xlsx válida.");

  const total = v.getUint16(fim + 10, true);
  let p = v.getUint32(fim + 16, true);
  const dec = new TextDecoder();
  const arquivos = {};

  for (let n = 0; n < total; n++) {
    const metodo = v.getUint16(p + 10, true);
    const tamComp = v.getUint32(p + 20, true);
    const tamNome = v.getUint16(p + 28, true);
    const tamExtra = v.getUint16(p + 30, true);
    const tamComent = v.getUint16(p + 32, true);
    const offLocal = v.getUint32(p + 42, true);
    const nome = dec.decode(b.subarray(p + 46, p + 46 + tamNome));

    const inicio = offLocal + 30 + v.getUint16(offLocal + 26, true) + v.getUint16(offLocal + 28, true);
    const dados = b.subarray(inicio, inicio + tamComp);
    if (metodo === 0) arquivos[nome] = dados;
    else if (metodo === 8) arquivos[nome] = await descomprimir(dados);
    else throw new Error(`Compressão ${metodo} não suportada.`);

    p += 46 + tamNome + tamExtra + tamComent;
  }
  return arquivos;
}

// "AB12" -> 27 (indice da coluna, comecando em 0)
function indiceColuna(ref) {
  const letras = ref.replace(/[0-9]/g, "");
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

async function lerXlsx(buffer) {
  const arquivos = await unzip(buffer);
  const dec = new TextDecoder();
  const xml = caminho => {
    const dados = arquivos[caminho];
    return dados ? new DOMParser().parseFromString(dec.decode(dados), "application/xml") : null;
  };
  const porNome = (raiz, nome) => [...raiz.getElementsByTagNameNS("*", nome)];

  const compartilhados = [];
  const ss = xml("xl/sharedStrings.xml");
  if (ss) for (const si of porNome(ss, "si")) compartilhados.push(porNome(si, "t").map(t => t.textContent).join(""));

  const destinos = {};
  for (const r of porNome(xml("xl/_rels/workbook.xml.rels"), "Relationship")) {
    const alvo = r.getAttribute("Target").replace(/^\/?xl\//, "").replace(/^\//, "");
    destinos[r.getAttribute("Id")] = "xl/" + alvo;
  }

  const abas = [];
  for (const s of porNome(xml("xl/workbook.xml"), "sheet")) {
    const id = s.getAttribute("r:id") || s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const folha = xml(destinos[id]);
    const linhas = [];
    for (const row of porNome(folha, "row")) {
      const i = Number(row.getAttribute("r")) - 1;
      const linha = [];
      for (const c of porNome(row, "c")) {
        const j = indiceColuna(c.getAttribute("r"));
        const tipo = c.getAttribute("t");
        const vEl = porNome(c, "v")[0];
        let valor;
        if (tipo === "inlineStr") valor = porNome(c, "t").map(t => t.textContent).join("");
        else if (tipo === "s") valor = compartilhados[Number(vEl.textContent)];
        else if (tipo === "str") valor = vEl ? vEl.textContent : "";
        else if (tipo === "b") valor = vEl ? vEl.textContent === "1" : false;
        else valor = vEl ? Number(vEl.textContent) : "";
        linha[j] = valor;
      }
      for (let k = 0; k < linha.length; k++) if (linha[k] === undefined) linha[k] = "";
      linhas[i] = linha;
    }
    for (let k = 0; k < linhas.length; k++) if (!linhas[k]) linhas[k] = [];
    abas.push({ nome: s.getAttribute("name"), linhas });
  }
  return abas;
}
