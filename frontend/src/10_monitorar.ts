// Monitorar: Pendências (visão geral / backlog) e Entregadores.

const COLS_EXPORT = COLUNAS_CONTRATO;

function filtrarPendencias(f: FiltrosPend): RegAtual[] {
  return E.analise!.atual.filter((r) => {
    const d = r.dados;
    if (f.cidades.length && !f.cidades.includes(String(d["Consignee City"]))) return false;
    if (f.bairros.length && !f.bairros.includes(String(d["Consignee Area"]))) return false;
    if (f.classes.length && !f.classes.includes(r.classe_operacional)) return false;
    if (f.faixas.length && !(r.faixa_backlog && f.faixas.includes(r.faixa_backlog))) return false;
    if (f.rota.length) { const fr = faixaRota(r); if (!fr || !f.rota.includes(fr)) return false; }
    if (f.dias.length) { const dt = paraData(d["Arrival Time"]); if (!dt || !f.dias.includes(diaIso(dt))) return false; }
    if (f.soProblema && d["Last Problem Type"] === null) return false;
    if (f.ocorrencia === "vigente" && !(d["Last Problem Type"] !== null && !r.reroteada && !r.entrega_confirmada)) return false;
    if (f.ocorrencia === "tratada" && !(r.reroteada && !r.entrega_confirmada)) return false;
    if (f.ocorrencia === "vigente" && !(d["Last Problem Type"] !== null && !r.reroteada && !r.entrega_confirmada)) return false;
    if (f.ocorrencia === "tratada" && !(r.reroteada && !r.entrega_confirmada)) return false;
    if (f.semEntregador && d["Delivery Associate"] !== null) return false;
    return true;
  });
}
function casaSelecao(r: RegAtual, s: SelecaoGrafico | null): boolean {
  if (!s) return true;
  const d = r.dados;
  if (s.dim === "cidade") return d["Consignee City"] === s.valor;
  if (s.dim === "entregador") return entregadorDe(d) === s.valor;
  if (s.dim === "problema") return d["Last Problem Type"] === s.valor;
  if (s.dim === "rota") return faixaRota(r) === s.valor;
  return r.classe_operacional === s.valor;
}

function colunasPendencia(): Coluna<RegAtual>[] {
  const g = (r: RegAtual) => r.dados;
  return [colAwb(g), colDado("Consignee City", g), colDado("Consignee Area", g), colDado("Delivery Associate", g),
    { id: "chegada", rotulo: "Chegou em", valor: (r) => r.backlog_dias, classe: "num",
      render: (r) => (r.backlog_dias === null ? h("span", { class: "nulo" }, "Sem data") : h("span", { class: "duas" }, fmtData(r.dados["Arrival Time"], false), h("small", null, "há " + fmtDias(r.backlog_dias)))) },
    { id: "rota", rotulo: "Em rota há", valor: (r) => r.em_rota_min, classe: "num", render: (r) => { const fr = faixaRota(r); return fr === null ? chip("Entregue", "ok") : r.em_rota_min === null ? h("span", { class: "nulo" }, "Sem saída") : h("span", { class: "tempo" }, chip(fmtMin(r.em_rota_min), TOM_ROTA[fr])); } },
    { id: "classe", rotulo: "Classe operacional", valor: (r) => r.classe_operacional, render: (r) => chip(r.classe_operacional, TOM_CLASSE[r.classe_operacional]) },
    colDado("Last Problem Type", g, "Problema"), colDado("Last Scan Status", g)];
}

