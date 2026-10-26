// Agir agora: Conferência de piso e Exceções.

const CHAVE_ERRO: Record<string, string> = {
  "Entregador fora da área": "erro_fora_area", "Entregador sem histórico": "erro_sem_historico", "Região com pouco histórico": "erro_pouco_historico", "Sem entregador": "erro_sem_entregador",
};

// Proveniência do mapa de região: de que arquivo, que período e com que critério ele foi gerado.
function textoProveniencia(m: MapaRegiao): string {
  const meta = m.meta;
  const crit = `vale quem tem pelo menos ${m.limiar} entregas e ${fmtPct(100 * (m.min_participacao ?? 0))} da região`;
  if (!meta) return `Critério: ${crit}. Este mapa não informa de onde veio nem o período.`;
  const per = meta.periodo ? `${fmtDia(meta.periodo.inicio)} a ${fmtDia(meta.periodo.fim)}` : "período não informado";
  return `Gerado de “${meta.fonte}” (${per}), ${fmtN(meta.linhas_usadas)} entregas. Critério: ${crit}. Entregador que não aparece nesse histórico é “sem histórico” (pode ser novo), não erro confirmado.`;
}

function telaPiso(): HTMLElement {
  const a = E.analise!; const f = E.f.piso;
  const todos = errosPiso();
  const lista = todos.filter((r) => (!f.tipos.length || f.tipos.includes(r.erro_piso!.tipo))
    && (!f.cidades.length || f.cidades.includes(String(r.dados["Consignee City"])))
    && (!f.bairros.length || f.bairros.includes(String(r.dados["Consignee Area"])))
    && (!f.entregadores.length || f.entregadores.includes(entregadorDe(r.dados))));
  const set = (fn: () => void) => atualizar(() => { fn(); TAB.delete("piso"); });
  const porTipo = contar(todos, (r) => r.erro_piso!.tipo);
  const ajustadas = Object.values(a.regras.por_cidade).filter((c) => c.origem === "ajuste manual").length;
  const g = (r: RegAtual) => r.dados;
  // Quantas peças a conferência de fato avaliou, contra as linhas do arquivo (o funil abaixo mostra onde cada retirada aconteceu).
  const ign = new Set(a.regras.cidades_ignoradas);
  const conferidas = a.atual.filter((r) => !ign.has(String(r.dados["Consignee City"]))).length;
  const arq = E.imp.atual && E.imp.atual.nome === a.arquivos.atual ? E.imp.atual.linhas : a.etapas.atual_lidas;
  const totalConferidas = h("p", { class: "nota" },h("strong", null, `${fmtN(conferidas)} de ${fmtN(arq)}`),
    ` linhas do arquivo foram conferidas (${fmtN(conferidas - todos.length)} sem problema). As demais saíram por filtro: veja em “Como chegamos a este número”.`);

  const resposta = todos.length
    ? h("div", { class: "resp-linha" },
        h("p", null, h("strong", null, plural(todos.length, "encomenda para revisar", "encomendas para revisar")), " antes do carregamento."),
        totalConferidas,
        h("div", { class: "resp-chips" }, porTipo.map((t) => h("button", { type: "button", class: "chip-btn" + (f.tipos.includes(t.rotulo) ? " sel" : ""), "aria-pressed": f.tipos.includes(t.rotulo) ? "true" : "false",
          on: { click: () => set(() => { f.tipos = f.tipos.includes(t.rotulo) ? f.tipos.filter((x) => x !== t.rotulo) : [t.rotulo]; }) } }, chipErro(t.rotulo), h("strong", null, fmtN(t.valor))))),
        h("span", { class: "resp-ajudas" }, "O que significa:", porTipo.map((t) => h("span", { class: "fig-tit" }, t.rotulo, explica(CHAVE_ERRO[t.rotulo] || "erro_cidade_fora", "resp")))))
    : h("div", { class: "resp-linha" }, h("p", null, h("strong", null, "Nenhum problema encontrado."), " Todas as pendentes estão com cidade e entregador dentro das regras."), totalConferidas);

  const ativos: ChipFiltro[] = [
    ...f.tipos.map((x) => ({ texto: "Problema: " + x, remover: () => set(() => { f.tipos = f.tipos.filter((y) => y !== x); }) })),
    ...f.cidades.map((x) => ({ texto: "Cidade: " + x, remover: () => set(() => { f.cidades = f.cidades.filter((y) => y !== x); }) })),
    ...f.bairros.map((x) => ({ texto: "Bairro: " + x, remover: () => set(() => { f.bairros = f.bairros.filter((y) => y !== x); }) })),
    ...f.entregadores.map((x) => ({ texto: "Entregador: " + x, remover: () => set(() => { f.entregadores = f.entregadores.filter((y) => y !== x); }) })),
  ];

  return h("div", { class: "tela" },
    cabecalho({ area: "Agir agora", titulo: "Conferência de piso", ajuda: "piso", pergunta: "Alguma encomenda está com a cidade ou o entregador errado?", resposta,
      acoes: h("button", { type: "button", class: "btn btn-ghost", on: { click: () => navegar("regras", { de: "piso" }) } }, icone("regras", "ic ic-sm"), "Ver regras de abrangência") }),
    h("div", { class: "alerta-caixa tom-inferido" }, icone("inferido"),
      h("div", null, h("span", { class: "fig-tit" }, h("strong", null, "Como a conferência decide"), explica("regra_derivada", "piso"), explica("rigor", "piso")),
        E.mapaRegiaoAtivo
          ? h("p", null, `Usando o mapa de região (CEP) ${E.mapaRegiaoOrigem === "sessao" ? "carregado nesta sessão pelo Estudo de regiões" : "publicado como padrão"}: cada encomenda é conferida pelo CEP (com retorno para bairro e cidade quando o CEP não tem regra). Um entregador fora do conjunto aparece como “Entregador fora da área”. ${textoProveniencia(E.mapaRegiaoAtivo)}`)
          : h("p", null, `As regras de quem entrega onde são aprendidas do relatório base: um entregador vale para uma cidade (ou bairro, nas cidades com ${a.parametros.min_entregadores_urbano} ou mais entregadores) quando tem pelo menos ${a.parametros.limiar_ruido} encomendas lá; o entregador com mais encomendas sempre vale. ${ajustadas ? `${plural(ajustadas, "cidade tem", "cidades têm")} ajuste manual, que tem prioridade.` : "Nenhuma cidade tem ajuste manual."}`),
        h("p", { class: "nota" }, E.mapaRegiaoAtivo ? "Para trocar o mapa, gere um novo no Estudo de regiões e clique em “Gerar e usar este mapa”." : "Uma regra derivada repete o histórico, inclusive erros recorrentes. Confirme antes de corrigir.", a.regras.cidades_ignoradas.length ? ` Cidades fora da conferência: ${a.regras.cidades_ignoradas.join(", ")}.` : ""))),
    funilTotais(a, false, "piso", "piso"),
    todos.length ? [
      barraFiltros([
        multi({ id: "pi-tipo", rotulo: "Problema", opcoes: porTipo.map((t) => t.rotulo), valores: f.tipos, onMudar: (v) => set(() => { f.tipos = v; }) }),
        multi({ id: "pi-cid", rotulo: "Cidade", opcoes: unicos(todos.map((r) => r.dados["Consignee City"] as string)), valores: f.cidades, onMudar: (v) => set(() => { f.cidades = v; }) }),
        multi({ id: "pi-bai", rotulo: "Bairro", opcoes: unicos(todos.filter((r) => !f.cidades.length || f.cidades.includes(String(r.dados["Consignee City"]))).map((r) => r.dados["Consignee Area"] as string)), valores: f.bairros, onMudar: (v) => set(() => { f.bairros = v; }), descricao: "Combina com a cidade." }),
        multi({ id: "pi-ent", rotulo: "Entregador atual", opcoes: unicos(todos.map((r) => entregadorDe(r.dados))), valores: f.entregadores, onMudar: (v) => set(() => { f.entregadores = v; }) }),
      ], ativos, () => set(() => { E.f.piso = filtrosVazios().piso; })),
      abas("piso-vista", [{ id: "tabela" as const, rotulo: "Tabela" }, { id: "roteiro" as const, rotulo: "Roteiro por entregador" }], f.vista || "tabela", (v) => set(() => { f.vista = v; })),
      f.vista === "roteiro" ? roteiroPiso(lista) : h("div", { class: "piso-layout" },
        h("section", { class: "bloco", "aria-labelledby": "pc-tit" },
          h("div", { class: "bloco-cab" }, h("h2", { id: "pc-tit" }, "Correções a investigar")),
          tabela({ id: "piso", titulo: "Correções de piso", linhas: lista, chave: (r) => awbDe(r.dados), onAbrir: (r) => abrirAwb(awbDe(r.dados)), ordemInicial: { col: "ent", dir: 1 },
            vazio: vazio("Nenhuma correção neste filtro", "Remova um filtro para ver as demais."),
            colunas: [colAwb(g),
              { id: "tipo", rotulo: "Problema", valor: (r) => r.erro_piso!.tipo, render: (r) => chipErro(r.erro_piso!.tipo) },
              { id: "local", rotulo: "Cidade · bairro", valor: (r) => `${r.dados["Consignee City"]} ${r.dados["Consignee Area"] ?? ""}`, render: (r) => h("span", { class: "duas" }, String(r.dados["Consignee City"]), h("small", null, valorTexto("Consignee Area", r.dados["Consignee Area"]))) },
              { id: "end", rotulo: "Endereço", valor: (r) => String(r.dados["Consignee Address"] ?? ""), render: (r) => h("span", { class: "duas" }, valorTexto("Consignee Address", r.dados["Consignee Address"]), h("small", null, "CEP " + valorTexto("Consignee Zip Code", r.dados["Consignee Zip Code"]))) },
              { id: "ent", rotulo: "Está com", valor: (r) => entregadorDe(r.dados), render: (r) => r.dados["Delivery Associate"] === null ? h("span", { class: "nulo" }, "Sem entregador") : String(r.dados["Delivery Associate"]) },
              { id: "esp", rotulo: "Deveria estar com", valor: (r) => r.erro_piso!.esperados.join(", "), render: (r) => h("span", { class: "duas" }, r.erro_piso!.esperados.length ? r.erro_piso!.esperados.join(" ou ") : h("span", { class: "nulo" }, "Sem regra para indicar"), h("small", { "data-explica": "piso_origem_regra" }, `regra ${ROTULO_ESCOPO[r.erro_piso!.escopo] || "da cidade"} · ` + r.erro_piso!.origem_regra)) },
            ],
            exportar: botaoExportar("correcoes_piso.xlsx", () => ({ linhas: lista.map((r) => ({ ...r.dados, tipo_erro: r.erro_piso!.tipo, detalhe: r.erro_piso!.detalhe, entregadores_esperados: r.erro_piso!.esperados.join(", ") })), colunas: [...COLUNAS_CONTRATO, "tipo_erro", "detalhe", "entregadores_esperados"] }), "Exportar correções", "piso") })),
        barras({ id: "pi-g-ent", titulo: "Por entregador atual", descricao: "Quem está com as encomendas a corrigir. Clique para filtrar.", unidade: ["correção", "correções"],
          itens: contar(todos, (r) => entregadorDe(r.dados)).map((x) => ({ ...x, tom: "critico" as Tom })), max: 10,
          selecionado: f.entregadores.length === 1 ? f.entregadores[0] : null, onSelecionar: (it) => set(() => { f.entregadores = it ? [it.rotulo] : []; }) })),
    ] : vazio("Piso conferido", "Não há encomendas pendentes com cidade ou entregador fora das regras de abrangência.", null, "ok"));
}

