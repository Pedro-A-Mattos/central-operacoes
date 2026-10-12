// Agir agora: Conferência de piso e Exceções.

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

  const resposta = todos.length
    ? h("div", { class: "resp-linha" },
        h("p", null, h("strong", null, plural(todos.length, "encomenda para revisar", "encomendas para revisar")), " antes do carregamento."),
        h("div", { class: "resp-chips" }, porTipo.map((t) => h("button", { type: "button", class: "chip-btn" + (f.tipos.includes(t.rotulo) ? " sel" : ""), "aria-pressed": f.tipos.includes(t.rotulo) ? "true" : "false",
          on: { click: () => set(() => { f.tipos = f.tipos.includes(t.rotulo) ? f.tipos.filter((x) => x !== t.rotulo) : [t.rotulo]; }) } }, chipErro(t.rotulo), h("strong", null, fmtN(t.valor))))),
        h("span", { class: "resp-ajudas" }, "O que significa:", porTipo.map((t) => h("span", { class: "fig-tit" }, t.rotulo, explica(t.rotulo === "Entregador fora da área" ? "erro_fora_area" : t.rotulo === "Sem entregador" ? "erro_sem_entregador" : "erro_cidade_fora", "resp")))))
    : h("p", null, h("strong", null, "Nenhum problema encontrado."), " Todas as pendentes estão com cidade e entregador dentro das regras.");

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
          ? h("p", null, `Usando o mapa de região (CEP) ${E.mapaRegiaoOrigem === "sessao" ? "carregado nesta sessão pelo Estudo de regiões" : "publicado como padrão"}: cada encomenda é conferida pelo CEP (com retorno para bairro e cidade quando o CEP não tem regra). Um entregador fora do conjunto do CEP aparece como “Entregador fora da área”.`)
          : h("p", null, `As regras de quem entrega onde são aprendidas do relatório base: um entregador vale para uma cidade (ou bairro, nas cidades com ${a.parametros.min_entregadores_urbano} ou mais entregadores) quando tem pelo menos ${a.parametros.limiar_ruido} encomendas lá; o entregador com mais encomendas sempre vale. ${ajustadas ? `${plural(ajustadas, "cidade tem", "cidades têm")} ajuste manual, que tem prioridade.` : "Nenhuma cidade tem ajuste manual."}`),
        h("p", { class: "nota" }, E.mapaRegiaoAtivo ? "Para trocar o mapa, gere um novo no Estudo de regiões e clique em “Usar neste navegador”." : "Uma regra derivada repete o histórico, inclusive erros recorrentes. Confirme antes de corrigir.", a.regras.cidades_ignoradas.length ? ` Cidades fora da conferência: ${a.regras.cidades_ignoradas.join(", ")}.` : ""))),
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
              { id: "ent", rotulo: "Está com", valor: (r) => entregadorDe(r.dados), render: (r) => r.dados["Delivery Associate"] === null ? h("span", { class: "nulo" }, "Sem entregador") : String(r.dados["Delivery Associate"]) },
              { id: "esp", rotulo: "Deveria estar com", valor: (r) => r.erro_piso!.esperados.join(", "), render: (r) => h("span", { class: "duas" }, r.erro_piso!.esperados.length ? r.erro_piso!.esperados.join(" ou ") : h("span", { class: "nulo" }, "Sem regra para indicar"), h("small", null, (r.erro_piso!.escopo === "cep" ? "regra do CEP · " : r.erro_piso!.escopo === "bairro" ? "regra do bairro · " : "regra da cidade · ") + r.erro_piso!.origem_regra)) },
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
            h("span", { class: "rot-awb" }, h("button", { type: "button", class: "awb", "data-awb": awb, on: { click: () => abrirAwb(awb) } }, awb), chipErro(r.erro_piso!.tipo)),
            h("span", { class: "duas" }, `${r.dados["Consignee City"]} · ${valorTexto("Consignee Area", r.dados["Consignee Area"])}`, h("small", null, valorTexto("Consignee Address", r.dados["Consignee Address"]))),
            h("span", { class: "rot-para" }, icone("seta", "ic ic-xs"), h("span", null, h("small", null, "Passar para"), entregarA(r))));
        })));
    }));
}

