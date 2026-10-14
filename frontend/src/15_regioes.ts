// Estudo de regiões (gera/baixa o JSON de quem atende cada CEP e permite usá-lo
// na sessão) e "Não recebido, mas entregue". A conferência por região acontece
// na própria Conferência de piso, usando o mapa de região ativo.

// ---------- upload de uma planilha (tela de Estudo) ----------
async function receberPlanilhaUnica(arquivo: File) {
  const e = E.estudo;
  atualizar(() => { e.lendo = true; e.erro = null; e.arquivo = null; e.mapa = null; });
  try {
    const info = await E.servico!.receber(arquivo);
    atualizar(() => { e.arquivo = info; });
  } catch (err) {
    atualizar(() => { e.erro = problemaDe(err); });
  } finally { atualizar(() => { e.lendo = false; }); }
}

function zonaPlanilhaEstudo(): HTMLElement {
  const e = E.estudo;
  const input = h("input", { type: "file", accept: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", id: "arq-estudo", class: "sr",
    on: { change: (ev: Event) => { const f = (ev.target as HTMLInputElement).files?.[0]; if (f) receberPlanilhaUnica(f); } } });
  const soltar = h("label", { for: "arq-estudo", class: "soltar" + (e.lendo ? " lendo" : ""),
    on: {
      dragover: (ev: DragEvent) => { ev.preventDefault(); (ev.currentTarget as HTMLElement).classList.add("arrastando"); },
      dragleave: (ev: DragEvent) => (ev.currentTarget as HTMLElement).classList.remove("arrastando"),
      drop: (ev: DragEvent) => { ev.preventDefault(); (ev.currentTarget as HTMLElement).classList.remove("arrastando"); const f = ev.dataTransfer?.files?.[0]; if (f) receberPlanilhaUnica(f); },
    } },
    icone(e.lendo ? "relogio" : "importar", "ic ic-lg"),
    h("strong", null, e.lendo ? "Lendo o arquivo…" : e.arquivo ? "Trocar arquivo" : "Escolha ou arraste o arquivo .xlsx"),
    h("span", null, "Relatório Dispatch exportado do sistema da transportadora"));
  const info = e.arquivo;
  const okv = pronto(info);
  const resumo = info ? h("div", { class: "validacao" },
    h("div", { class: "val-topo" }, icone("arquivo"), h("strong", { class: "val-nome", title: info.nome }, info.nome),
      okv ? chip("Pronto", "ok", "ok") : chip("Com problemas", "critico", "critico")),
    h("dl", { class: "val-num" },
      h("div", null, h("dt", null, "Linhas lidas"), h("dd", null, fmtN(info.linhas))),
      h("div", null, h("dt", null, "Códigos válidos"), h("dd", null, fmtN(info.validas)))),
    info.problemas.map(caixaProblema)) : null;
  return h("section", { class: "zona" },
    h("div", { class: "zona-cab" }, h("div", null, h("h2", null, "Histórico de entregas"),
      h("p", null, "Uma planilha só, com o maior volume possível de entregas já atribuídas. Não é comparação base × atualizado."))),
    input, soltar, e.erro ? caixaProblema(e.erro) : null, resumo);
}

// Lê o mapa de regiões publicado junto do site (padrão, somente leitura).
// Preferência: arquivo ofuscado (.b64 = deflate-raw + base64, ilegível a olho nu);
// fallback: .json em texto puro (compatibilidade).
async function carregarMapaRegiaoPublicado(): Promise<MapaRegiao | null> {
  const norm = (v: unknown): MapaRegiao | null => {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    return { ...(o as object), limiar: Number(o.limiar) || 0, por_cep: (o.por_cep as Record<string, string[]>) || {},
             por_bairro: (o.por_bairro as Record<string, string[]>) || {}, por_cidade: (o.por_cidade as Record<string, string[]>) || {} } as MapaRegiao;
  };
  // 1) arquivo ofuscado
  try {
    const r = await fetch("./regras_regiao.b64", { cache: "no-store" });
    if (r.ok) {
      const b64 = (await r.text()).trim();
      if (b64) {
        const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const json = new TextDecoder().decode(await inflarRaw(bin));
        const m = norm(JSON.parse(json));
        if (m) return m;
      }
    }
  } catch { /* tenta o .json abaixo */ }
  // 2) fallback: json em texto puro
  try {
    const r = await fetch("./regras_regiao.json", { cache: "no-store" });
    if (!r.ok) return null;
    return norm(await r.json());
  } catch { return null; }
}