// ---------- Roteiro de correção (piso) ----------
const CONFERIDOS = new Set<string>();
function roteiroPiso(lista: RegAtual[]): HTMLElement {
  const grupos = contar(lista, (r) => entregadorDe(r.dados));
  const feitos = lista.filter((r) => CONFERIDOS.has(awbDe(r.dados))).length;
  const entregarA = (r: RegAtual) => r.erro_piso!.esperados.join(" ou ") || "sem regra para indicar";
  return h("section", { class: "bloco roteiro", "aria-labelledby": "rot-tit" },
    h("div", { class: "bloco-cab" },
      h("h2", { id: "rot-tit", class: "fig-tit" }, "Roteiro de correção", explica("roteiro", "piso")),
      h("span", { class: "rot-prog" }, h("strong", null, `${fmtN(feitos)} de ${fmtN(lista.length)}`), " conferidas",
        h("span", { class: "rot-barra", "aria-hidden": "true" }, h("i", { style: { width: (lista.length ? (100 * feitos) / lista.length : 0) + "%" } }))),
      botaoExportar("roteiro_correcao_piso.xlsx", () => ({
        linhas: [...lista].sort((x, y) => entregadorDe(x.dados).localeCompare(entregadorDe(y.dados), "pt-BR")).map((r) => ({
          entregador_atual: entregadorDe(r.dados), "Waybill No": r.dados["Waybill No"], "Consignee City": r.dados["Consignee City"], "Consignee Area": r.dados["Consignee Area"],
          "Consignee Address": r.dados["Consignee Address"], tipo_erro: r.erro_piso!.tipo, entregar_a: entregarA(r), conferido: CONFERIDOS.has(awbDe(r.dados)) ? "sim" : "não" })),
        colunas: ["entregador_atual", "Waybill No", "Consignee City", "Consignee Area", "Consignee Address", "tipo_erro", "entregar_a", "conferido"] }), "Exportar roteiro")),
    h("p", { class: "nota" }, "Agrupado por quem está com a encomenda agora. Marque o que já foi conferido no galpão; as marcações valem só enquanto esta página estiver aberta."),
    grupos.map((g) => {
      const itens = lista.filter((r) => entregadorDe(r.dados) === g.rotulo);
      const ok = itens.filter((r) => CONFERIDOS.has(awbDe(r.dados))).length;
      return h("div", { class: "rot-grupo" + (ok === itens.length ? " completo" : "") },
        h("h3", null, g.rotulo === "(sem entregador)" ? "Sem entregador: atribuir" : `Retirar de ${g.rotulo}`, h("span", null, ` ${fmtN(ok)}/${fmtN(itens.length)}`)),
        h("ol", null, itens.map((r) => {
          const awb = awbDe(r.dados); const feito = CONFERIDOS.has(awb);
          return h("li", { class: feito ? "feito" : "" },
            h("input", { type: "checkbox", id: "rot-" + awb, checked: feito, "aria-label": `Conferida: ${awb}`, on: { change: (e: Event) => { (e.target as HTMLInputElement).checked ? CONFERIDOS.add(awb) : CONFERIDOS.delete(awb); renderizar(); } } }),
            h("span", { class: "rot-awb" }, awbComCopia(awb), chipErro(r.erro_piso!.tipo)),
            h("span", { class: "duas" }, `${r.dados["Consignee City"]} · ${valorTexto("Consignee Area", r.dados["Consignee Area"])}`, h("small", null, valorTexto("Consignee Address", r.dados["Consignee Address"]))),
            h("span", { class: "rot-para" }, icone("seta", "ic ic-xs"), h("span", null, h("small", null, "Passar para"), entregarA(r))));
        })));
    }));
}

