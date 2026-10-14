// Importação guiada: Selecionar → Validar → Confirmar → Processar → Resultado.

type Papel = "base" | "atual";

async function receberArquivo(papel: Papel, arquivo: File) {
  atualizar(() => { E.exemplo = false; if (papel === "atual") E.params.referencia_backlog = null; E.imp.lendo[papel] = true; E.imp.erro[papel] = null; E.imp[papel] = null; E.imp.ordem = null; });
  try {
    const info = await E.servico!.receber(arquivo);
    atualizar(() => { E.imp[papel] = info; });
    await checarOrdem();
  } catch (e) {
    atualizar(() => { E.imp.erro[papel] = problemaDe(e); });
  } finally { atualizar(() => { E.imp.lendo[papel] = false; }); }
}

const pronto = (v: ValidacaoArquivo | null) => !!v && !v.problemas.length && !!v.token;

async function checarOrdem() {
  if (!pronto(E.imp.base) || !pronto(E.imp.atual)) return;
  try { const o = await E.servico!.verificarOrdem(E.imp.base!, E.imp.atual!); atualizar(() => { E.imp.ordem = o; }); }
  catch { atualizar(() => { E.imp.ordem = null; }); }
}

async function usarExemplos(processarDireto = false) {
  atualizar(() => { E.imp.lendo.base = E.imp.lendo.atual = true; E.imp.erroGeral = null; });
  try {
    const ex = await E.servico!.exemplos();
    if (!ex) throw new ErroServico({ titulo: "Exemplos indisponíveis", significado: "Esta instalação não inclui os relatórios de exemplo.", acao: "Envie os seus relatórios Dispatch." });
    atualizar(() => { E.exemplo = true; E.imp.base = ex.base; E.imp.atual = ex.atual; E.imp.erro.base = E.imp.erro.atual = null; });
    await checarOrdem();
    if (processarDireto) await processar();
  } catch (e) { atualizar(() => { E.imp.erroGeral = problemaDe(e); }); }
  finally { atualizar(() => { E.imp.lendo.base = E.imp.lendo.atual = false; }); }
}

