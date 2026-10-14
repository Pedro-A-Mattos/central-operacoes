// Consultar: A entregar, O que mudou, Fora da jurisdição, Regras, Importação e critérios.

function telaAEntregar(): HTMLElement {
  const a = E.analise!; const f = E.f.aEntregar;
  const cidades = unicos(a.atual.map((r) => r.dados["Consignee City"] as string));
  const daCidade = f.cidade ? a.atual.filter((r) => r.dados["Consignee City"] === f.cidade) : a.atual;
  const ents = unicos(daCidade.map((r) => entregadorDe(r.dados)));
  const lista = f.entregador ? daCidade.filter((r) => entregadorDe(r.dados) === f.entregador) : daCidade;
  const set = (fn: () => void) => atualizar(() => { fn(); TAB.delete("aent"); });
  const g = (r: RegAtual) => r.dados;
  const resumo = contar(daCidade, (r) => entregadorDe(r.dados));
  return h("div", { class: "tela" },
    cabecalho({ area: "Consultar", titulo: "Encomendas a entregar", ajuda: "a_entregar", pergunta: "O que cada cidade e cada entregador ainda tem para entregar?",
      resposta: h("p", null, h("strong", null, plural(lista.length, "encomenda", "encomendas")), f.cidade ? ` em ${f.cidade}` : " em todas as cidades", f.entregador ? ` com ${f.entregador}` : "", ".") }),
    h("div", { class: "navegacao-cid" },
      h("label", null, h("span", null, "Cidade"), h("select", { id: "ae-cid", on: { change: (e: Event) => set(() => { f.cidade = (e.target as HTMLSelectElement).value; f.entregador = ""; }) } },
        h("option", { value: "" }, "Todas as cidades"), cidades.map((c) => h("option", { value: c, selected: f.cidade === c }, c)))),
      icone("seta"),
      h("label", null, h("span", null, "Entregador"), h("select", { id: "ae-ent", on: { change: (e: Event) => set(() => { f.entregador = (e.target as HTMLSelectElement).value; }) } },
        h("option", { value: "" }, "Todos os entregadores"), ents.map((c) => h("option", { value: c, selected: f.entregador === c }, c))))),
    !f.entregador ? barras({ id: "ae-res", titulo: "Resumo por entregador", descricao: "Clique para ver só as encomendas dele.", unidade: ["encomenda", "encomendas"], itens: resumo, max: 12,
      onSelecionar: (it) => it && set(() => { f.entregador = it.rotulo; }) }) : null,
    h("section", { class: "bloco" },
      tabela({ id: "aent", titulo: "Encomendas a entregar", linhas: lista, chave: (r) => awbDe(r.dados), onAbrir: (r) => abrirAwb(awbDe(r.dados)),
        colunas: [colAwb(g), colDado("Consignee City", g), colDado("Consignee Area", g), colDado("Consignee Address", g), colDado("Delivery Associate", g), colDado("Last Scan Status", g), colDado("Waybill Hold Time", g), colDado("Arrival Time", g)],
        exportar: botaoExportar("a_entregar.xlsx", () => ({ linhas: lista.map((r) => r.dados), colunas: COLUNAS_CONTRATO }), "Exportar Excel", "aent") })));
}

