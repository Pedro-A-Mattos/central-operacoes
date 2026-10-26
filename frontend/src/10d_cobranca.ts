// Mensagem de cobrança por entregador, pronta para colar no WhatsApp: é por ali que o operador cobra a equipe.
// Parte pura (montagem do texto, testável sem DOM) e o painel que a mostra em Pendências de entrega.
// O texto só leva código, cidade, bairro e o motivo da ocorrência: nada que identifique o destinatário.

const SEM_ENTREGADOR_MSG = "(sem entregador)";
const ABAS_COBRANCA: AbaPend[] = ["atrasadas", "tent1", "tent2", "tent3"]; // extravio e avaria vão para a transportadora, não para o entregador

// O que acompanha o código na linha da encomenda, conforme a aba.
function detalheCobranca(r: RegAtual, aba: AbaPend): string {
  const d = r.dados, partes: string[] = [];
  const motivo = String(d["Last Problem Reason"] ?? d["Last Problem Type"] ?? "").trim();
  if (aba === "atrasadas") {
    const dia = diaChegada(r); if (dia !== SEM_DATA) partes.push(`chegou ${fmtDiaCurto(dia)}`);
    if (motivo) partes.push(motivo);
  } else {
    if (motivo) partes.push(motivo);
    partes.push(`${tentativasDe(r)} tent.`);
    if (aba === "tent3" && !r.motivo_devolucao) partes.push("confirmar devolução");
  }
  return partes.join(" · ");
}

// Um grupo por entregador, o que tem mais encomendas primeiro; "sem entregador" fica por último (não é uma pessoa para cobrar).
function gruposCobranca(regs: RegAtual[]): { entregador: string; regs: RegAtual[] }[] {
  const m = new Map<string, RegAtual[]>();
  for (const r of regs) { const e = entregadorDe(r.dados); if (!m.has(e)) m.set(e, []); m.get(e)!.push(r); }
  return [...m].map(([entregador, rs]) => ({ entregador, regs: rs }))
    .sort((a, b) => Number(a.entregador === SEM_ENTREGADOR_MSG) - Number(b.entregador === SEM_ENTREGADOR_MSG) || b.regs.length - a.regs.length || a.entregador.localeCompare(b.entregador, "pt-BR"));
}

// Texto de um entregador: título com a ação, uma lista por cidade (código · bairro · motivo) e o horário do relatório.
// Formatação do WhatsApp: *negrito* e _itálico_.
function textoCobranca(entregador: string, regs: RegAtual[], o: { aba: AbaPend; acao: string; referencia: string }): string {
  const n = regs.length;
  const porCidade = new Map<string, RegAtual[]>();
  for (const r of regs) { const c = textoOu(r.dados["Consignee City"], "(sem cidade)"); if (!porCidade.has(c)) porCidade.set(c, []); porCidade.get(c)!.push(r); }
  const semEnt = entregador === SEM_ENTREGADOR_MSG;
  const cab = semEnt
    ? `*Sem entregador atribuído*: ${plural(n, "encomenda precisa", "encomendas precisam")} de entregador.`
    : `*${entregador}*, ${plural(n, "encomenda pede", "encomendas pedem")} a sua atenção: ${o.acao.charAt(0).toLowerCase() + o.acao.slice(1)}.`;
  const blocos = [...porCidade].sort(([a], [b]) => a.localeCompare(b, "pt-BR")).map(([cidade, rs]) => {
    const linhas = [...rs].sort((x, y) => textoOu(x.dados["Consignee Area"], "").localeCompare(textoOu(y.dados["Consignee Area"], ""), "pt-BR") || awbDe(x.dados).localeCompare(awbDe(y.dados)))
      .map((r) => { const det = detalheCobranca(r, o.aba); return `• ${awbDe(r.dados)} · ${textoOu(r.dados["Consignee Area"], "(sem bairro)")}${det ? " · " + det : ""}`; });
    return [`*${cidade}* (${rs.length})`, ...linhas].join("\n");
  });
  return [cab, ...blocos, semEnt ? "" : "Me avise o retorno, por favor.", `_Relatório de ${fmtData(o.referencia)}_`].filter(Boolean).join("\n\n");
}