function trocarOrdem() {
  atualizar(() => { const b = E.imp.base; E.imp.base = E.imp.atual; E.imp.atual = b; const eb = E.imp.erro.base; E.imp.erro.base = E.imp.erro.atual; E.imp.erro.atual = eb; E.imp.ordem = null; });
  checarOrdem();
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

function registroDe(a: Analise): RegistroImportacao {
  const porEnt: Record<string, number> = {};
  for (const r of a.atual) { const e = entregadorDe(r.dados); porEnt[e] = (porEnt[e] || 0) + 1; }
  return {
    chave: a.referencia_backlog + "|" + a.arquivos.atual, referencia: a.referencia_backlog, referencia_origem: a.referencia_origem,
    gerado_em: a.gerado_em, arquivos: a.arquivos,
    resumo: { pendentes: a.resumo.pendentes, saiu_entregue: a.resumo.saiu_entregue, saiu_devolucao: a.resumo.saiu_devolucao, novas: a.resumo.novas },
    piso: a.atual.filter((r) => r.erro_piso).length,
    excecoes: a.atual.filter((r) => r.excecoes.length && !a.justificativas[awbDe(r.dados)]).length,
    acoes: a.atual.filter(pendPrecisaAcao).length,
    filtros: { descarregado: a.parametros.ignorar_descarregado, nao_recebido: a.parametros.ignorar_nao_recebido },
    em_rota_24h: a.atual.filter((r) => (r.em_rota_min ?? 0) >= 1440).length,
    por_entregador: porEnt,
    pendentes: a.atual.map((r) => awbDe(r.dados)),
  };
}

// Modo "conferir piso de 1 tabela": usa a mesma planilha como base e atualizado,
// com o mapa de região ativo. Todas as linhas viram "pendentes" e a conferência
// de piso roda por região (CEP). Exige um mapa de região ativo.
async function processarPisoUnico() {
  const arq = E.imp.base;
  if (!pronto(arq)) return;
  if (!E.mapaRegiaoAtivo) {
    atualizar(() => { E.imp.erroGeral = { titulo: "Nenhum mapa de região definido", significado: "A conferência de piso de uma tabela usa o mapa de quem atende cada região (CEP). Sem ele, não há como apontar atribuições erradas.", acao: "Abra o Estudo de regiões, gere o mapa e clique em “Gerar e usar este mapa” (ou publique o regras_regiao.json padrão)." }; });
    return;
  }
  const etapas = ["Conferindo o relatório", "Removendo força maior e separando fora da jurisdição", "Aplicando o mapa de região", "Conferindo o piso"];
  atualizar(() => { E.imp.processando = true; E.imp.erroGeral = null; E.imp.etapas = etapas.map((t) => ({ texto: t, feito: false })); });
  try {
    E.imp.etapas[0].feito = true; renderizar(); await espera(60);
    // base == atual: nada "sai"; tudo é pendente e conferido pelo mapa de região
    const a = await E.servico!.analisar(arq!, arq!, { ...E.params, mapa_regiao: E.mapaRegiaoAtivo });
    for (const et of E.imp.etapas) et.feito = true;
    renderizar(); await espera(120);
    atualizar(() => {
      E.analise = a; indexar(a); E.desempenho = a.desempenho;
      E.overrides = { por_cidade: {}, cidades_ignoradas: [] };
      E.f = filtrosVazios(); E.pisoUnico = true; E.imp.processando = false;
    });
    E.servico!.obterRegras().then((ov) => atualizar(() => { E.overrides = ov; })).catch(() => {});
    navegar("piso");
    aviso(`Conferência de piso: ${plural(errosPiso().length, "encomenda para revisar", "encomendas para revisar")} de ${fmtN(a.resumo.pendentes)}.`);
  } catch (e) {
    atualizar(() => { E.imp.processando = false; E.imp.erroGeral = problemaDe(e); });
  }
}

async function processar(reprocessar = false) {
  if (!pronto(E.imp.base) || !pronto(E.imp.atual)) return;
  const etapas = ["Conferindo os dois relatórios", "Removendo força maior e separando fora da jurisdição", "Comparando base × atualizado por código (AWB)", "Conferindo piso, exceções e desempenho"];
  atualizar(() => { E.imp.processando = true; E.imp.erroGeral = null; E.imp.etapas = etapas.map((t) => ({ texto: t, feito: false })); });
  try {
    E.imp.etapas[0].feito = true; renderizar(); await espera(60);
    const a = await E.servico!.analisar(E.imp.base!, E.imp.atual!, { ...E.params, mapa_regiao: E.mapaRegiaoAtivo });
    for (const et of E.imp.etapas) et.feito = true;
    renderizar(); await espera(120);
    const filtrosAntes = E.f;
    atualizar(() => {
      E.analise = a; indexar(a); E.desempenho = a.desempenho;
      E.overrides = { por_cidade: {}, cidades_ignoradas: [] };
      if (!reprocessar) E.f = filtrosVazios(); else { E.f = filtrosAntes; E.f.entregadores.dias = []; E.f.entregadores.sel = null; E.f.pendencias.dias = E.f.pendencias.dias.filter((d) => a.dias_chegada.includes(d)); }
      E.pisoUnico = false;
      E.imp.processando = false;
    });
    E.servico!.obterRegras().then((ov) => atualizar(() => { E.overrides = ov; })).catch(() => {});
    if (!E.exemplo) E.servico!.registrarImportacao(registroDe(a)).then((h) => atualizar(() => { E.historico = h; }))
      .catch(() => aviso("A análise foi feita, mas não foi possível guardá-la no histórico.", "erro"));
    if (!reprocessar) {
      navegar("torre");
      aviso(`Análise concluída: ${plural(a.resumo.pendentes, "encomenda pendente", "encomendas pendentes")}, ${plural(errosPiso().length, "problema de piso", "problemas de piso")}.`);
    } else aviso("Análise recalculada com os novos parâmetros.");
  } catch (e) {
    atualizar(() => { E.imp.processando = false; E.imp.erroGeral = problemaDe(e); });
    if (reprocessar) aviso(problemaDe(e).titulo, "erro");
  }
}

function caixaProblema(p: ProblemaArquivo): HTMLElement {
  return h("div", { class: "problema", role: "alert" }, icone("critico"),
    h("div", null, h("strong", null, p.titulo),
      h("dl", null, h("dt", null, "O que significa"), h("dd", null, p.significado), h("dt", null, "O que fazer"), h("dd", null, p.acao))));
}

function zonaArquivo(papel: Papel): HTMLElement {
  const info = E.imp[papel], erro = E.imp.erro[papel], lendo = E.imp.lendo[papel];
  const piso1 = E.imp.modo === "piso1";
  const titulo = piso1 ? "Planilha de entregas" : papel === "base" ? "Relatório base" : "Relatório atualizado";
  const desc = piso1
    ? "As entregas que você quer conferir. Cada linha é checada contra o mapa de regiões (CEP) para apontar entregador em região errada."
    : papel === "base"
    ? "O retrato anterior da operação. O que estava aqui e sumiu do atualizado vira provável entrega ou possível devolução."
    : "O retrato mais recente. Tudo o que está nele é tratado como pendente: o que ainda falta entregar.";
  const input = h("input", { type: "file", accept: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", id: "arq-" + papel, class: "sr",
    on: { change: (e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) receberArquivo(papel, f); } } });
  const soltar = h("label", { for: "arq-" + papel, class: "soltar" + (lendo ? " lendo" : ""),
    on: {
      dragover: (e: DragEvent) => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add("arrastando"); },
      dragleave: (e: DragEvent) => (e.currentTarget as HTMLElement).classList.remove("arrastando"),
      drop: (e: DragEvent) => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.remove("arrastando"); const f = e.dataTransfer?.files?.[0]; if (f) receberArquivo(papel, f); },
    } },
    icone(lendo ? "relogio" : "importar", "ic ic-lg"),
    h("strong", null, lendo ? "Lendo o arquivo…" : info ? "Trocar arquivo" : "Escolha ou arraste o arquivo .xlsx"),
    h("span", null, "Relatório Dispatch exportado do sistema da transportadora"));

  let validacao: Filho = null;
  if (info) {
    const okv = pronto(info);
    validacao = h("div", { class: "validacao" },
      h("div", { class: "val-topo" }, icone("arquivo"), h("strong", { class: "val-nome", title: info.nome }, info.nome),
        okv ? chip("Pronto", "ok", "ok") : chip("Com problemas", "critico", "critico")),
      h("dl", { class: "val-num" },
        h("div", null, h("dt", null, "Linhas lidas"), h("dd", null, fmtN(info.linhas))),
        h("div", null, h("dt", null, "Códigos válidos"), h("dd", null, fmtN(info.validas))),
        h("div", null, h("dt", null, "Chegadas ao galpão"), h("dd", null, info.chegada_min ? `${fmtData(info.chegada_min, false)} a ${fmtData(info.chegada_max, false)}` : "sem datas"))),
      h("div", { class: "val-campos" }, h("span", { class: "mini-rot" }, "Campos usados na análise"),
        h("ul", null, info.colunas.map((c) => h("li", { class: c.presente ? "ok" : c.obrigatoria ? "falta-obr" : "falta", title: c.papel },
          icone(c.presente ? "ok" : "critico", "ic ic-xs"), ROTULOS[c.coluna] || c.coluna, c.obrigatoria ? h("span", { class: "obr" }, " (obrigatório)") : null)))),
      info.avisos.length ? h("ul", { class: "val-avisos" }, info.avisos.map((a) => h("li", null, icone("alerta", "ic ic-xs"), a))) : null,
      info.qualidade && info.qualidade.length ? h("div", { class: "val-qualidade" },
        h("span", { class: "mini-rot fig-tit" }, "Qualidade dos dados", explica("qualidade", "imp-" + papel)),
        h("ul", null, info.qualidade.map((q) => h("li", { class: "q-" + q.tom },
          h("strong", null, fmtN(q.n)), " ", q.titulo,
          q.exemplos.length ? h("small", { class: "q-ex" }, "Ex.: " + q.exemplos.join(" · ")) : null,
          h("small", null, q.impacto))))) : null,
      info.problemas.map(caixaProblema),
      info.previa.length ? h("details", { class: "previa" }, h("summary", null, "Ver os primeiros registros"),
        h("div", { class: "tabela-rolagem" }, h("table", null,
          h("thead", null, h("tr", null, ["Waybill No", "Consignee City", "Delivery Associate", "Last Scan Status", "Arrival Time"].map((c) => h("th", null, ROTULOS[c])))),
          h("tbody", null, info.previa.map((r) => h("tr", null, ["Waybill No", "Consignee City", "Delivery Associate", "Last Scan Status", "Arrival Time"].map((c) => h("td", { class: c === "Waybill No" ? "mono" : "" }, valorTexto(c, r[c]))))))))) : null);
  }
  return h("section", { class: "zona", "aria-labelledby": "zona-" + papel },
    h("div", { class: "zona-cab" }, h("span", { class: "zona-n" }, papel === "base" ? "1" : "2"),
      h("div", null, h("h2", { id: "zona-" + papel }, titulo), h("p", null, desc))),
    input, soltar, erro ? caixaProblema(erro) : null, validacao);
}

