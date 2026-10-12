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
    em_rota_24h: a.atual.filter((r) => (r.em_rota_min ?? 0) >= 1440).length,
    por_entregador: porEnt,
    pendentes: a.atual.map((r) => awbDe(r.dados)),
  };
}

async function processar(reprocessar = false) {
  if (!pronto(E.imp.base) || !pronto(E.imp.atual)) return;
  const etapas = ["Conferindo os dois relatórios", "Removendo força maior e separando fora da jurisdição", "Comparando base × atualizado por código (AWB)", "Conferindo piso, exceções e desempenho"];
  atualizar(() => { E.imp.processando = true; E.imp.erroGeral = null; E.imp.etapas = etapas.map((t) => ({ texto: t, feito: false })); });
  try {
    E.imp.etapas[0].feito = true; renderizar(); await espera(60);
    const a = await E.servico!.analisar(E.imp.base!, E.imp.atual!, E.params);
    for (const et of E.imp.etapas) et.feito = true;
    renderizar(); await espera(120);
    const filtrosAntes = E.f;
    atualizar(() => {
      E.analise = a; indexar(a); E.desempenho = a.desempenho;
      E.overrides = { por_cidade: {}, cidades_ignoradas: [] };
      if (!reprocessar) E.f = filtrosVazios(); else { E.f = filtrosAntes; E.f.entregadores.dias = []; E.f.entregadores.sel = null; E.f.pendencias.dias = E.f.pendencias.dias.filter((d) => a.dias_chegada.includes(d)); }
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
  const titulo = papel === "base" ? "Relatório base" : "Relatório atualizado";
  const desc = papel === "base"
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
  const v = E.imp.atual!;
  const definida = E.params.referencia_backlog || null;
  const sugerida = v.referencia_sugerida || null;
  const efetiva = definida || sugerida;
  const origem: OrigemReferencia = definida ? "definida" : (v.referencia_origem || "relogio");
  return h("div", { class: "conf-ref" },
    h("span", { class: "fig-tit" }, icone("relogio", "ic ic-sm"), h("strong", null, "Referência dos tempos: "), efetiva ? fmtData(efetiva) : "momento do processamento", explica("referencia", "imp")),
    h("small", null, "Origem: ", ORIGEM_REF[origem], "."),
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
            h("p", null, `${fmtN(o.so_no_atual)} códigos existem só no atualizado e apenas ${fmtN(o.so_na_base)} só na base, e o atualizado tem mais linhas. Normalmente o atualizado é menor, porque as encomendas entregues saem dele.`),
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

  return h("div", { class: "tela tela-importar" },
    cabecalho({ area: "Início", titulo: "Nova importação", pergunta: "Quais dois retratos da operação você quer comparar?",
      acoes: E.analise && !imp.processando ? h("button", { type: "button", class: "btn btn-ghost", on: { click: () => navegar("torre") } }, "Voltar à análise atual") : null }),
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