// ---------- Pendências de entrega ----------
const REGRA_PEND: Record<Exclude<AbaPend, "justificados">, Filho> = {
  atrasadas: "Regra de pendência: toda peça de Unaí, qualquer que seja a data de chegada, e as das demais cidades que chegaram antes do dia da referência. Peça de outra cidade que chegou no dia da referência, com entrega confirmada ou com tentativa de entrega no dia não entra (as com tentativa estão nas listas de tentativas).",
  tent1: "Peças com ocorrência e exatamente 1 tentativa de entrega. As que já saíram para rota depois da ocorrência aparecem marcadas “já em rota” e não contam nos alertas. Ação nas demais: colocar em rota de novo. O entregador precisa avisar se já está em rota.",
  tent2: "Peças com ocorrência e exatamente 2 tentativas. As que já saíram para rota depois da ocorrência aparecem marcadas “já em rota” e não contam nos alertas. Ação nas demais: colocar em rota de novo e verificar com o entregador se vai devolver a peça.",
  tent3: "3 ou mais tentativas: realizar o processo de devolução. Quando o último motivo não é ausência nem recusa (ex.: reprogramação a pedido do cliente), a peça aparece como “confirmar” antes de devolver.",
  extravio: "O tipo ou o motivo do problema contém “lost” ou “extravi”. Ação: investigar com a transportadora.",
  avaria: "O tipo ou o motivo do problema contém “avaria” ou “danific”, e não é extravio. Não é tentativa de entrega: a peça pode nem ter saído do galpão. Ação: seguir o processo de avaria (sinalizar o piso e pedir aprovação). O relatório não traz o horário de deslacre do caminhão, então os prazos de 4 h (iMile) e 2 h (Anjun) não são medidos aqui.",
  ja_em_rota: "Tinham ocorrência, mas a saída para entrega é POSTERIOR a ela: já foram colocadas em rota de novo. Saem das listas de ação; esta aba serve para conferir.",
};
const ACAO_PEND: Record<Exclude<AbaPend, "justificados">, string> = {
  atrasadas: "Cobrar a entrega", tent1: "Colocar em rota", tent2: "Colocar em rota e ver devolução", tent3: "Iniciar devolução",
  extravio: "Investigar extravio", avaria: "Seguir o processo de avaria", ja_em_rota: "Conferir se está em rota",
};
const TOM_ACAO: Record<Exclude<AbaPend, "justificados">, Tom> = { atrasadas: "atencao", tent1: "atencao", tent2: "atencao", tent3: "critico", extravio: "critico", avaria: "critico", ja_em_rota: "ok" };
const MARCADOS_EXC = new Set<string>();

