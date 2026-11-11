"use strict";
// Conversa com o repositório privado de dados pela API do GitHub (Contents). Só duas operações:
// ler a foto que o PC publica (sempre de um mesmo commit, para os arquivos baterem entre si) e
// criar um arquivo novo em fila/ para cada pedido. O celular nunca altera nem apaga arquivo existente.
const Nuvem = (() => {
  const CHAVE = "organizador.nuvem.chave";      // token fine-grained deste aparelho
  const SAIDA = "organizador.nuvem.saida";      // pedidos ainda não enviados (sem rede, por exemplo)
  const FOTO = "organizador.nuvem.foto";        // última leitura, para abrir rápido e sem rede
  const ARQUIVOS = ["rotinas", "previstas", "registros", "tarefas", "lembretes", "atividades", "listas", "atualizado", "noticias",
                    "agenda", "economia", "mercado", "mercado_diario"];
  const OPCIONAIS = new Set(["noticias", "agenda", "economia", "mercado", "mercado_diario"]);     // podem faltar num commit antigo do PC: viram null, sem erro
  // Nos testes, um GitHub de mentira na própria máquina (só vale em localhost)
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  const API = (local && localStorage.getItem("organizador.nuvem.api")) || "https://api.github.com";
  const REPO = () => `/repos/${CONFIG.dono}/${CONFIG.repo}`;

  const lerLocal = (chave, padrao) => { try { return JSON.parse(localStorage.getItem(chave)) ?? padrao; } catch { return padrao; } };
  const gravarLocal = (chave, valor) => { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* cheio ou bloqueado */ } };

  const token = () => localStorage.getItem(CHAVE);

  class ErroNuvem extends Error {
    constructor(status, mensagem) { super(mensagem); this.status = status; }
  }

  async function pedir(caminho, opcoes = {}, chave = token()) {
    const resposta = await fetch(API + caminho, {
      ...opcoes, cache: "no-store",
      headers: { Authorization: `Bearer ${chave}`, Accept: "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28", ...(opcoes.headers || {}) },
    });
    if (!resposta.ok) throw new ErroNuvem(resposta.status, `GitHub respondeu ${resposta.status}`);
    return resposta.status === 204 ? null : resposta.json();
  }

  // base64 da API <-> texto UTF-8
  function deBase64(b64) {
    const bin = atob(b64.replace(/\s/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }
  function paraBase64(texto) {
    const bytes = new TextEncoder().encode(texto);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  async function lerArquivo(caminho, ref) {
    const r = await pedir(`${REPO()}/contents/${caminho}?ref=${ref}`);
    return JSON.parse(deBase64(r.content));
  }

  let ultimoCommit = null;

  // {dados, fila, commit} ou null se nada mudou desde a última leitura
  async function ler(forcar = false) {
    let ref;
    try {
      ref = (await pedir(`${REPO()}/git/ref/heads/${CONFIG.ramo}`)).object.sha;
    } catch (e) {
      if (e.status === 404 || e.status === 409) throw new ErroNuvem(e.status, "O repositório de dados ainda está vazio: abra o Organizador no PC para ele publicar a primeira foto.");
      throw e;
    }
    if (!forcar && ref === ultimoCommit) return null;
    const lidos = await Promise.all(ARQUIVOS.map(n => lerArquivo(`${n}.json`, ref).catch(e => {
      if (OPCIONAIS.has(n) && e.status === 404) return null;
      throw e;
    })));
    const dados = Object.fromEntries(ARQUIVOS.map((n, i) => [n, lidos[i]]));
    let fila = [];
    try {
      const itens = await pedir(`${REPO()}/contents/fila?ref=${ref}`);
      fila = await Promise.all(itens.filter(i => i.name.endsWith(".json")).map(i => lerArquivo(i.path, ref)));
    } catch (e) {
      if (e.status !== 404) throw e;  // sem pasta fila = nenhum pedido esperando o PC
    }
    ultimoCommit = ref;
    const foto = { dados, fila, commit: ref };
    gravarLocal(FOTO, foto);
    return foto;
  }

  const fotoGuardada = () => lerLocal(FOTO, null);
  const saida = () => lerLocal(SAIDA, []);

  // Guarda o pedido na saída (na hora) e tenta enviar
  function pedirMudanca(op) {
    gravarLocal(SAIDA, [...saida(), op]);
    return enviarPendentes();
  }

  let enviando = null;
  function enviarPendentes() {
    // Um envio por vez: dois toques rápidos não mandam o mesmo pedido duas vezes
    enviando = enviando || (async () => {
      try {
        for (const op of saida()) {
          const corpo = { message: `Celular: ${op.tipo}`, content: paraBase64(JSON.stringify(op, null, 1) + "\n"),
                          branch: CONFIG.ramo };
          try {
            await pedir(`${REPO()}/contents/fila/${op.id}.json`, { method: "PUT", body: JSON.stringify(corpo),
                                                                   headers: { "Content-Type": "application/json" } });
          } catch (e) {
            if (e.status !== 422) throw e;  // 422 = o arquivo já existe: esse pedido já tinha ido
          }
          gravarLocal(SAIDA, saida().filter(o => o.id !== op.id));
        }
      } finally {
        enviando = null;
      }
    })();
    return enviando;
  }

  async function entrar(chave) {
    chave = chave.trim();
    try {
      await pedir(REPO(), {}, chave);  // a chave tem que abrir o repositório de dados
    } catch (e) {
      if (e.status === 401) throw new ErroNuvem(401, "Chave inválida ou vencida.");
      if (e.status === 404 || e.status === 403) throw new ErroNuvem(e.status, `A chave não dá acesso a ${CONFIG.dono}/${CONFIG.repo}. Confira se esse repositório foi escolhido na chave.`);
      throw e;
    }
    localStorage.setItem(CHAVE, chave);
  }

  // Sai desta máquina: apaga a chave e tudo o que ficou guardado no navegador
  function sair() {
    for (const k of Object.keys(localStorage)) if (k.startsWith("organizador.")) localStorage.removeItem(k);
    ultimoCommit = null;
  }

  return { token, ler, fotoGuardada, saida, pedirMudanca, enviarPendentes, entrar, sair, ErroNuvem,
           enviandoAgora: () => Boolean(enviando) };
})();