function telaMudancas(): HTMLElement {
  const a = E.analise!; const f = E.f.mudancas;
  const set = (fn: () => void) => atualizar(fn);
  const ent = a.sairam.filter((r) => r.categoria === "provavel_entrega");
  const dev = a.sairam.filter((r) => r.categoria === "possivel_devolucao");
  const ja = a.sairam.filter((r) => r.categoria === "ja_entregue");
  const oc = a.sairam.filter((r) => r.categoria === "saiu_com_ocorrencia");
  const grupos = { provavel_entrega: ent, possivel_devolucao: dev, ja_entregue: ja, saiu_com_ocorrencia: oc } as const;
  const REGRA_SAIDA: Record<keyof typeof grupos, string> = {
    provavel_entrega: "Estavam ABERTAS no relatório base e não aparecem no atualizado, sem sinal de devolução, extravio ou avaria. É o que o relatório permite inferir, não uma confirmação de entrega.",
    possivel_devolucao: "Saíram do relatório com palavra de devolução no problema (devol, não recebido, recusad, retorno) ou com 3 ou mais tentativas e último motivo de ausência ou recusa. É um indício.",
    ja_entregue: "Já constavam como ENTREGUES (status ou assinatura) no relatório base e só saíram do relatório. Não contam como progresso entre os dois relatórios.",
    saiu_com_ocorrencia: "Saíram com extravio ou avaria no último problema registrado. Sumir do relatório não prova entrega: investigue.",
  };
  const NOME_EXPORT: Record<keyof typeof grupos, string> = { provavel_entrega: "provaveis_entregas.xlsx", possivel_devolucao: "possiveis_devolucoes.xlsx", ja_entregue: "ja_entregues_antes.xlsx", saiu_com_ocorrencia: "sairam_com_ocorrencia.xlsx" };
  const novas = a.atual.filter((r) => r.nova);
  const gs = (r: RegSaiu) => r.dados, ga = (r: RegAtual) => r.dados;
  let conteudo: Filho;
  if (f.aba in grupos) {
    const l = grupos[f.aba as keyof typeof grupos];
    conteudo = [
      h("p", { class: "regra" }, explica(f.aba, "mud"), REGRA_SAIDA[f.aba as keyof typeof grupos], " ", f.aba === "ja_entregue" ? null : selo("inferido")),
      tabela({ id: "mud-" + f.aba, titulo: "Encomendas que saíram", linhas: l, chave: (r) => awbDe(r.dados), onAbrir: (r) => abrirAwb(awbDe(r.dados)),
        colunas: [colAwb(gs), colDado("Consignee City", gs), colDado("Delivery Associate", gs), colDado("Last Scan Status", gs, "Último status na base"), colDado("Last Problem Type", gs, "Problema"),
          ...(f.aba === "possivel_devolucao" ? [{ id: "ind", rotulo: "Indício encontrado", valor: (r: RegSaiu) => r.indicio, render: (r: RegSaiu) => chip("“" + r.indicio + "”", "inferido") }] : [])],
        exportar: botaoExportar(NOME_EXPORT[f.aba as keyof typeof grupos], () => ({ linhas: l.map((r) => r.dados), colunas: COLUNAS_CONTRATO }), "Exportar Excel", "mud-" + f.aba) })];
  } else if (f.aba === "novas") {
    conteudo = [h("p", { class: "regra" }, explica("novas", "mud"), "Aparecem no relatório atualizado, mas não existiam no base."),
      tabela({ id: "mud-novas", titulo: "Novas encomendas", linhas: novas, chave: (r) => awbDe(r.dados), onAbrir: (r) => abrirAwb(awbDe(r.dados)),
        colunas: [colAwb(ga), colDado("Consignee City", ga), colDado("Delivery Associate", ga), colDado("Last Scan Status", ga), colDado("Arrival Time", ga)],
        exportar: botaoExportar("novas_awbs.xlsx", () => ({ linhas: novas.map((r) => r.dados), colunas: COLUNAS_CONTRATO }), "Exportar Excel", "mud-novas") })];
  } else {
    conteudo = [h("p", { class: "regra" }, explica("mudou_status", "mud"), "Estão nos dois relatórios com status diferente (inclui status que surgiu ou sumiu)."),
      tabela({ id: "mud-status", titulo: "Mudanças de status", linhas: a.mudou_status, chave: (r) => r.awb, onAbrir: (r) => abrirAwb(r.awb),
        vazio: vazio("Nenhuma mudança de status", "Todas as encomendas presentes nos dois relatórios mantiveram o mesmo status.", null, "ok"),
        colunas: [colAwb((r: Analise["mudou_status"][number]) => ({ "Waybill No": r.awb })),
          { id: "sb", rotulo: "Status na base", valor: (r) => r.status_base as string, render: (r) => valorTexto("Last Scan Status", r.status_base) },
          { id: "su", rotulo: "Status no atualizado", valor: (r) => r.status_atual as string, render: (r) => h("strong", null, valorTexto("Last Scan Status", r.status_atual)) }],
        exportar: botaoExportar("mudou_status.xlsx", () => ({ linhas: a.mudou_status.map((r) => ({ "Waybill No": r.awb, status_base: r.status_base, status_ultima: r.status_atual })), colunas: ["Waybill No", "status_base", "status_ultima"] }), "Exportar Excel", "mud-status") })];
  }
  return h("div", { class: "tela" },
    cabecalho({ area: "Consultar", titulo: "O que mudou", pergunta: "O que mudou entre o relatório base e o atualizado?",
      resposta: h("p", null, `${plural(ent.length + dev.length + ja.length + oc.length, "encomenda saiu", "encomendas saíram")} do relatório (${fmtN(ja.length)} já estavam entregues no base), ${plural(novas.length, "é nova", "são novas")} e ${plural(a.mudou_status.length, "mudou", "mudaram")} de status.`) }),
    abas("mud", [
      { id: "provavel_entrega" as const, rotulo: "Prováveis entregas", n: ent.length },
      { id: "possivel_devolucao" as const, rotulo: "Possíveis devoluções", n: dev.length, tom: "inferido" as Tom },
      { id: "saiu_com_ocorrencia" as const, rotulo: "Saíram com ocorrência", n: oc.length, tom: oc.length ? "atencao" as Tom : undefined },
      { id: "ja_entregue" as const, rotulo: "Já entregues antes", n: ja.length },
      { id: "novas" as const, rotulo: "Novas", n: novas.length },
      { id: "status" as const, rotulo: "Mudanças de status", n: a.mudou_status.length },
    ], f.aba, (v) => set(() => { f.aba = v; })),
    h("section", { class: "bloco" }, conteudo));
}

