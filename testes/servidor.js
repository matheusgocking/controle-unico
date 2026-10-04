/* Servidor de arquivos para os testes: serve a pasta do app em http://127.0.0.1:<porta>/,
   como o GitHub Pages serve no ar. Só para os testes; o app em si não usa nada daqui. */
const http = require("http"), fs = require("fs"), path = require("path");
const RAIZ = path.join(__dirname, "..");
const TIPOS = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8",
  ".json":"application/json", ".png":"image/png", ".webmanifest":"application/manifest+json", ".svg":"image/svg+xml" };

function iniciar(){
  return new Promise(ok => {
    const s = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const arq = path.join(RAIZ, p);
      if (!arq.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
      fs.readFile(arq, (e, dados) => {
        if (e) { res.writeHead(404); return res.end("não achei"); }
        res.writeHead(200, { "Content-Type": TIPOS[path.extname(arq)] || "application/octet-stream" });
        res.end(dados);
      });
    });
    s.listen(0, "127.0.0.1", () => ok({ url: "http://127.0.0.1:" + s.address().port + "/", fechar: () => s.close() }));
  });
}
module.exports = { iniciar };