// ---------- painel ----------
const COBRANCA = { aberto: false, entregador: "" };

// `regs` = a lista que a tela mostra agora (já com filtros e célula da tabela); só entra quem ainda pede ação.
function painelCobranca(regs: RegAtual[], aba: AbaPend, acao: string, referencia: string): HTMLElement | null {
  if (!ABAS_COBRANCA.includes(aba)) return null;
  const grupos = gruposCobranca(regs.filter((r) => pedeAcao(aba as AcaoPend, r)));
  if (!grupos.length) return null;
  const o = { aba, acao, referencia };
  const botao = h("button", { type: "button", class: "btn btn-sec", "aria-expanded": COBRANCA.aberto ? "true" : "false", on: { click: () => { COBRANCA.aberto = !COBRANCA.aberto; atualizar(); if (COBRANCA.aberto) irPara("cob-tit"); } } },
    icone("copiar", "ic ic-sm"), COBRANCA.aberto ? "Fechar a mensagem" : "Mensagem para o entregador");
  if (!COBRANCA.aberto) return h("div", { class: "cobranca-barra" }, botao, h("span", { class: "nota" }, "Texto pronto para colar no WhatsApp, com a lista desta aba."));

  if (!grupos.some((g) => g.entregador === COBRANCA.entregador)) COBRANCA.entregador = grupos[0].entregador;
  const atual = grupos.find((g) => g.entregador === COBRANCA.entregador)!;
  const texto = textoCobranca(atual.entregador, atual.regs, o);
  const area = h("textarea", { class: "cobranca-texto", readonly: true, rows: "12", "aria-label": "Mensagem para " + atual.entregador, on: { focus: (e: Event) => (e.target as HTMLTextAreaElement).select() } }) as HTMLTextAreaElement;
  area.value = texto;
  const pessoas = grupos.filter((g) => g.entregador !== SEM_ENTREGADOR_MSG);
  const todas = () => pessoas.map((g) => textoCobranca(g.entregador, g.regs, o)).join("\n\n――――――――――\n\n");
  return h("section", { class: "bloco cobranca", "aria-labelledby": "cob-tit" },
    h("div", { class: "bloco-cab" }, h("h2", { id: "cob-tit" }, "Mensagem para o entregador"), botao),
    h("p", { class: "nota" }, "Texto pronto para colar no WhatsApp, com a lista desta aba (já considera os filtros e a tabela por data). Só leva código, cidade, bairro e motivo: nada do destinatário."),
    h("div", { class: "cobranca-ferr" },
      h("label", { class: "sel-ordem" }, h("span", null, "Entregador"),
        h("select", { id: "cob-ent", on: { change: (e: Event) => atualizar(() => { COBRANCA.entregador = (e.target as HTMLSelectElement).value; }) } },
          grupos.map((g) => h("option", { value: g.entregador, selected: g.entregador === atual.entregador }, `${g.entregador === SEM_ENTREGADOR_MSG ? "Sem entregador" : g.entregador} (${g.regs.length})`)))),
      h("button", { type: "button", class: "btn btn-pri", on: { click: () => copiarTexto(texto, `Mensagem para ${atual.entregador} copiada.`, area) } }, icone("copiar", "ic ic-sm"), "Copiar mensagem"),
      pessoas.length > 1 ? h("button", { type: "button", class: "btn btn-ghost", on: { click: () => copiarTexto(todas(), `Mensagens de ${plural(pessoas.length, "entregador", "entregadores")} copiadas.`) } }, `Copiar de todos (${pessoas.length})`) : null),
    area,
    texto.length > 20000 ? h("p", { class: "nota" }, `Mensagem longa (${fmtN(texto.length)} caracteres). O WhatsApp aceita até cerca de 65 mil, mas fica difícil de ler: filtre por cidade ou data para dividir.`) : null);
}