const ORIGEM_REF: Record<OrigemReferencia, string> = {
  nome_arquivo: "horário no nome do arquivo atualizado",
  ultimo_evento: "evento mais recente registrado no relatório atualizado",
  definida: "definida por você",
  relogio: "relógio deste computador (o relatório não tem datas)",
};
const paraInputData = (s: string) => s.replace(" ", "T").slice(0, 16);
function caixaReferencia(): HTMLElement {
  const v = (E.imp.modo === "piso1" ? E.imp.base : E.imp.atual)!;
  const definida = E.params.referencia_backlog || null;
  const sugerida = v.referencia_sugerida || null;
  const efetiva = definida || sugerida;
  const origem: OrigemReferencia = definida ? "definida" : (v.referencia_origem || "relogio");
  return h("div", { class: "conf-ref" },
    h("span", { class: "fig-tit" }, icone("relogio", "ic ic-sm"), h("strong", null, "Referência dos tempos: "), efetiva ? fmtData(efetiva) : "momento do processamento", explica("referencia", "imp")),
    h("small", null, "Origem: ", ORIGEM_REF[origem], "."),
    (() => { const ult = paraData(v.chegada_max), ref = paraData(efetiva);
      return ult && ref && ult.getTime() > ref.getTime()
        ? h("small", { class: "aviso-ref", role: "alert" }, `Atenção: a última chegada (${fmtData(v.chegada_max)}) é posterior a esta referência. As encomendas que chegaram depois ficam fora das faixas de tempo.`) : null; })(),
    E.imp.editandoRef
      ? h("span", { class: "linha-campo" },
          h("label", null, h("span", { class: "sr" }, "Data e hora de referência"),
            h("input", { type: "datetime-local", id: "imp-ref", step: "1", value: paraInputData(efetiva || dataHoraIso(new Date())) })),
          h("button", { type: "button", class: "btn btn-sec btn-p", on: { click: () => { const x = (document.getElementById("imp-ref") as HTMLInputElement).value; atualizar(() => { E.params.referencia_backlog = x ? x.replace("T", " ") + (x.length === 16 ? ":00" : "") : null; E.imp.editandoRef = false; }); } } }, "Usar esta data"),
          h("button", { type: "button", class: "btn btn-ghost btn-p", on: { click: () => atualizar(() => { E.imp.editandoRef = false; }) } }, "Cancelar"))
      : h("span", { class: "linha-campo" },
          h("button", { type: "button", class: "link", on: { click: () => atualizar(() => { E.imp.editandoRef = true; }) } }, "Alterar"),
          definida ? h("button", { type: "button", class: "link", on: { click: () => atualizar(() => { E.params.referencia_backlog = null; }) } }, "Voltar à data do relatório") : null));
}