async function justificarVarias(awbs: string[], motivo: string, observacao: string, reavaliar: string) {
  try {
    let j: Record<string, Justificativa> = {};
    for (const awb of awbs) j = await E.servico!.justificar(awb, { motivo, observacao, reavaliar_em: reavaliar });
    atualizar(() => { E.analise!.justificativas = j; MARCADOS_EXC.clear(); });
    aviso(`${plural(awbs.length, "alerta justificado", "alertas justificados")}. ${awbs.length === 1 ? "Ele foi" : "Eles foram"} para “Justificados”.`);
    return true;
  } catch (e) { aviso(problemaDe(e).titulo + ". " + problemaDe(e).acao, "erro"); return false; }
}
async function reativarAlerta(awb: string) {
  try { const j = await E.servico!.reativar(awb); atualizar(() => { E.analise!.justificativas = j; }); aviso(`Alerta de ${awb} reativado.`); }
  catch (e) { aviso(problemaDe(e).titulo, "erro"); }
}

function formJustificar(awbs: string[], aoConcluir?: () => void): HTMLElement {
  const id = "fj-" + (awbs.length === 1 ? awbs[0] : "lote");
  const form = h("form", { class: "form-just", id, on: { submit: async (e: Event) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const motivo = String(fd.get("motivo") || "").trim();
    const erro = form.querySelector(".erro-campo") as HTMLElement;
    if (!motivo) { erro.hidden = false; (form.querySelector("[name=motivo]") as HTMLElement).focus(); return; }
    const ok = await justificarVarias(awbs, motivo, String(fd.get("obs") || ""), String(fd.get("reav") || ""));
    if (ok && aoConcluir) aoConcluir();
  } } },
    h("label", null, h("span", null, "Motivo ", h("em", null, "(obrigatório)")), h("input", { name: "motivo", id: id + "-m", maxlength: "200", placeholder: "Ex.: cliente reagendou para segunda", "aria-describedby": id + "-e" })),
    h("p", { class: "erro-campo", id: id + "-e", hidden: true }, "Informe um motivo para registrar a justificativa."),
    h("label", null, h("span", null, "Observação"), h("textarea", { name: "obs", id: id + "-o", rows: "2", maxlength: "500" })),
    h("label", null, h("span", null, "Reavaliar em"), h("input", { name: "reav", id: id + "-r", type: "date" })),
    h("p", { class: "nota" }, "A justificativa fica guardada pelo código da encomenda e vale também nas próximas importações. ", rotuloPersistencia()),
    h("button", { type: "submit", class: "btn btn-pri" }, awbs.length === 1 ? "Justificar e silenciar alerta" : `Justificar ${awbs.length} alertas`));
  return form;
}

