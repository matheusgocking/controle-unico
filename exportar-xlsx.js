// Gera um arquivo .xlsx dentro do navegador, sem biblioteca nenhuma.
// Testado em 24/09/2026: o Excel abre o arquivo sem aviso, com duas abas,
// acentos, & e <> preservados e numeros entrando como numero (Double).
//
// Uso:
//   const bytes = xlsx([{ nome: "Lançamentos", linhas: [[...], [...]] }]);
//   baixar(bytes, "Controle 2026-09.xlsx");
//
// Limite conhecido: datas saem como texto (ISO, AAAA-MM-DD), porque o arquivo
// nao tem folha de estilos. Quem precisar de data real converte no destino.

const CRC_TAB = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TAB[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ZIP no modo "stored" (sem compressao). Simples e aceito pelo Excel.
function zip(files) {
  const enc = new TextEncoder();
  const locais = [], centrais = [];
  let off = 0;

  for (const f of files) {
    const nome = enc.encode(f.nome);
    const dados = typeof f.conteudo === "string" ? enc.encode(f.conteudo) : f.conteudo;
    const crc = crc32(dados);

    const lh = new Uint8Array(30 + nome.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(12, 0x2821, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dados.length, true);
    lv.setUint32(22, dados.length, true);
    lv.setUint16(26, nome.length, true);
    lh.set(nome, 30);

    const ch = new Uint8Array(46 + nome.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(14, 0x2821, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dados.length, true);
    cv.setUint32(24, dados.length, true);
    cv.setUint16(28, nome.length, true);
    cv.setUint32(42, off, true);
    ch.set(nome, 46);

    locais.push(lh, dados);
    centrais.push(ch);
    off += lh.length + dados.length;
  }

  const tamCentral = centrais.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, tamCentral, true);
  ev.setUint32(16, off, true);

  const partes = [...locais, ...centrais, eocd];
  const total = partes.reduce((s, p) => s + p.length, 0);
  const saida = new Uint8Array(total);
  let p = 0;
  for (const parte of partes) { saida.set(parte, p); p += parte.length; }
  return saida;
}

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const col = n => { let s = ""; n++; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - 1 - r) / 26; } return s; };

function folha(linhas) {
  const rows = linhas.map((linha, i) => {
    const cels = linha.map((v, j) => {
      const ref = col(j) + (i + 1);
      if (typeof v === "number" && isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join("");
    return `<row r="${i + 1}">${cels}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
}

// abas: [{ nome: "Lançamentos", linhas: [["Data","Valor"], ["2026-09-01", 21.9]] }]
function xlsx(abas) {
  const arquivos = [];
  const tipos = abas.map((_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");

  arquivos.push({ nome: "[Content_Types].xml", conteudo:
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${tipos}</Types>` });

  arquivos.push({ nome: "_rels/.rels", conteudo:
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` });

  const sheets = abas.map((a, i) => `<sheet name="${esc(a.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  arquivos.push({ nome: "xl/workbook.xml", conteudo:
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>` });

  const rels = abas.map((_, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("");
  arquivos.push({ nome: "xl/_rels/workbook.xml.rels", conteudo:
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>` });

  abas.forEach((a, i) => arquivos.push({ nome: `xl/worksheets/sheet${i + 1}.xml`, conteudo: folha(a.linhas) }));
  return zip(arquivos);
}

function baixar(bytes, nomeArquivo) {
  const url = URL.createObjectURL(new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}
