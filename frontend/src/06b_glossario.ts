// Glossário: explicações detalhadas abertas pelo "?" em títulos, indicadores,
// gráficos, abas e filtros. Um texto por conceito, reutilizado em toda a interface.
// Descreve o comportamento atual (MVP). Mudanças de regra entram aqui junto com o motor.

interface Explicacao {
  titulo: string;
  oQue: string;
  calculo?: string;
  exemplo?: string;
  acao?: string;
  selo?: Selo;
  aviso?: string;
}

const GLOSSARIO: Record<string, Explicacao> = {
  // ---------- comparação ----------
  pendente: {
    titulo: "Pendente",
    oQue: "Encomenda que ainda aparece no relatório atualizado, ou seja, que ainda falta entregar.",
    calculo: "Toda linha do relatório atualizado conta como pendente, depois das remoções: força maior (sempre), sem cidade de destino (vai para Fora da jurisdição) e, se os filtros estiverem ligados, status “descarregado” e status “não recebido”.",
    exemplo: "O relatório atualizado tem 552 linhas; 119 são força maior e 20 não têm cidade. Sobram 413 pendentes.",
    selo: "relatorio",
  },
  provavel_entrega: {
    titulo: "Provável entrega",
    oQue: "Encomenda que estava no relatório base e sumiu do atualizado, sem nenhum sinal de devolução. Provavelmente foi entregue, mas os arquivos não confirmam.",
    calculo: "Código presente no base e ausente no atualizado, e o tipo e o motivo do último problema não contêm “devol”, “não recebido”, “nao recebido”, “recusad” nem “retorno”.",
    exemplo: "Ontem a encomenda estava “Em rota de entrega”, sem problema. Hoje ela não aparece mais no relatório: conta como provável entrega.",
    acao: "Use como estimativa. Para confirmar uma entrega específica, consulte o sistema da transportadora.",
    selo: "inferido",
  },
  possivel_devolucao: {
    titulo: "Possível devolução",
    oQue: "Encomenda que sumiu do relatório atualizado, mas cujo último problema registrado sugere devolução.",
    calculo: "Código presente no base e ausente no atualizado, e o tipo ou o motivo do problema contém “devol”, “não recebido”, “nao recebido”, “recusad” ou “retorno”.",
    exemplo: "No base, o problema era “Não recebido”. No atualizado, a encomenda não aparece: conta como possível devolução.",
    acao: "Confirme com a transportadora se a encomenda voltou. Sumir do relatório nunca é tratado como extravio.",
    selo: "inferido",
  },
  novas: {
    titulo: "Novas",
    oQue: "Encomendas que aparecem no relatório atualizado e não existiam no base.",
    calculo: "Código presente no atualizado e ausente no base. Também contam como pendentes.",
    exemplo: "Uma carga chegou ao galpão depois da exportação do relatório base.",
  },
  mudou_status: {
    titulo: "Mudança de status",
    oQue: "Encomenda presente nos dois relatórios cujo último status de leitura mudou.",
    calculo: "Compara o campo “Last Scan Status” do base com o do atualizado. Conta também quando o status surgiu ou sumiu.",
    exemplo: "No base estava “atribuído”; no atualizado, “Em rota de entrega”.",
  },
  com_ocorrencia: {
    titulo: "Com ocorrência",
    oQue: "Pendente que tem algum problema registrado pela transportadora.",
    calculo: "O campo “Tipo de problema” (Last Problem Type) está preenchido.",
    exemplo: "Reprogramação, Não entregue, Não recebido, Lost package.",
  },
  base_total: {
    titulo: "Relatório base",
    oQue: "O retrato anterior da operação. Serve de referência para saber o que saiu e o que é novo.",
    calculo: "Linhas do relatório base depois das mesmas remoções aplicadas ao atualizado (força maior, sem cidade, descarregado e não recebido se ligados).",
  },
  ordem_arquivos: {
    titulo: "Ordem dos arquivos",
    oQue: "Qual relatório é o base (anterior) e qual é o atualizado (mais recente). A ordem muda todos os resultados.",
    calculo: "O sistema compara os códigos dos dois arquivos. Se há mais códigos só no atualizado do que só no base, e o atualizado tem mais linhas, ele avisa que podem estar invertidos.",
    exemplo: "Normalmente o atualizado é menor, porque as encomendas entregues saem dele.",
    acao: "É só um indício. A ordem só muda se você trocar.",
  },

  // ---------- piso ----------
  piso: {
    titulo: "Conferência de piso",
    oQue: "Confere, antes do carregamento, se cada encomenda pendente está com um entregador que costuma atender aquela cidade ou bairro.",
    calculo: "Para cada pendente, compara cidade, bairro e entregador com as regras de abrangência. Cidades marcadas como ignoradas não são conferidas.",
    exemplo: "Uma encomenda de Arinos está com um entregador que só entrega em Buritis: aparece como “Entregador fora da área”.",
    acao: "Confirme a correção no galpão e mova a encomenda para um dos entregadores indicados. Exporte a lista para conferir no piso.",
  },
  erro_fora_area: {
    titulo: "Entregador fora da área",
    oQue: "O entregador atribuído não está entre os que costumam atender aquela cidade (ou aquele bairro, nas cidades conferidas por bairro).",
    calculo: "O entregador não pertence ao conjunto válido da regra de abrangência.",
    exemplo: "Num bairro onde só os entregadores A e B costumam entregar, a encomenda está com C: erro.",
    acao: "Verifique se é erro de atribuição. Se o entregador realmente atende ali, ajuste a regra da cidade.",
  },
  erro_sem_entregador: {
    titulo: "Sem entregador",
    oQue: "Encomenda pendente de uma cidade atendida, mas sem entregador atribuído.",
    calculo: "O campo “Delivery Associate” está vazio.",
    acao: "Atribua a um dos entregadores indicados antes do carregamento.",
  },
  erro_cidade_fora: {
    titulo: "Cidade fora da abrangência",
    oQue: "A cidade de destino não aparece em nenhuma regra, porque não havia encomendas dela no relatório base.",
    acao: "Confirme se a cidade é atendida. Se for, crie um ajuste manual para ela.",
  },
  regra_derivada: {
    titulo: "Regra derivada",
    oQue: "Regra aprendida do próprio relatório base: quem entregou onde. Não é um cadastro oficial.",
    calculo: "Um entregador vale para a cidade (ou bairro) quando tem pelo menos o “rigor da conferência” em encomendas lá. O entregador com mais encomendas sempre vale. É recalculada a cada importação.",
    aviso: "Se um erro se repete no histórico, a regra derivada passa a considerá-lo correto. Por isso confirme antes de corrigir.",
    selo: "derivada",
  },
  ajuste_manual: {
    titulo: "Ajuste manual",
    oQue: "Lista de entregadores válidos para uma cidade definida por uma pessoa. Tem prioridade sobre a regra derivada.",
    calculo: "Substitui a regra derivada daquela cidade e passa a conferir pela cidade inteira, sem divisão por bairro. Fica gravado e vale para todas as importações.",
    selo: "manual",
  },
  rigor: {
    titulo: "Rigor da conferência",
    oQue: "Quantas encomendas um entregador precisa ter num lugar, no relatório base, para contar como válido ali. No MVP se chamava “limiar de ruído”.",
    calculo: "Associações abaixo desse número são tratadas como exceção do histórico e descartadas. Padrão: 3.",
    exemplo: "Com rigor 3, um entregador que levou 2 encomendas para Formoso não vale para Formoso (a não ser que seja o que mais levou).",
    acao: "Aumente para uma conferência mais exigente; diminua se estiver aparecendo erro demais. Vale só para esta sessão.",
  },
  por_bairro: {
    titulo: "Conferida por bairro",
    oQue: "Cidades com 3 ou mais entregadores no relatório base são conferidas bairro a bairro, porque cada entregador costuma cobrir uma região.",
    calculo: "Valor fixo no MVP (3 entregadores). Um ajuste manual faz a cidade voltar a ser conferida pela cidade inteira.",
  },
  cidades_ignoradas: {
    titulo: "Cidades fora da conferência",
    oQue: "Cidades cujas encomendas não passam pela conferência de piso.",
    calculo: "Ficam gravadas e valem para todas as importações.",
  },

  // ---------- exceções ----------
  excecoes: {
    titulo: "Exceções",
    oQue: "Encomendas pendentes que saíram do fluxo normal de entrega e precisam de uma decisão.",
    calculo: "Regras sobre as pendentes: devolução (3+ tentativas por ausência ou recusa), 3+ tentativas por outro motivo (revisar), extravio (palavra no problema) e insucesso (problema com menos de 3 tentativas, sem ser extravio). Uma encomenda pode cair em mais de uma.",
    acao: "Trate cada alerta ou justifique para tirá-lo da lista ativa sem perder o registro.",
  },
  devolucao: {
    titulo: "Devolução",
    oQue: "Encomenda que já teve 3 ou mais tentativas de entrega sem encontrar ou sem ser aceita pelo destinatário. Pela regra, deve voltar ao remetente.",
    calculo: "Tentativas (Delivery Count) maior ou igual a 3 E o último motivo indica ausência ou recusa: não recebido, local fechado, telefone não atendido, telefone errado, recusado ou ausente.",
    exemplo: "3 tentativas, último motivo “Telefone não atendido”: devolução. 3 tentativas por “Mudança de horário de entrega”: vai para “3+ tentativas, revisar”.",
    aviso: "O relatório traz só o ÚLTIMO motivo, não o de cada tentativa. Regra revisada em 11/10 (OP-02); antes contava qualquer motivo.",
    acao: "Confirme a devolução ou justifique, por exemplo, se o cliente pediu nova data.",
  },
  revisar_tentativas: {
    titulo: "3+ tentativas, revisar",
    oQue: "Encomenda com 3 ou mais tentativas cujo último motivo não é ausência nem recusa. Não é devolução automática, mas também não deve ficar esquecida.",
    calculo: "Tentativas maior ou igual a 3 E o último motivo NÃO está na lista de ausência ou recusa.",
    exemplo: "3 tentativas por “Reprogramação — Mudança de horário de entrega” (o cliente pediu outra data).",
    acao: "Decida caso a caso: reagendar, devolver ou justificar.",
  },
  extravio: {
    titulo: "Extravio",
    oQue: "Encomenda com indício de que se perdeu.",
    calculo: "O tipo ou o motivo do problema contém “lost” ou “extravi” (ex.: “Lost package”, “Encomenda extraviada”).",
    acao: "Abra a investigação com a transportadora.",
  },
  insucesso: {
    titulo: "Insucesso",
    oQue: "Tentativa de entrega que não deu certo, mas a encomenda ainda pode ser entregue numa nova tentativa.",
    calculo: "Tem problema registrado, menos de 3 tentativas de entrega e não é extravio.",
    exemplo: "“Não entregue — Telefone não atendido” com 1 tentativa. Se chegar a 3 tentativas, passa para Devolução.",
    acao: "Programe a nova tentativa e, se possível, resolva o motivo antes (confirmar telefone, endereço ou horário).",
  },
  justificados: {
    titulo: "Justificados",
    oQue: "Alertas que alguém silenciou informando um motivo. Saem das listas ativas, mas o registro fica.",
    calculo: "A justificativa é guardada pelo código da encomenda e vale também nas próximas importações. Pode ter uma data para reavaliar.",
    acao: "Reative se a situação mudar.",
  },

  // ---------- pendências ----------
  classe_operacional: {
    titulo: "Classe operacional",
    oQue: "Situação da pendente segundo o próprio relatório, sem comparar arquivos.",
    calculo: "Anormal: tem problema registrado. Entregue: status entregue, assinado, signed ou delivered, ou data de assinatura (Sign Date) preenchida. Não entregue: os demais.",
    aviso: "Até 11/10 a data “Delivery Time” também contava como entregue. Nos relatórios ela aparece cerca de 2 h depois da chegada em toda encomenda em rota: é a saída para entrega, não a entrega. Por isso deixou de contar (OP-01).",
  },
  anormal: {
    titulo: "Anormal (pendente com ocorrência)",
    oQue: "Encomenda que continua pendente e tem algum problema registrado pela transportadora.",
    calculo: "O campo “Tipo de problema” está preenchido.",
  },
  tempo_espera: {
    titulo: "Há quanto tempo aguardam",
    oQue: "Quantos dias se passaram desde que a encomenda chegou ao galpão. Ajuda a priorizar o que está parado há mais tempo (backlog).",
    calculo: "Referência menos a data de chegada (Arrival Time). Faixas: 0–1 dia (menos de 2 dias), 2–3 dias (de 2 a menos de 4) e 4+ dias.",
    exemplo: "Chegou dia 06 às 14h e a referência é dia 10 às 14h: 4 dias, faixa 4+ dias.",
    acao: "A referência aparece no topo da tela. Veja de onde ela veio no “?” da referência.",
  },
  tempo_medio: {
    titulo: "Tempo médio desde a chegada",
    oQue: "Média de dias que as pendentes do filtro estão no galpão.",
    calculo: "Média do tempo de espera das encomendas com data de chegada válida. As sem data ficam fora.",
  },
  dias_chegada: {
    titulo: "Dia de chegada",
    oQue: "Restringe a análise às encomendas que chegaram ao galpão nos dias escolhidos.",
    calculo: "Usa a data do campo “Arrival Time”. Vazio = todos os dias. Vale só para esta tela.",
  },
  so_problema: { titulo: "Somente com problema", oQue: "Mostra só pendentes com tipo de problema preenchido." },
  sem_entregador: { titulo: "Somente sem entregador", oQue: "Mostra só pendentes sem entregador atribuído." },
  por_cidade: { titulo: "Por cidade", oQue: "Quantas pendentes há em cada cidade de destino.", acao: "Clique numa barra para ver as encomendas daquela cidade." },
  por_entregador: { titulo: "Por entregador", oQue: "Quantas pendentes estão atribuídas a cada entregador no relatório atualizado. Mostra os 15 com mais.", acao: "Clique numa barra para ver as encomendas dele." },
  tipos_problema: { titulo: "Tipos de problema", oQue: "Último problema registrado nas pendentes, agrupado por tipo.", exemplo: "Não entregue, Reprogramação, Não recebido, Lost package." },

  // ---------- entregadores ----------
  desempenho: {
    titulo: "Desempenho do entregador",
    oQue: "Mostra o que aconteceu com as encomendas que estavam com cada entregador no relatório base.",
    calculo: "Universo: encomendas dele no base. Provável entrega: saíram do relatório sem indício de devolução. Anormal: continuam no atualizado com problema. Pendente: continuam sem problema. O que sobra saiu com indício de devolução.",
    exemplo: "Jessica tinha 203 no base: 100 prováveis entregas, 5 anormais, 97 pendentes e 1 saiu com indício de devolução.",
  },
  pct_entregue: {
    titulo: "% de prováveis entregas",
    oQue: "Parte das encomendas do entregador no base que saíram como prováveis entregas.",
    calculo: "Prováveis entregas ÷ total do entregador no base × 100, com uma casa decimal.",
    selo: "inferido",
  },
  na_base: { titulo: "Total na base", oQue: "Encomendas atribuídas ao entregador no relatório base. É o universo do indicador." },
  dias_entregadores: {
    titulo: "Dia de chegada (Entregadores)",
    oQue: "Recalcula a comparação usando só as encomendas que chegaram nos dias escolhidos.",
    calculo: "Filtra os dois relatórios pelos dias e compara de novo. Vale só para esta tela.",
  },

  // ---------- consulta ----------
  fora_jurisdicao: {
    titulo: "Fora da jurisdição",
    oQue: "Encomendas sem cidade de destino. Não pertencem às regiões atendidas.",
    calculo: "Campo “Consignee City” vazio. Ficam só neste registro e não entram em nenhum indicador.",
  },
  forca_maior: {
    titulo: "Força maior (FM)",
    oQue: "Encomendas com ocorrência de força maior, retiradas de toda a análise.",
    calculo: "Tipo de problema de força maior — “Ocorrênia FM” e “Force majeure” (as duas grafias usadas pela iMile), além de variações como “FM” ou “Força maior”. Sempre removidas, nos dois relatórios.",
  },
  descarregado: {
    titulo: "Ignorar “descarregado”",
    oQue: "Remove dos dois relatórios as encomendas com status “descarregado” e recalcula tudo.",
    calculo: "Ligado por padrão desde 11/10 (no MVP era desligado). Pode ser desligado na confirmação da importação ou em Importação e critérios.",
  },
  nao_recebido: {
    titulo: "Ignorar “não recebido”",
    oQue: "Remove dos dois relatórios as encomendas com status “não recebido” e recalcula tudo.",
    calculo: "Compara o “Last Scan Status” com “não recebido” (com ou sem acento). Ligado por padrão desde 12/10. Pode ser desligado na confirmação da importação ou em Importação e critérios.",
  },
  a_entregar: { titulo: "Encomendas a entregar", oQue: "Lista das pendentes navegável por cidade e depois por entregador." },
  // ---------- incluídos em 11/10 ----------
  tempo_rota: {
    titulo: "Tempo em rota",
    oQue: "Há quanto tempo a encomenda saiu para entrega sem que a entrega tenha sido confirmada.",
    calculo: "Referência menos “Delivery Time”. Faixas: menos de 12 h, 12 a 24 h e mais de 24 h. Não vale para quem já tem entrega confirmada.",
    aviso: "“Delivery Time” foi interpretado como saída para entrega pelo padrão dos relatórios (sempre cerca de 2 h após a chegada). Vale confirmar com a iMile. A previsão de entrega (Estimated Delivery Time) vem vazia, então o atraso é medido assim.",
    acao: "Mais de 24 h em rota: cobre o retorno do entregador.",
  },
  entregue_confirmada: {
    titulo: "Entrega confirmada",
    oQue: "Encomenda que o próprio relatório marca como entregue: status de entregue ou data de assinatura preenchida.",
    calculo: "Se ela está no relatório atualizado, segue contada como pendente (regra RN-003 do MVP). Excluí-la das pendentes é uma decisão pendente.",
    selo: "relatorio",
  },
  referencia: {
    titulo: "Referência dos tempos",
    oQue: "Data e hora usadas para calcular há quanto tempo cada encomenda aguarda ou está em rota.",
    calculo: "1) Horário no nome do arquivo exportado (ex.: “…2026-10-11T185714…”); 2) se não houver, o evento mais recente registrado no relatório atualizado (chegada, problema, saída ou assinatura); 3) ou a data que você definir na importação.",
    exemplo: "O mesmo arquivo analisado hoje ou daqui a uma semana dá exatamente os mesmos números.",
    aviso: "Até 11/10 a referência era o relógio no momento da análise (OP-06).",
  },
  qualidade: {
    titulo: "Qualidade dos dados",
    oQue: "Checagens feitas na importação para mostrar problemas no arquivo que podem distorcer os números.",
    calculo: "Grafias diferentes do mesmo bairro, cidade ou entregador (ignora maiúsculas, acentos e espaços), linhas sem cidade, chegada, entregador ou bairro e encomendas já entregues.",
    exemplo: "“Planalto” e “planalto” viram dois bairros diferentes na conferência de piso.",
    acao: "Só informa: nada é corrigido automaticamente. Corrija na origem quando possível.",
  },
  pendente_sem_ocorrencia: {
    titulo: "Pendente sem ocorrência",
    oQue: "Encomenda que estava com o entregador na base, continua no relatório atualizado e não tem problema registrado. Provavelmente ainda está na rua ou aguardando saída.",
    calculo: "Código do entregador na base, ainda presente no atualizado, sem tipo de problema.",
  },
  pendente_com_ocorrencia: {
    titulo: "Pendente com ocorrência",
    oQue: "Encomenda que estava com o entregador na base, continua no atualizado e tem algum problema registrado (antes chamada de “Anormal”).",
    calculo: "Código do entregador na base, ainda presente no atualizado, com tipo de problema preenchido.",
    exemplo: "Não entregue — Telefone não atendido; Reprogramação.",
  },
  ritmo: {
    titulo: "Ritmo",
    oQue: "Compara quanto do trabalho de cada entregador ainda está na rua com a média dos entregadores, no horário da referência.",
    calculo: "Ainda na rua = (pendentes com e sem ocorrência) ÷ total na base. “Abaixo do ritmo” quando passa da média em mais de 15 pontos percentuais.",
    exemplo: "Às 14:42, a média é 30% ainda na rua; um entregador com 50% aparece como abaixo do ritmo.",
    acao: "Converse com o entregador ou redistribua a carga. Compare com o histórico para ver se é recorrente.",
  },
  historico: {
    titulo: "Histórico de importações",
    oQue: "Resumo de cada análise processada, para acompanhar a evolução ao longo do dia e entre dias.",
    calculo: "Guardado a cada processamento (exceto a demonstração automática). Importações com o mesmo arquivo atualizado e a mesma referência são substituídas, não duplicadas.",
    acao: "Use para ver se as pendências estão caindo e quanto tempo as encomendas ficam paradas de verdade.",
  },
  mapa: {
    titulo: "Mapa das pendências",
    oQue: "Posição de cada encomenda pendente pelas coordenadas do relatório (latitude e longitude do destinatário).",
    calculo: "No modo “Mapa”, os pontos ficam sobre o mapa de ruas do OpenStreetMap, com zoom e arraste (precisa de internet). No modo “Esquemático”, os pontos são projetados sem fundo e funciona sem internet; é também o modo usado automaticamente quando o mapa de fundo não carrega. Encomendas sem coordenadas não aparecem.",
    acao: "Clique num ponto para ver a encomenda. Arraste e aproxime para enxergar as cidades. Use a cor por situação para achar concentrações de erros de piso ou exceções.",
  },
  simulacao: {
    titulo: "Impacto da mudança",
    oQue: "Mostra o que muda na conferência de piso antes de você salvar um ajuste de regra.",
    calculo: "Roda a conferência com as regras atuais e com as propostas e compara encomenda por encomenda.",
    exemplo: "Liberar o Pedro em Arinos: 14 encomendas deixam de ser erro.",
  },
  roteiro: {
    titulo: "Roteiro de correção",
    oQue: "As correções de piso agrupadas por entregador atual, para conferir no galpão: o que tirar de cada um e para quem passar.",
    acao: "Marque cada encomenda conferida e exporte para levar ao piso. As marcações valem só nesta sessão.",
  },
};