function telaPendencias(): HTMLElement {
  const a = E.analise!; const f = E.f.pendencias;
  const pv = E.f.pivot;
  const recorteBruto = filtrarPendencias(f); // antes de tirar datas: as caixas de data da tabela dinâmica precisam mostrar todas
  const datasFora = new Set(pv.datasFora);
  const recorte = recorteBruto.filter((r) => !datasFora.has(diaChegada(r)));
  const lista = recorte.filter((r) => casaSelecao(r, f.sel) && casaCelulaPivot(r, pv.cel, pv.dims));
  const set = (fn: () => void) => atualizar(() => { fn(); TAB.delete("pend"); });
  const ativos: ChipFiltro[] = [
    ...pv.datasFora.map((d) => ({ texto: "Sem a chegada de " + (d === SEM_DATA ? "(sem data)" : fmtDia(d)), remover: () => set(() => { pv.datasFora = pv.datasFora.filter((x) => x !== d); pv.cel = null; }) })),
    ...(pv.cel ? [{ texto: "Tabela · " + rotuloCelulaPivot(pv.cel), remover: () => set(() => { pv.cel = null; }) }] : []),
    ...f.cidades.map((c) => ({ texto: "Cidade: " + c, remover: () => set(() => { f.cidades = f.cidades.filter((x) => x !== c); }) })),
    ...f.bairros.map((c) => ({ texto: "Bairro: " + c, remover: () => set(() => { f.bairros = f.bairros.filter((x) => x !== c); }) })),
    ...f.classes.map((c) => ({ texto: "Classe: " + c, remover: () => set(() => { f.classes = f.classes.filter((x) => x !== c); }) })),
    ...f.faixas.map((c) => ({ texto: "Aguardando: " + c, remover: () => set(() => { f.faixas = f.faixas.filter((x) => x !== c); }) })),
    ...f.rota.map((c) => ({ texto: "Em rota: " + c, remover: () => set(() => { f.rota = f.rota.filter((x) => x !== c); }) })),
    ...f.dias.map((c) => ({ texto: "Chegada: " + fmtDia(c), remover: () => set(() => { f.dias = f.dias.filter((x) => x !== c); }) })),
    ...(f.ocorrencia ? [{ texto: f.ocorrencia === "vigente" ? "Ocorrência vigente" : "Ocorrência já tratada", remover: () => set(() => { f.ocorrencia = ""; }) }] : []),
    ...(f.ocorrencia ? [{ texto: f.ocorrencia === "vigente" ? "Ocorrência vigente" : "Ocorrência já tratada", remover: () => set(() => { f.ocorrencia = ""; }) }] : []),
    ...(f.soProblema ? [{ texto: "Somente com problema", remover: () => set(() => { f.soProblema = false; }) }] : []),
    ...(f.semEntregador ? [{ texto: "Somente sem entregador", remover: () => set(() => { f.semEntregador = false; }) }] : []),
    ...(f.sel ? [{ texto: "Seleção no gráfico · " + f.sel.rotulo, remover: () => set(() => { f.sel = null; }) }] : []),
  ];
  const selecionar = (dim: SelecaoGrafico["dim"], prefixo: string) => (it: ItemBarra | null) =>
    set(() => { f.sel = it ? { dim, valor: it.chave ?? it.rotulo, rotulo: `${prefixo}: ${it.rotulo}` } : null; });
  const selDe = (dim: SelecaoGrafico["dim"]) => (f.sel && f.sel.dim === dim ? f.sel.valor : null);

  const dias = recorte.map((r) => r.backlog_dias).filter((x): x is number => x !== null && x >= 0); // chegada depois da referência não entra na média
  const media = dias.length ? dias.reduce((s, x) => s + x, 0) / dias.length : 0;
  const k = {
    pend: recorte.length, cidades: unicos(recorte.map((r) => r.dados["Consignee City"] as string)).length,
    ents: unicos(recorte.map((r) => r.dados["Delivery Associate"] as string)).length,
    vigente: recorte.filter((r) => r.dados["Last Problem Type"] !== null && !r.reroteada && !r.entrega_confirmada).length,
    tratada: recorte.filter((r) => r.reroteada && !r.entrega_confirmada).length,
  };

  const controles = [
    multi({ id: "p-cid", rotulo: "Cidade", opcoes: unicos(a.atual.map((r) => r.dados["Consignee City"] as string)), valores: f.cidades, onMudar: (v) => set(() => { f.cidades = v; }) }),
    multi({ id: "p-bai", rotulo: "Bairro", opcoes: unicos(a.atual.filter((r) => !f.cidades.length || f.cidades.includes(String(r.dados["Consignee City"]))).map((r) => r.dados["Consignee Area"] as string)), valores: f.bairros, onMudar: (v) => set(() => { f.bairros = v; }), descricao: "Combina com a cidade. Sem cidade escolhida, lista os bairros de todas." }),
    multi({ id: "p-cls", ajuda: "classe_operacional", rotulo: "Classe operacional", opcoes: ["Entregue", "Não entregue", "Anormal"], valores: f.classes, onMudar: (v) => set(() => { f.classes = v; }),
      descricao: "Pelo status e pela data de entrega do relatório: Anormal = tem problema; Entregue = status de entregue ou data de entrega preenchida." }),
    multi({ id: "p-rota", ajuda: "tempo_rota", rotulo: "Em rota há", opcoes: FAIXAS_ROTA, valores: f.rota, onMudar: (v) => set(() => { f.rota = v; }), descricao: "Desde a saída para entrega até a referência." }),
    multi({ id: "p-dias", ajuda: "dias_chegada", rotulo: "Dia de chegada", opcoes: a.dias_chegada, valores: f.dias, formatar: fmtDia, onMudar: (v) => set(() => { f.dias = v; }) }),
    alternar({ id: "p-prob", ajuda: "so_problema", rotulo: "Somente com problema", valor: f.soProblema, onMudar: (v) => set(() => { f.soProblema = v; }) }),
    alternar({ id: "p-sem", ajuda: "sem_entregador", rotulo: "Somente sem entregador", valor: f.semEntregador, onMudar: (v) => set(() => { f.semEntregador = v; }) }),
  ];

  const temDados = recorteBruto.length > 0;
  const limparTudo = () => set(() => { E.f.pendencias = filtrosVazios().pendencias; pv.datasFora = []; pv.cel = null; pv.fechados = []; });

  return h("div", { class: "tela" },
    cabecalho({ area: "Monitorar", titulo: "Pendências", ajuda: "pendente", pergunta: "Quantas encomendas faltam entregar, onde estão e há quanto tempo esperam?",
      resposta: h("p", null, h("strong", null, plural(recorte.length, "encomenda pendente", "encomendas pendentes")), recorte.length !== a.atual.length ? ` no filtro atual (de ${fmtN(a.atual.length)})` : "", ` · tempo médio desde a chegada: ${fmtN(Math.round(media * 10) / 10)} dias, contado até ${fmtData(a.referencia_backlog)}.`) }),
    funilTotais(a, false), // o operador compara esta tela com a planilha dele: mostra de quantas linhas do arquivo viemos
    barraFiltros(controles, ativos, limparTudo, "Estes filtros valem só nesta tela."),
    temDados ? [
      h("div", { class: "kpis kpis-6" },
        kpi({ rotulo: "Pendentes", ajuda: "pendente", valor: k.pend, nota: "No filtro atual" }),
        kpi({ rotulo: "Cidades", valor: k.cidades, nota: "Com pendências" }),
        kpi({ rotulo: "Entregadores", valor: k.ents, nota: "Com encomendas atribuídas" }),
        kpi({ rotulo: "Ocorrência vigente", ajuda: "com_ocorrencia", valor: k.vigente, tom: k.vigente ? "atencao" : undefined, nota: "Problema registrado e nenhuma saída para rota depois dele" }),
        kpi({ rotulo: "Já em rota após ocorrência", ajuda: "ocorrencia_tratada", valor: k.tratada, nota: "A saída para entrega é posterior ao problema" }),
        kpi({ rotulo: "Tempo médio", ajuda: "tempo_medio", valor: fmtN(Math.round(media * 10) / 10) + " dias", nota: "Desde a chegada ao galpão" })),
      pivotChegada({ regs: recorteBruto, referencia: a.referencia_backlog, set, est: pv }),
      h("div", { class: "graficos g2" },
        barras({ id: "p-g-cid", ajuda: "por_cidade", titulo: "Por cidade", descricao: "Clique numa barra para filtrar a lista abaixo.", unidade: ["encomenda", "encomendas"], itens: contar(recorte, (r) => r.dados["Consignee City"] as string), selecionado: selDe("cidade"), onSelecionar: selecionar("cidade", "Cidade") }),
        barras({ id: "p-g-ent", ajuda: "por_entregador", titulo: "Por entregador", descricao: "Os 15 com mais pendências.", unidade: ["encomenda", "encomendas"], itens: contar(recorte, (r) => entregadorDe(r.dados)).slice(0, 15), selecionado: selDe("entregador"), onSelecionar: selecionar("entregador", "Entregador"), max: 8 }),
        barras({ id: "p-g-rota", ajuda: "tempo_rota", titulo: "Há quanto tempo em rota", descricao: "Desde a saída para entrega, sem entrega confirmada.", unidade: ["encomenda", "encomendas"],
          itens: FAIXAS_ROTA.map((x) => ({ rotulo: x, valor: recorte.filter((r) => faixaRota(r) === x).length, tom: TOM_ROTA[x] })).filter((x) => x.valor || x.rotulo !== "Sem saída registrada"),
          selecionado: selDe("rota"), onSelecionar: selecionar("rota", "Em rota") }),
        barras({ id: "p-g-prob", ajuda: "tipos_problema", titulo: "Tipos de problema", descricao: "Último problema registrado.", unidade: ["encomenda", "encomendas"], itens: contar(recorte.filter((r) => r.dados["Last Problem Type"] !== null), (r) => r.dados["Last Problem Type"] as string).map((x) => ({ ...x, tom: "atencao" as Tom })), selecionado: selDe("problema"), onSelecionar: selecionar("problema", "Problema"), vazio: "Nenhuma pendente com problema neste filtro." })),
      h("section", { class: "bloco", "aria-labelledby": "pl-tit" },
        h("div", { class: "bloco-cab" }, h("h2", { id: "pl-tit" }, pv.cel ? `Encomendas · ${rotuloCelulaPivot(pv.cel)}` : f.sel ? `Encomendas · ${f.sel.rotulo}` : "Encomendas do recorte"),
          f.sel || pv.cel ? h("button", { type: "button", class: "link", on: { click: () => set(() => { f.sel = null; pv.cel = null; }) } }, "Limpar seleção") : null),
        h("p", { class: "nota" }, "“Entregue” nesta classe é a entrega confirmada pelo próprio relatório (status ou data de assinatura). “Provável entrega” é outra coisa: vem da comparação entre os relatórios."),
        tabela({ id: "pend", titulo: "Encomendas pendentes", colunas: colunasPendencia(), linhas: lista, chave: (r) => awbDe(r.dados), onAbrir: (r) => abrirAwb(awbDe(r.dados)), ordemInicial: { col: "chegada", dir: -1 },
          exportar: botaoExportar("pendencias.xlsx", () => ({ linhas: lista.map((r) => r.dados), colunas: COLS_EXPORT }), "Exportar Excel", "pend") })),
    ] : vazio("Nenhuma encomenda no filtro atual", "Remova um dos filtros acima para ver resultados.", h("button", { type: "button", class: "btn btn-sec", on: { click: limparTudo } }, "Limpar filtros")));
}

