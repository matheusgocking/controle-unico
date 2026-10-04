/* Um Google Drive de mentira, só na memória, para testar a sincronização entre dois aparelhos
   sem conta de verdade. Responde às poucas chamadas que nuvem.js faz. */
function criarDrive(){
  const arquivos = {};   // id -> { id, name, mimeType, parents, conteudo, modifiedTime, trashed }
  let seq = 0, relogio = Date.parse("2026-10-04T15:00:00Z");
  const agora = () => new Date(relogio += 1000).toISOString();
  const novo = (meta, conteudo) => {
    const id = "arq" + (++seq);
    arquivos[id] = { id, name:meta.name, mimeType:meta.mimeType || "application/json", parents:meta.parents || [], conteudo:conteudo || "", modifiedTime:agora(), trashed:false };
    return arquivos[id];
  };
  const meta = a => ({ id:a.id, modifiedTime:a.modifiedTime, trashed:a.trashed, name:a.name });
  const json = (route, corpo, status = 200) => route.fulfill({ status, contentType:"application/json", body:JSON.stringify(corpo) });

  /* a busca "name='X' and mimeType='Y' and 'P' in parents and trashed=false" */
  function buscar(q){
    const nome = (q.match(/name='((?:\\'|[^'])*)'/) || [])[1];
    const tipo = (q.match(/mimeType='([^']*)'/) || [])[1];
    const pai = (q.match(/'([^']*)' in parents/) || [])[1];
    return Object.values(arquivos).filter(a => !a.trashed && (!nome || a.name === nome.replace(/\\'/g, "'")) && (!tipo || a.mimeType === tipo) && (!pai || a.parents.includes(pai)));
  }

  async function atender(route){
    const req = route.request(), u = new URL(req.url()), m = req.method();
    if (u.hostname === "oauth2.googleapis.com") return json(route, {});
    if (u.pathname === "/drive/v3/about") return json(route, { user:{ emailAddress:"teste@exemplo.com" } });
    let r;
    if (m === "GET" && u.pathname === "/drive/v3/files") {
      const q = u.searchParams.get("q") || "";
      return json(route, { files: buscar(q).sort((a, b) => a.id.localeCompare(b.id)).map(meta) });
    }
    if ((r = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/)) && m === "GET") {
      const a = arquivos[r[1]]; if (!a) return json(route, { error:"não achei" }, 404);
      if (u.searchParams.get("alt") === "media") return route.fulfill({ status:200, contentType:"application/json", body:a.conteudo });
      return json(route, meta(a));
    }
    if (u.pathname === "/drive/v3/files" && m === "POST") {   // pasta
      return json(route, meta(novo(JSON.parse(req.postData()), "")));
    }
    if (u.pathname === "/upload/drive/v3/files" && m === "POST") {   // multipart: metadados e conteúdo
      const corpo = req.postData(), limite = (req.headers()["content-type"].match(/boundary=(.*)$/) || [])[1];
      const partes = corpo.split("--" + limite).slice(1, -1).map(p => p.split("\r\n\r\n").slice(1).join("\r\n\r\n").replace(/\r\n$/, ""));
      return json(route, meta(novo(JSON.parse(partes[0]), partes[1])));
    }
    if ((r = u.pathname.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/)) && m === "PATCH") {
      const a = arquivos[r[1]]; if (!a) return json(route, { error:"não achei" }, 404);
      a.conteudo = req.postData(); a.modifiedTime = agora();
      return json(route, meta(a));
    }
    if ((r = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)\/permissions$/))) return json(route, { id:"perm" });
    return json(route, { error:"chamada não prevista no Drive falso: " + m + " " + u.pathname }, 500);
  }

  return {
    arquivos, novo, atender,
    ler: nome => { const a = Object.values(arquivos).find(x => x.name === nome && !x.trashed); return a ? JSON.parse(a.conteudo) : null; },
    nomes: () => Object.values(arquivos).filter(a => !a.trashed).map(a => a.name)
  };
}
module.exports = { criarDrive };
