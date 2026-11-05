"use strict";
// Telas do Organizador no celular. Os dados vêm da foto que o PC publica (nuvem.js); cada ação vira um pedido
// em fila/, que o PC aplica no banco. Enquanto isso, a tela já mostra a foto com os pedidos aplicados por cima.

const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];  // 0 = segunda, como no PC
const DIAS_EXTENSO = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro",
               "novembro", "dezembro"];
const REPETICOES = { nao: "Não repete", diaria: "Todo dia", dias_uteis: "Dias úteis", semanal: "Toda semana",
                     mensal: "Todo mês", anual: "Todo ano" };
const ORDINAIS_FIM = { "-1": "Último", "-2": "Penúltimo", "-3": "Antepenúltimo" };
const COR_PRIORIDADE = { 1: "vermelho", 2: "laranja", 3: "cinza" };

const estado = { foto: null, aba: "hoje", sub: null, guia: "trabalho", cat: null, aberto: null, erro: null, falhaEnvio: false,
                 msgLogin: "", ocupado: false, lendo: false, lerDeNovo: false };

// ---------------------------------------------------------------- datas (sempre no horário do aparelho)
const dois = n => String(n).padStart(2, "0");
const isoData = d => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
const hoje = () => isoData(new Date());
const isoAgora = () => { const d = new Date(); return `${isoData(d)}T${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`; };
const deIso = s => { const [a, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(a, m - 1, d); };
const somarDias = (s, n) => { const d = deIso(s); d.setDate(d.getDate() + n); return isoData(d); };
const ddmm = s => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const ddmmaaaa = s => `${ddmm(s)}/${s.slice(0, 4)}`;
const diaCurto = s => `${DIAS_SEMANA[(deIso(s).getDay() + 6) % 7].toLowerCase()}, ${ddmm(s)}`;
const hhmm = s => (s || "").slice(11, 16);
const novoId = () => isoAgora().replace(/[-:]/g, "") + "-" + Math.random().toString(36).slice(2, 8);

const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const etq = (cor, texto) => `<span class="etq ${cor}">${esc(texto)}</span>`;
const mesmo = (a, b) => String(a) === String(b);

// ---------------------------------------------------------------- foto + pedidos ainda não aplicados pelo PC

function aplicar(d, op) {
  const campos = o => ({ data: o.data, titulo: o.titulo, tema: o.tema || "Outro", impacto: o.impacto || "",
                         descricao: o.descricao || "", evidencia: o.evidencia || "", status: o.status || "concluido" });
  switch (op.tipo) {
    case "rotina_registrar":
    case "rotina_desfazer": {
      d.registros = d.registros.filter(r => !(r.tipo === "rotina" && mesmo(r.ref_id, op.rotina_id) && r.data_ref === op.data));
      if (op.tipo === "rotina_registrar") {
        const rotina = d.rotinas.find(r => mesmo(r.id, op.rotina_id));
        d.registros.push({ tipo: "rotina", ref_id: Number(op.rotina_id), titulo: rotina ? rotina.nome : "", data_ref: op.data,
                           executado_em: op.criado_em, status: op.status, observacao: op.observacao || "", pendente: true });
      }
      break;
    }
    case "tarefa_criar":
      d.tarefas.push({ id: "op:" + op.id, titulo: op.titulo, prazo: op.prazo || null, prioridade: op.prioridade || 2,
                       categoria: op.categoria, descricao: op.descricao || "", status: "aberta", criada_em: op.criado_em,
                       pendente: true });
      break;
    case "tarefa_concluir": {
      const t = d.tarefas.find(x => mesmo(x.id, op.tarefa_id));
      if (t) Object.assign(t, { status: "concluida", concluida_em: op.criado_em, pendente: true });
      if (t) d.registros.push({ tipo: "tarefa", ref_id: t.id, titulo: t.titulo, data_ref: t.prazo || op.criado_em.slice(0, 10),
                                prazo: t.prazo ? `${t.prazo}T23:59:59` : null, executado_em: op.criado_em, status: "feito",
                                observacao: "", pendente: true });
      break;
    }
    case "lembrete_criar":
      d.lembretes.push({ id: "op:" + op.id, texto: op.texto, inicio: null, quando: null, repeticao: "nao",
                         categoria: op.categoria, status: "ativo", criado_em: op.criado_em, pendente: true });
      break;
    case "lembrete_concluir": {
      const l = d.lembretes.find(x => mesmo(x.id, op.lembrete_id));
      if (l) Object.assign(l, { status: "concluido", concluido_em: op.criado_em, pendente: true });
      break;
    }
    case "atividade_salvar": {
      const a = op.atividade_id && d.atividades.find(x => mesmo(x.id, op.atividade_id));
      if (a) Object.assign(a, campos(op), { pendente: true });
      else if (!op.atividade_id) d.atividades.push({ id: "op:" + op.id, ...campos(op), criada_em: op.criado_em, pendente: true });
      break;
    }
  }
}

function visao() {
  if (!estado.foto) return null;
  const d = structuredClone(estado.foto.dados);
  const vistos = new Set();
  const ops = [...estado.foto.fila, ...Nuvem.saida()].filter(op => !vistos.has(op.id) && vistos.add(op.id));
  ops.sort((a, b) => (a.id < b.id ? -1 : 1));
  ops.forEach(op => aplicar(d, op));
  d.esperando = ops.length;
  return d;
}

function rotinasDoDia(d, dia) {
  return (d.previstas.dias[dia] || [])
    .map(id => d.rotinas.find(r => r.id === id)).filter(Boolean)
    .map(r => ({ ...r, registro: d.registros.find(g => g.tipo === "rotina" && g.ref_id === r.id && g.data_ref === dia) }));
}

function pendencias(d, dia) {
  const saida = [];
  let x = somarDias(dia, -d.listas.dias_pendencia);
  if (x < d.previstas.de) x = d.previstas.de;
  for (; x < dia; x = somarDias(x, 1))
    rotinasDoDia(d, x).filter(r => !r.registro).forEach(r => saida.push({ ...r, dia: x }));
  return saida;
}

function frequencia(r) {
  if (r.frequencia === "mensal") {
    const n = r.dia_util || 1;
    return `${n < 0 ? ORDINAIS_FIM[n] : n + "º"} dia útil do mês`;
  }
  if (r.frequencia === "mensal_dia") return `Todo dia ${r.dia_util || 1} do mês`;
  const dias = r.dias.join(",");
  let t = dias === "0,1,2,3,4" ? "Seg a Sex" : dias === "0,1,2,3,4,5,6" ? "Todos os dias" : r.dias.map(i => DIAS_SEMANA[i]).join(", ");
  if (r.se_feriado === "proximo") t += " · se feriado, no próximo dia útil";
  return t;
}

// ---------------------------------------------------------------- pedaços de tela

function selo(d) {
  const naSaida = Nuvem.saida().length;
  if (Nuvem.enviandoAgora()) return `<span class="selo salvando">Salvando…</span>`;
  if (estado.falhaEnvio && naSaida) return `<span class="selo erro">Sem conexão · ${naSaida} para enviar</span>`;
  if (estado.erro) return `<span class="selo erro">Sem conexão</span>`;
  if (d && d.esperando) return `<span class="selo espera">${d.esperando} esperando o PC</span>`;
  return `<span class="selo">☁ Salvo na nuvem</span>`;
}

const topo = (d, esquerda) => `<div class="topo"><span class="apagado pequeno">${esquerda}</span>${selo(d)}</div>`;

const guias = () => `<div class="guias">${[["trabalho", "Trabalho"], ["pessoal", "Pessoal"]].map(([c, n]) =>
  `<button data-guia="${c}" class="${estado.guia === c ? "ativa" : ""}">${n}</button>`).join("")}</div>`;

function opcoes(chave, html) {
  return estado.aberto === chave ? `<div class="opcoes">${html}</div>` : "";
}

function linhaRotina(r, dia, pendencia = false) {
  const reg = r.registro;
  const chave = `r${r.id}_${dia}`;
  let selo_;
  if (!reg) {
    const prazo = `${dia}T${r.horario_limite || "23:59"}:59`;
    selo_ = isoAgora() > prazo ? etq("vermelho", "Atrasada") : etq("laranja", "Pendente");
  } else {
    selo_ = reg.status === "feito" ? etq("verde", `Feito às ${hhmm(reg.executado_em)}${reg.executado_em.slice(0, 10) !== dia ? " de " + ddmm(reg.executado_em) : ""}`)
                                   : etq("cinza", "Pulada");
  }
  const detalhes = [pendencia ? `Referente a ${diaCurto(dia)}` : "", r.categoria === "pessoal" && pendencia ? "Pessoal" : "",
                    r.horario_limite ? `até ${r.horario_limite}` : "", reg && reg.observacao ? `Obs.: ${reg.observacao}` : "",
                    reg && reg.pendente ? "enviando ao PC" : ""].filter(Boolean);
  const circulo = reg
    ? `<button class="circulo ${reg.status === "feito" ? "ok" : "pulada"}" data-acao="rotina-desfazer" data-id="${r.id}" data-dia="${dia}" aria-label="Desfazer">${reg.status === "feito" ? "✓" : "–"}</button>`
    : `<button class="circulo" data-acao="rotina-feita" data-id="${r.id}" data-dia="${dia}" aria-label="Concluir"></button>`;
  const mais = reg
    ? `<button class="botao" data-acao="rotina-desfazer" data-id="${r.id}" data-dia="${dia}">Desfazer</button>`
    : `<button class="botao" data-acao="rotina-pular" data-id="${r.id}" data-dia="${dia}">Pular</button>
       <form data-form="rotina-obs" data-id="${r.id}" data-dia="${dia}" class="rapido">
         <input type="text" name="obs" placeholder="Observação (opcional)">
         <button class="botao principal">Concluir com observação</button></form>`;
  return `<div class="linha ${reg ? "feita" : ""}">${circulo}
    <div class="info"><div class="nome">${esc(r.nome)} ${selo_}</div>
    ${detalhes.length ? `<div class="detalhe">${esc(detalhes.join(" · "))}</div>` : ""}</div>
    <button class="mais-opcoes" data-acao="abrir" data-chave="${chave}" aria-label="Mais opções">⋯</button></div>
    ${opcoes(chave, mais)}`;
}

function linhaTarefa(t) {
  const h = hoje();
  let selos = etq(COR_PRIORIDADE[t.prioridade] || "cinza", { 1: "Alta", 2: "Média", 3: "Baixa" }[t.prioridade] || "Média");
  if (t.status === "aberta" && t.prazo && t.prazo < h) selos += etq("vermelho", `Venceu em ${ddmm(t.prazo)}`);
  else if (t.status === "aberta" && t.prazo === h) selos += etq("laranja", "Vence hoje");
  const detalhes = [t.status === "concluida" ? `Concluída em ${ddmm(t.concluida_em)} às ${hhmm(t.concluida_em)}`
                                             : t.prazo ? `Prazo ${ddmmaaaa(t.prazo)}` : "Sem prazo",
                    t.descricao, t.pendente ? "enviando ao PC" : ""].filter(Boolean);
  const circulo = t.status === "aberta"
    ? `<button class="circulo" data-acao="tarefa-concluir" data-id="${esc(t.id)}" aria-label="Concluir"></button>`
    : `<span class="circulo ok">✓</span>`;
  return `<div class="linha ${t.status === "aberta" ? "" : "feita"}">${circulo}<div class="info">
    <div class="nome">${esc(t.titulo)} ${selos}</div><div class="detalhe">${esc(detalhes.join(" · "))}</div></div></div>`;
}

function quandoLembrete(iso) {
  const dia = iso.slice(0, 10);
  const h = hoje();
  const rotulo = dia === h ? "hoje" : dia === somarDias(h, 1) ? "amanhã" : diaCurto(dia);
  return `${rotulo} às ${hhmm(iso)}`;
}

function linhaLembrete(l) {
  const agora = isoAgora().slice(0, 16);
  let selo_ = "";
  if (l.status === "ativo" && l.quando && l.quando <= agora) {
    const atraso = (new Date() - new Date(l.quando)) / 36e5;
    selo_ = atraso > 1 ? etq("vermelho", "Atrasado") : etq("laranja", "Agora");
  }
  const detalhes = [l.quando ? quandoLembrete(l.quando) : "", l.repeticao !== "nao" ? REPETICOES[l.repeticao].toLowerCase() : "",
                    l.categoria === "pessoal" ? "Pessoal" : "", l.pendente ? "enviando ao PC" : ""].filter(Boolean);
  const circulo = l.status === "ativo"
    ? `<button class="circulo" data-acao="lembrete-concluir" data-id="${esc(l.id)}" aria-label="Feito"></button>`
    : `<span class="circulo ok">✓</span>`;
  return `<div class="linha ${l.status === "ativo" ? "" : "feita"}">${circulo}<div class="info">
    <div class="nome">${esc(l.texto)} ${selo_}</div>
    ${detalhes.length ? `<div class="detalhe">${esc(detalhes.join(" · "))}</div>` : ""}</div></div>`;
}

function rodape(d) {
  const em = d.atualizado && d.atualizado.em;
  return `<p class="apagado pequeno">${em ? `O PC atualizou os dados em ${ddmm(em)} às ${hhmm(em)}.` : ""}
    A agenda do Outlook e o Mercado ficam só no PC.</p>`;
}

// ---------------------------------------------------------------- telas

function telaHoje(d) {
  const h = hoje();
  const agora = new Date();
  const saudacao = agora.getHours() < 12 ? "Bom dia" : agora.getHours() < 18 ? "Boa tarde" : "Boa noite";
  const doDia = rotinasDoDia(d, h);
  const feitas = doDia.filter(r => r.registro).length;
  const pend = pendencias(d, h);
  const daGuia = doDia.filter(r => r.categoria === estado.guia);
  const vencendo = d.tarefas.filter(t => t.status === "aberta" && t.prazo && t.prazo <= h);
  const extenso = `${DIAS_EXTENSO[agora.getDay()]}, ${agora.getDate()} de ${MESES[agora.getMonth()]}`;
  let html = topo(d, esc(extenso)) + `<h1>${saudacao}</h1>`;
  if (h > d.previstas.ate) html += `<div class="aviso">O PC não atualiza os dados há mais de um mês: as rotinas de hoje não aparecem. Abra o Organizador no PC.</div>`;
  html += `<p class="apagado pequeno">Rotinas do dia · ${feitas}/${doDia.length}</p>
    <div class="barra"><div data-largura="${doDia.length ? Math.round(100 * feitas / doDia.length) : 0}"></div></div>`;
  if (pend.length) {
    html += `<h2>Pendências de dias anteriores</h2><p class="apagado pequeno">Marque como feita ou pule (ex.: feriado).</p>`
          + pend.map(r => linhaRotina(r, r.dia, true)).join("");
  }
  html += `<h2>Rotinas</h2>${guias()}` + (daGuia.length ? daGuia.map(r => linhaRotina(r, h)).join("")
                                                        : `<p class="apagado">Nenhuma rotina prevista para hoje.</p>`);
  html += `<h2>Tarefas vencendo</h2>` + (vencendo.length ? vencendo.map(linhaTarefa).join("")
                                                         : `<p class="apagado">Nenhuma tarefa vencendo até hoje.</p>`);
  return html + rodape(d);
}

function telaTarefas(d) {
  const abertas = d.tarefas.filter(t => t.status === "aberta" && t.categoria === estado.guia)
    .sort((a, b) => (a.prazo === null) - (b.prazo === null) || (a.prazo || "").localeCompare(b.prazo || "")
                    || a.prioridade - b.prioridade || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  const feitas = d.tarefas.filter(t => t.status === "concluida" && t.categoria === estado.guia)
    .sort((a, b) => (b.concluida_em || "").localeCompare(a.concluida_em || ""));
  return topo(d, "") + `<h1>Tarefas</h1>${guias()}
    <form data-form="tarefa" class="rapido">
      <input type="text" name="titulo" placeholder="Nova tarefa" required maxlength="200">
      <input type="date" name="prazo" value="${hoje()}" aria-label="Prazo">
      <select name="prioridade" aria-label="Prioridade"><option value="1">Alta</option><option value="2" selected>Média</option><option value="3">Baixa</option></select>
      <button class="botao principal">Adicionar</button>
    </form>`
    + (abertas.length ? abertas.map(linhaTarefa).join("") : `<p class="apagado">Nenhuma tarefa aberta.</p>`)
    + (feitas.length ? `<details><summary>Concluídas nos últimos 30 dias (${feitas.length})</summary>${feitas.map(linhaTarefa).join("")}</details>` : "");
}

function telaLembretes(d) {
  const agora = isoAgora().slice(0, 16);
  const ativos = d.lembretes.filter(l => l.status === "ativo");
  const grupos = [
    ["Para agora", ativos.filter(l => l.quando && l.quando <= agora).sort((a, b) => a.quando.localeCompare(b.quando))],
    ["Próximos", ativos.filter(l => l.quando && l.quando > agora).sort((a, b) => a.quando.localeCompare(b.quando))],
    ["Sem prazo", ativos.filter(l => !l.quando)],
  ];
  const feitos = d.lembretes.filter(l => l.status === "concluido").sort((a, b) => (b.concluido_em || "").localeCompare(a.concluido_em || ""));
  return topo(d, "") + `<h1>Lembretes</h1>
    <form data-form="lembrete" class="rapido">
      <input type="text" name="texto" placeholder="Lembrar de…" required maxlength="300">
      <select name="categoria" aria-label="Categoria"><option value="trabalho">Trabalho</option><option value="pessoal">Pessoal</option></select>
      <button class="botao principal">Salvar</button>
    </form>
    <p class="apagado pequeno">Ficam sem prazo. Horário e repetição você põe no PC (⋯ › Editar).</p>`
    + grupos.filter(([, l]) => l.length).map(([nome, l]) => `<h2>${nome}</h2>${l.map(linhaLembrete).join("")}`).join("")
    + (ativos.length ? "" : `<p class="apagado">Nenhum lembrete.</p>`)
    + (feitos.length ? `<details><summary>Concluídos recentemente (${feitos.length})</summary>${feitos.map(linhaLembrete).join("")}</details>` : "");
}

function telaNoticias(d) {
  const n = d.noticias;
  if (!n) return topo(d, "") + `<h1>Notícias</h1><p class="apagado">O PC ainda não mandou as manchetes. Elas chegam na próxima sincronização.</p>`;
  const cats = Object.keys(n.categorias);
  if (!cats.includes(estado.cat)) estado.cat = cats[0];
  const itens = n.categorias[estado.cat] || [];
  const quando = n.coletado_em ? `O PC buscou ${n.coletado_em.slice(0, 10) === hoje() ? "hoje" : "em " + ddmm(n.coletado_em)} às ${hhmm(n.coletado_em)}.` : "";
  // Só links http(s): o PC já filtra, mas a página não confia no que vem de fora
  const linha = x => `<div class="linha noticia"><div class="info">
      <div class="nome">${/^https?:\/\//i.test(x.link) ? `<a href="${esc(x.link)}" target="_blank" rel="noopener noreferrer">${esc(x.titulo)}</a>` : esc(x.titulo)}</div>
      <div class="detalhe">${esc(x.fonte)} · ${esc(diaCurto(x.publicado_em))} às ${esc(hhmm(x.publicado_em))}</div>
      ${x.resumo ? `<div class="detalhe resumo">${esc(x.resumo)}</div>` : ""}</div></div>`;
  return topo(d, "") + `<h1>Notícias</h1>
    <div class="guias">${cats.map(c => `<button data-cat="${esc(c)}" class="${c === estado.cat ? "ativa" : ""}">${esc(c)}</button>`).join("")}</div>
    <p class="apagado pequeno">${quando} Com o Organizador aberto, ele busca de novo a cada 30 minutos.</p>`
    + (itens.length ? itens.map(linha).join("") : `<p class="apagado">Nenhuma notícia dos últimos dias nesta categoria.</p>`);
}

function telaMais(d) {
  if (estado.sub === "rotinas") return telaRotinas(d);
  if (estado.sub === "atividades") return telaAtividades(d);
  if (estado.sub === "historico") return telaHistorico(d);
  return topo(d, "") + `<h1>Mais</h1><div class="lista-mais">
      <button data-sub="rotinas">Rotinas</button>
      <button data-sub="atividades">Atividades (projetos)</button>
      <button data-sub="historico">Histórico</button>
    </div>
    <h2>Este aparelho</h2>
    <p class="apagado pequeno">Dados em ${esc(CONFIG.dono)}/${esc(CONFIG.repo)} (privado).</p>
    <button class="botao" data-acao="recarregar">Buscar de novo</button>
    <button class="botao perigo largo" data-acao="sair">Sair desta máquina</button>
    <p class="apagado pequeno">Sair apaga a chave e os dados guardados neste navegador. Perdeu o celular? Apague a chave dele no GitHub (Settings › Developer settings › Fine-grained tokens).</p>`
    + rodape(d);
}

const voltar = titulo => `<button class="botao" data-sub="">‹ Voltar</button><h1>${titulo}</h1>`;

function telaRotinas(d) {
  const lista = d.rotinas.filter(r => r.categoria === estado.guia);
  return topo(d, "") + voltar("Rotinas") + guias()
    + lista.map(r => {
      const passos = (r.checklist || "").split("\n").map(p => p.trim()).filter(Boolean);
      const detalhes = [frequencia(r), r.horario_limite ? `até ${r.horario_limite}` : ""].filter(Boolean).join(" · ");
      return `<div class="linha"><div class="info"><div class="nome">${esc(r.nome)}</div><div class="detalhe">${esc(detalhes)}</div>
        ${r.descricao ? `<div class="detalhe">${esc(r.descricao)}</div>` : ""}
        ${passos.length ? `<ol class="detalhe">${passos.map(p => `<li>${esc(p)}</li>`).join("")}</ol>` : ""}</div></div>`;
    }).join("")
    + `<p class="apagado pequeno">Para criar ou mudar rotinas, use o Organizador no PC.</p>`;
}

function telaAtividades(d) {
  const temas = d.listas.temas.map(t => `<option>${esc(t)}</option>`).join("");
  const andamento = d.atividades.filter(a => a.status === "andamento").sort((a, b) => b.data.localeCompare(a.data));
  const concluidas = d.atividades.filter(a => a.status !== "andamento").sort((a, b) => b.data.localeCompare(a.data));
  const linha = a => `<div class="linha"><div class="info"><div class="nome">${esc(a.titulo)} ${etq("azul", a.tema)}</div>
      <div class="detalhe">${esc([a.status === "andamento" ? `Desde ${ddmmaaaa(a.data)}` : `Concluído em ${ddmmaaaa(a.data)}`,
                                  a.impacto, a.pendente ? "enviando ao PC" : ""].filter(Boolean).join(" · "))}</div>
      ${a.status === "andamento" ? `<button class="botao" data-acao="atividade-concluir" data-id="${esc(a.id)}">Concluir hoje</button>` : ""}
    </div></div>`;
  return topo(d, "") + voltar("Atividades")
    + `<details><summary>Novo projeto</summary><form data-form="atividade">
        <label class="campo">Título</label><input type="text" name="titulo" required maxlength="200">
        <label class="campo">Tema</label><select name="tema">${temas}</select>
        <label class="campo">Situação</label><select name="status"><option value="andamento">Em andamento</option><option value="concluido">Concluído</option></select>
        <label class="campo">Data (início, ou conclusão se já acabou)</label><input type="date" name="data" value="${hoje()}" required>
        <label class="campo">Impacto (de preferência com número)</label><input type="text" name="impacto" maxlength="300">
        <label class="campo">Descrição</label><textarea name="descricao" maxlength="2000"></textarea>
        <button class="botao principal largo">Salvar projeto</button></form></details>`
    + (andamento.length ? `<h2>Em andamento</h2>${andamento.map(linha).join("")}` : "")
    + (concluidas.length ? `<h2>Concluídos</h2>${concluidas.map(linha).join("")}` : "")
    + (d.atividades.length ? "" : `<p class="apagado">Nenhum projeto ainda.</p>`);
}

function telaHistorico(d) {
  const desde = somarDias(hoje(), -14);
  const lista = d.registros.filter(r => r.executado_em.slice(0, 10) >= desde).sort((a, b) => b.executado_em.localeCompare(a.executado_em));
  let html = topo(d, "") + voltar("Histórico") + `<p class="apagado pequeno">Últimos 14 dias.</p>`;
  let dia = null;
  for (const r of lista) {
    const x = r.executado_em.slice(0, 10);
    if (x !== dia) { html += `<h2>${diaCurto(x)}</h2>`; dia = x; }
    const pontual = r.status === "feito" && r.prazo ? (r.executado_em <= r.prazo ? etq("verde", "No prazo") : etq("laranja", "Fora do prazo")) : "";
    html += `<div class="linha"><div class="info"><div class="nome">${esc(r.titulo)} ${etq("cinza", r.tipo === "rotina" ? "Rotina" : "Tarefa")}
      ${r.status === "pulado" ? etq("cinza", "Pulada") : pontual}</div>
      <div class="detalhe">${esc([hhmm(r.executado_em), r.observacao ? `Obs.: ${r.observacao}` : ""].filter(Boolean).join(" · "))}</div></div></div>`;
  }
  return html + (lista.length ? "" : `<p class="apagado">Nada registrado.</p>`);
}

function telaLogin() {
  const aparelho = /iPhone|Android/i.test(navigator.userAgent) ? "celular" : "computador";
  const link = "https://github.com/settings/personal-access-tokens/new?" + new URLSearchParams({
    name: `Organizador - ${aparelho}`, description: "Organizador: ler e gravar o repositório de dados",
    target_name: CONFIG.dono, expires_in: "none", contents: "write" });
  return `<h1>Entrar neste aparelho</h1>
    <p class="apagado">Uma vez por aparelho. A chave só abre o seu repositório de dados (${esc(CONFIG.dono)}/${esc(CONFIG.repo)}) e fica guardada só neste navegador.</p>
    <ol class="passos">
      <li><a href="${esc(link)}" target="_blank" rel="noopener">Criar a chave deste aparelho no GitHub</a>.
        Em <b>Repository access</b>, escolha <b>Only select repositories</b> e marque <b>${esc(CONFIG.repo)}</b>.
        Em <b>Permissions</b>, ponha <b>Contents</b> em <b>Read and write</b>. Clique em <b>Generate token</b> e copie a chave.</li>
      <li>Cole a chave aqui:</li>
    </ol>
    <form data-form="entrar"><input type="password" name="chave" placeholder="github_pat_…" autocomplete="off" required>
      <button class="botao principal largo">Entrar</button></form>
    <p class="erro-texto">${esc(estado.msgLogin)}</p>`;
}

// ---------------------------------------------------------------- desenho e ações

function render() {
  const tela = document.getElementById("tela");
  const menu = document.getElementById("menu");
  if (!Nuvem.token()) {
    menu.hidden = true;
    tela.innerHTML = telaLogin();
    return;
  }
  menu.hidden = false;
  menu.querySelectorAll("button").forEach(b => b.classList.toggle("ativa", b.dataset.aba === estado.aba));
  const d = visao();
  if (!d) {
    tela.innerHTML = estado.erro ? `<div class="aviso">${esc(estado.erro)}</div><button class="botao" data-acao="recarregar">Tentar de novo</button>`
                                 : `<p class="carregando">Carregando…</p>`;
    return;
  }
  tela.innerHTML = { hoje: telaHoje, tarefas: telaTarefas, lembretes: telaLembretes, noticias: telaNoticias, mais: telaMais }[estado.aba](d);
  // Largura da barra pelo JS: a CSP da página não deixa estilo escrito no HTML
  tela.querySelectorAll("[data-largura]").forEach(el => { el.style.width = el.dataset.largura + "%"; });
}

function deslogar(mensagem) {
  Nuvem.sair();
  Object.assign(estado, { foto: null, erro: null, falhaEnvio: false, msgLogin: mensagem || "", aba: "hoje", sub: null });
  render();
}

async function atualizar(forcar = false) {
  if (!Nuvem.token()) return render();
  // Uma leitura por vez: com a rede lenta, o timer e a volta ao app empilhavam leituras iguais
  if (estado.lendo) { estado.lerDeNovo = estado.lerDeNovo || forcar || "sim"; return; }
  estado.lendo = true;
  try {
    await atualizarAgora(forcar);
  } finally {
    estado.lendo = false;
  }
  if (estado.lerDeNovo) {
    const forcarDeNovo = estado.lerDeNovo === true;
    estado.lerDeNovo = false;
    await atualizar(forcarDeNovo);
  }
}

async function atualizarAgora(forcar) {
  try {
    await Nuvem.enviarPendentes();
    estado.falhaEnvio = false;
  } catch (e) {
    if (e.status === 401) return deslogar("A chave deste aparelho não vale mais. Crie outra e entre de novo.");
    estado.falhaEnvio = true;
  }
  try {
    const foto = await Nuvem.ler(forcar);
    if (foto) estado.foto = foto;
    estado.erro = null;
  } catch (e) {
    if (e.status === 401) return deslogar("A chave deste aparelho não vale mais. Crie outra e entre de novo.");
    estado.erro = e.message || "Sem conexão";
  }
  render();
}

async function pedir(op) {
  op = { id: novoId(), criado_em: isoAgora(), aparelho: "web", ...op };
  estado.aberto = null;
  estado.ocupado = true;
  const envio = Nuvem.pedirMudanca(op);
  render();  // aparece na hora, com "Salvando…"
  try {
    await envio;
    estado.falhaEnvio = false;
    await atualizar(true);  // lê o commit novo antes de redesenhar, para o pedido não piscar
  } catch (e) {
    if (e.status === 401) return deslogar("A chave deste aparelho não vale mais. Crie outra e entre de novo.");
    estado.falhaEnvio = true;  // fica guardado no aparelho e vai na próxima conexão
    render();
  } finally {
    estado.ocupado = false;
  }
}

document.addEventListener("click", ev => {
  const alvo = ev.target.closest("button, [data-acao]");
  if (!alvo) return;
  const ds = alvo.dataset;
  if (ds.aba) { Object.assign(estado, { aba: ds.aba, sub: null, aberto: null }); render(); scrollTo(0, 0); return; }
  if (ds.guia) { estado.guia = ds.guia; render(); return; }
  if (ds.cat) { estado.cat = ds.cat; render(); scrollTo(0, 0); return; }
  if (ds.sub !== undefined) { Object.assign(estado, { sub: ds.sub || null, aberto: null }); render(); scrollTo(0, 0); return; }
  switch (ds.acao) {
    case "abrir": estado.aberto = estado.aberto === ds.chave ? null : ds.chave; render(); break;
    case "rotina-feita": pedir({ tipo: "rotina_registrar", rotina_id: Number(ds.id), data: ds.dia, status: "feito" }); break;
    case "rotina-pular": pedir({ tipo: "rotina_registrar", rotina_id: Number(ds.id), data: ds.dia, status: "pulado" }); break;
    case "rotina-desfazer": pedir({ tipo: "rotina_desfazer", rotina_id: Number(ds.id), data: ds.dia }); break;
    case "tarefa-concluir": pedir({ tipo: "tarefa_concluir", tarefa_id: ds.id.startsWith("op:") ? ds.id : Number(ds.id) }); break;
    case "lembrete-concluir": pedir({ tipo: "lembrete_concluir", lembrete_id: ds.id.startsWith("op:") ? ds.id : Number(ds.id) }); break;
    case "atividade-concluir": {
      const a = visao().atividades.find(x => mesmo(x.id, ds.id));
      if (a) pedir({ tipo: "atividade_salvar", atividade_id: ds.id.startsWith("op:") ? ds.id : Number(ds.id), data: hoje(),
                     titulo: a.titulo, tema: a.tema, impacto: a.impacto, descricao: a.descricao, evidencia: a.evidencia,
                     status: "concluido" });
      break;
    }
    case "recarregar": estado.erro = null; render(); atualizar(true); break;
    case "sair":
      if (confirm("Sair desta máquina? A chave e os dados guardados neste navegador serão apagados.")) deslogar("");
      break;
  }
});

document.addEventListener("submit", async ev => {
  const form = ev.target;
  ev.preventDefault();
  const v = Object.fromEntries(new FormData(form));
  const ds = form.dataset;
  switch (ds.form) {
    case "entrar":
      try {
        await Nuvem.entrar(v.chave);
        estado.msgLogin = "";
        render();
        atualizar(true);
      } catch (e) {
        estado.msgLogin = e.message || "Não consegui falar com o GitHub.";
        render();
      }
      break;
    case "rotina-obs":
      pedir({ tipo: "rotina_registrar", rotina_id: Number(ds.id), data: ds.dia, status: "feito", observacao: v.obs.trim() });
      break;
    case "tarefa":
      if (v.titulo.trim()) pedir({ tipo: "tarefa_criar", titulo: v.titulo.trim(), prazo: v.prazo || null,
                                   prioridade: Number(v.prioridade), categoria: estado.guia, descricao: "" });
      break;
    case "lembrete":
      if (v.texto.trim()) pedir({ tipo: "lembrete_criar", texto: v.texto.trim(), categoria: v.categoria });
      break;
    case "atividade":
      if (v.titulo.trim()) pedir({ tipo: "atividade_salvar", titulo: v.titulo.trim(), tema: v.tema, status: v.status,
                                   data: v.data, impacto: v.impacto.trim(), descricao: v.descricao.trim(), evidencia: "" });
      break;
  }
});

// Abre com a última foto guardada (rápido e sem rede) e busca a atual; de novo ao voltar para o app e a cada minuto
estado.foto = Nuvem.token() ? Nuvem.fotoGuardada() : null;
render();
atualizar(true);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !estado.ocupado) atualizar(); });
setInterval(() => { if (document.visibilityState === "visible" && !estado.ocupado) atualizar(); }, 60000);
