// Painel de detalhes de uma encomenda (AWB) — reutilizado por todas as telas.

function abrirAwb(awb: string, foco: "" | "justificar" = "") {
  atualizar(() => { E.drawer = awb; E.drawerFoco = foco; });
  setTimeout(() => {
    const alvo = foco === "justificar" ? document.querySelector<HTMLElement>(".gaveta [name=motivo]") : document.getElementById("gaveta-fechar");
    alvo?.focus();
  }, 30);
}
function fecharAwb() {
  const awb = E.drawer;
  atualizar(() => { E.drawer = null; });
  if (awb) setTimeout(() => (document.querySelector<HTMLElement>(`button.awb[data-awb="${awb}"]`) || document.getElementById("titulo-tela"))?.focus(), 30);
}

function campo(rot: string, v: Filho, s?: Selo): HTMLElement {
  return h("div", { class: "campo" }, h("dt", null, rot, s ? selo(s) : null), h("dd", null, v));
}
const val = (d: Dados, c: string) => { const v = d[c]; const vaz = v === null || v === undefined || String(v).trim() === ""; return h("span", { class: vaz ? "nulo" : "" }, valorTexto(c, v)); };

function motivosAtual(r: RegAtual): Filho[] {
  const d = r.dados; const a = E.analise!;
  const m: Filho[] = [h("li", null, "Está no relatório atualizado, por isso conta como ", h("strong", null, "pendente"), ".")];
  m.push(h("li", null, r.nova ? ["Não existia no relatório base: é uma ", h("strong", null, "nova"), " encomenda."] : "Também estava no relatório base."));
  if (r.mudou_status) m.push(h("li", null, `O status mudou de “${valorTexto("Last Scan Status", r.status_base)}” para “${valorTexto("Last Scan Status", d["Last Scan Status"])}”.`));
  if (r.classe_operacional === "Anormal") m.push(h("li", null, "Classe operacional ", h("strong", null, "Anormal"), `: há problema registrado (${d["Last Problem Type"]}).`));
  else if (r.classe_operacional === "Entregue") m.push(h("li", null, "Classe operacional ", h("strong", null, "Entregue"), `: ${d["Sign Date"] ? "há data de assinatura" : "o status indica entrega"} no relatório. Mesmo assim segue contada como pendente, porque está no relatório atualizado (RN-003).`));
  else m.push(h("li", null, "Classe operacional ", h("strong", null, "Não entregue"), ": sem problema e sem entrega confirmada no relatório."));
  if (r.em_rota_min !== null) m.push(h("li", { class: r.em_rota_min >= 1440 ? "m-atencao" : "" }, `Saiu para entrega há ${fmtMin(r.em_rota_min)} (Delivery Time ${fmtData(d["Delivery Time"])}), sem entrega confirmada.`));
  if (r.backlog_dias !== null) m.push(h("li", null, `Chegou ao galpão em ${fmtData(d["Arrival Time"])}, há ${fmtDias(r.backlog_dias)} (até ${fmtData(a.referencia_backlog)}).`));
  else m.push(h("li", null, "Sem data de chegada válida: fica fora do cálculo de tempo de espera."));
  if (r.erro_piso) m.push(h("li", { class: "m-critico" }, h("strong", null, r.erro_piso.tipo + ": "), r.erro_piso.detalhe,
    r.erro_piso.esperados.length ? ` Válidos pela regra ${ROTULO_ESCOPO[r.erro_piso.escopo] || "da cidade"} (${r.erro_piso.origem_regra}): ${r.erro_piso.esperados.join(", ")}.` : ""));
  else if (!a.regras.cidades_ignoradas.includes(String(d["Consignee City"]))) m.push(h("li", null, "Conferência de piso: cidade e entregador dentro da regra."));
  else m.push(h("li", null, "A cidade está fora da conferência de piso."));
  const cont = d["Delivery Count"];
  if (r.excecoes.includes("devolucao")) m.push(h("li", { class: "m-critico" }, h("strong", null, "Devolução: "), `${cont} tentativas de entrega (regra: ${a.parametros.limite_tentativas} ou mais) e o último motivo indica ausência ou recusa (“${r.motivo_devolucao}”).`));
  if (r.excecoes.includes("revisar_tentativas")) m.push(h("li", { class: "m-atencao" }, h("strong", null, "3+ tentativas, revisar: "), `${cont} tentativas, mas o último motivo (“${d["Last Problem Reason"] ?? d["Last Problem Type"] ?? "não informado"}”) não é ausência nem recusa. Por isso não conta como devolução.`));
  if (r.excecoes.includes("extravio")) m.push(h("li", { class: "m-critico" }, h("strong", null, "Extravio: "), "o tipo ou motivo do problema contém “lost” ou “extravi”."));
  if (r.excecoes.includes("avaria")) m.push(h("li", { class: "m-critico" }, h("strong", null, "Avaria: "), `o tipo ou motivo do problema indica dano (“${d["Last Problem Reason"] ?? d["Last Problem Type"] ?? "não informado"}”). ${(Number(cont) || 0) === 0 ? "Não houve tentativa de entrega. " : ""}Siga o processo de avaria: sinalizar o piso e pedir aprovação.`));
  if (r.excecoes.includes("insucesso") && !r.excecoes.includes("avaria")) m.push(h("li", { class: "m-atencao" }, h("strong", null, "Insucesso: "), `há problema registrado e ${cont ?? 0} tentativa(s), menos de ${a.parametros.limite_tentativas}. Aguarda nova tentativa.`));
  if (r.reroteada) m.push(h("li", { class: "m-ok" }, h("strong", null, "Já em rota de novo: "), `a saída para entrega (${fmtData(d["Delivery Time"])}) é posterior à ocorrência (${fmtData(d["Last Problem Date"])}). Não pede mais ação sua.`));
  else if (r.excecoes.includes("insucesso") && !r.excecoes.includes("avaria") && (Number(cont) || 0) >= 1 && !r.entrega_confirmada) m.push(h("li", { class: "m-atencao" }, h("strong", null, "Sem nova saída para rota: "), `nenhuma saída para entrega depois da ocorrência de ${fmtData(d["Last Problem Date"])}. ${(Number(cont) || 0) >= 2 ? "Colocar em rota e verificar com o entregador se vai devolver." : "Colocar em rota de novo."}`));
  const pend = motivoPendencia(r);
  m.push(h("li", { class: pend.pendente ? "m-atencao" : "m-ok" }, h("strong", null, pend.pendente ? "Conta como pendência: " : "Não conta como pendência: "), pend.motivo));
  const vista = vistaNoHistorico(awbDe(d));
  if (vista && vista.vezes > 1) m.push(h("li", { class: vista.vezes >= 3 ? "m-atencao" : "" }, `Já aparecia como pendente na importação de ${fmtData(vista.primeira)}: está pendente em ${vista.vezes} importações do histórico.`));
  return m;
}