// ---------- Entregadores ----------
const ORDENS: Record<FiltrosEnt["ordem"], [string, (a: LinhaDesempenho, b: LinhaDesempenho) => number]> = {
  total: ["Mais encomendas abertas na base", (a, b) => b.total - a.total],
  pct_desc: ["Maior % de entregas", (a, b) => b.pct_entregue - a.pct_entregue || b.total - a.total],
  pct_asc: ["Menor % de entregas", (a, b) => a.pct_entregue - b.pct_entregue || b.total - a.total],
  anormal: ["Mais ocorrências vigentes", (a, b) => b.anormal - a.anormal || b.total - a.total],
  pendente: ["Mais pendentes sem ocorrência", (a, b) => b.pendente - a.pendente || b.total - a.total],
  rua: ["Mais trabalho ainda na rua (%)", (a, b) => naRua(b) - naRua(a) || b.total - a.total],
};
// Ritmo: parte do trabalho do entregador que ainda está na rua, comparada à média.
const naRua = (l: LinhaDesempenho) => (l.total ? (l.anormal + l.tratada + l.pendente) / l.total : 0);
const LIMITE_RITMO = 0.15, MIN_RITMO = 5;
// "(sem entregador)" não é uma pessoa: fica fora da média e do alerta de ritmo (auditoria L-02).
const soEntregadores = (ls: LinhaDesempenho[]) => ls.filter((l) => l.entregador !== SEM_ENTREGADOR);
function mediaNaRua(ls: LinhaDesempenho[]) { const v = soEntregadores(ls); const t = v.reduce((s, l) => s + l.total, 0); return t ? v.reduce((s, l) => s + l.anormal + l.tratada + l.pendente, 0) / t : 0; }
const abaixoDoRitmo = (l: LinhaDesempenho, media: number) => l.entregador !== SEM_ENTREGADOR && l.total >= MIN_RITMO && naRua(l) - media > LIMITE_RITMO;
const CLASSES_ENT: { id: string; rotulo: string; tom: string }[] = [
  { id: "Entregue", rotulo: "Entrega (provável ou confirmada)", tom: "ok" },
  { id: "Anormal", rotulo: "Ocorrência vigente", tom: "atencao" },
  { id: "Tratada", rotulo: "Ocorrência já tratada (em rota de novo)", tom: "neutro" },
  { id: "Pendente", rotulo: "Pendente sem ocorrência", tom: "acento" },
];