function telaImportar(): HTMLElement {
  const imp = E.imp;
  const ambos = pronto(imp.base) && pronto(imp.atual);
  const passo = imp.processando ? 4 : ambos ? 3 : imp.base || imp.atual ? 2 : 1;
  const passos = ["Selecionar arquivos", "Validar", "Confirmar", "Processar"];
  const o = imp.ordem;

  const confirmar = ambos ? h("section", { class: "confirmar", "aria-labelledby": "conf-tit" },
    h("h2", { id: "conf-tit", class: "fig-tit" }, "Confirme antes de processar", explica("ordem_arquivos", "conf")),
    h("p", { class: "conf-ordem" }, h("span", { class: "conf-arq" }, h("small", null, "Base (anterior)"), imp.base!.nome), icone("seta"), h("span", { class: "conf-arq" }, h("small", null, "Atualizado (mais recente)"), imp.atual!.nome)),
    o ? (o.possivel_inversao
      ? h("div", { class: "alerta-caixa tom-atencao", role: "alert" }, icone("alerta"),
          h("div", null, h("strong", null, "Os arquivos podem estar invertidos"),
            h("p", null, o.evento_base && o.evento_atual ? `O evento mais recente do base (${fmtData(o.evento_base)}) é posterior ao do atualizado (${fmtData(o.evento_atual)}). O atualizado deveria ser o mais novo.` : `${fmtN(o.so_no_atual)} códigos existem só no atualizado e apenas ${fmtN(o.so_na_base)} só na base, e o atualizado tem mais linhas. Sem datas para comparar, este é um sinal fraco.`),
            h("p", { class: "nota" }, "Isto é um indício, não uma certeza. A ordem só muda se você trocar."),
            h("button", { type: "button", class: "btn btn-sec", on: { click: trocarOrdem } }, icone("trocar", "ic ic-sm"), "Trocar base e atualizado")))
      : h("div", { class: "alerta-caixa tom-ok" }, icone("ok"),
          h("div", null, h("strong", null, "A ordem parece consistente"),
            h("p", null, `${fmtN(o.em_ambos)} códigos aparecem nos dois, ${fmtN(o.so_na_base)} saíram e ${fmtN(o.so_no_atual)} são novos no atualizado.`))))
      : h("p", { class: "nota" }, "Verificando a ordem dos arquivos…"),
    caixaReferencia(),
    h("div", { class: "conf-opcoes" },
      alternar({ id: "opt-desc", ajuda: "descarregado", rotulo: "Ignorar encomendas com status “descarregado”", valor: E.params.ignorar_descarregado, onMudar: (v) => atualizar(() => { E.params.ignorar_descarregado = v; }),
        dica: "Remove essas encomendas de toda a análise, nos dois relatórios. Desligado por padrão, como no MVP." }),
      alternar({ id: "opt-nrec", ajuda: "nao_recebido", rotulo: "Ignorar encomendas “não recebido”", valor: E.params.ignorar_nao_recebido, onMudar: (v) => atualizar(() => { E.params.ignorar_nao_recebido = v; }),
        dica: "Remove de toda a análise as encomendas com “não recebido” no status ou no tipo de problema, nos dois relatórios. Ligado por padrão." }),
      h("p", { class: "nota" }, "Sempre aplicado: encomendas de força maior (FM) são removidas e as sem cidade ficam separadas em “Fora da jurisdição”.")),
    imp.processando
      ? h("ol", { class: "etapas", "aria-live": "polite" }, imp.etapas.map((et) => h("li", { class: et.feito ? "feito" : "andando" }, et.feito ? icone("ok", "ic ic-sm") : h("span", { class: "giro", "aria-hidden": "true" }), et.texto)))
      : h("div", { class: "conf-acoes" },
          h("button", { type: "button", class: "btn btn-pri", id: "btn-processar", on: { click: () => processar() } }, "Processar análise"),
          h("button", { type: "button", class: "btn btn-ghost", on: { click: trocarOrdem } }, icone("trocar", "ic ic-sm"), "Trocar a ordem"))) : null;

  const seletorModo = h("div", { class: "modo-import", role: "radiogroup", "aria-label": "O que você quer fazer" },
    h("button", { type: "button", class: "modo-op" + (imp.modo === "completa" ? " sel" : ""), "aria-pressed": imp.modo === "completa" ? "true" : "false",
      on: { click: () => atualizar(() => { imp.modo = "completa"; imp.erroGeral = null; }) } },
      h("strong", null, "Análise completa"), h("small", null, "Duas tabelas (base × atualizado): pendências, exceções, desempenho e piso.")),
    h("button", { type: "button", class: "modo-op" + (imp.modo === "piso1" ? " sel" : ""), "aria-pressed": imp.modo === "piso1" ? "true" : "false",
      on: { click: () => atualizar(() => { imp.modo = "piso1"; imp.erroGeral = null; }) } },
      h("strong", null, "Conferir piso de 1 tabela"), h("small", null, "Uma tabela só: usa o mapa de regiões para apontar entregas em região errada.")));

  if (imp.modo === "piso1") {
    const temMapa = !!E.mapaRegiaoAtivo;
    const prontoArq = pronto(imp.base);
    return h("div", { class: "tela tela-importar" },
      cabecalho({ area: "Início", titulo: "Nova importação", pergunta: "O que você quer fazer?",
        acoes: E.analise && !imp.processando ? h("button", { type: "button", class: "btn btn-ghost", on: { click: () => navegar("torre") } }, "Voltar à análise atual") : null }),
      seletorModo,
      temMapa
        ? h("div", { class: "alerta-caixa tom-ok" }, icone("ok"), h("div", null, h("strong", null, "Mapa de regiões ativo"),
            h("p", null, `A conferência usará o mapa ${E.mapaRegiaoOrigem === "sessao" ? "carregado nesta sessão (Estudo de regiões)" : "publicado como padrão"} para apontar entregas em região errada.`)))
        : h("div", { class: "alerta-caixa tom-atencao", role: "alert" }, icone("alerta"), h("div", null, h("strong", null, "Nenhum mapa de regiões definido"),
            h("p", null, "A conferência de piso de uma tabela precisa saber quem atende cada região. Gere o mapa no Estudo de regiões e clique em “Gerar e usar este mapa”."),
            h("button", { type: "button", class: "btn btn-sec", on: { click: () => navegar("estudo") } }, icone("regras", "ic ic-sm"), "Ir para o Estudo de regiões"))),
      imp.erroGeral ? caixaProblema(imp.erroGeral) : null,
      h("div", { class: "zonas uma" }, zonaArquivo("base")),
      prontoArq ? h("section", { class: "confirmar" },
        caixaReferencia(),
        h("div", { class: "conf-opcoes" },
          alternar({ id: "opt-desc", ajuda: "descarregado", rotulo: "Ignorar encomendas com status “descarregado”", valor: E.params.ignorar_descarregado, onMudar: (v) => atualizar(() => { E.params.ignorar_descarregado = v; }), dica: "Remove essas encomendas da conferência." }),
          alternar({ id: "opt-nrec", ajuda: "nao_recebido", rotulo: "Ignorar encomendas “não recebido”", valor: E.params.ignorar_nao_recebido, onMudar: (v) => atualizar(() => { E.params.ignorar_nao_recebido = v; }), dica: "Remove as encomendas “não recebido” da conferência." })),
        imp.processando
          ? h("ol", { class: "etapas", "aria-live": "polite" }, imp.etapas.map((et) => h("li", { class: et.feito ? "feito" : "andando" }, et.feito ? icone("ok", "ic ic-sm") : h("span", { class: "giro", "aria-hidden": "true" }), et.texto)))
          : h("div", { class: "conf-acoes" }, h("button", { type: "button", class: "btn btn-pri", id: "btn-conferir-piso", disabled: !temMapa, on: { click: () => processarPisoUnico() } }, "Conferir piso"))) : null,
      !prontoArq ? h("p", { class: "exemplos" }, "Quer testar? ",
        h("button", { type: "button", class: "link", on: { click: () => usarExemplos() } }, "Usar uma planilha de exemplo"), ".") : null);
  }

  return h("div", { class: "tela tela-importar" },
    cabecalho({ area: "Início", titulo: "Nova importação", pergunta: "O que você quer fazer?",
      acoes: E.analise && !imp.processando ? h("button", { type: "button", class: "btn btn-ghost", on: { click: () => navegar("torre") } }, "Voltar à análise atual") : null }),
    seletorModo,
    h("ol", { class: "passos", "aria-label": "Etapas da importação" }, passos.map((p, i) => h("li", { class: i + 1 < passo ? "feito" : i + 1 === passo ? "atual" : "", "aria-current": i + 1 === passo ? "step" : null }, h("span", null, String(i + 1)), p))),
    imp.erroGeral ? caixaProblema(imp.erroGeral) : null,
    h("div", { class: "zonas" }, zonaArquivo("base"),
      h("button", { type: "button", class: "trocar", title: "Trocar base e atualizado", "aria-label": "Trocar base e atualizado", disabled: !imp.base && !imp.atual, on: { click: trocarOrdem } }, icone("trocar")),
      zonaArquivo("atual")),
    confirmar,
    !ambos ? h("p", { class: "exemplos" }, "Quer só conhecer a ferramenta? ",
      h("button", { type: "button", class: "link", on: { click: () => usarExemplos() } }, "Usar os relatórios de exemplo"),
      " (tabela_base.xlsx × ultima_tabela.xlsx).") : null);
}