function gaveta(): HTMLElement | null {
  if (!E.drawer || !E.analise) return null;
  const awb = E.drawer; const a = E.analise;
  const ref = E.idx.get(awb);
  const fechar = h("button", { type: "button", class: "btn-icone", id: "gaveta-fechar", "aria-label": "Fechar detalhes", on: { click: fecharAwb } }, icone("fechar"));
  const copiar = h("button", { type: "button", class: "btn btn-ghost btn-p", on: { click: () => copiarCodigo(awb) } }, "Copiar código");
  let situacao: Filho[] = [], motivos: Filho[] = [], d: Dados = { "Waybill No": awb }, origem = "", extra: Filho = null;
  if (!ref) {
    const fm = a.removidas.fm.includes(awb), desc = a.removidas.descarregado.includes(awb), nrec = a.removidas.nao_recebido.includes(awb), cruz = (a.removidas.cruzadas || []).includes(awb);
    return h("aside", { class: "gaveta", role: "dialog", "aria-modal": "false", "aria-labelledby": "gav-tit" },
      h("div", { class: "gav-cab" }, h("div", null, h("p", { class: "sobretitulo" }, "Encomenda"), h("h2", { id: "gav-tit", class: "mono" }, awb)), fechar),
      vazio(fm ? "Removida por força maior" : desc ? "Removida pelo filtro de descarregado" : nrec ? "Removida pelo filtro de não recebido" : cruz ? "Removida pelo outro relatório" : "Fora desta análise",
        fm ? "Encomendas de força maior (FM) são retiradas de toda a análise." : desc ? "O filtro “Ignorar descarregado” está ligado." : nrec ? "O filtro “Ignorar não recebido” está ligado." : cruz ? "O outro relatório traz esta encomenda como FM, descarregado, não recebido ou sem cidade, então ela sai da análise nos dois (senão pareceria uma entrega)." : "Este código não está em nenhum dos dois relatórios."));
  }
  if (ref.fonte === "atual") {
    const r = ref.reg; d = r.dados; origem = `Relatório atualizado (${a.arquivos.atual})` + (r.nova ? "" : ` · status anterior do relatório base (${a.arquivos.base})`);
    situacao = [chip("Pendente", "neutro"), r.nova ? chip("Nova", "info") : null, r.erro_piso ? chipErro(r.erro_piso.tipo) : null, ...r.excecoes.map((x) => chip(ROTULO_EXC[x], TOM_EXC[x])), chip(r.classe_operacional, TOM_CLASSE[r.classe_operacional])];
    motivos = motivosAtual(r);
    if (r.excecoes.length || PEND.atrasadas(r)) {
      const j = a.justificativas[awb];
      extra = h("section", { class: "gav-sec", "aria-labelledby": "gav-just" }, h("h3", { id: "gav-just" }, "Alerta"),
        j ? h("div", { class: "just-ok" }, h("p", null, chip("Justificado", "ok", "ok"), " ", h("strong", null, j.motivo)),
              j.observacao ? h("p", null, j.observacao) : null,
              h("p", { class: "nota" }, `Registrado em ${fmtData(j.criada_em) || j.criada_em}`, j.reavaliar_em ? ` · reavaliar em ${fmtData(j.reavaliar_em, false)}` : ""),
              h("button", { type: "button", class: "btn btn-sec", on: { click: () => reativarAlerta(awb) } }, "Reativar alerta"))
          : [h("p", { class: "nota" }, "Se a situação já foi tratada, justifique para tirar a encomenda das listas ativas sem perder o registro."), formJustificar([awb])]);
    }
    if (r.erro_piso) extra = [extra, h("section", { class: "gav-sec" }, h("h3", null, "Correção sugerida"),
      h("p", { class: "de-para" }, h("span", null, h("small", null, "Está com"), d["Delivery Associate"] ? String(d["Delivery Associate"]) : h("span", { class: "nulo" }, "Sem entregador")), icone("seta"),
        h("span", null, h("small", null, "Deveria estar com"), r.erro_piso.esperados.join(" ou ") || h("span", { class: "nulo" }, "Sem regra"))),
      h("p", { class: "nota" }, r.erro_piso.origem_regra === "ajuste manual" ? selo("manual") : selo("derivada"), " Confirme antes de mover a encomenda."))];
  } else if (ref.fonte === "saiu") {
    const r = ref.reg; d = r.dados; origem = `Último registro no relatório base (${a.arquivos.base}). Não aparece no atualizado.`;
    situacao = [chip(r.categoria === "provavel_entrega" ? "Provável entrega" : "Possível devolução", r.categoria === "provavel_entrega" ? "ok" : "inferido"), selo("inferido")];
    motivos = [h("li", null, "Estava no relatório base e ", h("strong", null, "não aparece no atualizado"), "."),
      r.categoria === "provavel_entrega"
        ? h("li", null, "Nenhuma palavra de devolução no problema registrado, então é tratada como ", h("strong", null, "provável entrega"), ". Não há confirmação de entrega nos arquivos.")
        : h("li", null, `O problema registrado contém “${r.indicio}”, então é tratada como `, h("strong", null, "possível devolução"), "."),
      h("li", null, "Sumir do relatório nunca é tratado como extravio.")];
  } else {
    d = ref.dados; origem = ref.fonte === "fora_atual" ? `Relatório atualizado (${a.arquivos.atual})` : `Relatório base (${a.arquivos.base})`;
    situacao = [chip("Fora da jurisdição", "neutro")];
    motivos = [h("li", null, "Não tem cidade de destino, por isso fica ", h("strong", null, "fora da jurisdição"), "."), h("li", null, "Não entra em nenhum indicador: pendências, piso, desempenho ou tempo de espera.")];
  }
  const r = ref.fonte === "atual" ? ref.reg : null;
  return h("aside", { class: "gaveta", role: "dialog", "aria-modal": "false", "aria-labelledby": "gav-tit", on: { keydown: (e: KeyboardEvent) => { if (e.key === "Escape") fecharAwb(); } } },
    h("div", { class: "gav-cab" },
      h("div", null, h("p", { class: "sobretitulo" }, "Código da encomenda (AWB)"), h("h2", { id: "gav-tit", class: "mono" }, awb), h("div", { class: "chips" }, situacao)),
      fechar),
    h("div", { class: "gav-corpo" },
      h("section", { class: "gav-sec porque", "aria-labelledby": "gav-pq" }, h("h3", { id: "gav-pq" }, "Por que esta classificação"), h("ul", null, motivos)),
      extra,
      h("section", { class: "gav-sec" }, h("h3", null, "Destino e atribuição"), h("dl", { class: "campos" },
        campo("Cidade", val(d, "Consignee City")), campo("Bairro", val(d, "Consignee Area")), campo("Endereço", val(d, "Consignee Address")), campo("CEP", val(d, "Consignee Zip Code")),
        campo("Entregador", val(d, "Delivery Associate"), "relatorio"),
        r && !r.nova && String(r.entregador_base ?? "") !== String(d["Delivery Associate"] ?? "") ? campo("Entregador na base", h("span", null, valorTexto("Delivery Associate", r.entregador_base))) : null,
        campo("Rota", val(d, "Consignee Route Code")), campo("Estação", val(d, "Dispatch Station")))),
      h("section", { class: "gav-sec" }, h("h3", null, "Status"), h("dl", { class: "campos" },
        r ? campo("No relatório base", r.nova ? h("span", { class: "nulo" }, "Não estava na base") : h("span", null, valorTexto("Last Scan Status", r.status_base))) : null,
        campo(r ? "No relatório atualizado" : "Último status", val(d, "Last Scan Status")))),
      h("section", { class: "gav-sec" }, h("h3", null, "Chegada e tempo"), h("dl", { class: "campos" },
        campo("Chegada ao galpão", val(d, "Arrival Time")),
        r ? campo("Chegou", r.backlog_dias !== null ? h("span", null, chipIdadeChegada(r), " ", fmtDias(r.backlog_dias)) : h("span", { class: "nulo" }, "Sem data de chegada")) : null,
        campo("Saída para entrega", val(d, "Delivery Time")),
        r ? campo("Em rota há", r.em_rota_min !== null ? h("span", null, fmtMin(r.em_rota_min)) : h("span", { class: "nulo" }, r.entrega_confirmada ? "Entregue" : "Sem saída registrada")) : null,
        campo("Entrega confirmada em", val(d, "Sign Date")),
        campo("Tempo em espera (relatório)", val(d, "Waybill Hold Time")))),
      h("section", { class: "gav-sec" }, h("h3", null, "Tentativas e problema"), h("dl", { class: "campos" },
        campo("Tentativas de entrega", val(d, "Delivery Count")), campo("Tipo de problema", val(d, "Last Problem Type")), campo("Motivo", val(d, "Last Problem Reason")), campo("Data do problema", val(d, "Last Problem Date")),
        campo("Referência", val(d, "Reference No")))),
      h("p", { class: "gav-origem" }, icone("arquivo", "ic ic-xs"), "Origem: ", origem, ". Os arquivos trazem só o último registro de cada encomenda; não há histórico de eventos."),
      h("div", { class: "gav-acoes" }, copiar)));
}