function telaFora(): HTMLElement {
  const a = E.analise!; const f = E.f.fora;
  const lista = f.aba === "atual" ? a.fora.atual : a.fora.base;
  const g = (d: Dados) => d;
  return h("div", { class: "tela" },
    cabecalho({ area: "Consultar", titulo: "Fora da jurisdição", ajuda: "fora_jurisdicao", pergunta: "Quais encomendas não têm cidade de destino e por isso ficam fora dos números?",
      resposta: h("p", null, h("strong", null, plural(a.fora.atual.length, "encomenda", "encomendas")), " no atualizado e ", h("strong", null, fmtN(a.fora.base.length)), " na base. Ficam só neste registro: não entram em pendências, piso, desempenho nem tempo de espera.") }),
    abas("fora", [{ id: "atual" as const, rotulo: "Relatório atualizado", n: a.fora.atual.length }, { id: "base" as const, rotulo: "Relatório base", n: a.fora.base.length }], f.aba, (v) => atualizar(() => { f.aba = v; })),
    h("section", { class: "bloco" },
      tabela({ id: "fora-" + f.aba, titulo: "Fora da jurisdição", linhas: lista, chave: (d) => awbDe(d), onAbrir: (d) => abrirAwb(awbDe(d)),
        vazio: vazio("Nenhuma encomenda fora da jurisdição", "Todas as encomendas deste relatório têm cidade de destino.", null, "ok"),
        colunas: [colAwb(g), colDado("Reference No", g), colDado("Last Scan Status", g), colDado("Arrival Time", g)],
        exportar: botaoExportar(`fora_jurisdicao_${f.aba === "atual" ? "atualizado" : "base"}.xlsx`, () => ({ linhas: lista, colunas: COLUNAS_CONTRATO }), "Exportar Excel", "fora-" + f.aba) })));
}

// ---------- Regras de abrangência ----------
const EDIT = { cidade: "", sel: [] as string[], limiar: 0, ignoradas: null as string[] | null, salvando: false };