// Deriva o mapa com o limiar escolhido. Não ativa nada sozinha: quem ativa é `aplicarEstudo`.
async function processarEstudo() {
  const e = E.estudo;
  if (!pronto(e.arquivo)) return;
  atualizar(() => { e.processando = true; });
  try {
    const mapa = await E.servico!.derivarRegiao(e.arquivo!, e.limiar);
    atualizar(() => { e.mapa = mapa; e.processando = false; });
  } catch (err) { atualizar(() => { e.processando = false; }); aviso(problemaDe(err).titulo, "erro"); }
}

async function baixarMapaRegiao() {
  const e = E.estudo;
  if (!e.mapa) return;
  const nome = `regras_regiao_limiar${e.mapa.limiar}.json`;
  const r = await salvarArquivo(nome, JSON.stringify({ gerado_em: new Date().toISOString().slice(0, 19), ...e.mapa }, null, 2));
  if (r === "salvo") aviso(`Mapeamento salvo em ${nome}. Para torná-lo padrão, versione-o como regras_regiao.json no repositório.`);
  else if (r === "erro") aviso("Não foi possível gerar o arquivo neste ambiente.", "erro");
}

// Reprocessa a análise existente com o mapa ativo, sem reimportar: respeita o modo
// (piso de 1 tabela usa a mesma planilha; análise completa reprocessa base × atual).
async function reprocessarComMapa() {
  if (E.pisoUnico) await processarPisoUnico();
  else await processar(true);
}

// Um único passo: gera o mapa com o limiar escolhido, ATIVA nesta sessão, recalcula a conferência de piso e guarda
// "antes → agora" para a tela mostrar. Vale só na sessão; "Voltar ao mapa publicado" desfaz.
async function aplicarEstudo() {
  const e = E.estudo;
  if (!pronto(e.arquivo) || e.processando) return;
  const antes = E.analise ? errosPiso().length : null;
  atualizar(() => { e.aplicado = null; });
  await processarEstudo();
  if (!e.mapa) return;
  atualizar(() => { E.mapaRegiaoAtivo = e.mapa; E.mapaRegiaoOrigem = "sessao"; });
  if (E.analise) await reprocessarComMapa();
  atualizar(() => { e.aplicado = { antes, depois: E.analise ? errosPiso().length : null, limiar: e.mapa!.limiar }; });
}

async function restaurarMapaPublicado() {
  const m = await carregarMapaRegiaoPublicado();
  atualizar(() => { E.mapaRegiaoAtivo = m; E.mapaRegiaoOrigem = m ? "github" : ""; E.estudo.aplicado = null; });
  if (E.analise) await reprocessarComMapa();
  aviso(m ? "Voltou ao mapa publicado." : "Não há mapa publicado: a conferência usa as regras derivadas da base.");
}