const AJUDA = { aberta: "" };

function explica(chave: string, rotulo?: string): HTMLElement {
  const e = GLOSSARIO[chave];
  if (!e) return h("span");
  const id = "aj-" + chave + (rotulo ? "-" + rotulo.replace(/\W+/g, "") : "");
  const aberta = AJUDA.aberta === id;
  return h("span", { class: "ajuda" + (aberta ? " aberta" : "") },
    h("button", { type: "button", class: "ajuda-btn", id: id + "-b", "aria-expanded": aberta ? "true" : "false", "aria-controls": id, "aria-label": "O que é " + e.titulo + "?",
      on: { click: (ev: Event) => { ev.stopPropagation(); AJUDA.aberta = aberta ? "" : id; renderizar(); if (!aberta) setTimeout(() => document.getElementById(id)?.focus()); } } }, "?"),
    aberta ? h("div", { class: "ajuda-pop", id, role: "dialog", "aria-label": e.titulo, tabindex: "-1",
      on: { click: (ev: Event) => ev.stopPropagation(), keydown: (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.stopPropagation(); fecharAjuda(); } } } },
      h("div", { class: "ajuda-cab" }, h("strong", null, e.titulo), e.selo ? selo(e.selo) : null,
        h("button", { type: "button", class: "ajuda-fechar", "aria-label": "Fechar explicação", on: { click: () => fecharAjuda() } }, icone("fechar", "ic ic-xs"))),
      h("p", null, e.oQue),
      e.calculo ? h("div", { class: "ajuda-sec" }, h("span", null, "Como é calculado"), h("p", null, e.calculo)) : null,
      e.exemplo ? h("div", { class: "ajuda-sec" }, h("span", null, "Exemplo"), h("p", null, e.exemplo)) : null,
      e.aviso ? h("div", { class: "ajuda-sec ajuda-aviso" }, h("span", null, "Atenção"), h("p", null, e.aviso)) : null,
      e.acao ? h("div", { class: "ajuda-sec" }, h("span", null, "O que fazer"), h("p", null, e.acao)) : null) : null);
}

function fecharAjuda() {
  const id = AJUDA.aberta; AJUDA.aberta = ""; renderizar();
  if (id) setTimeout(() => document.getElementById(id + "-b")?.focus());
}
