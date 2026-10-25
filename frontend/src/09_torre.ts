// Torre de controle: "Como está a operação e o que precisa da minha atenção?"

// Verbete de cada alerta da Torre (para a dica ao passar o mouse), pela ação e pela origem.
const AJUDA_POR_ACAO: Record<string, string> = {
  "Revisar antes do carregamento": "piso", "Iniciar devolução": "tent3", "Colocar em rota e ver devolução": "tent2", "Colocar em rota": "tent1",
  "Seguir o processo de avaria": "avaria", "Cobrar a entrega": "atrasadas", "Cobrar retorno do entregador": "tempo_rota", "Priorizar": "tempo_espera", "Confirmar com a transportadora": "possivel_devolucao",
  "Ver quais são": "entregue_confirmada",
};
const ajudaDoAlerta = (acao: string, origem: string) => (acao === "Investigar" ? (origem === "O que mudou" ? "saiu_com_ocorrencia" : "extravio") : AJUDA_POR_ACAO[acao]);

function telaTorre(): HTMLElement {
  const a = E.analise!;
  const piso = errosPiso();
  const porTipo = contar(piso, (r) => r.erro_piso!.tipo);
  const t1 = pendAcao("tent1"), t2 = pendAcao("tent2"), t3 = pendAtivas("tent3"), ext = pendAtivas("extravio"), avr = pendAtivas("avaria"), atr = pendAtivas("atrasadas");
  const velhas = a.atual.filter((r) => r.faixa_backlog === "4+ dias");
  const comProblema = a.atual.filter((r) => r.dados["Last Problem Type"] !== null);
  const vigentes = comProblema.filter((r) => !r.reroteada && !r.entrega_confirmada);
  const tratadasN = a.atual.filter((r) => r.reroteada && !r.entrega_confirmada).length;
  const semData = a.atual.filter((r) => r.backlog_dias === null).length;
  const depoisRef = a.atual.filter((r) => r.backlog_dias !== null && r.backlog_dias < 0).length;

  type Alerta = { tom: Tom; n: number; texto: string; origem: string; acao: string; ir: () => void; extra?: Filho };
  const alertas: Alerta[] = [];
  if (piso.length) alertas.push({ tom: "critico", n: piso.length, texto: `${plural(piso.length, "encomenda", "encomendas")} com possível erro de cidade ou entregador`, origem: "Conferência de piso", acao: "Revisar antes do carregamento",
    ir: () => navegar("piso", { de: "torre", prep: () => { E.f.piso = filtrosVazios().piso; } }),
    extra: h("span", { class: "alerta-sub" }, porTipo.map((t) => h("button", { type: "button", class: "link", on: { click: () => navegar("piso", { de: "torre", prep: () => { E.f.piso = { ...filtrosVazios().piso, tipos: [t.rotulo] }; } }) } }, `${t.rotulo}: ${fmtN(t.valor)}`))) });
  const irPend3 = (aba: AbaPend) => () => navegar("excecoes", { de: "torre", prep: () => { E.f.excecoes = { ...filtrosVazios().excecoes, aba }; } });
  if (t3.length) {
    const confirmar = t3.filter((r) => !r.motivo_devolucao).length;
    alertas.push({ tom: "critico", n: t3.length, texto: `${plural(t3.length, "encomenda com", "encomendas com")} 3 ou mais tentativas: iniciar a devolução${confirmar ? ` (${confirmar} por motivo que não é ausência, confirmar)` : ""}`, origem: "Pendências de entrega", acao: "Iniciar devolução", ir: irPend3("tent3") });
  }
  if (ext.length) alertas.push({ tom: "critico", n: ext.length, texto: `${plural(ext.length, "possível extravio", "possíveis extravios")}`, origem: "Pendências de entrega", acao: "Investigar", ir: irPend3("extravio") });
  if (avr.length) alertas.push({ tom: "critico", n: avr.length, texto: `${plural(avr.length, "encomenda com avaria", "encomendas com avaria")}: seguir o processo de avaria (sinalizar o piso e pedir aprovação)`, origem: "Pendências de entrega", acao: "Seguir o processo de avaria", ir: irPend3("avaria") });
  if (t2.length) alertas.push({ tom: "atencao", n: t2.length, texto: `${plural(t2.length, "encomenda com", "encomendas com")} 2 tentativas e sem nova saída para rota: colocar em rota e ver com o entregador se devolve`, origem: "Pendências de entrega", acao: "Colocar em rota e ver devolução", ir: irPend3("tent2") });
  if (t1.length) alertas.push({ tom: "atencao", n: t1.length, texto: `${plural(t1.length, "encomenda com", "encomendas com")} 1 tentativa e sem nova saída para rota: colocar em rota de novo`, origem: "Pendências de entrega", acao: "Colocar em rota", ir: irPend3("tent1") });
  if (atr.length) alertas.push({ tom: "atencao", n: atr.length, texto: `${plural(atr.length, "encomenda pendente", "encomendas pendentes")}: peças de Unaí e das demais cidades que chegaram antes de ${fmtDia(refDiaAnalise())}`, origem: "Pendências de entrega", acao: "Cobrar a entrega", ir: irPend3("atrasadas") });
  const longas = a.atual.filter((r) => faixaRota(r) === "Mais de 24 h");
  if (longas.length) alertas.push({ tom: "atencao", n: longas.length, texto: `${plural(longas.length, "encomenda saiu", "encomendas saíram")} para entrega há mais de 24 h e ${longas.length === 1 ? "segue" : "seguem"} sem entrega confirmada`, origem: "Pendências · tempo em rota", acao: "Cobrar retorno do entregador",
    ir: () => navegar("pendencias", { de: "torre", prep: () => { E.f.pendencias = { ...filtrosVazios().pendencias, rota: ["Mais de 24 h"] }; } }) });
  if (velhas.length) alertas.push({ tom: "atencao", n: velhas.length, texto: `${plural(velhas.length, "encomenda chegou", "encomendas chegaram")} há 4 dias ou mais e ${velhas.length === 1 ? "segue pendente" : "seguem pendentes"}`, origem: "Pendências", acao: "Priorizar",
    ir: () => navegar("pendencias", { de: "torre", prep: () => { E.f.pendencias = { ...filtrosVazios().pendencias, faixas: ["4+ dias"] }; } }) });
  if (a.resumo.saiu_devolucao) alertas.push({ tom: "inferido", n: a.resumo.saiu_devolucao, texto: `${plural(a.resumo.saiu_devolucao, "encomenda saiu", "encomendas saíram")} do relatório com indício de devolução`, origem: "O que mudou", acao: "Confirmar com a transportadora",
    ir: () => navegar("mudancas", { de: "torre", prep: () => { E.f.mudancas.aba = "possivel_devolucao"; } }) });

  if (a.resumo.saiu_com_ocorrencia) alertas.push({ tom: "atencao", n: a.resumo.saiu_com_ocorrencia, texto: `${plural(a.resumo.saiu_com_ocorrencia, "encomenda saiu", "encomendas saíram")} do relatório com extravio ou avaria (sumir não prova entrega)`, origem: "O que mudou", acao: "Investigar",
    ir: () => navegar("mudancas", { de: "torre", prep: () => { E.f.mudancas.aba = "saiu_com_ocorrencia"; } }) });
  if (a.entregues_confirmadas) alertas.push({ tom: "info", n: a.entregues_confirmadas, texto: `${plural(a.entregues_confirmadas, "encomenda do relatório atualizado já consta", "encomendas do relatório atualizado já constam")} como entregue e segue contada como pendente`, origem: "Regra RN-003 · decisão pendente", acao: "Ver quais são",
    ir: () => navegar("pendencias", { de: "torre", prep: () => { E.f.pendencias = { ...filtrosVazios().pendencias, classes: ["Entregue"] }; } }) });

  const kpis = h("div", { class: "kpis" },
    kpi({ rotulo: "Prováveis entregas", ajuda: "provavel_entrega", valor: a.resumo.saiu_entregue, selo: "inferido", nota: "Peças abertas que saíram do relatório, sem sinal de devolução, extravio ou avaria", destino: () => navegar("mudancas", { de: "torre", prep: () => { E.f.mudancas.aba = "provavel_entrega"; } }) }),
    kpi({ rotulo: "Possíveis devoluções", ajuda: "possivel_devolucao", valor: a.resumo.saiu_devolucao, selo: "inferido", nota: "Saíram com palavra de devolução no problema", destino: () => navegar("mudancas", { de: "torre", prep: () => { E.f.mudancas.aba = "possivel_devolucao"; } }) }),
    kpi({ rotulo: "Novas", ajuda: "novas", valor: a.resumo.novas, nota: "Só aparecem no relatório atualizado", destino: () => navegar("mudancas", { de: "torre", prep: () => { E.f.mudancas.aba = "novas"; } }) }),
    kpi({ rotulo: "Ocorrência vigente", ajuda: "com_ocorrencia", valor: vigentes.length, tom: vigentes.length ? "atencao" : undefined, nota: `${fmtN(tratadasN)} com ocorrência já saíram para rota de novo`, destino: () => navegar("pendencias", { de: "torre", prep: () => { E.f.pendencias = { ...filtrosVazios().pendencias, ocorrencia: "vigente" }; } }) }),
    kpi({ rotulo: "Problemas de piso", ajuda: "piso", valor: piso.length, tom: piso.length ? "critico" : "ok", nota: "Cidade ou entregador fora da regra", destino: () => navegar("piso", { de: "torre", prep: () => { E.f.piso = filtrosVazios().piso; } }) }));

  const destaque = h("section", { class: "pend-destaque", "aria-labelledby": "pend-tit" },
    h("h2", { id: "pend-tit", class: "sr" }, "Encomendas pendentes"),
    kpi({ id: "kpi-pendentes", rotulo: "Pendentes", ajuda: "pendente", valor: a.resumo.pendentes, nota: "Encomendas no relatório atualizado, depois dos filtros ao lado",
      destino: () => navegar("pendencias", { de: "torre", prep: () => { E.f.pendencias = filtrosVazios().pendencias; } }) }),
    funilTotais(a));

  const irPend = (prep: (f: FiltrosPend) => void) => navegar("pendencias", { de: "torre", prep: () => { const f = filtrosVazios().pendencias; prep(f); E.f.pendencias = f; } });
  const refDia = a.referencia_backlog.slice(0, 10);
  const chegadas: ItemBarra[] = diasDoRecorte(a.atual).filter((x) => x.dia !== SEM_DATA).map(({ dia, n }) => {
    const idade = idadeEmDias(dia, refDia); const tom = tomIdade(idade);
    return { rotulo: `${fmtDiaCurto(dia)} · ${rotuloIdade(idade)}`, chave: dia, valor: n, tom: tom === "neutro" ? undefined : tom };
  });

  return h("div", { class: "tela" },
    cabecalho({ area: "Visão central", titulo: "Torre de controle", pergunta: "Como está a operação e o que precisa da minha atenção?" }),
    a.ordem.possivel_inversao ? h("div", { class: "alerta-caixa tom-atencao", role: "alert" }, icone("alerta"),
      h("div", null, h("strong", null, "Os relatórios podem ter sido importados na ordem invertida"),
        h("p", null, `${a.ordem.evento_base && a.ordem.evento_atual ? `O evento mais recente do base (${fmtData(a.ordem.evento_base)}) é posterior ao do atualizado (${fmtData(a.ordem.evento_atual)}).` : `${fmtN(a.ordem.so_no_atual)} códigos só no atualizado contra ${fmtN(a.ordem.so_na_base)} só na base.`} Se estiverem invertidos, entregas e novas trocam de lugar.`),
        h("button", { type: "button", class: "btn btn-sec", on: { click: () => navegar("importar") } }, "Revisar a importação"))) : null,
    destaque,
    h("section", { "aria-labelledby": "ind-tit" }, h("h2", { id: "ind-tit", class: "sr" }, "Indicadores"), kpis,
      h("p", { class: "rodape-kpi" }, `Base com ${fmtN(a.resumo.base_total)} encomendas · ${plural(a.resumo.mudou_status, "mudança de status", "mudanças de status")} · ${fmtN(a.resumo.saiu_ja_entregue)} já entregues antes saíram do relatório (não contam como progresso) · ${plural(a.etapas.fora_atual, "encomenda", "encomendas")} fora da jurisdição e ${plural(a.etapas.fm_atual, "de força maior", "de força maior")} não entram nos números.`)),
    h("div", { class: "graficos g2" },
      barras({ id: "t-cid", ajuda: "por_cidade", titulo: "Pendências por cidade", descricao: "Encomendas no relatório atualizado. Clique para ver a lista.", unidade: ["encomenda", "encomendas"],
        itens: contar(a.atual, (r) => r.dados["Consignee City"] as string), max: 8, onSelecionar: (it) => it && irPend((f) => { f.sel = { dim: "cidade", valor: it.rotulo, rotulo: "Cidade: " + it.rotulo }; }) }),
      barras({ id: "t-fx", ajuda: "pivot_chegada", titulo: "Pendentes por data de chegada", descricao: `Dia de chegada ao galpão, até ${fmtData(a.referencia_backlog)}. Clique num dia; a tabela por cidade está em Pendências.`, unidade: ["encomenda", "encomendas"], itens: chegadas,
        onSelecionar: (it) => it && irPend((f) => { f.dias = [it.chave as string]; }),
        legenda: semData || depoisRef ? `${[semData ? `${plural(semData, "encomenda", "encomendas")} sem data de chegada` : "", depoisRef ? `${plural(depoisRef, "encomenda chegou", "encomendas chegaram")} DEPOIS da data de referência (revise a referência)` : ""].filter(Boolean).join(" e ")}.` : null }),
      barras({ id: "t-prob", ajuda: "tipos_problema", titulo: "Ocorrências registradas", descricao: "Tipo do último problema nas pendentes.", unidade: ["encomenda", "encomendas"],
        itens: contar(comProblema, (r) => r.dados["Last Problem Type"] as string).map((x) => ({ ...x, tom: "atencao" as Tom })), max: 6,
        onSelecionar: (it) => it && irPend((f) => { f.sel = { dim: "problema", valor: it.rotulo, rotulo: "Problema: " + it.rotulo }; }), vazio: "Nenhuma pendente com problema registrado." }),
      barras({ id: "t-ent", ajuda: "por_entregador", titulo: "Entregadores com mais pendências", descricao: "Encomendas atribuídas no relatório atualizado. Clique para ver o desempenho.", unidade: ["encomenda", "encomendas"],
        itens: contar(a.atual, (r) => entregadorDe(r.dados)).map((x) => ({ ...x, tom: x.rotulo === "(sem entregador)" ? "atencao" as Tom : undefined })), max: 8,
        onSelecionar: (it) => it && (it.rotulo === "(sem entregador)"
          ? irPend((f) => { f.semEntregador = true; })
          : navegar("entregadores", { de: "torre", prep: () => { E.f.entregadores.sel = { entregador: it.rotulo, classe: null }; } })) })),
    h("section", { class: "atencao", "aria-labelledby": "at-tit" },
      h("h2", { id: "at-tit" }, "Precisa da sua atenção"),
      alertas.length ? h("ul", { class: "alertas" }, alertas.map((al) => h("li", { class: "alerta tom-" + al.tom },
        h("span", { class: "alerta-n" }, fmtN(al.n)),
        h("div", { class: "alerta-txt" }, h("strong", { "data-explica": ajudaDoAlerta(al.acao, al.origem) }, al.texto), h("span", { class: "alerta-origem" }, al.origem, al.tom === "inferido" ? selo("inferido") : null), al.extra || null),
        h("button", { type: "button", class: "btn btn-sec alerta-acao", on: { click: al.ir } }, al.acao, icone("seta", "ic ic-sm")))))
        : vazio("Nada exige ação agora", "Sem problemas de piso, exceções ativas ou encomendas paradas há 4 dias ou mais.", null, "ok")));
}