// ---------- Exceções ----------
const REGRA_EXC: Record<TipoExcecao, Filho> = {
  devolucao: "Regra: 3 ou mais tentativas de entrega e o último motivo é ausência ou recusa (não recebido, local fechado, telefone não atendido ou errado, recusado).",
  revisar_tentativas: "3 ou mais tentativas, mas o último motivo não é ausência nem recusa (ex.: reprogramação a pedido do cliente). Não é devolução automática: decida caso a caso.",
  extravio: "Regra atual: o tipo ou o motivo do problema contém “lost” ou “extravi”.",
  insucesso: "Regra atual: tem problema registrado, menos de 3 tentativas e não é extravio. Aguarda nova tentativa.",
};
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
    navegador: "Salvo apenas neste navegador.", memoria: "Não será guardado: o armazenamento deste navegador está bloqueado.",
  };
  return h("span", { class: "persist persist-" + p }, t[p || "memoria"]);
}

function telaExcecoes(): HTMLElement {
  const a = E.analise!; const f = E.f.excecoes;
  const set = (fn: () => void) => atualizar(() => { fn(); TAB.delete("exc"); });
  const ativasPor: Record<TipoExcecao, RegAtual[]> = { devolucao: excAtivas("devolucao"), extravio: excAtivas("extravio"), insucesso: excAtivas("insucesso"), revisar_tentativas: excAtivas("revisar_tentativas") };
  const just = excJustificadas();
  const base = f.aba === "justificados" ? just : ativasPor[f.aba];
  const lista = base.filter((r) => (!f.cidades.length || f.cidades.includes(String(r.dados["Consignee City"]))) && (!f.bairros.length || f.bairros.includes(String(r.dados["Consignee Area"]))) && (!f.entregadores.length || f.entregadores.includes(entregadorDe(r.dados))));
  const totalAtivas = ativasPor.devolucao.length + ativasPor.extravio.length + ativasPor.insucesso.length + ativasPor.revisar_tentativas.length;
  const g = (r: RegAtual) => r.dados;
  const outrasJust = Object.keys(a.justificativas).filter((k) => !E.idx.has(k) || !(E.idx.get(k)!.fonte === "atual" && (E.idx.get(k) as any).reg.excecoes.length)).length;
  const colsBase: Coluna<RegAtual>[] = [colAwb(g), colDado("Consignee City", g), colDado("Delivery Associate", g), colDado("Last Problem Type", g, "Problema"), colDado("Last Problem Reason", g, "Motivo"),
    { id: "tent", rotulo: "Tentativas", valor: (r) => r.dados["Delivery Count"] as number, classe: "num", render: (r) => valorTexto("Delivery Count", r.dados["Delivery Count"]) },
    colDado("Last Problem Date", g)];
  const colsJust: Coluna<RegAtual>[] = [colAwb(g),
    { id: "tipo", rotulo: "Alerta", valor: (r) => r.excecoes.map((x) => ROTULO_EXC[x]).join(", "), render: (r) => h("span", { class: "chips" }, r.excecoes.map((x) => chip(ROTULO_EXC[x], "neutro"))) },
    { id: "mot", rotulo: "Motivo da justificativa", valor: (r) => a.justificativas[awbDe(r.dados)].motivo },
    { id: "reav", rotulo: "Reavaliar em", valor: (r) => a.justificativas[awbDe(r.dados)].reavaliar_em || null, render: (r) => a.justificativas[awbDe(r.dados)].reavaliar_em ? fmtData(a.justificativas[awbDe(r.dados)].reavaliar_em, false) : h("span", { class: "nulo" }, "Sem data") },
    { id: "acao", rotulo: "Ação", valor: () => null, ordenavel: false, render: (r) => h("button", { type: "button", class: "btn btn-ghost btn-p", on: { click: () => reativarAlerta(awbDe(r.dados)) } }, "Reativar") }];

  const exportar = botaoExportar(`excecoes_${f.aba}.xlsx`, () => f.aba === "justificados"
    ? { linhas: lista.map((r) => ({ ...r.dados, motivo_alerta: a.justificativas[awbDe(r.dados)].motivo, reavaliar_em: a.justificativas[awbDe(r.dados)].reavaliar_em })), colunas: [...COLUNAS_CONTRATO, "motivo_alerta", "reavaliar_em"] }
    : { linhas: lista.map((r) => r.dados), colunas: COLUNAS_CONTRATO }, "Exportar Excel", "exc");

  return h("div", { class: "tela" },
    cabecalho({ area: "Agir agora", titulo: "Exceções", ajuda: "excecoes", pergunta: "O que saiu do fluxo normal e precisa de uma decisão?",
      resposta: h("p", null, h("strong", null, plural(totalAtivas, "alerta ativo", "alertas ativos")), ` · ${plural(just.length, "justificado", "justificados")} nesta análise.`) }),
    abas("exc", [
      { id: "devolucao" as const, rotulo: "Devolução", n: ativasPor.devolucao.length, tom: "critico" as Tom },
      { id: "extravio" as const, rotulo: "Extravios", n: ativasPor.extravio.length, tom: "critico" as Tom },
      { id: "insucesso" as const, rotulo: "Insucessos", n: ativasPor.insucesso.length, tom: "atencao" as Tom },
      { id: "revisar_tentativas" as const, rotulo: "3+ tentativas, revisar", n: ativasPor.revisar_tentativas.length, tom: "atencao" as Tom },
      { id: "justificados" as const, rotulo: "Justificados", n: just.length },
    ], f.aba, (v) => set(() => { f.aba = v; MARCADOS_EXC.clear(); })),
    h("p", { class: "regra" }, explica(f.aba === "justificados" ? "justificados" : f.aba, "aba"), f.aba === "justificados"
      ? ["Alertas silenciados com motivo. Reative para que voltem às listas ativas.", outrasJust ? ` Há ${plural(outrasJust, "outra justificativa guardada", "outras justificativas guardadas")} para encomendas que não estão em alerta nesta análise.` : ""]
      : REGRA_EXC[f.aba]),
    base.length ? barraFiltros([
      multi({ id: "x-cid", rotulo: "Cidade", opcoes: unicos(base.map((r) => r.dados["Consignee City"] as string)), valores: f.cidades, onMudar: (v) => set(() => { f.cidades = v; }) }),
      multi({ id: "x-bai", rotulo: "Bairro", opcoes: unicos(base.filter((r) => !f.cidades.length || f.cidades.includes(String(r.dados["Consignee City"]))).map((r) => r.dados["Consignee Area"] as string)), valores: f.bairros, onMudar: (v) => set(() => { f.bairros = v; }), descricao: "Combina com a cidade." }),
      multi({ id: "x-ent", rotulo: "Entregador", opcoes: unicos(base.map((r) => entregadorDe(r.dados))), valores: f.entregadores, onMudar: (v) => set(() => { f.entregadores = v; }) }),
    ], [...f.cidades.map((x) => ({ texto: "Cidade: " + x, remover: () => set(() => { f.cidades = f.cidades.filter((y) => y !== x); }) })),
        ...f.bairros.map((x) => ({ texto: "Bairro: " + x, remover: () => set(() => { f.bairros = f.bairros.filter((y) => y !== x); }) })),
        ...f.entregadores.map((x) => ({ texto: "Entregador: " + x, remover: () => set(() => { f.entregadores = f.entregadores.filter((y) => y !== x); }) }))],
      () => set(() => { f.cidades = []; f.bairros = []; f.entregadores = []; })) : null,
    base.length
      ? tabela({ id: "exc", titulo: "Exceções", linhas: lista, chave: (r) => awbDe(r.dados), onAbrir: (r) => abrirAwb(awbDe(r.dados), f.aba !== "justificados" ? "justificar" : ""),
          colunas: f.aba === "justificados" ? colsJust : [...colsBase, { id: "acao", rotulo: "Ação", valor: () => null, ordenavel: false,
            render: (r) => h("button", { type: "button", class: "btn btn-ghost btn-p", on: { click: () => abrirAwb(awbDe(r.dados), "justificar") } }, "Justificar") }],
          selecao: f.aba !== "justificados" ? { marcados: MARCADOS_EXC, onMudar: () => renderizar(), acoes: (n) => h("details", { class: "lote", id: "lote-just" },
            h("summary", { class: "btn btn-sec" }, `Justificar ${n} selecionado${n > 1 ? "s" : ""}`),
            h("div", { class: "lote-pop" }, formJustificar([...MARCADOS_EXC]))) } : undefined,
          exportar })
      : vazio(f.aba === "justificados" ? "Nenhum alerta justificado" : "Nenhum alerta ativo", f.aba === "justificados" ? "Quando você justificar um alerta, ele aparece aqui e pode ser reativado." : "Nenhuma encomenda pendente se encaixa nesta regra agora.", null, f.aba === "justificados" ? "neutro" : "ok"));
}