function telaEstudo(): HTMLElement {
  const e = E.estudo;
  const m = e.mapa;
  const r = m ? resumoMapa(m) : null;
  const ativoNota = E.mapaRegiaoAtivo
    ? `Regra ativa na conferência de piso: mapa de região (${E.mapaRegiaoOrigem === "sessao" ? "desta sessão" : "padrão publicado"}).`
    : "Sem mapa de região ativo: a conferência de piso usa as regras derivadas da base.";
  return h("div", { class: "tela" },
    cabecalho({ area: "Consultar", titulo: "Estudo de regiões", pergunta: "Quais entregadores atendem cada região (CEP), a partir de um histórico grande?",
      resposta: h("p", null, "Envie uma planilha com bastante histórico. O sistema deriva, com um limiar de confiança, quem atende cada CEP (podendo ser mais de um). Um clique gera o mapa e já o usa nesta sessão: a Conferência de piso passa a apontar entregas em região errada com base nele. Baixe o JSON se quiser versioná-lo como padrão."),
      acoes: E.analise ? h("button", { type: "button", class: "btn btn-ghost", on: { click: () => navegar("torre") } }, "Voltar à análise") : null }),
    h("p", { class: "nota" }, ativoNota),
    zonaPlanilhaEstudo(),
    pronto(e.arquivo) ? h("section", { class: "bloco" },
      h("div", { class: "filtros-controles" },
        h("label", { class: "sel-ordem" }, h("span", null, "Limiar de confiança"),
          h("input", { type: "number", id: "est-lim", min: "1", max: "100", value: String(e.limiar), style: { width: "90px" },
            on: { input: (ev: Event) => { e.limiar = Math.max(1, Math.min(100, Number((ev.target as HTMLInputElement).value) || 5)); } } })),
        h("button", { type: "button", class: "btn btn-pri", disabled: e.processando, on: { click: () => aplicarEstudo() } }, icone("ok", "ic ic-sm"), e.processando ? "Processando…" : "Gerar e usar este mapa"),
        E.mapaRegiaoOrigem === "sessao" ? h("button", { type: "button", class: "btn btn-ghost", disabled: e.processando, on: { click: () => restaurarMapaPublicado() } }, "Voltar ao mapa publicado") : null),      h("p", { class: "nota" }, "Um entregador entra na regra de uma região (CEP, bairro ou cidade) quando tem pelo menos “limiar” entregas ali E pelo menos 5% das entregas da região; o entregador com mais entregas é sempre mantido. Limiar MENOR aceita mais gente por região (menos alertas falsos, detecção um pouco menor); limiar MAIOR deixa quase só o entregador principal (mais alertas). Os totais de CEPs, entregadores e cidades não mudam com o limiar, porque todo CEP guarda ao menos o entregador principal: o que muda é quantos CEPs têm mais de um entregador e quantos alertas de piso saem. Padrão 5 (docs/CALIBRACAO_REGIAO.md).")) : null,
    m && r ? [
      h("div", { class: "kpis kpis-4" },
        kpi({ rotulo: "CEPs mapeados", valor: r.ceps, nota: `Limiar ${m.limiar}` }),
        kpi({ rotulo: "CEPs com +1 entregador", valor: r.multi, tom: r.multi ? "atencao" : undefined, nota: "Regiões compartilhadas" }),
        kpi({ rotulo: "Entregadores", valor: r.ents, nota: "Com região atribuída" }),
        kpi({ rotulo: "Cidades", valor: r.cidades, nota: "No fallback" })),
      e.aplicado ? h("div", { class: "alerta-caixa tom-ok", role: "status" }, icone("ok"),
        h("div", null, h("strong", null, `Mapa com limiar ${e.aplicado.limiar} ativo nesta sessão`),
          e.aplicado.depois === null
            ? h("p", null, "Importe os dois relatórios para ver a conferência de piso por região.")
            : h("p", null, `Alertas de piso: ${e.aplicado.antes === null ? "" : `${fmtN(e.aplicado.antes)} → `}${fmtN(e.aplicado.depois)}. Mude o limiar e clique de novo para comparar.`),
          h("button", { type: "button", class: "btn btn-sec", on: { click: () => navegar("piso", { de: "estudo" }) } }, "Ver conferência de piso", icone("seta", "ic ic-sm")))) : null,
      h("div", { class: "bloco-cab" }, h("h2", null, "Mapeamento"),
        h("div", { class: "conf-acoes" },
          h("button", { type: "button", class: "btn btn-sec", on: { click: () => baixarMapaRegiao() } }, icone("baixar", "ic ic-sm"), "Baixar JSON"))),
      abas("est-aba", [{ id: "cep" as const, rotulo: "Por CEP" }, { id: "entregador" as const, rotulo: "Por entregador" }], e.aba, (v) => atualizar(() => { e.aba = v; })),
      e.aba === "cep" ? tabelaCep(m) : tabelaEntregador(m),
    ] : null);
}

