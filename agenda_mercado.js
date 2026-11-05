"use strict";
// Agenda (Outlook do PC), indicadores, Mercado e agenda econômica no celular. Tudo vem pronto do PC (agenda.json,
// economia.json, mercado.json, mercado_diario.json): o celular não fala com Outlook, TradingView nem ANBIMA.
// Usa os auxiliares do app.js (esc, etq, ddmm, hhmm, diaCurto, hoje, estado...), que já existem quando a tela desenha.

// ---------------------------------------------------------------- números
function br(v, casas = 2, sinal = false) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const t = Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return sinal && v > 0 ? "+" + t : t;
}
const pct = (v, casas = 2) => (v === null || v === undefined ? "—" : `${br(v, casas, true)}%`);
const classeVar = (v, inverso = false) => (!v ? "neutra" : (v > 0) !== inverso ? "sobe" : "cai");

// ---------------------------------------------------------------- indicadores (Hoje)
const INDICADORES = [
  ["CDI", "cdi", d => `${br(d.valor)}%`, null, "off"],
  ["Selic", "selic", d => `${br(d.valor)}%`, d => `${br(d.variacao, 2, true)} p.p.`, "off"],
  ["IPCA 12m", "ipca_12m", d => `${br(d.valor)}%`, d => `${br(d.variacao, 2, true)} p.p.`, "inverso"],
  ["Dólar", "dolar", d => `R$ ${br(d.valor, 4)}`, d => pct(d.variacao), "normal"],
  ["Ibovespa", "ibovespa", d => br(d.valor, 0), d => pct(d.variacao), "normal"],
];

function faixaIndicadores(d) {
  const ind = d.mercado && d.mercado.indicadores;
  if (!ind) return "";
  return `<div class="faixa">${INDICADORES.map(([rotulo, chave, valor, variacao, cor]) => {
    const x = ind[chave];
    if (!x) return `<div class="kpi"><div class="rotulo">${rotulo}</div><div class="valor">—</div></div>`;
    const classe = cor === "off" || x.variacao === null ? "neutra" : classeVar(x.variacao, cor === "inverso");
    return `<div class="kpi"><div class="rotulo">${rotulo}</div><div class="valor">${esc(valor(x))}</div>
      <div class="var ${classe}">${variacao && x.variacao !== null ? esc(variacao(x)) : "&nbsp;"}</div></div>`;
  }).join("")}</div>`;
}

// ---------------------------------------------------------------- agenda do Outlook
function linhaCompromisso(c) {
  const agora = isoAgora().slice(0, 16);
  let hora, selo_ = "", classe = "";
  if (c.dia_inteiro) hora = "Dia todo";
  else {
    hora = `${hhmm(c.inicio)}<small>${hhmm(c.fim)}</small>`;
    if (c.inicio <= agora && agora < c.fim) { selo_ = etq("azul", "Agora"); classe = "agora"; }
    else if (c.fim <= agora) classe = "feita";
    else {
      const min = Math.round((new Date(c.inicio) - new Date()) / 60000);
      if (min <= 60) selo_ = etq("cinza", `em ${min} min`);
    }
  }
  if (c.disponibilidade === "Provisório" || c.disponibilidade === "Livre") classe += " leve";
  const meta = [c.local, !["Ocupado", ""].includes(c.disponibilidade) ? c.disponibilidade : ""].filter(Boolean).join(" · ");
  return `<div class="linha evento ${classe}"><div class="hora">${hora}</div><div class="info">
    <div class="nome">${esc(c.assunto)} ${selo_}</div>${meta ? `<div class="detalhe">${esc(meta)}</div>` : ""}</div></div>`;
}

function agendaDias(d, dias) {
  const o = d.agenda && d.agenda.outlook;
  if (!o) return `<p class="apagado">O PC ainda não mandou a agenda do Outlook (ele precisa estar com o Outlook aberto).</p>`;
  const h = hoje();
  let html = o.de < h ? `<div class="aviso">Agenda lida do Outlook do PC em ${ddmm(o.de)}: o Outlook ou o Organizador estão fechados.</div>` : "";
  for (let i = 0; i < dias; i++) {
    const dia = somarDias(h, i);
    const doDia = o.itens.filter(c => (c.inicio.slice(0, 10) <= dia && dia < c.fim.slice(0, 10)) || c.inicio.slice(0, 10) === dia);
    const rotulo = i === 0 ? "Hoje" : i === 1 ? "Amanhã" : DIAS_EXTENSO[deIso(dia).getDay()];
    html += `<h2 class="dia">${esc(rotulo[0].toUpperCase() + rotulo.slice(1))} · ${ddmm(dia)}</h2>`
          + (doDia.length ? doDia.map(linhaCompromisso).join("") : `<p class="apagado pequeno">Livre</p>`);
  }
  return html;
}