// Simulação: mostra o impacto na conferência de piso ANTES de salvar.
const IMPACTO = { chave: "", carregando: false, res: null as Simulacao | null, erro: "", timer: 0 as unknown as ReturnType<typeof setTimeout> };
const cfgAtual = (): ConfigRegras => ({ overrides: E.overrides, limiar_ruido: E.params.limiar_ruido, cidades_ignoradas: E.params.cidades_ignoradas, mapa_regiao: E.mapaRegiaoAtivo });
function simularImpacto(chave: string, novo: ConfigRegras) {
  clearTimeout(IMPACTO.timer);
  IMPACTO.chave = chave; IMPACTO.carregando = true; IMPACTO.erro = "";
  IMPACTO.timer = setTimeout(async () => {
    try { const r = await E.servico!.simular(cfgAtual(), novo); if (IMPACTO.chave === chave) { IMPACTO.res = r; IMPACTO.carregando = false; renderizar(); } }
    catch (e) { IMPACTO.erro = problemaDe(e).titulo; IMPACTO.carregando = false; renderizar(); }
  }, 250);
  renderizar();
}
function caixaImpacto(chave: string): HTMLElement | null {
  if (IMPACTO.chave !== chave) return null;
  if (IMPACTO.carregando) return h("div", { class: "impacto", "aria-live": "polite" }, h("span", { class: "giro" }), "Calculando o impacto…");
  if (IMPACTO.erro) return h("div", { class: "impacto" }, IMPACTO.erro);
  const r = IMPACTO.res; if (!r) return null;
  const nada = !r.mudancas.length;
  return h("div", { class: "impacto" + (nada ? "" : " com-mudanca"), "aria-live": "polite" },
    h("p", { class: "fig-tit" }, h("strong", null, "Se salvar: "), nada ? "nada muda na conferência de piso." : `os problemas de piso vão de ${fmtN(r.erros_antes)} para ${fmtN(r.erros_depois)}.`, explica("simulacao", chave)),
    nada ? null : h("p", { class: "impacto-num" },
      r.deixam_de_ser_erro ? chip(`${fmtN(r.deixam_de_ser_erro)} deixam de ser erro`, "ok", "ok") : null,
      r.passam_a_erro ? chip(`${fmtN(r.passam_a_erro)} passam a ser erro`, "critico", "critico") : null,
      r.mudam_tipo ? chip(`${fmtN(r.mudam_tipo)} mudam de tipo`, "atencao") : null),
    nada ? null : h("details", { class: "impacto-det" }, h("summary", null, "Ver encomendas afetadas"),
      h("ul", null, r.mudancas.slice(0, 30).map((m) => h("li", null,
        awbComCopia(m.awb), ` ${m.cidade ?? ""} · ${m.entregador ?? "sem entregador"}: `,
        h("span", { class: "nulo" }, m.antes || "sem erro"), " → ", h("strong", null, m.depois || "sem erro")))),
      r.mudancas.length > 30 ? h("p", { class: "nota" }, `e mais ${fmtN(r.mudancas.length - 30)}.`) : null));
}

async function salvarOverrides(ov: Overrides, msg: string) {
  EDIT.salvando = true; renderizar();
  try {
    const salvo = await E.servico!.salvarRegras(ov);
    E.overrides = salvo; EDIT.cidade = ""; EDIT.ignoradas = null; IMPACTO.chave = "";
    await processar(true); aviso(msg);
  } catch (e) { aviso(problemaDe(e).titulo, "erro"); }
  finally { EDIT.salvando = false; renderizar(); }
}