function rotuloPersistencia(): HTMLElement {
  const p = E.servico?.persistencia;
  const t: Record<Persistencia, string> = {
    servidor: "Salvo no servidor.", compartilhada: "Salvo no banco deste aplicativo, visível para quem tem acesso a ele.",
    navegador: "Salvo apenas neste navegador.", sessao: "Vale só nesta sessão: ao fechar ou recarregar a página, some.", memoria: "Não será guardado: o armazenamento deste navegador está bloqueado.",
  };
  return h("span", { class: "persist persist-" + p }, t[p || "memoria"]);
}

function acaoDe(r: RegAtual, aba: Exclude<AbaPend, "justificados">): string {
  if (aba === "tent3" && !r.motivo_devolucao) return "Confirmar devolução (reprogramação)";
  if ((aba === "tent1" || aba === "tent2") && r.reroteada) return "Já em rota: acompanhar";
  return ACAO_PEND[aba];
}
// Peças de 1 e 2 tentativas variam de ação por linha (em rota ou não); 3 tentativas também (confirmar x devolver).
const ACAO_POR_LINHA: AbaPend[] = ["tent1", "tent2", "tent3"];
const tomDaAcao = (r: RegAtual, aba: Exclude<AbaPend, "justificados">): Tom =>
  aba === "tent3" && !r.motivo_devolucao ? "atencao" : !pedeAcao(aba, r) ? "ok" : TOM_ACAO[aba];