function blocoAgendaHoje(d) {
  return `<h2>Agenda</h2>` + agendaDias(d, 2).replace(/<h2 class="dia">/g, `<h3 class="dia">`).replace(/<\/h2>/g, "</h3>")
    + `<button class="botao" data-aba="mais" data-ir="agenda">Ver a semana</button>`;
}

function telaAgenda(d) {
  return topo(d, "") + voltar("Agenda") + `<p class="apagado pequeno">Próximos 7 dias do Outlook do PC. Reuniões canceladas não aparecem.</p>`
    + agendaDias(d, 8);
}

// ---------------------------------------------------------------- mercado
const ABAS_MERCADO = [["br", "Ações BR"], ["eua", "EUA"], ["cripto", "Cripto"], ["etfs", "ETFs"], ["rf", "Renda fixa"],
                      ["curvas", "Curvas"], ["economia", "Agenda econômica"]];
const PERIODOS = [["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"], ["ano", "Ano"], ["doze_meses", "12 meses"]];
const TITULOS = ["LTN", "NTN-F", "NTN-B", "LFT"];

const chips = (lista, atual, attr) => `<div class="chips">${lista.map(([v, n]) =>
  `<button data-${attr}="${esc(v)}" class="${v === atual ? "ativa" : ""}">${esc(n)}</button>`).join("")}</div>`;

const caixas = lista => `<div class="caixas">${lista.map(a => `<div class="kpi"><div class="rotulo">${esc(a.nome)}</div>
  <div class="valor">${br(a.ultimo, 2)}</div><div class="var ${classeVar(a.dia)}">${pct(a.dia)} no dia</div>
  <div class="var neutra">${pct(a.ano, 1)} no ano</div></div>`).join("")}</div>`;

const linhaAtivo = (a, periodo, comNome = true) => `<div class="linha ativo"><div class="info">
    <div class="nome">${esc(a.ticker)}${comNome ? ` <span class="apagado">${esc(a.nome)}</span>` : ""}</div>
    ${a.setor ? `<div class="detalhe">${esc(a.setor)}</div>` : ""}</div>
  <div class="numeros"><div>${br(a.ultimo, 2)}</div><div class="var ${classeVar(a[periodo])}">${pct(a[periodo])}</div></div></div>`;

function listaPorPeriodo(itens, titulo, comNome = true) {
  const p = estado.periodo;
  const ordenados = [...itens].sort((a, b) => (b[p] ?? -1e9) - (a[p] ?? -1e9));
  return `<h2>${esc(titulo)}</h2>` + ordenados.map(a => linhaAtivo(a, p, comNome)).join("");
}

function barraSetor(v, maior) {
  // SVG, não CSS: a CSP da página não aceita estilo escrito no HTML
  const w = Math.abs(v || 0) / maior * 50;
  const x = v >= 0 ? 50 : 50 - w;
  return `<svg class="trilho" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="3.5" width="100" height="1" fill="rgba(250,250,250,.14)"/>
    <rect x="${x.toFixed(1)}" y="1" width="${Math.max(w, 0.5).toFixed(1)}" height="6" rx="1" fill="${v >= 0 ? "#3DD56D" : "#FF6C6C"}"/></svg>`;
}

function abaIndice(c, nomeIndice) {
  const maior = Math.max(...c.setores.map(s => Math.abs(s.dia || 0)), 0.01);
  return caixas(c.indices)
    + `<h2>Maiores altas do ${nomeIndice}</h2>` + c.altas.map(a => linhaAtivo(a, "dia")).join("")
    + `<h2>Maiores baixas do ${nomeIndice}</h2>` + c.baixas.map(a => linhaAtivo(a, "dia")).join("")
    + `<h2>Setores</h2><p class="apagado pequeno">Variação do dia ponderada pelo valor de mercado.</p>`
    + c.setores.filter(s => s.dia !== null).map(s => `<div class="setor"><span class="nome">${esc(s.setor)}</span>${barraSetor(s.dia, maior)}
        <span class="var ${classeVar(s.dia)}">${pct(s.dia)}</span></div>`).join("")
    + chips(PERIODOS, estado.periodo, "periodo")
    + listaPorPeriodo(c.maiores, `30 maiores do ${nomeIndice} (de ${c.total} ações)`);
}