function tabelaCep(m: MapaRegiao): HTMLElement {
  const linhasCep = Object.entries(m.por_cep).map(([cep, ents]) => ({ cep, ents, n: ents.length }));
  return tabela({ id: "est-cep", titulo: "CEP e entregadores", linhas: linhasCep, chave: (l) => l.cep, porPagina: 30, ordemInicial: { col: "n", dir: -1 },
    colunas: [
      { id: "cep", rotulo: "CEP", valor: (l) => l.cep, classe: "mono" },
      { id: "n", rotulo: "Entregadores", valor: (l) => l.n, classe: "num" },
      { id: "quem", rotulo: "Quem atende", valor: (l) => l.ents.join(", "), render: (l) => h("span", { class: "chips" }, l.ents.map((x) => chip(x, l.ents.length > 1 ? "atencao" : "neutro"))) },
    ],
    exportar: botaoExportar("mapa_regiao_cep.xlsx", () => ({ linhas: linhasCep.map((l) => ({ "Consignee Zip Code": l.cep, entregadores: l.ents.join(", "), qtd_entregadores: l.n })), colunas: ["Consignee Zip Code", "entregadores", "qtd_entregadores"] })) });
}

// Agrega por entregador: CEPs atendidos, cidades cobertas, e quantos CEPs são exclusivos vs. compartilhados.
function porEntregadorDoMapa(m: MapaRegiao) {
  const compartilhado = (ents: string[]) => ents.length > 1;
  const porEnt = new Map<string, { ceps: string[]; exclusivos: number; compartilhados: number; cidades: Set<string> }>();
  for (const [cep, ents] of Object.entries(m.por_cep)) {
    for (const e of ents) {
      const x = porEnt.get(e) || { ceps: [], exclusivos: 0, compartilhados: 0, cidades: new Set<string>() };
      x.ceps.push(cep);
      if (compartilhado(ents)) x.compartilhados++; else x.exclusivos++;
      porEnt.set(e, x);
    }
  }
  // cidades cobertas (via por_cidade do mapa)
  for (const [cidade, ents] of Object.entries(m.por_cidade)) for (const e of ents) { const x = porEnt.get(e); if (x) x.cidades.add(cidade); }
  return [...porEnt.entries()].map(([entregador, x]) => ({
    entregador, nCeps: x.ceps.length, ceps: x.ceps.sort(), exclusivos: x.exclusivos, compartilhados: x.compartilhados,
    cidades: [...x.cidades].sort(),
  })).sort((a, b) => b.nCeps - a.nCeps || a.entregador.localeCompare(b.entregador, "pt-BR"));
}

