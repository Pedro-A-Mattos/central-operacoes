// Torre de controle: "Como está a operação e o que precisa da minha atenção?"

function telaTorre(): HTMLElement {
  const a = E.analise!;
  const piso = errosPiso();
  const porTipo = contar(piso, (r) => r.erro_piso!.tipo);
  const dev = excAtivas("devolucao"), ext = excAtivas("extravio"), ins = excAtivas("insucesso"), rev = excAtivas("revisar_tentativas");
  const velhas = a.atual.filter((r) => r.faixa_backlog === "4+ dias");
  const comProblema = a.atual.filter((r) => r.dados["Last Problem Type"] !== null);
  const semData = a.atual.filter((r) => r.faixa_backlog === null).length;

  type Alerta = { tom: Tom; n: number; texto: string; origem: string; acao: string; ir: () => void; extra?: Filho };
  const alertas: Alerta[] = [];
  if (piso.length) alertas.push({ tom: "critico", n: piso.length, texto: `${plural(piso.length, "encomenda", "encomendas")} com possível erro de cidade ou entregador`, origem: "Conferência de piso", acao: "Revisar antes do carregamento",
    ir: () => navegar("piso", { de: "torre", prep: () => { E.f.piso = { tipos: [], cidades: [], entregadores: [] }; } }),
    extra: h("span", { class: "alerta-sub" }, porTipo.map((t) => h("button", { type: "button", class: "link", on: { click: () => navegar("piso", { de: "torre", prep: () => { E.f.piso = { tipos: [t.rotulo], cidades: [], entregadores: [] }; } }) } }, `${t.rotulo}: ${fmtN(t.valor)}`))) });
  if (dev.length) alertas.push({ tom: "critico", n: dev.length, texto: `${plural(dev.length, "encomenda", "encomendas")} com 3 ou mais tentativas por ausência ou recusa`, origem: "Exceções", acao: "Decidir devolução ou justificar",
    ir: () => navegar("excecoes", { de: "torre", prep: () => { E.f.excecoes = { aba: "devolucao", cidades: [], entregadores: [] }; } }) });
  if (ext.length) alertas.push({ tom: "critico", n: ext.length, texto: `${plural(ext.length, "possível extravio", "possíveis extravios")}`, origem: "Exceções", acao: "Investigar",
    ir: () => navegar("excecoes", { de: "torre", prep: () => { E.f.excecoes = { aba: "extravio", cidades: [], entregadores: [] }; } }) });
  if (ins.length) alertas.push({ tom: "atencao", n: ins.length, texto: `${plural(ins.length, "insucesso", "insucessos")} de entrega aguardando nova tentativa`, origem: "Exceções", acao: "Planejar nova tentativa",
    ir: () => navegar("excecoes", { de: "torre", prep: () => { E.f.excecoes = { aba: "insucesso", cidades: [], entregadores: [] }; } }) });
  if (rev.length) alertas.push({ tom: "atencao", n: rev.length, texto: `${plural(rev.length, "encomenda tem", "encomendas têm")} 3 ou mais tentativas por outro motivo (ex.: reprogramação)`, origem: "Exceções", acao: "Revisar caso a caso",
    ir: () => navegar("excecoes", { de: "torre", prep: () => { E.f.excecoes = { aba: "revisar_tentativas", cidades: [], entregadores: [] }; } }) });
  const longas = a.atual.filter((r) => faixaRota(r) === "Mais de 24 h");
  if (longas.length) alertas.push({ tom: "atencao", n: longas.length, texto: `${plural(longas.length, "encomenda saiu", "encomendas saíram")} para entrega há mais de 24 h e ${longas.length === 1 ? "segue" : "seguem"} sem entrega confirmada`, origem: "Pendências · tempo em rota", acao: "Cobrar retorno do entregador",
    ir: () => navegar("pendencias", { de: "torre", prep: () => { E.f.pendencias = { ...filtrosVazios().pendencias, rota: ["Mais de 24 h"] }; } }) });
  if (velhas.length) alertas.push({ tom: "atencao", n: velhas.length, texto: `${plural(velhas.length, "encomenda chegou", "encomendas chegaram")} há 4 dias ou mais e ${velhas.length === 1 ? "segue pendente" : "seguem pendentes"}`, origem: "Pendências", acao: "Priorizar",
    ir: () => navegar("pendencias", { de: "torre", prep: () => { E.f.pendencias = { ...filtrosVazios().pendencias, faixas: ["4+ dias"] }; } }) });
  if (a.resumo.saiu_devolucao) alertas.push({ tom: "inferido", n: a.resumo.saiu_devolucao, texto: `${plural(a.resumo.saiu_devolucao, "encomenda saiu", "encomendas saíram")} do relatório com indício de devolução`, origem: "O que mudou", acao: "Confirmar com a transportadora",
    ir: () => navegar("mudancas", { de: "torre", prep: () => { E.f.mudancas.aba = "possivel_devolucao"; } }) });

  if (a.entregues_confirmadas) alertas.push({ tom: "info", n: a.entregues_confirmadas, texto: `${plural(a.entregues_confirmadas, "encomenda do relatório atualizado já consta", "encomendas do relatório atualizado já constam")} como entregue e segue contada como pendente`, origem: "Regra RN-003 · decisão pendente", acao: "Ver quais são",
    ir: () => navegar("pendencias", { de: "torre", prep: () => { E.f.pendencias = { ...filtrosVazios().pendencias, classes: ["Entregue"] }; } }) });

  const kpis = h("div", { class: "kpis" },
    kpi({ rotulo: "Pendentes", ajuda: "pendente", valor: a.resumo.pendentes, nota: "Encomendas no relatório atualizado", destino: () => navegar("pendencias", { de: "torre", prep: () => { E.f.pendencias = filtrosVazios().pendencias; } }) }),
    kpi({ rotulo: "Prováveis entregas", ajuda: "provavel_entrega", valor: a.resumo.saiu_entregue, selo: "inferido", nota: "Saíram do relatório sem indício de devolução", destino: () => navegar("mudancas", { de: "torre", prep: () => { E.f.mudancas.aba = "provavel_entrega"; } }) }),
    kpi({ rotulo: "Possíveis devoluções", ajuda: "possivel_devolucao", valor: a.resumo.saiu_devolucao, selo: "inferido", nota: "Saíram com palavra de devolução no problema", destino: () => navegar("mudancas", { de: "torre", prep: () => { E.f.mudancas.aba = "possivel_devolucao"; } }) }),
    kpi({ rotulo: "Novas", ajuda: "novas", valor: a.resumo.novas, nota: "Só aparecem no relatório atualizado", destino: () => navegar("mudancas", { de: "torre", prep: () => { E.f.mudancas.aba = "novas"; } }) }),
    kpi({ rotulo: "Com ocorrência", ajuda: "com_ocorrencia", valor: comProblema.length, tom: comProblema.length ? "atencao" : undefined, nota: "Pendentes com problema registrado", destino: () => navegar("pendencias", { de: "torre", prep: () => { E.f.pendencias = { ...filtrosVazios().pendencias, soProblema: true }; } }) }),
    kpi({ rotulo: "Problemas de piso", ajuda: "piso", valor: piso.length, tom: piso.length ? "critico" : "ok", nota: "Cidade ou entregador fora da regra", destino: () => navegar("piso", { de: "torre", prep: () => { E.f.piso = { tipos: [], cidades: [], entregadores: [] }; } }) }));

  const irPend = (prep: (f: FiltrosPend) => void) => navegar("pendencias", { de: "torre", prep: () => { const f = filtrosVazios().pendencias; prep(f); E.f.pendencias = f; } });
  const faixas = (["0-1 dia", "2-3 dias", "4+ dias"] as Faixa[]).map((f) => ({ rotulo: f, valor: a.atual.filter((r) => r.faixa_backlog === f).length, tom: TOM_FAIXA[f] }));

  return h("div", { class: "tela" },
    cabecalho({ area: "Visão central", titulo: "Torre de controle", pergunta: "Como está a operação e o que precisa da minha atenção?" }),
    a.ordem.possivel_inversao ? h("div", { class: "alerta-caixa tom-atencao", role: "alert" }, icone("alerta"),
      h("div", null, h("strong", null, "Os relatórios podem ter sido importados na ordem invertida"),
        h("p", null, `${fmtN(a.ordem.so_no_atual)} códigos só no atualizado contra ${fmtN(a.ordem.so_na_base)} só na base. Se estiverem invertidos, entregas e novas trocam de lugar.`),
        h("button", { type: "button", class: "btn btn-sec", on: { click: () => navegar("importar") } }, "Revisar a importação"))) : null,
    h("section", { class: "atencao", "aria-labelledby": "at-tit" },
      h("h2", { id: "at-tit" }, "Precisa da sua atenção"),
      alertas.length ? h("ul", { class: "alertas" }, alertas.map((al) => h("li", { class: "alerta tom-" + al.tom },
        h("span", { class: "alerta-n" }, fmtN(al.n)),
        h("div", { class: "alerta-txt" }, h("strong", null, al.texto), h("span", { class: "alerta-origem" }, al.origem, al.tom === "inferido" ? selo("inferido") : null), al.extra || null),
        h("button", { type: "button", class: "btn btn-sec alerta-acao", on: { click: al.ir } }, al.acao, icone("seta", "ic ic-sm")))))
        : vazio("Nada exige ação agora", "Sem problemas de piso, exceções ativas ou encomendas paradas há 4 dias ou mais.", null, "ok")),
    h("section", { "aria-labelledby": "ind-tit" }, h("h2", { id: "ind-tit", class: "sr" }, "Indicadores"), kpis,
      h("p", { class: "rodape-kpi" }, `Base com ${fmtN(a.resumo.base_total)} encomendas · ${plural(a.resumo.mudou_status, "mudança de status", "mudanças de status")} · ${plural(a.etapas.fora_atual, "encomenda", "encomendas")} fora da jurisdição e ${plural(a.etapas.fm_atual, "de força maior", "de força maior")} não entram nos números.`)),
    h("div", { class: "graficos g2" },
      barras({ id: "t-cid", ajuda: "por_cidade", titulo: "Pendências por cidade", descricao: "Encomendas no relatório atualizado. Clique para ver a lista.", unidade: ["encomenda", "encomendas"],
        itens: contar(a.atual, (r) => r.dados["Consignee City"] as string), max: 8, onSelecionar: (it) => it && irPend((f) => { f.sel = { dim: "cidade", valor: it.rotulo, rotulo: "Cidade: " + it.rotulo }; }) }),
      barras({ id: "t-fx", ajuda: "tempo_espera", titulo: "Há quanto tempo aguardam", descricao: `Dias desde a chegada ao galpão até ${fmtData(a.referencia_backlog)}.`, unidade: ["encomenda", "encomendas"], itens: faixas,
        onSelecionar: (it) => it && irPend((f) => { f.faixas = [it.rotulo]; }),
        legenda: semData ? `${plural(semData, "encomenda", "encomendas")} sem data de chegada ficam fora das faixas.` : null }),
      barras({ id: "t-prob", ajuda: "tipos_problema", titulo: "Ocorrências registradas", descricao: "Tipo do último problema nas pendentes.", unidade: ["encomenda", "encomendas"],
        itens: contar(comProblema, (r) => r.dados["Last Problem Type"] as string).map((x) => ({ ...x, tom: "atencao" as Tom })), max: 6,
        onSelecionar: (it) => it && irPend((f) => { f.sel = { dim: "problema", valor: it.rotulo, rotulo: "Problema: " + it.rotulo }; }), vazio: "Nenhuma pendente com problema registrado." }),
      barras({ id: "t-ent", ajuda: "por_entregador", titulo: "Entregadores com mais pendências", descricao: "Encomendas atribuídas no relatório atualizado. Clique para ver o desempenho.", unidade: ["encomenda", "encomendas"],
        itens: contar(a.atual, (r) => entregadorDe(r.dados)).map((x) => ({ ...x, tom: x.rotulo === "(sem entregador)" ? "atencao" as Tom : undefined })), max: 8,
        onSelecionar: (it) => it && (it.rotulo === "(sem entregador)"
          ? irPend((f) => { f.semEntregador = true; })
          : navegar("entregadores", { de: "torre", prep: () => { E.f.entregadores.sel = { entregador: it.rotulo, classe: null }; } })) })));
}