// Gráfico de linhas em SVG, sem biblioteca. series: [{nome, pontos: [[x, y, rótulo]]}] (1ª azul cheia, depois mais claras)
const CORES = ["#4B8BFF", "#9CC0FF", "#8E8E8E"];
const TRACOS = ["", "5 3", "2 3"];
function grafico(series, { rotulosX = null, fmtY = v => br(v, 1) + "%", fmtX = v => br(v, 0), alto = 190 } = {}) {
  const todos = series.flatMap(s => s.pontos);
  if (!todos.length) return `<p class="apagado">Sem dados.</p>`;
  const L = 300, E = 40, D = 8, C = 10, B = 22, A = alto;
  let [x0, x1] = [Math.min(...todos.map(p => p[0])), Math.max(...todos.map(p => p[0]))];
  let [y0, y1] = [Math.min(...todos.map(p => p[1])), Math.max(...todos.map(p => p[1]))];
  if (x0 === x1) x1 = x0 + 1;
  const folga = (y1 - y0) * 0.08 || 0.5; y0 -= folga; y1 += folga;
  const px = x => E + (x - x0) / (x1 - x0) * (L - E - D);
  const py = y => C + (1 - (y - y0) / (y1 - y0)) * (A - C - B);
  let svg = `<svg class="grafico" viewBox="0 0 ${L} ${A}" role="img">`;
  for (let i = 0; i <= 4; i++) {
    const y = y0 + (y1 - y0) * i / 4;
    svg += `<line x1="${E}" x2="${L - D}" y1="${py(y).toFixed(1)}" y2="${py(y).toFixed(1)}" stroke="rgba(128,128,128,.18)"/>
      <text x="${E - 4}" y="${(py(y) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#A3A8B8">${esc(fmtY(y))}</text>`;
  }
  const marcas = rotulosX ? rotulosX.map((r, i) => [i, r]) : [0, 1, 2, 3, 4].map(i => [x0 + (x1 - x0) * i / 4]).map(([x]) => [x, fmtX(x)]);
  const passo = Math.ceil(marcas.length / 7);
  marcas.forEach(([x, r], i) => {
    if (i % passo === 0) svg += `<text x="${px(x).toFixed(1)}" y="${A - 6}" text-anchor="middle" font-size="9" fill="#A3A8B8">${esc(r)}</text>`;
  });
  series.forEach((s, i) => {
    const pts = [...s.pontos].sort((a, b) => a[0] - b[0]);
    svg += `<polyline fill="none" stroke="${CORES[i]}" stroke-width="${i ? 1.5 : 2}" ${TRACOS[i] ? `stroke-dasharray="${TRACOS[i]}"` : ""}
      points="${pts.map(p => `${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join(" ")}"/>`;
    if (pts.length <= 40) pts.forEach(p => {
      svg += `<circle cx="${px(p[0]).toFixed(1)}" cy="${py(p[1]).toFixed(1)}" r="2.5" fill="${CORES[i]}"><title>${esc(`${s.nome} · ${p[2] || fmtX(p[0])}: ${fmtY(p[1])}`)}</title></circle>`;
    });
  });
  svg += `</svg>`;
  const legenda = series.length > 1 ? `<div class="legenda">${series.map((s, i) => `<span><i class="cor${i}"></i>${esc(s.nome)}</span>`).join("")}</div>` : "";
  return legenda + svg;
}

const anos = (venc, dia) => (deIso(venc) - deIso(dia)) / (365.25 * 864e5);