// Conferência de totais: de quantas linhas do arquivo até o número de pendentes.
// Usa só `etapas`, que os dois motores já devolvem, para o funil nunca divergir.
// Com `ate = "piso"`, o funil continua até as encomendas realmente conferidas na Conferência de piso
// (descontando as cidades fora da conferência), para o total bater com a tela.
function funilTotais(a: Analise, aberto = true, ate: "pendentes" | "piso" = "pendentes"): HTMLElement {
  const e = a.etapas, par = a.parametros;
  type Passo = { rotulo: string; n: number; nota: string; ir?: () => void };
  const retiradas: Passo[] = [];
  const arq = E.imp.atual && E.imp.atual.nome === a.arquivos.atual ? E.imp.atual : null;
  const linhasArquivo = arq ? arq.linhas : e.atual_lidas;
  const semCodigo = linhasArquivo - e.atual_lidas;
  if (semCodigo > 0) retiradas.push({ rotulo: "Sem código ou repetidas", n: semCodigo, nota: "Linhas sem AWB ou com AWB repetida (fica a última ocorrência)" });
  retiradas.push(
    { rotulo: "Descarregado", n: e.descarregado_atual, nota: par.ignorar_descarregado ? "Status “descarregado” (filtro ligado)" : "Filtro desligado" },
    { rotulo: "Não recebido", n: e.nao_recebido_atual, nota: par.ignorar_nao_recebido ? "Status ou tipo de problema “não recebido” (filtro ligado)" : "Filtro desligado",
      ir: () => navegar("nao-recebido", { de: "torre" }) },
    { rotulo: "Força maior", n: e.fm_atual, nota: "Ocorrência de força maior (FM): sempre retirada da análise" },
    { rotulo: "Sem cidade", n: e.fora_atual, nota: "Sem cidade de destino: ficam em Fora da jurisdição", ir: () => navegar("fora", { de: "torre" }) },
    { rotulo: "Retiradas pelo outro relatório", n: e.cruzadas_atual ?? 0, nota: "O relatório base traz a peça como FM, descarregado, não recebido ou sem cidade: ela sai da análise nos dois" });
  const conferem = linhasArquivo - retiradas.reduce((s, r) => s + r.n, 0) === a.resumo.ultima_total;
  let total = a.resumo.ultima_total, rotuloTotal = "Encomendas no relatório atualizado";
  if (ate === "piso") {
    const ign = new Set(a.regras.cidades_ignoradas);
    const nIgn = ign.size ? a.atual.filter((r) => ign.has(String(r.dados["Consignee City"]))).length : 0;
    retiradas.push({ rotulo: "Cidades fora da conferência", n: nIgn, nota: ign.size ? `Cidades marcadas para não conferir: ${[...ign].join(", ")}` : "Nenhuma cidade marcada para ficar de fora" });
    total -= nIgn; rotuloTotal = "Encomendas conferidas no piso";
  }
  return h("details", { class: "funil", open: aberto },
    h("summary", null, h("strong", null, "Como chegamos a este número"), h("span", { class: "funil-resumo" }, `${fmtN(linhasArquivo)} → ${fmtN(total)}`)),
    h("ol", { class: "funil-lista", "aria-label": "Conferência de totais do relatório atualizado" },
      h("li", { class: "funil-linha" }, h("span", { class: "funil-sinal", "aria-hidden": "true" }), h("span", { class: "funil-rot" }, arq ? "Linhas no arquivo atualizado" : "Códigos únicos no relatório atualizado"), h("strong", null, fmtN(linhasArquivo))),
      retiradas.map((r) => h("li", { class: "funil-linha" + (r.n ? "" : " zero") },
        h("span", { class: "funil-sinal", "aria-hidden": "true" }, "−"),
        h("span", { class: "funil-rot" }, r.ir && r.n ? h("button", { type: "button", class: "link", on: { click: r.ir } }, r.rotulo) : r.rotulo, h("small", null, r.nota)),
        h("strong", null, fmtN(r.n)))),
      h("li", { class: "funil-linha total" }, h("span", { class: "funil-sinal", "aria-hidden": "true" }, "="), h("span", { class: "funil-rot" }, rotuloTotal), h("strong", null, fmtN(total)))),
    conferem ? null : h("p", { class: "nota" }, "Os passos não somam exatamente porque algum filtro atua nos dois relatórios; confira em Importação e critérios."));
}