function telaRegras(): HTMLElement {
  const a = E.analise!;
  const cidades = Object.keys(a.regras.por_cidade);
  const todosEnt = unicos([...E.desempenho!.linhas.map((l) => l.entregador).filter((x) => x !== "(sem entregador)"), ...a.atual.map((r) => r.dados["Delivery Associate"] as string)]);
  const ov = E.overrides;
  const ign = EDIT.ignoradas ?? ov.cidades_ignoradas;
  const limiar = EDIT.limiar || E.params.limiar_ruido;

  const linhas = cidades.map((c) => ({ cidade: c, ...a.regras.por_cidade[c] }));
  const simCidade = (c: string) => simularImpacto("cidade:" + c, { ...cfgAtual(), overrides: { ...ov, por_cidade: { ...ov.por_cidade, [c]: EDIT.sel } } });
  const editor = (c: string) => h("form", { class: "editor-regra", on: { submit: (e: Event) => { e.preventDefault();
      if (!EDIT.sel.length) { aviso("Escolha pelo menos um entregador para a cidade.", "erro"); return; }
      salvarOverrides({ ...ov, por_cidade: { ...ov.por_cidade, [c]: EDIT.sel } }, `Ajuste salvo para ${c}.`); } } },
    h("p", null, `Quem pode entregar em ${c}? O ajuste vale para a cidade inteira (sem divisão por bairro) e tem prioridade sobre a regra derivada.`),
    h("div", { class: "editor-ops" }, todosEnt.map((e, i) => h("label", { class: "ms-op" }, h("input", { type: "checkbox", id: `ed-${i}`, checked: EDIT.sel.includes(e), on: { change: (ev: Event) => { EDIT.sel = (ev.target as HTMLInputElement).checked ? [...EDIT.sel, e] : EDIT.sel.filter((x) => x !== e); simCidade(c); } } }), h("span", null, e)))),
    caixaImpacto("cidade:" + c),
    h("div", { class: "editor-acoes" },
      h("button", { type: "submit", class: "btn btn-pri", disabled: EDIT.salvando }, "Salvar ajuste e recalcular"),
      h("button", { type: "button", class: "btn btn-ghost", on: { click: () => atualizar(() => { EDIT.cidade = ""; }) } }, "Cancelar")));

  return h("div", { class: "tela" },
    cabecalho({ area: "Consultar", titulo: "Regras de abrangência", pergunta: "Quem pode entregar em cada cidade e bairro?",
      resposta: h("p", null, `${plural(cidades.length, "cidade", "cidades")} com regra · ${plural(Object.keys(ov.por_cidade).length, "ajuste manual", "ajustes manuais")} · `, rotuloPersistencia()) }),
    h("div", { class: "cartoes-config" },
      h("section", { class: "bloco" },
        h("h2", { class: "fig-tit" }, "Rigor da conferência", explica("rigor", "rg")),
        h("p", { class: "nota" }, "Número mínimo de encomendas de um entregador num lugar para que ele conte como válido ali. Abaixo disso, a associação é tratada como exceção do histórico (no MVP: “limiar de ruído”)."),
        E.mapaRegiaoAtivo ? h("p", { class: "aviso-ref" }, "O mapa de região está ativo na conferência de piso: este rigor não se aplica (o critério vem de como o mapa foi gerado, no Estudo de regiões). Os ajustes manuais por cidade e as cidades ignoradas continuam valendo e têm prioridade sobre o mapa.") : null,
        h("div", { class: "linha-campo" },
          h("label", null, h("span", null, "Mínimo de encomendas"), h("input", { type: "number", id: "rg-limiar", min: "1", max: "20", disabled: !!E.mapaRegiaoAtivo, value: String(limiar), on: { input: (e: Event) => { EDIT.limiar = Math.max(1, Math.min(20, +(e.target as HTMLInputElement).value || 1)); simularImpacto("limiar", { ...cfgAtual(), limiar_ruido: EDIT.limiar }); } } })),
          h("button", { type: "button", class: "btn btn-sec", disabled: E.imp.processando || !!E.mapaRegiaoAtivo, on: { click: () => { E.params.limiar_ruido = EDIT.limiar || E.params.limiar_ruido; EDIT.limiar = 0; IMPACTO.chave = ""; processar(true); } } }, "Aplicar e recalcular")),
        caixaImpacto("limiar"),
        h("p", { class: "nota" }, `Atual: ${a.parametros.limiar_ruido}. Padrão do MVP: 3. Cidades com ${a.parametros.min_entregadores_urbano} ou mais entregadores são conferidas por bairro (fixo no MVP).`)),
      h("section", { class: "bloco" },
        h("h2", { class: "fig-tit" }, "Cidades fora da conferência", explica("cidades_ignoradas", "rg")),
        h("p", { class: "nota" }, "Encomendas destas cidades não são conferidas no piso."),
        multi({ id: "rg-ign", rotulo: "Cidades ignoradas", opcoes: unicos([...cidades, ...ov.cidades_ignoradas]), valores: ign, onMudar: (v) => { EDIT.ignoradas = v; simularImpacto("ign", { ...cfgAtual(), overrides: { ...ov, cidades_ignoradas: v } }); } }),
        caixaImpacto("ign"),
        EDIT.ignoradas ? h("button", { type: "button", class: "btn btn-sec", disabled: EDIT.salvando, on: { click: () => salvarOverrides({ ...ov, cidades_ignoradas: EDIT.ignoradas! }, "Cidades ignoradas atualizadas.") } }, "Salvar e recalcular") : null)),
    h("section", { class: "bloco" },
      h("div", { class: "bloco-cab" }, h("h2", null, "Regras por cidade"), h("span", { class: "resp-ajudas" }, h("span", { class: "fig-tit" }, "Regra derivada", explica("regra_derivada", "rg")), h("span", { class: "fig-tit" }, "Ajuste manual", explica("ajuste_manual", "rg")), h("span", { class: "fig-tit" }, "Conferida por bairro", explica("por_bairro", "rg")))),
      h("ul", { class: "regras-lista" }, linhas.map((l) => {
        const bairros = a.regras.por_bairro.filter((b) => b.cidade === l.cidade);
        const manual = l.origem === "ajuste manual";
        return h("li", { class: "regra-cid" },
          h("div", { class: "regra-topo" },
            h("strong", null, l.cidade),
            manual ? selo("manual") : selo("derivada"),
            a.regras.cidades_ignoradas.includes(l.cidade) ? chip("Fora da conferência", "neutro") : null,
            h("span", { class: "regra-escopo" }, l.urbana ? `Conferida por bairro (${bairros.length})` : "Conferida pela cidade"),
            h("span", { class: "regra-acoes" },
              h("button", { type: "button", class: "btn btn-ghost btn-p", on: { click: () => { EDIT.cidade = l.cidade; EDIT.sel = [...l.entregadores]; simCidade(l.cidade); } } }, "Ajustar"),
              manual ? h("button", { type: "button", class: "btn btn-ghost btn-p", disabled: EDIT.salvando, on: { click: () => { const p = { ...ov.por_cidade }; delete p[l.cidade]; salvarOverrides({ ...ov, por_cidade: p }, `Ajuste de ${l.cidade} removido.`); } } }, "Remover ajuste") : null)),
          h("p", { class: "regra-ents" }, l.entregadores.join(" · ") || h("span", { class: "nulo" }, "Nenhum entregador")),
          l.urbana && bairros.length ? h("details", { class: "bairros" }, h("summary", null, "Ver regras por bairro"),
            h("ul", null, bairros.map((b) => h("li", null, h("strong", null, b.bairro), " — ", b.entregadores.join(", "))))) : null,
          EDIT.cidade === l.cidade ? editor(l.cidade) : null);
      }))));
}