function curvaBR(t, tipos, titulo) {
  const series = ["atual", "anterior", "mes"].filter(m => t[m]).map(m => ({
    nome: ddmmaaaa(t[m].dia),
    pontos: t[m].itens.filter(x => tipos.includes(x.titulo) && x.vencimento > t[m].dia)
      .map(x => [anos(x.vencimento, t[m].dia), x.taxa, `${x.titulo} ${x.vencimento.slice(5, 7)}/${x.vencimento.slice(0, 4)}`]),
  }));
  return `<h2>${titulo}</h2>` + grafico(series, { fmtX: v => `${br(v, 0)}a` });
}

function abaRendaFixa(md) {
  const t = md.titulos;
  if (!t) return `<p class="apagado">O PC ainda não mandou as taxas da ANBIMA.</p>`;
  const tipo = estado.titulo;
  const chave = x => `${x.titulo}|${x.vencimento}`;
  const antes = new Map(t.anterior.itens.map(x => [chave(x), x]));
  const mes = new Map(t.mes.itens.map(x => [chave(x), x]));
  const umMes = (deIso(t.atual.dia) - deIso(t.mes.dia)) / 864e5 >= 25;
  const bps = v => (v === null ? "—" : br(v, 1, true));
  const linhas = t.atual.itens.filter(x => x.titulo === tipo).sort((a, b) => a.vencimento.localeCompare(b.vencimento)).map(x => {
    const a = antes.get(chave(x)), m = mes.get(chave(x));
    const dDia = a ? (x.taxa - a.taxa) * 100 : null, dMes = m ? (x.taxa - m.taxa) * 100 : null;
    return `<tr><td>${ddmm(x.vencimento)}/${x.vencimento.slice(2, 4)}</td><td>${br(x.taxa, tipo === "LFT" ? 4 : 2)}</td>
      <td class="var ${classeVar(dDia, true)}">${bps(dDia)}</td><td class="var ${classeVar(dMes, true)}">${bps(dMes)}</td>
      <td>${br(x.pu, 2)}</td></tr>`;
  }).join("");
  return chips(TITULOS.map(x => [x, x]), tipo, "titulo")
    + `<table class="tabela"><thead><tr><th>Venc.</th><th>Taxa</th><th>Dia (bps)</th><th>${umMes ? "1 mês" : "Desde " + ddmm(t.mes.dia)} (bps)</th><th>PU</th></tr></thead>
       <tbody>${linhas}</tbody></table>
       <p class="apagado pequeno">Taxas indicativas ANBIMA de ${ddmmaaaa(t.atual.dia)}, comparadas com ${ddmm(t.anterior.dia)} e ${ddmm(t.mes.dia)}.
       Taxa subindo (vermelho) é preço caindo.${tipo === "LFT" ? " Na LFT a taxa é o ágio/deságio sobre a Selic." : ""}
       O arquivo do dia sai à noite.</p>`;
}

function abaCurvas(md) {
  let html = md.titulos ? curvaBR(md.titulos, ["LTN", "NTN-F"], "Prefixada · LTN e NTN-F") + curvaBR(md.titulos, ["NTN-B"], "Juro real · NTN-B (IPCA+)")
                        : `<p class="apagado">O PC ainda não mandou as taxas da ANBIMA.</p>`;
  if (md.treasury) {
    const prazos = md.treasury.prazos;
    html += `<h2>Treasuries · EUA</h2>` + grafico(md.treasury.curvas.map(c => ({
      nome: ddmmaaaa(c.dia), pontos: prazos.map((p, i) => [i, c.taxas[p], p]).filter(p => p[1] !== undefined),
    })), { rotulosX: prazos, fmtY: v => br(v, 2) + "%" });
  }
  return html + `<p class="apagado pequeno">Fontes: ANBIMA (taxas indicativas) e Tesouro americano (par yields).</p>`;
}

function abaCripto(c, md) {
  let html = caixas(c.cripto.slice(0, 5));
  if (md && md.btc) {
    const pts = md.btc.pontos.map(([dia, v]) => [deIso(dia).getTime(), v, ddmmaaaa(dia)]);
    const mesAno = t => { const d = new Date(t); return `${MESES[d.getMonth()].slice(0, 3)}/${String(d.getFullYear()).slice(2)}`; };
    html += `<h2>Bitcoin em dólar · 12 meses</h2>` + grafico([{ nome: "BTC", pontos: pts }], { fmtY: v => "$" + br(v / 1000, 0) + " mil", fmtX: mesAno });
  }
  return html + chips(PERIODOS, estado.periodo, "periodo") + listaPorPeriodo(c.cripto, "Cripto");
}