function tabelaEntregador(m: MapaRegiao): HTMLElement {
  const linhas = porEntregadorDoMapa(m);
  return h("div", null,
    h("p", { class: "nota" }, "Uma linha por entregador: quantos CEPs atende, quantos são exclusivos (só ele) e quantos divide com outros. Expanda para ver os CEPs; passe o mouse para a lista completa."),
    tabela({ id: "est-ent", titulo: "Entregadores e regiões", linhas, chave: (l) => l.entregador, porPagina: 30, ordemInicial: { col: "nceps", dir: -1 },
      colunas: [
        { id: "ent", rotulo: "Entregador", valor: (l) => l.entregador },
        { id: "nceps", rotulo: "CEPs", valor: (l) => l.nCeps, classe: "num" },
        { id: "excl", rotulo: "Exclusivos", valor: (l) => l.exclusivos, classe: "num" },
        { id: "comp", rotulo: "Compartilhados", valor: (l) => l.compartilhados, classe: "num", render: (l) => l.compartilhados ? chip(String(l.compartilhados), "atencao") : h("span", { class: "nulo" }, "0") },
        { id: "cidades", rotulo: "Cidades", valor: (l) => l.cidades.join(", "), render: (l) => h("span", { class: "chips" }, l.cidades.slice(0, 4).map((c) => chip(c, "neutro")), l.cidades.length > 4 ? h("small", null, ` +${l.cidades.length - 4}`) : null) },
        { id: "ceps", rotulo: "CEPs atendidos", ordenavel: false, valor: (l) => l.ceps.join(" "), render: (l) => h("details", { class: "ceps-exp" }, h("summary", { title: l.ceps.join(", ") }, `ver ${l.nCeps} CEPs`), h("div", { class: "ceps-lista" }, l.ceps.map((c) => h("span", { class: "mono ceps-chip" }, c)))) },
      ],
      exportar: botaoExportar("mapa_regiao_entregador.xlsx", () => ({ linhas: linhas.map((l) => ({ entregador: l.entregador, ceps_atendidos: l.ceps.join(", "), qtd_ceps: l.nCeps, exclusivos: l.exclusivos, compartilhados: l.compartilhados, cidades: l.cidades.join(", ") })), colunas: ["entregador", "ceps_atendidos", "qtd_ceps", "exclusivos", "compartilhados", "cidades"] })) }));
}

function resumoMapa(m: MapaRegiao) {
  const multi = Object.values(m.por_cep).filter((e) => e.length > 1).length;
  const ents = new Set<string>();
  for (const v of Object.values(m.por_cep)) for (const x of v) ents.add(x);
  return { ceps: Object.keys(m.por_cep).length, bairros: Object.keys(m.por_bairro).length, cidades: Object.keys(m.por_cidade).length, multi, ents: ents.size };
}