async function mudarDiasEntregadores(dias: string[]) {
  atualizar(() => { E.f.entregadores.dias = dias; E.carregandoDesempenho = true; });
  try { const d = await E.servico!.desempenho(dias); atualizar(() => { E.desempenho = d; }); }
  catch (e) { aviso(problemaDe(e).titulo, "erro"); }
  finally { atualizar(() => { E.carregandoDesempenho = false; }); }
}

function dadosDeAwb(awb: string): Dados {
  const r = E.idx.get(awb);
  if (!r) return { "Waybill No": awb };
  return r.fonte === "atual" || r.fonte === "saiu" ? r.reg.dados : r.dados;
}

function telaEntregadores(): HTMLElement {
  const a = E.analise!; const f = E.f.entregadores; const d = E.desempenho!;
  // Por cidade: uma linha por (cidade, entregador), com os mesmos números; os totais gerais seguem os de `d.linhas`.
  type LinhaEnt = LinhaDesempenho & { cidade?: string };
  const porCidade = f.agrupar === "cidade";
  const fonte: LinhaEnt[] = porCidade ? d.por_cidade || [] : d.linhas;
  const mesma = (l: LinhaEnt) => !!f.sel && f.sel.entregador === l.entregador && (f.sel.cidade ?? null) === (l.cidade ?? null);
  if (f.sel && !fonte.some(mesma)) f.sel = null;
  const linhas = [...fonte].sort(ORDENS[f.ordem][1]);
  const nomeLinha = (l: LinhaEnt) => (l.cidade !== undefined ? `${l.cidade} · ${l.entregador}` : l.entregador);
  const selDe = (l: LinhaEnt, classe: string | null) => ({ entregador: l.entregador, ...(l.cidade !== undefined ? { cidade: l.cidade } : {}), classe });
  const tot = d.linhas.reduce((s, l) => ({ total: s.total + l.total, entregue: s.entregue + l.entregue, anormal: s.anormal + l.anormal, tratada: s.tratada + l.tratada, pendente: s.pendente + l.pendente, ja: s.ja + l.ja_entregues }), { total: 0, entregue: 0, anormal: 0, tratada: 0, pendente: 0, ja: 0 });
  const set = (fn: () => void) => atualizar(fn);
  const media = mediaNaRua(d.linhas);
  const abaixo = d.linhas.filter((l) => abaixoDoRitmo(l, media));
  const horaRef = fmtData(a.referencia_backlog).slice(-5);
  const resto = (l: { total: number; entregue: number; anormal: number; tratada: number; pendente: number }) => l.total - l.entregue - l.anormal - l.tratada - l.pendente;
  const ORDEM_POR_CLASSE: Record<string, FiltrosEnt["ordem"]> = { Entregue: "pct_desc", Anormal: "anormal", Pendente: "pendente" };
  const segs = (l: { total: number; entregue: number; anormal: number; tratada: number; pendente: number }): SegRosca[] => [
    { id: "Entregue", rotulo: "Entrega (provável ou confirmada)", valor: l.entregue, tom: "ok", ajuda: "entrega_progresso" },
    { id: "Anormal", rotulo: "Ocorrência vigente", valor: l.anormal, tom: "atencao", ajuda: "pendente_com_ocorrencia" },
    { id: "Tratada", rotulo: "Ocorrência já tratada", valor: l.tratada, tom: "neutro", ajuda: "ocorrencia_tratada" },
    { id: "Pendente", rotulo: "Pendente sem ocorrência", valor: l.pendente, tom: "acento", ajuda: "pendente_sem_ocorrencia" },
    { id: "Devolucao", rotulo: "Saiu com sinal de devolução ou ocorrência", valor: resto(l), tom: "inferido", ajuda: "possivel_devolucao" },
  ];

  const itemEmp = (l: LinhaEnt) => {
    const selE = mesma(l);
    const seg = (id: string, rot: string, n: number, tom: string) => n > 0 ? h("button", { type: "button", class: `seg tom-${tom}` + (selE && f.sel!.classe === id ? " sel" : "") + (f.realce && f.realce !== id ? " apagado" : ""), style: { flexGrow: String(n) },
      title: `${nomeLinha(l)} · ${rot}: ${plural(n, "encomenda", "encomendas")} (${fmtPct((100 * n) / l.total)})`, "aria-label": `${rot}: ${n}`,
      on: { click: () => set(() => { f.sel = selE && f.sel!.classe === id ? null : selDe(l, id); TAB.delete("ent-awb"); }) } }) : null;
    return h("li", { class: "emp" + (selE ? " sel" : "") + (f.sel && !selE ? " esmaecida" : "") },
      h("button", { type: "button", class: "emp-nome", title: "Ver a composição de " + nomeLinha(l), "aria-pressed": selE ? "true" : "false",
        on: { click: () => set(() => { f.sel = selE && !f.sel!.classe ? null : selDe(l, null); TAB.delete("ent-awb"); }) } }, l.entregador),
      h("span", { class: "emp-barra" },
        seg("Entregue", "Entrega (provável ou confirmada)", l.entregue, "ok"), seg("Anormal", "Ocorrência vigente", l.anormal, "atencao"), seg("Tratada", "Ocorrência já tratada", l.tratada, "neutro"), seg("Pendente", "Pendente sem ocorrência", l.pendente, "acento"),
        resto(l) > 0 ? h("span", { class: "seg tom-inferido" + (f.realce && f.realce !== "Devolucao" ? " apagado" : ""), style: { flexGrow: String(resto(l)) }, title: `${plural(resto(l), "encomenda saiu", "encomendas saíram")} com sinal de devolução ou ocorrência` }) : null),
      h("span", { class: "emp-num" }, abaixoDoRitmo(l, media) ? h("span", { class: "ritmo-mark", title: `Abaixo do ritmo: ${fmtPct(100 * naRua(l))} ainda na rua, média ${fmtPct(100 * media)}` }, "▲") : null,
        // Quantidade e percentual juntos: "126 de 270 · 46,7%".
        h("strong", null, fmtN(l.entregue)), h("small", null, ` de ${fmtN(l.total)} · ${fmtPct(l.pct_entregue)}`)));
  };
  // Por cidade: um cabeçalho por cidade, com o subtotal, e os entregadores dela logo abaixo (na ordem escolhida).
  const itensLista: Filho[] = [];
  if (porCidade) {
    const cidades = [...new Set(linhas.map((l) => l.cidade as string))].sort((x, y) => x.localeCompare(y, "pt-BR"));
    for (const c of cidades) {
      const rs = linhas.filter((l) => l.cidade === c);
      const sub = rs.reduce((s, l) => ({ total: s.total + l.total, entregue: s.entregue + l.entregue }), { total: 0, entregue: 0 });
      itensLista.push(h("li", { class: "emp-cidade" }, h("strong", null, c),
        h("small", null, `${plural(rs.length, "entregador", "entregadores")} · ${fmtN(sub.entregue)} de ${fmtN(sub.total)} · ${fmtPct(sub.total ? (100 * sub.entregue) / sub.total : 0)}`)));
      rs.forEach((l) => itensLista.push(itemEmp(l)));
    }
  } else linhas.forEach((l) => itensLista.push(itemEmp(l)));
  const lista = h("ol", { class: "empilhadas", "aria-label": "Composição por entregador" }, itensLista);

  let detalhe: Filho = null;
  if (f.sel) {
    const l = fonte.find(mesma);
    if (l) {
      const cls = (l as Partial<LinhaDesempenhoCidade>).awbs || d.awbs[l.entregador] || {};
      const classes = f.sel.classe ? [f.sel.classe] : ["Entregue", "Anormal", "Tratada", "Pendente"];
      const regs = classes.flatMap((c) => (cls[c] || []).map((awb) => ({ awb, classe: c, dados: dadosDeAwb(awb) })));
      const rot = (c: string) => CLASSES_ENT.find((x) => x.id === c)!.rotulo;
      detalhe = h("section", { class: "bloco detalhe-ent", "aria-labelledby": "de-tit" },
        h("div", { class: "bloco-cab" }, h("h2", { id: "de-tit" }, nomeLinha(l)),
          h("button", { type: "button", class: "link", on: { click: () => set(() => { f.sel = null; }) } }, "Fechar")),
        abaixoDoRitmo(l, media) ? h("p", { class: "nota ritmo-nota" }, h("span", { class: "ritmo-mark" }, "▲"), ` Abaixo do ritmo às ${horaRef}: ${fmtPct(100 * naRua(l))} do trabalho ainda na rua, contra ${fmtPct(100 * media)} na média. `, explica("ritmo", "det")) : null,
        rosca({ id: "ent-sel", titulo: "Composição das encomendas", descricao: `${plural(l.total, "encomenda aberta", "encomendas abertas")} na base${l.ja_entregues ? ` (fora ${fmtN(l.ja_entregues)} já entregues antes)` : ""}. Clique numa parte para listar só ela.`,
          segmentos: segs(l), centro: { valor: fmtPct(l.pct_entregue), rotulo: "de entregas" }, selecionado: f.sel.classe,
          onSelecionar: (id) => set(() => { f.sel = selDe(l, id === "Devolucao" ? f.sel!.classe : id); TAB.delete("ent-awb"); }) }),
        tabela({ id: "ent-awb", titulo: "Encomendas do entregador", linhas: regs, chave: (r) => r.awb, onAbrir: (r) => abrirAwb(r.awb),
          colunas: [colAwb((r: { dados: Dados }) => r.dados), { id: "classe", rotulo: "Situação", valor: (r) => rot(r.classe), render: (r) => chip(rot(r.classe), r.classe === "Entregue" ? "ok" : r.classe === "Anormal" ? "atencao" : "neutro") },
            colDado("Consignee City", (r: { dados: Dados }) => r.dados), colDado("Consignee Area", (r: { dados: Dados }) => r.dados), colDado("Last Problem Type", (r: { dados: Dados }) => r.dados, "Problema"), colDado("Arrival Time", (r: { dados: Dados }) => r.dados)],
          exportar: botaoExportar(`entregador_${nomeLinha(l).replace(/[^\p{L}\p{N}]+/gu, "_")}.xlsx`, () => ({ linhas: regs.map((r) => ({ ...r.dados, classe: r.classe })), colunas: [...COLS_EXPORT, "classe"] }), "Exportar Excel", "ent-awb") }));
    }
  }

  return h("div", { class: "tela" },
    cabecalho({ area: "Monitorar", titulo: "Entregadores", ajuda: "desempenho", pergunta: "Como está cada entregador: o que saiu, o que tem problema e o que segue pendente?",
      resposta: h("p", null, h("strong", null, fmtPct(tot.total ? (100 * tot.entregue) / tot.total : 0)), ` das ${fmtN(tot.total)} encomendas abertas na base já saíram como entrega (provável ou confirmada) · ${fmtN(tot.anormal)} seguem com ocorrência vigente · ${fmtN(tot.tratada)} já voltaram para a rua · ${fmtN(tot.pendente)} pendentes sem ocorrência. ${fmtN(tot.ja)} já estavam entregues na base e não entram na conta.`) }),
    abas("ent-agrupar", [{ id: "entregador" as const, rotulo: "Por entregador" }, { id: "cidade" as const, rotulo: "Por cidade e entregador" }], f.agrupar,
      (v) => set(() => { f.agrupar = v; f.sel = null; TAB.delete("ent-awb"); })),
    barraFiltros([
      multi({ id: "e-dias", ajuda: "dias_entregadores", rotulo: "Dia de chegada", opcoes: a.dias_chegada_entregadores, valores: f.dias, formatar: fmtDia, onMudar: (v) => mudarDiasEntregadores(v),
        descricao: "Recalcula a comparação só com as encomendas que chegaram nestes dias." }),
      h("label", { class: "sel-ordem" }, h("span", null, "Ordenar por"),
        h("select", { id: "e-ord", on: { change: (e: Event) => set(() => { f.ordem = (e.target as HTMLSelectElement).value as FiltrosEnt["ordem"]; }) } },
          Object.entries(ORDENS).map(([k, [r]]) => h("option", { value: k, selected: f.ordem === k }, r)))),
      E.carregandoDesempenho ? h("span", { class: "carregando" }, h("span", { class: "giro" }), "Recalculando…") : null,
    ], f.dias.map((x) => ({ texto: "Chegada: " + fmtDia(x), remover: () => mudarDiasEntregadores(f.dias.filter((y) => y !== x)) })), () => mudarDiasEntregadores([]),
      "Universo de cada entregador: as encomendas atribuídas a ele no relatório base que AINDA NÃO estavam entregues."),
    h("div", { class: "ent-topo" },
      h("div", { class: "kpis kpis-2x" },
        kpi({ rotulo: "Entregadores", valor: soEntregadores(d.linhas).length, nota: "Com encomendas na base" }),
        kpi({ rotulo: "Abertas na base", ajuda: "na_base", valor: tot.total, nota: "Universo do indicador" }),
        kpi({ rotulo: "Abaixo do ritmo", ajuda: "ritmo", valor: abaixo.length, tom: abaixo.length ? "atencao" : undefined, nota: `Às ${horaRef}, média de ${fmtPct(100 * media)} ainda na rua`,
          destino: abaixo.length ? () => set(() => { f.ordem = "rua"; }) : undefined }),
        kpi({ rotulo: "Ocorrências vigentes", ajuda: "pendente_com_ocorrencia", valor: tot.anormal, tom: tot.anormal ? "atencao" : undefined, nota: "Problema sem saída para rota depois" })),
      rosca({ id: "ent-geral", titulo: "Resumo de todos os entregadores", ajuda: "desempenho", descricao: "Peças abertas na base. Clique numa parte para destacá-la nas barras e ordenar por ela.",
        segmentos: segs(tot), centro: { valor: fmtPct(tot.total ? (100 * tot.entregue) / tot.total : 0), rotulo: "de entregas" }, selecionado: f.realce,
        onSelecionar: (id) => set(() => { f.realce = id; if (id && ORDEM_POR_CLASSE[id]) f.ordem = ORDEM_POR_CLASSE[id]; }) })),
    h("div", { class: "ent-layout" + (detalhe ? " com-detalhe" : "") },
      h("figure", { class: "grafico" },
        h("figcaption", null, h("span", { class: "fig-tit" }, h("strong", null, "Composição por entregador"), explica("desempenho", "comp")), h("span", null, "Cada linha soma 100% das encomendas abertas do entregador na base. Clique numa cor para ver as encomendas.")),
        h("div", { class: "legenda" }, CLASSES_ENT.map((c) => h("span", null, h("i", { class: "tom-" + c.tom }), c.rotulo)), h("span", null, h("i", { class: "tom-inferido" }), "Saíram com sinal de devolução ou ocorrência")),
        linhas.length ? lista : vazio("Nenhum entregador neste filtro", "Não há encomendas na base para os dias escolhidos.")),
      detalhe),
    h("section", { class: "bloco", "aria-labelledby": "et-tit" },
      h("div", { class: "bloco-cab" }, h("h2", { id: "et-tit" }, "Tabela de desempenho")),
      tabela({ id: porCidade ? "ent-cid" : "ent", titulo: porCidade ? "Desempenho por cidade e entregador" : "Desempenho por entregador", linhas, chave: (l) => `${l.cidade ?? ""}|${l.entregador}`, porPagina: 30,
        onAbrir: (l) => set(() => { f.sel = selDe(l, null); TAB.delete("ent-awb"); }),
        colunas: [
          ...(porCidade ? [{ id: "cidade", rotulo: "Cidade", valor: (l: LinhaEnt) => l.cidade ?? "" }] : []),
          { id: "entregador", rotulo: "Entregador", valor: (l) => l.entregador },
          { id: "total", rotulo: "Abertas na base", valor: (l) => l.total, classe: "num" },
          { id: "entregue", rotulo: "Entregas", valor: (l) => l.entregue, classe: "num" },
          { id: "anormal", rotulo: "Ocorr. vigente", valor: (l) => l.anormal, classe: "num" },
          { id: "tratada", rotulo: "Ocorr. tratada", valor: (l) => l.tratada, classe: "num" },
          { id: "pendente", rotulo: "Pend. s/ ocorr.", valor: (l) => l.pendente, classe: "num" },
          { id: "pct", rotulo: "% de entregas", valor: (l) => l.pct_entregue, classe: "num", render: (l) => fmtPct(l.pct_entregue) },
          { id: "ja", rotulo: "Já entregues antes", valor: (l) => l.ja_entregues, classe: "num" },
          { id: "rua", rotulo: "Ainda na rua", valor: (l) => Math.round(1000 * naRua(l)) / 10, classe: "num", render: (l) => h("span", { class: "tempo" }, fmtPct(100 * naRua(l)), abaixoDoRitmo(l, media) ? chip("Abaixo do ritmo", "atencao") : null) },
        ],
        exportar: botaoExportar(porCidade ? "desempenho_por_cidade_e_entregador.xlsx" : "desempenho_entregadores.xlsx",
          () => ({ linhas: linhas.map(({ awbs: _awbs, ...r }: LinhaEnt & { awbs?: unknown }) => r) as unknown as Dados[],
            colunas: [...(porCidade ? ["cidade"] : []), "entregador", "total", "entregue", "anormal", "tratada", "pendente", "pct_entregue", "ja_entregues"] })) })));
}