function abaEconomia(e) {
  const agora = isoAgora().slice(0, 16);
  let html = "";
  const m = e.macro;
  if (!m) html += `<p class="apagado">O PC ainda não mandou a agenda econômica.</p>`;
  else {
    const decisoes = m.decisoes.filter(x => x.quando.slice(0, 10) >= hoje());
    if (decisoes.length) html += `<div class="chips fixos">${decisoes.map(x => `<span class="chip"><b>${esc(x.banco)}</b> ${esc(diaCurto(x.quando))}</span>`).join("")}</div>`;
    let dia = null;
    const eventos = m.eventos.filter(x => x.quando.slice(0, 10) >= hoje());
    for (const x of eventos) {
      if (x.quando.slice(0, 10) !== dia) { dia = x.quando.slice(0, 10); html += `<h3 class="dia">${dia === hoje() ? "Hoje" : esc(diaCurto(dia))}</h3>`; }
      const meta = [m.paises[x.pais] || x.pais, x.periodo, x.atual ? `saiu ${x.atual}` : "", x.anterior ? `anterior ${x.anterior}` : "",
                    x.projecao ? `projeção ${x.projecao}` : ""].filter(Boolean).join(" · ");
      const hora = hhmm(x.quando) === "00:00" ? "—" : hhmm(x.quando);
      html += `<div class="linha evento ${x.quando < agora ? "feita" : ""}"><div class="hora">${hora}</div><div class="info">
        <div class="nome">${esc(x.nome)} ${x.juros ? etq("laranja", "Juros") : ""}</div><div class="detalhe">${esc(meta)}</div></div></div>`;
    }
    if (!eventos.length) html += `<p class="apagado">Sem eventos relevantes nas próximas 2 semanas.</p>`;
  }
  const r = e.resultados;
  if (r) {
    html += `<h2>Resultados de empresas</h2>`;
    let dia = null;
    for (const x of r.empresas.filter(x => x.data >= hoje())) {
      if (x.data !== dia) { dia = x.data; html += `<h3 class="dia">${dia === hoje() ? "Hoje" : esc(diaCurto(dia))}</h3>`; }
      html += `<div class="linha evento"><div class="hora">${esc(x.ticker)}</div><div class="info"><div class="nome">${esc(x.nome)}</div>
        <div class="detalhe">${esc([x.pais === "BR" ? "BR" : "EUA", x.momento].filter(Boolean).join(" · "))}</div></div></div>`;
    }
  }
  return html + `<p class="apagado pequeno">Horários de Brasília · fonte: TradingView.</p>`;
}

function telaMercado(d) {
  const aba = estado.mercadoAba;
  const c = d.mercado && d.mercado.cotacoes;
  const md = d.mercado_diario || {};
  let html = topo(d, "") + `<h1>Mercado</h1>` + chips(ABAS_MERCADO, aba, "mercado");
  const semCotacoes = `<p class="apagado">O PC ainda não mandou as cotações.</p>`;
  if (aba === "br") html += c ? abaIndice(c.br, "Ibovespa") : semCotacoes;
  else if (aba === "eua") html += c ? abaIndice(c.eua, "S&P 500") : semCotacoes;
  else if (aba === "cripto") html += c ? abaCripto(c, md) : semCotacoes;
  else if (aba === "etfs") html += c ? chips(PERIODOS, estado.periodo, "periodo") + listaPorPeriodo(c.etfs.Brasil, "ETFs do Brasil", true)
                                           + listaPorPeriodo(c.etfs.EUA, "ETFs dos EUA", true) : semCotacoes;
  else if (aba === "rf") html += abaRendaFixa(md);
  else if (aba === "curvas") html += abaCurvas(md);
  else if (aba === "economia") html += d.economia ? abaEconomia(d.economia) : `<p class="apagado">O PC ainda não mandou a agenda econômica.</p>`;
  if (c && ["br", "eua", "cripto", "etfs"].includes(aba))
    html += `<p class="apagado pequeno">Cotações que o PC buscou em ${ddmm(c.em)} às ${hhmm(c.em)}, com atraso de cerca de 15 minutos · TradingView.
      No pregão o PC busca de novo a cada 15 minutos.</p>`;
  return html;
}