// ========================================================================
// F4 — Não recebido, mas entregue (análise de estudo; antes do filtro)
// ========================================================================
function telaNaoRecebido(): HTMLElement {
  const a = E.analise;
  if (!a) return vazio("Importe uma análise primeiro", "Esta tela cruza os relatórios já importados. Faça uma importação para ver os casos.", h("button", { type: "button", class: "btn btn-sec", on: { click: () => navegar("importar") } }, "Nova importação"));
  // Fonte: lista calculada do atual bruto (antes dos filtros opcionais), para
  // não ser esvaziada pelo filtro "ignorar não recebido".
  const casos = a.nao_recebido_entregue || [];
  const comDeliveryTime = casos.filter((x) => x.categoria === "Com Delivery Time");
  const semDeliveryTime = casos.filter((x) => x.categoria !== "Com Delivery Time");
  const confirmadas = casos.filter((x) => x.confirmada);
  const porEntregador = contar(casos.map((x) => x.dados), (d) => entregadorDe(d));
  const linhas = casos.map((x) => ({ awb: String(x.dados["Waybill No"]), d: x.dados, categoria: x.categoria, confirmada: x.confirmada }));

  return h("div", { class: "tela" },
    cabecalho({ area: "Monitorar", titulo: "Não recebido, mas entregue", ajuda: "nao_recebido_entregue", pergunta: "Quais encomendas foram registradas como “não recebido” mas têm indício de entrega? Quem fez isso?",
      resposta: h("p", null, h("strong", null, plural(casos.length, "encomenda", "encomendas")), " registradas como “não recebido” têm indício de entrega (status de entrega/assinatura ou tempo de entrega preenchido). É visibilidade, não cobrança: o registro de não recebimento já foi feito. Confira o ", h("strong", null, "Last Scan Status"), " de cada linha — algumas ainda constam “Em rota de entrega”.") }),
    h("div", { class: "kpis kpis-4" },
      kpi({ rotulo: "Com indício de entrega", valor: casos.length, tom: casos.length ? "atencao" : undefined, nota: "Não recebido + sinal de entrega" }),
      kpi({ rotulo: "Entrega confirmada", valor: confirmadas.length, tom: confirmadas.length ? "critico" : undefined, nota: "Status de entregue ou assinatura" }),
      kpi({ rotulo: "Com Delivery Time", valor: comDeliveryTime.length, nota: "Registraram o tempo de entrega" }),
      kpi({ rotulo: "Sem Delivery Time", valor: semDeliveryTime.length, tom: semDeliveryTime.length ? "critico" : undefined, nota: "Indício só pelo status, sem o tempo" })),
    casos.length ? [
      h("div", { class: "graficos g2" },
        barras({ id: "nr-ent", titulo: "Por entregador", descricao: "Quem tem casos de “não recebido” com indício de entrega.", unidade: ["encomenda", "encomendas"], itens: porEntregador.map((x) => ({ ...x, tom: "atencao" as Tom })), max: 12 }),
        barras({ id: "nr-cat", titulo: "Com vs sem Delivery Time", descricao: "Registraram ou não o tempo de entrega.", unidade: ["encomenda", "encomendas"],
          itens: [{ rotulo: "Com Delivery Time", valor: comDeliveryTime.length, tom: "atencao" }, { rotulo: "Sem Delivery Time", valor: semDeliveryTime.length, tom: "critico" }] })),
      h("section", { class: "bloco" }, h("div", { class: "bloco-cab" }, h("h2", null, "Encomendas")),
        tabela({ id: "nr-tab", titulo: "Não recebido, com indício de entrega", linhas, chave: (l) => l.awb, porPagina: 50, onAbrir: (l) => abrirAwb(l.awb),
          colunas: [
            { id: "awb", rotulo: "Waybill No", valor: (l) => l.awb, classe: "mono", render: (l) => awbComCopia(l.awb) },
            { id: "ent", rotulo: "Entregador", valor: (l) => entregadorDe(l.d) },
            { id: "status", rotulo: "Last Scan Status", valor: (l) => String(l.d["Last Scan Status"] ?? ""), render: (l) => valorTexto("Last Scan Status", l.d["Last Scan Status"]) },
            { id: "problema", rotulo: "Last Problem Type", valor: (l) => String(l.d["Last Problem Type"] ?? ""), render: (l) => valorTexto("Last Problem Type", l.d["Last Problem Type"]) },
            { id: "indicio", rotulo: "Indício", valor: (l) => (l.confirmada ? "entrega confirmada" : "só tempo de entrega"), render: (l) => l.confirmada ? chip("Entrega confirmada", "neutro") : chip("Só tempo de entrega", "atencao") },
            { id: "dt", rotulo: "Tempo de entrega (Delivery Time)", valor: (l) => String(l.d["Delivery Time"] ?? ""), render: (l) => l.d["Delivery Time"] != null && String(l.d["Delivery Time"]).trim() !== "" ? valorTexto("Delivery Time", l.d["Delivery Time"]) : h("span", { class: "nulo" }, "Não registrado") },
            { id: "cidade", rotulo: "Cidade", valor: (l) => String(l.d["Consignee City"] ?? "") },
          ],
          exportar: botaoExportar("nao_recebido_com_indicio_entrega.xlsx", () => ({ linhas: linhas.map((l) => ({ ...l.d, delivery_time_registrado: l.categoria === "Com Delivery Time" ? "sim" : "não", entrega_confirmada: l.confirmada ? "sim" : "não" })), colunas: [...COLUNAS_CONTRATO, "delivery_time_registrado", "entrega_confirmada"] })) })),
    ] : vazio("Nenhum caso encontrado", "Não há encomendas registradas como “não recebido” com indício de entrega nesta análise.", null, "ok"));
}