function telaExcecoes(): HTMLElement {
  const a = E.analise!; const f = E.f.excecoes;
  const set = (fn: () => void) => atualizar(() => { fn(); TAB.delete("exc"); });
  const ativas = Object.fromEntries((Object.keys(PEND) as AcaoPend[]).map((k) => [k, pendAtivas(k)])) as Record<AcaoPend, RegAtual[]>;
  const just = pendJustificadas();
  const base = f.aba === "justificados" ? just : ativas[f.aba];
  const filtrada = base.filter((r) => (!f.cidades.length || f.cidades.includes(String(r.dados["Consignee City"]))) && (!f.bairros.length || f.bairros.includes(String(r.dados["Consignee Area"]))) && (!f.entregadores.length || f.entregadores.includes(entregadorDe(r.dados))));
  // Na aba de pendentes, a tabela dinâmica por data de chegada também filtra a lista (datas tiradas da soma e célula clicada).
  const comPivot = f.aba === "atrasadas"; const pv = E.f.pivotEntrega; const datasFora = new Set(pv.datasFora);
  const lista = comPivot ? filtrada.filter((r) => !datasFora.has(diaChegada(r)) && casaCelulaPivot(r, pv.cel, pv.dims)) : filtrada;
  const precisamAcao = a.atual.filter(pendPrecisaAcao).length;
  const g = (r: RegAtual) => r.dados;
  const emAlerta = (k: string) => { const ref = E.idx.get(k); return !!ref && ref.fonte === "atual" && (ref.reg.excecoes.length > 0 || PEND.atrasadas(ref.reg)); };
  const outrasJust = Object.keys(a.justificativas).filter((k) => !emAlerta(k)).length;
  const aba = f.aba === "justificados" ? null : f.aba;
  const colAcao: Coluna<RegAtual> = { id: "acao_sug", rotulo: "Ação sugerida", valor: (r) => (aba ? acaoDe(r, aba) : null),
    render: (r) => (aba ? chip(acaoDe(r, aba), tomDaAcao(r, aba)) : "—") };
  const colDias: Coluna<RegAtual> = { id: "dias", rotulo: "Pendente há", valor: (r) => r.backlog_dias, classe: "num",
    render: (r) => (r.backlog_dias === null ? h("span", { class: "nulo" }, "Sem data") : fmtDias(r.backlog_dias)) };
  // Problema e motivo na mesma coluna (id = chave real do registro, para o filtro de coluna e a exportação).
  const colOcorrencia: Coluna<RegAtual> = { id: "Last Problem Type", rotulo: "Ocorrência", valor: (r) => (r.dados["Last Problem Type"] as string | null),
    render: (r) => (r.dados["Last Problem Type"] ? h("span", { class: "duas" }, String(r.dados["Last Problem Type"]), h("small", null, String(r.dados["Last Problem Reason"] ?? ""))) : h("span", { class: "nulo" }, "—")) };
  const colsBase: Coluna<RegAtual>[] = [colAwb(g), colDado("Consignee City", g), colDado("Delivery Associate", g),
    ...(aba === "atrasadas" ? [colDias] : []),
    colOcorrencia,
    { id: "tent", rotulo: "Tentativas", valor: (r) => r.dados["Delivery Count"] as number, classe: "num", render: (r) => valorTexto("Delivery Count", r.dados["Delivery Count"]) },
    ...(aba && ACAO_POR_LINHA.includes(aba) ? [colAcao, colDado("Last Problem Date", g, "Data da ocorrência"), ...(aba === "tent3" ? [] : [colDado("Delivery Time", g, "Saiu para rota")])] // a ação varia por linha
      : [colDado("Last Problem Date", g, "Data da ocorrência"), colDado("Delivery Time", g, "Saiu para rota")])]; // demais abas: a ação é a mesma para toda a lista (está na regra)
  const colsJust: Coluna<RegAtual>[] = [colAwb(g),
    { id: "tipo", rotulo: "Alerta", valor: (r) => (r.excecoes.length ? r.excecoes.map((x) => ROTULO_EXC[x]).join(", ") : "Pendente"),
      render: (r) => h("span", { class: "chips" }, r.excecoes.length ? r.excecoes.map((x) => chip(ROTULO_EXC[x], "neutro")) : chip("Pendente", "neutro")) },
    { id: "mot", rotulo: "Motivo da justificativa", valor: (r) => a.justificativas[awbDe(r.dados)].motivo },
    { id: "reav", rotulo: "Reavaliar em", valor: (r) => a.justificativas[awbDe(r.dados)].reavaliar_em || null, render: (r) => a.justificativas[awbDe(r.dados)].reavaliar_em ? fmtData(a.justificativas[awbDe(r.dados)].reavaliar_em, false) : h("span", { class: "nulo" }, "Sem data") },
    { id: "acao", rotulo: "Ação", valor: () => null, ordenavel: false, render: (r) => h("button", { type: "button", class: "btn btn-ghost btn-p", on: { click: () => reativarAlerta(awbDe(r.dados)) } }, "Reativar") }];

  const exportar = botaoExportar(`pendencias_entrega_${f.aba}.xlsx`, () => f.aba === "justificados"
    ? { linhas: lista.map((r) => ({ ...r.dados, motivo_alerta: a.justificativas[awbDe(r.dados)].motivo, reavaliar_em: a.justificativas[awbDe(r.dados)].reavaliar_em })), colunas: [...COLUNAS_CONTRATO, "motivo_alerta", "reavaliar_em"] }
    : { linhas: lista.map((r) => ({ ...r.dados, acao_sugerida: aba ? acaoDe(r, aba) : "" })), colunas: [...COLUNAS_CONTRATO, "acao_sugerida"] }, "Exportar Excel", "exc");

  const vazioTit = f.aba === "justificados" ? "Nenhum alerta justificado" : f.aba === "ja_em_rota" ? "Nada por aqui" : "Nada pendente nesta lista";
  const vazioTxt = f.aba === "justificados" ? "Quando você justificar um alerta, ele aparece aqui e pode ser reativado."
    : f.aba === "ja_em_rota" ? "Nenhuma ocorrência saiu para rota de novo depois de registrada." : "Nenhuma encomenda pendente se encaixa nesta regra agora.";

  return h("div", { class: "tela" },
    cabecalho({ area: "Agir agora", titulo: "Pendências de entrega", ajuda: "excecoes", pergunta: "O que preciso colocar em rota, cobrar ou devolver?",
      resposta: h("p", null, h("strong", null, plural(precisamAcao, "encomenda pede", "encomendas pedem")), ` uma ação sua · ${plural(ativas.ja_em_rota.length, "já saiu", "já saíram")} para rota de novo · ${plural(just.length, "justificada", "justificadas")}.`) }),
    abas("exc", [
      { id: "atrasadas" as const, rotulo: "Pendentes", n: ativas.atrasadas.length, tom: "atencao" as Tom },
      { id: "tent1" as const, rotulo: "1 tentativa", n: ativas.tent1.length, tom: "atencao" as Tom },
      { id: "tent2" as const, rotulo: "2 tentativas", n: ativas.tent2.length, tom: "atencao" as Tom },
      { id: "tent3" as const, rotulo: "3 tentativas · devolução", n: ativas.tent3.length, tom: "critico" as Tom },
      { id: "extravio" as const, rotulo: "Extravios", n: ativas.extravio.length, tom: "critico" as Tom },
      { id: "avaria" as const, rotulo: "Avarias", n: ativas.avaria.length, tom: "critico" as Tom },
      { id: "ja_em_rota" as const, rotulo: "Já em rota", n: ativas.ja_em_rota.length },
      { id: "justificados" as const, rotulo: "Justificados", n: just.length },
    ], f.aba, (v) => set(() => { f.aba = v; MARCADOS_EXC.clear(); E.f.pivotEntrega.cel = null; })),
    h("p", { class: "regra" }, explica(f.aba, "aba"), f.aba === "justificados"
      ? ["Alertas silenciados com motivo. Reative para que voltem às listas ativas.", outrasJust ? ` Há ${plural(outrasJust, "outra justificativa guardada", "outras justificativas guardadas")} para encomendas que não estão em alerta nesta análise.` : ""]
      : REGRA_PEND[f.aba]),
    base.length ? barraFiltros([
      multi({ id: "x-cid", rotulo: "Cidade", opcoes: unicos(base.map((r) => r.dados["Consignee City"] as string)), valores: f.cidades, onMudar: (v) => set(() => { f.cidades = v; }) }),
      multi({ id: "x-bai", rotulo: "Bairro", opcoes: unicos(base.filter((r) => !f.cidades.length || f.cidades.includes(String(r.dados["Consignee City"]))).map((r) => r.dados["Consignee Area"] as string)), valores: f.bairros, onMudar: (v) => set(() => { f.bairros = v; }), descricao: "Combina com a cidade." }),
      multi({ id: "x-ent", rotulo: "Entregador", opcoes: unicos(base.map((r) => entregadorDe(r.dados))), valores: f.entregadores, onMudar: (v) => set(() => { f.entregadores = v; }) }),
    ], [...f.cidades.map((x) => ({ texto: "Cidade: " + x, remover: () => set(() => { f.cidades = f.cidades.filter((y) => y !== x); }) })),
        ...f.bairros.map((x) => ({ texto: "Bairro: " + x, remover: () => set(() => { f.bairros = f.bairros.filter((y) => y !== x); }) })),
        ...f.entregadores.map((x) => ({ texto: "Entregador: " + x, remover: () => set(() => { f.entregadores = f.entregadores.filter((y) => y !== x); }) })),
        ...(comPivot ? [...pv.datasFora.map((d) => ({ texto: "Sem a chegada de " + (d === SEM_DATA ? "(sem data)" : fmtDia(d)), remover: () => set(() => { pv.datasFora = pv.datasFora.filter((x) => x !== d); pv.cel = null; }) })),
          ...(pv.cel ? [{ texto: "Tabela · " + rotuloCelulaPivot(pv.cel), remover: () => set(() => { pv.cel = null; }) }] : [])] : [])],
      () => set(() => { f.cidades = []; f.bairros = []; f.entregadores = []; pv.datasFora = []; pv.cel = null; })) : null,
    comPivot && filtrada.length ? pivotChegada({ regs: filtrada, referencia: a.referencia_backlog, set, est: pv }) : null,
    base.length
      ? tabela({ id: "exc", titulo: "Pendências de entrega", linhas: lista, chave: (r) => awbDe(r.dados), onAbrir: (r) => abrirAwb(awbDe(r.dados), f.aba !== "justificados" ? "justificar" : ""),
          ordemInicial: aba === "atrasadas" ? { col: "dias", dir: -1 } : undefined,
          colunas: f.aba === "justificados" ? colsJust : [...colsBase, { id: "acao", rotulo: "Justificar", valor: () => null, ordenavel: false,
            render: (r) => h("button", { type: "button", class: "btn btn-ghost btn-p", on: { click: () => abrirAwb(awbDe(r.dados), "justificar") } }, "Justificar") }],
          selecao: f.aba !== "justificados" ? { marcados: MARCADOS_EXC, onMudar: () => renderizar(), acoes: (n) => h("details", { class: "lote", id: "lote-just" },
            h("summary", { class: "btn btn-sec" }, `Justificar ${n} selecionado${n > 1 ? "s" : ""}`),
            h("div", { class: "lote-pop" }, formJustificar([...MARCADOS_EXC]))) } : undefined,
          exportar })
      : vazio(vazioTit, vazioTxt, null, f.aba === "justificados" ? "neutro" : "ok"));
}