// ---------- Importação e critérios ----------
function telaCriterios(): HTMLElement {
  const a = E.analise!; const et = a.etapas;
  const linhaEtapa = (rot: string, b: number, u: number, nota?: string) => h("tr", null, h("th", { scope: "row" }, rot, nota ? h("small", null, nota) : null), h("td", { class: "num" }, fmtN(b)), h("td", { class: "num" }, fmtN(u)));
  const linhaEtapaAj = (aj: string, rot: string, b: number, u: number, nota?: string) => h("tr", null, h("th", { scope: "row" }, h("span", { class: "fig-tit" }, rot, explica(aj, "funil")), nota ? h("small", null, nota) : null), h("td", { class: "num" }, fmtN(b)), h("td", { class: "num" }, fmtN(u)));
  const def = (t: string, d: Filho, s?: Selo) => h("div", { class: "def" }, h("dt", null, t, s ? selo(s) : null), h("dd", null, d));
  return h("div", { class: "tela" },
    cabecalho({ area: "Consultar", titulo: "Importação e critérios", pergunta: "De onde vêm os números e quais regras foram aplicadas?" }),
    h("div", { class: "cartoes-config" },
      h("section", { class: "bloco" }, h("h2", null, "Arquivos desta análise"),
        h("dl", { class: "dl-lista" },
          def("Relatório base", a.arquivos.base), def("Relatório atualizado", a.arquivos.atual),
          def("Processado em", fmtData(a.gerado_em)),
          def("Referência dos tempos", [fmtData(a.referencia_backlog), " — ", ORIGEM_REF[a.referencia_origem], ". O mesmo arquivo gera sempre os mesmos tempos."]),
          def("Processamento", a.motor === "python" ? "Servidor Python (motor de regras original)." : "Neste navegador, com o motor local validado contra o motor Python."),
          def("Justificativas e ajustes", rotuloPersistencia())),
        h("button", { type: "button", class: "btn btn-sec", on: { click: () => navegar("importar") } }, icone("importar", "ic ic-sm"), "Nova importação")),
      h("section", { class: "bloco" }, h("h2", null, "Do arquivo aos números"),
        h("div", { class: "tabela-rolagem" }, h("table", { class: "funil" },
          h("thead", null, h("tr", null, h("th", null, "Etapa"), h("th", { class: "num" }, "Base"), h("th", { class: "num" }, "Atualizado"))),
          h("tbody", null,
            linhaEtapa("Códigos válidos lidos", et.base_lidas, et.atual_lidas, "Sem código descartadas; repetidos: fica a última linha"),
            linhaEtapaAj("descarregado", "− Status “descarregado”", et.descarregado_base, et.descarregado_atual, a.parametros.ignorar_descarregado ? "Filtro ligado" : "Filtro desligado"),
            linhaEtapaAj("nao_recebido", "− “Não recebido”", et.nao_recebido_base, et.nao_recebido_atual, a.parametros.ignorar_nao_recebido ? "Filtro ligado" : "Filtro desligado"),
            linhaEtapaAj("forca_maior", "− Força maior (FM)", et.fm_base, et.fm_atual, "Sempre removidas"),
            linhaEtapaAj("fora_jurisdicao", "− Fora da jurisdição", et.fora_base, et.fora_atual, "Sem cidade de destino"),
            h("tr", { class: "total" }, h("th", { scope: "row" }, "Entram na análise"), h("td", { class: "num" }, fmtN(a.resumo.base_total)), h("td", { class: "num" }, fmtN(a.resumo.ultima_total)))))),
        alternar({ id: "cr-desc", ajuda: "descarregado", rotulo: "Ignorar status “descarregado”", valor: E.params.ignorar_descarregado, onMudar: (v) => { E.params.ignorar_descarregado = v; processar(true); },
          dica: "Remove essas encomendas dos dois relatórios e recalcula tudo." }),
        alternar({ id: "cr-nrec", ajuda: "nao_recebido", rotulo: "Ignorar “não recebido”", valor: E.params.ignorar_nao_recebido, onMudar: (v) => { E.params.ignorar_nao_recebido = v; processar(true); },
          dica: "Remove as encomendas com “não recebido” (status ou tipo de problema) dos dois relatórios e recalcula tudo." }))),
    h("section", { class: "bloco" }, h("h2", null, "Como cada número é calculado"),
      h("dl", { class: "defs" },
        def("Pendente", "Toda encomenda presente no relatório atualizado (depois das remoções acima).", "relatorio"),
        def("Provável entrega", "Estava na base e não está no atualizado, sem palavra de devolução no tipo ou motivo do problema.", "inferido"),
        def("Possível devolução", "Estava na base, não está no atualizado e o problema contém “devol”, “não recebido”, “nao recebido”, “recusad” ou “retorno”.", "inferido"),
        def("Nova", "Está no atualizado e não estava na base."),
        def("Mudança de status", "Está nos dois com “Last Scan Status” diferente."),
        def("Classe operacional", "Na lista de pendentes: Anormal se há problema registrado; Entregue se o status é entregue/assinado/signed/delivered ou se há data de entrega; senão, Não entregue. Difere de “provável entrega”.", "pendente"),
        def("Desempenho do entregador", "Universo: encomendas dele na base. Prováveis entregas: as que saíram sem indício de devolução. Anormais e pendentes: as que seguem no atualizado, com e sem problema. A soma pode ser menor que o total; a diferença saiu com indício de devolução."),
        def("Tempo de espera", "Dias desde a chegada ao galpão até a referência. Faixas: 0–1 dia (menos de 2), 2–3 dias (de 2 a menos de 4), 4+ dias."),
        def("Devolução (exceção)", `${a.parametros.limite_tentativas} ou mais tentativas e último motivo de ausência ou recusa (${a.parametros.motivos_devolucao.join(", ")}). Com outro motivo, vai para “3+ tentativas, revisar”.`),
        def("Tempo em rota", "Desde a saída para entrega (Delivery Time) até a referência, para quem não tem entrega confirmada."),
        def("Extravio", "Tipo ou motivo do problema contém “lost” ou “extravi”."),
        def("Insucesso", "Tem problema, menos de 3 tentativas e não é extravio."),
        def("Erro de piso", "Entregador fora da área (não está entre os válidos para a cidade ou bairro), Sem entregador, Cidade fora da abrangência."))),
    h("section", { class: "bloco" }, h("h2", null, "Decisões de regra"),
      h("ul", { class: "propostas" },
        h("li", null, chip("Aplicada em 11/10", "ok"), h("strong", null, " OP-01 · Entregue = entrega confirmada. "), "“Delivery Time” é a saída para entrega e deixou de contar como entregue; vale status de entregue ou data de assinatura."),
        h("li", null, chip("Aplicada em 11/10", "ok"), h("strong", null, " OP-02 · Devolução pelo motivo. "), "Só ausência ou recusa contam; 3+ tentativas por outro motivo vão para revisão."),
        h("li", null, chip("Aplicada em 11/10", "ok"), h("strong", null, " OP-06 · Referência fixa. "), "Vem do nome do arquivo ou do evento mais recente; o mesmo arquivo gera sempre os mesmos números."),
        h("li", null, chip("Aplicada em 11/10", "ok"), h("strong", null, " Descarregado ignorado por padrão. "), "Pode ser desligado na importação."),
        h("li", null, selo("pendente"), h("strong", null, "Entregas confirmadas no atualizado. "), "Hoje seguem contadas como pendentes (RN-003). Excluí-las muda pendências, piso e exceções."),
        h("li", null, selo("pendente"), h("strong", null, "Grafias de bairro. "), "Unificar “Planalto” e “planalto” na conferência por bairro mudaria as regras derivadas."),
        h("li", null, selo("proposta"), h("strong", null, "OP-03 · Parâmetros configuráveis. "), "Mínimo de entregadores para conferir por bairro, limite de tentativas e faixas de espera continuam fixos."),
        h("li", null, selo("proposta"), h("strong", null, "OP-05 · Cadastro oficial de abrangência. "), "As regras derivadas podem repetir erros do histórico. Os ajustes manuais já têm prioridade."),
        h("li", null, chip("Alerta ativo", "ok"), h("strong", null, " OP-07 · Ordem dos arquivos. "), "A importação avisa quando há indício de inversão, sem trocar a ordem sozinha."))));
}
