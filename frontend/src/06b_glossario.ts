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
    calculo: "Toda linha do relatório atualizado conta como pendente, depois das remoções: força maior (sempre), sem cidade de destino (vai para Fora da jurisdição) e, se os filtros estiverem ligados, status “descarregado” e “não recebido” (por status ou tipo de problema).",
    exemplo: "O relatório atualizado tem 552 linhas; 119 são força maior e 20 não têm cidade. Sobram 413 pendentes.",
    selo: "relatorio",
  },
  provavel_entrega: {
    titulo: "Prováveis entregas",
    oQue: "Peças que estavam ABERTAS no relatório base e não aparecem no atualizado, sem sinal de devolução, extravio ou avaria. É um palpite: o relatório não confirma a entrega.",
    calculo: "A AWB está na base (não entregue) e não está no atualizado, e o último problema não indica devolução, extravio ou avaria. Peças que já constavam entregues na base ficam em “Já entregues antes”.",
    aviso: "Se a peça foi retirada por filtro (FM, descarregado, não recebido, sem cidade) em qualquer dos relatórios, ela sai dos dois e não vira entrega.",
    selo: "inferido",
  },
  possivel_devolucao: {
    titulo: "Possíveis devoluções",
    oQue: "Peças que saíram do relatório e têm sinal de devolução: palavra de devolução no problema, ou 3 ou mais tentativas com último motivo de ausência ou recusa.",
    calculo: "Palavras: devol, não recebido, recusad, retorno. Ou: tentativas maior ou igual a 3 e último motivo na lista de ausência ou recusa.",
    aviso: "É um indício, não uma confirmação.",
    selo: "inferido",
  },
  ja_entregue: {
    titulo: "Já entregues antes",
    oQue: "Peças que já constavam como entregues (status ou assinatura) no relatório base e saíram do relatório. É a limpeza normal do relatório, não progresso entre os dois arquivos.",
    calculo: "O registro da base tem status de entregue ou data de assinatura.",
    acao: "Nada a fazer. Elas ficam fora do universo do desempenho por entregador.",
  },
  saiu_com_ocorrencia: {
    titulo: "Saíram com ocorrência",
    oQue: "Peças que saíram do relatório com extravio ou avaria no último problema. Sumir do relatório não prova que foram entregues.",
    calculo: "O problema ou o motivo contém “lost”, “extravi”, “avaria” ou “danific”, e a peça não estava entregue na base.",
    acao: "Investigue com a transportadora antes de considerar entregue.",
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
    titulo: "Ocorrência vigente",
    oQue: "Pendente que tem problema registrado pela transportadora e que ainda não saiu de novo para entrega depois dele.",
    calculo: "Tipo de problema (Last Problem Type) preenchido e Delivery Time não posterior a Last Problem Date. As que já saíram para rota depois do problema aparecem como “já em rota” e não contam aqui.",
    exemplo: "Reprogramação, Não entregue, Lost package.",
    aviso: "O último problema fica no relatório mesmo depois de a peça voltar para a rua; por isso contar tudo que tem problema superestima o que pede ação.",
  },
  base_total: {
    titulo: "Relatório base",
    oQue: "O retrato anterior da operação. Serve de referência para saber o que saiu e o que é novo.",
    calculo: "Linhas do relatório base depois das mesmas remoções aplicadas ao atualizado (força maior, sem cidade, descarregado e não recebido se ligados).",
  },
  ordem_arquivos: {
    titulo: "Ordem dos arquivos",
    oQue: "Qual relatório é o base (anterior) e qual é o atualizado (mais recente). A ordem muda todos os resultados.",
    calculo: "O sistema compara o evento mais recente de cada arquivo (chegada, problema, saída para entrega ou assinatura). Se o evento mais recente do base é posterior ao do atualizado, ele avisa que podem estar invertidos. O número de linhas não entra: o atualizado pode ter mais ou menos linhas que o base.",
    exemplo: "Base com último evento em 12/10 às 10h e atualizado com último evento em 11/10 às 18h: provavelmente estão trocados.",
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
    oQue: "O entregador atribuído é conhecido no histórico, mas não está entre os que atenderam aquela região (CEP e bairro) ou cidade, e a região tem entregas suficientes para a regra ser confiável.",
    calculo: "O entregador não pertence ao conjunto válido da regra de abrangência.",
    exemplo: "Num bairro onde só os entregadores A e B costumam entregar, a encomenda está com C: erro.",
    acao: "Verifique se é erro de atribuição. Se o entregador realmente atende ali, ajuste a regra da cidade.",
  },
  erro_sem_historico: {
    titulo: "Entregador sem histórico",
    oQue: "O entregador atribuído não aparece no histórico que gerou o mapa de região. Pode ser um entregador novo; não é erro confirmado.",
    calculo: "O nome não consta na lista de entregadores do mapa (gerada do arquivo de estudo).",
    exemplo: "Um entregador que começou depois do período do estudo: todas as peças dele cairiam aqui, e não como “fora da área”.",
    acao: "Confirme com o líder do piso se é entregador novo ou cobertura. Se for, gere um mapa novo incluindo o período recente.",
  },
  erro_pouco_historico: {
    titulo: "Região com pouco histórico",
    oQue: "A região (CEP ou bairro) teve poucas entregas no histórico, então a regra dela é fraca: não dá para dizer com segurança que o entregador está errado.",
    calculo: "O total de entregas da região no histórico é menor que o mínimo do mapa (padrão: 20) e o entregador não está entre os que atenderam.",
    acao: "Revise caso a caso. Não trate como erro confirmado.",
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
  cidades_sem_prazo: {
    titulo: "Cidades sem prazo de chegada",
    oQue: "Cidades em que toda peça é pendência, qualquer que seja a data de chegada. Nas demais, a peça só vira pendência depois do dia da referência.",
    calculo: "Vale na lista Pendentes de Pendências de entrega, no alerta da Torre e no número de peças que pedem ação. Por padrão é só Unaí (decisão da operação em 24/10/2026).",
    aviso: "Não recalcula o relatório: muda só o que é tratado como pendência. Fica gravado e vale para as próximas importações.",
  },
  cidades_ignoradas: {
    titulo: "Cidades fora da conferência",
    oQue: "Cidades cujas encomendas não passam pela conferência de piso.",
    calculo: "Ficam gravadas e valem para todas as importações.",
  },

  // ---------- exceções ----------
  excecoes: {
    titulo: "Pendências de entrega",
    oQue: "As encomendas que dependem de uma ação do coordenador para a entrega acontecer: colocar em rota de novo, cobrar o entregador ou iniciar a devolução.",
    calculo: "Cada aba é uma regra sobre as pendentes: 2+ dias pendentes; 1, 2 e 3 tentativas com ocorrência; extravios; avarias. Quem já saiu de novo para entrega depois da ocorrência não aparece nas listas de ação: vai para “Já em rota”.",
    acao: "Trate cada encomenda ou justifique para tirá-la da lista ativa sem perder o registro.",
  },
  atrasadas: {
    titulo: "Pendentes",
    oQue: "Encomendas que pedem atenção por prazo: todas as das cidades sem prazo (por padrão, Unaí) e, nas demais cidades, as que chegaram antes do dia da referência.",
    calculo: "Cidades sem prazo: sempre, qualquer que seja a data de chegada (Arrival Time); a lista está em Regras de abrangência. Demais cidades: o dia de chegada é anterior ao dia da referência do relatório (prazo de um dia vencido). Ficam de fora a peça de outra cidade que chegou no dia da referência, a que tem entrega confirmada e a que teve tentativa de entrega no dia da referência (essa aparece nas listas de tentativas).",
    exemplo: "Referência dia 12: uma peça de Buritis que chegou dia 11 é pendente; uma que chegou dia 12 não é. Uma peça de Unaí que chegou dia 12 é pendente.",
    aviso: "Peça sem data de chegada conta como pendente, porque não dá para provar que chegou no dia. O dia da referência vem do relatório atualizado (veja a referência no topo).",
    acao: "Cobre o entregador pela entrega ou reprograme a rota.",
  },
  tent1: {
    titulo: "1 tentativa",
    oQue: "Encomenda com uma tentativa de entrega que deu problema. Quando já saiu para rota de novo, continua na lista, marcada “já em rota”, mas não conta nos alertas.",
    calculo: "Tem problema registrado, exatamente 1 tentativa (Delivery Count) e não é extravio nem avaria. A saída para entrega (Delivery Time) posterior à data do problema (Last Problem Date) só marca a peça como “já em rota”. Peça com 0 tentativas não entra: ela nunca foi tentada.",
    exemplo: "“Não entregue — Telefone não atendido” em 10/10 às 11h, sem nenhuma saída para entrega depois disso.",
    aviso: "A saída para entrega é o sinal de que a peça foi colocada em rota de novo. Se o relatório não atualizar essa data, a peça continua sem a marca “já em rota” mesmo já estando na rua.",
    acao: "Nas que não saíram: colocar em rota de novo. O entregador precisa avisar se já está em rota. Nas marcadas “já em rota”: só acompanhar.",
  },
  tent2: {
    titulo: "2 tentativas",
    oQue: "Encomenda com duas tentativas de entrega e problema. Quando já saiu para rota de novo, continua na lista, marcada “já em rota”, mas não conta nos alertas.",
    calculo: "Tem problema registrado, exatamente 2 tentativas e não é extravio nem avaria. A saída para entrega depois da data do problema só marca a peça como “já em rota”.",
    acao: "Nas que não saíram: colocar em rota de novo e verificar com o entregador se vai devolver a peça. Nas marcadas “já em rota”: só acompanhar.",
  },
  tent3: {
    titulo: "3 tentativas · devolução",
    oQue: "Encomenda que chegou a 3 ou mais tentativas e deve entrar no processo de devolução.",
    calculo: "Tentativas (Delivery Count) maior ou igual a 3. Quando o último motivo é ausência ou recusa, a ação é “Iniciar devolução”. Quando é outro motivo (ex.: reprogramação a pedido do cliente), a ação é “Confirmar devolução”.",
    aviso: "O relatório traz só o ÚLTIMO motivo, não o de cada tentativa. Uma reprogramação pedida pelo cliente não é ausência, por isso pede confirmação antes de devolver (decisão OP-02, 11/10).",
    acao: "Realize o processo de devolução ou justifique, por exemplo, se o cliente pediu nova data.",
  },
  avaria: {
    titulo: "Avarias (processo)",
    oQue: "Encomendas com dano registrado pela transportadora. Não são tentativa de entrega: a peça pode nem ter saído do galpão. Pedem o processo de avaria.",
    calculo: "O tipo ou o motivo do problema contém “avaria” ou “danific”, e não é extravio. Vale com 0 tentativas ou mais; fica de fora quem já tem entrega confirmada.",
    aviso: "O relatório não traz o horário de deslacre do caminhão, então os prazos de 4 h (iMile) e 2 h (Anjun) não são medidos aqui. Confira no processo.",
    acao: "Sinalize o piso, peça a aprovação e, se couber, separe para o retorno no próximo caminhão. Justifique para tirar da lista ativa.",
  },
  ja_em_rota: {
    titulo: "Já em rota",
    oQue: "Encomendas que tiveram ocorrência, mas que já saíram de novo para entrega. Não pedem mais ação do coordenador.",
    calculo: "A saída para entrega (Delivery Time) é posterior à data do último problema (Last Problem Date).",
    acao: "Use para conferir se o sistema entendeu certo e, se quiser, confirme com o entregador.",
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
    calculo: "Entregue: status entregue, assinado, signed ou delivered, ou data de assinatura (Sign Date) preenchida (vale mesmo com problema anterior). Anormal: tem problema registrado e não foi entregue. Não entregue: os demais.",
    aviso: "Até 11/10 a data “Delivery Time” também contava como entregue. Nos relatórios ela aparece cerca de 2 h depois da chegada em toda encomenda em rota: é a saída para entrega, não a entrega. Por isso deixou de contar (OP-01).",
  },
  anormal: {
    titulo: "Anormal (com problema)",
    oQue: "Encomenda pendente com problema registrado pela transportadora e sem entrega confirmada.",
    calculo: "O campo “Tipo de problema” está preenchido e não há status de entregue nem assinatura. Quem foi entregue depois de um problema é “Entregue”.",
  },
  tempo_espera: {
    titulo: "Há quanto tempo aguardam",
    oQue: "Quantos dias se passaram desde que a encomenda chegou ao galpão. Ajuda a priorizar o que está parado há mais tempo (backlog).",
    calculo: "Dias de calendário entre o dia de chegada (Arrival Time) e o dia da referência: chegou hoje, “no dia”; chegou ontem, “há 1 dia”. Em cores: até 1 dia verde, 2 a 3 dias amarelo, 4 ou mais vermelho.",
    exemplo: "Chegou dia 06 às 23h e a referência é dia 10 às 08h: “há 4 dias”, mesmo com pouco mais de 3 dias corridos.",
    acao: "A referência aparece no topo da tela. Veja de onde ela veio no “?” da referência.",
  },
  pivot_chegada: {
    titulo: "Pendentes por data de chegada",
    oQue: "Quantas encomendas pendentes chegaram ao galpão em cada dia, por cidade. Mostra de uma vez quanto está parado e há quanto tempo, sem agrupar em faixas.",
    calculo: "Cada encomenda cai no dia do Arrival Time. A idade é a diferença em dias de calendário entre esse dia e o dia da referência. As caixas “Detalhar por” abrem as linhas em entregador, bairro e endereço, nessa ordem; as caixas de data tiram um dia da soma.",
    exemplo: "Referência dia 21: o que chegou dia 17 aparece como “há 4 dias”. Desmarcar o dia 16 tira essas encomendas da tabela, dos números e da lista abaixo.",
    acao: "Clique num número para listar as encomendas daquela cidade e data. Use “Exportar tabela” para levar a mesma visão ao Excel.",
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
    oQue: "Mostra o que aconteceu com as encomendas ABERTAS que estavam com cada entregador no relatório base (as já entregues ficam de fora).",
    calculo: "Universo: encomendas dele no base que ainda não estavam entregues. Entrega: confirmada no atualizado (status ou assinatura) ou saiu do relatório sem sinal de devolução. Ocorrência vigente: continua com problema e sem saída para rota depois dele. Ocorrência já tratada: continua com problema, mas já saiu de novo para entrega. Pendente: continua, sem problema. O que sobra saiu com sinal de devolução, extravio ou avaria.",
    aviso: "A % depende do tempo entre os dois relatórios: compare entregadores no mesmo par de arquivos, não entre importações de intervalos diferentes.",
    exemplo: "Uma entregadora com 40 peças abertas no base: 10 entregas, 5 ocorrências vigentes, 3 já tratadas, 20 pendentes e 2 que saíram com sinal de devolução.",
  },
  entrega_progresso: {
    titulo: "Entrega (provável ou confirmada)",
    oQue: "Peça aberta na base que, no atualizado, já consta entregue (status ou assinatura) ou saiu do relatório sem sinal de devolução, extravio ou avaria.",
    calculo: "Confirmada: status de entregue ou Sign Date preenchida. Provável: sumiu do relatório (o relatório não confirma a entrega).",
    aviso: "Peças que já estavam entregues na base não entram: elas só saíram do relatório.",
  },
  ocorrencia_tratada: {
    titulo: "Ocorrência já tratada",
    oQue: "Peça que teve um problema registrado, mas cuja saída para entrega é POSTERIOR a ele: já foi colocada em rota de novo.",
    calculo: "Delivery Time maior que Last Problem Date, com problema registrado e sem entrega confirmada.",
    aviso: "O último problema continua aparecendo no relatório mesmo depois de a peça voltar para a rua. Este indicador separa o que ainda pede ação do que já foi tratado.",
  },
  pct_entregue: {
    titulo: "% de prováveis entregas",
    oQue: "Parte das encomendas do entregador no base que saíram como prováveis entregas.",
    calculo: "Prováveis entregas ÷ total do entregador no base × 100, com uma casa decimal.",
    selo: "inferido",
  },
  na_base: { titulo: "Abertas na base", oQue: "Encomendas atribuídas ao entregador no relatório base que ainda não estavam entregues. É o universo do indicador." },

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
    oQue: "Remove dos dois relatórios as encomendas marcadas como “não recebido” e recalcula tudo.",
    calculo: "Remove quando o “Last Scan Status” OU o “Last Problem Type” é “não recebido” (com ou sem acento). Essas encomendas saem de toda a análise, inclusive das exceções. Ligado por padrão desde 12/10. Pode ser desligado na confirmação da importação ou em Importação e critérios.",
  },
  nao_recebido_entregue: {
    titulo: "Não recebido, mas entregue",
    oQue: "Encomendas registradas como “não recebido” que, mesmo assim, têm indício de entrega.",
    calculo: "Universo: linhas com “não recebido” no status ou no tipo de problema (antes do filtro). “Indício de entrega” = status de entregue/assinatura OU com Delivery Time preenchido. Atenção: algumas ainda constam “Em rota de entrega” (entram pelo Delivery Time) — por isso a coluna Last Scan Status é mostrada. Separadas em com e sem Delivery Time.",
    acao: "É visibilidade, não cobrança: o registro de não recebimento já foi feito. Use para investigar o comportamento dos entregadores.",
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
    titulo: "Ocorrência vigente",
    oQue: "Encomenda que estava com o entregador na base, continua no atualizado com problema registrado e ainda não saiu de novo para entrega depois dele.",
    calculo: "Peça aberta na base, presente no atualizado, com tipo de problema preenchido e Delivery Time não posterior a Last Problem Date.",
    exemplo: "Não entregue — Telefone não atendido; Reprogramação.",
    acao: "É o que pede ação do coordenador: colocar em rota de novo, cobrar ou devolver (ver Pendências de entrega).",
  },
  ritmo: {
    titulo: "Ritmo",
    oQue: "Compara quanto do trabalho de cada entregador ainda está na rua com a média dos entregadores, no horário da referência.",
    calculo: "Ainda na rua = (ocorrência vigente + já tratada + pendentes sem ocorrência) ÷ abertas na base. “Abaixo do ritmo” quando passa da média em mais de 15 pontos percentuais, com pelo menos 5 peças. “(sem entregador)” não entra na média.",
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
    acao: "Clique num ponto para ver a encomenda. Arraste e aproxime para enxergar as cidades. Use a cor por situação para achar concentrações de erros de piso ou ocorrências vigentes. Encomendas sem coordenada não têm ponto: a contagem delas aparece na legenda e, se houver alerta, numa faixa acima do mapa.",
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
  // ---------- rótulos curtos (chips, colunas, funil) ----------
  situacao_erro_piso: {
    titulo: "Erro de piso",
    oQue: "A encomenda tem um alerta da conferência de piso: o entregador ou a cidade não bate com a regra de quem atende aquela região.",
    calculo: "Vem da Conferência de piso. Tipos: entregador fora da área, entregador sem histórico, região com pouco histórico, sem entregador e cidade fora da abrangência.",
    acao: "Abra a encomenda para ver quem deveria estar com ela, ou use a Conferência de piso para o roteiro de correção.",
  },
  situacao_sem_alerta: {
    titulo: "Sem alerta",
    oQue: "Nenhum erro de piso e nenhuma ocorrência vigente. Não significa que esteja entregue: a encomenda continua pendente.",
  },
  erro_cidade_ausente: {
    titulo: "Cidade ausente",
    oQue: "A encomenda não tem cidade de destino no relatório.",
    calculo: "O campo “Consignee City” está vazio.",
    acao: "Sem cidade, ela vai para “Fora da jurisdição” e não entra nos indicadores.",
  },
  sem_coordenada: {
    titulo: "Sem coordenada",
    oQue: "O relatório não traz latitude e longitude da encomenda (vazias ou zeradas), então ela não tem ponto no mapa.",
    calculo: "Latitude ou longitude vazia ou igual a 0.",
    acao: "O alerta dela vale do mesmo jeito: veja a lista abaixo do mapa ou a Conferência de piso.",
  },
  retiradas_cruzadas: {
    titulo: "Retiradas pelo outro relatório",
    oQue: "Peças que um dos relatórios traz como força maior, descarregado, não recebido ou sem cidade. Elas saem da análise nos dois relatórios; senão pareceriam entregas.",
    calculo: "A AWB foi retirada por filtro num relatório e ainda estava no outro.",
  },
  col_pendente_ha: {
    titulo: "Pendente há",
    oQue: "Tempo desde a chegada ao galpão até a data de referência do relatório.",
    calculo: "Data de referência menos o horário de chegada (Arrival Time).",
  },
  col_tentativas: {
    titulo: "Tentativas",
    oQue: "Número de tentativas de entrega registradas pela transportadora (Delivery Count).",
    aviso: "Na prática o relatório só conta tentativas que deram problema: 3 tentativas são 3 tentativas frustradas.",
  },
  col_data_ocorrencia: {
    titulo: "Data da ocorrência",
    oQue: "Quando o último problema foi registrado (Last Problem Date).",
    aviso: "O problema continua aparecendo mesmo depois de a peça voltar para a rua. Compare com “Saiu para rota”.",
  },
  col_saiu_rota: {
    titulo: "Saiu para rota",
    oQue: "Data e hora da saída para entrega (Delivery Time).",
    calculo: "Se for posterior à data da ocorrência, a peça já foi colocada em rota de novo.",
    aviso: "Na maioria das encomendas é cerca de 2 h depois da chegada: é a atribuição à rota.",
  },
  col_acao_sugerida: {
    titulo: "Ação sugerida",
    oQue: "O que fazer com a encomenda, conforme a aba: colocar em rota, ver devolução, iniciar ou confirmar devolução, investigar extravio.",
  },
  col_situacao: {
    titulo: "Situação",
    oQue: "Estado da encomenda neste recorte: Erro de piso, Ocorrência vigente ou Sem alerta.",
  },
  col_piso: {
    titulo: "Piso",
    oQue: "Resultado da conferência de piso para a encomenda e quem deveria estar com ela.",
  },
  col_deveria: {
    titulo: "Deveria estar com",
    oQue: "Entregadores que a regra de região aceita para aquele CEP, bairro ou cidade.",
  },
  col_esta_com: {
    titulo: "Está com",
    oQue: "Entregador atribuído à encomenda no relatório.",
  },
  col_ocorrencia: {
    titulo: "Ocorrência",
    oQue: "Último problema registrado: o tipo em cima e o motivo embaixo.",
  },
  tipo_reprogramacao: {
    titulo: "Reprogramação",
    oQue: "O cliente pediu outra data, horário ou endereço de entrega. Não é falha do entregador.",
    acao: "Coloque a peça em rota de novo na data combinada. Com 3 tentativas, confirme a devolução antes de devolver.",
  },
  tipo_nao_entregue: {
    titulo: "Não entregue (tipo de problema)",
    oQue: "Tentativa de entrega sem sucesso, com um motivo registrado (por exemplo, telefone não atendido, ausente ou endereço errado).",
    acao: "Veja o motivo e coloque em rota de novo; com 3 tentativas, a regra é iniciar a devolução.",
  },
  tipo_lost: {
    titulo: "Lost package",
    oQue: "A transportadora registrou a encomenda como perdida (extravio).",
    acao: "Investigue com a transportadora antes de tratar como entrega ou devolução.",
  },
  tipo_avaria: {
    titulo: "Avaria",
    oQue: "A encomenda foi registrada como danificada.",
    acao: "Siga o processo de avaria: sinalização do piso e aprovação, dentro do prazo da transportadora.",
  },
  col_awb: {
    titulo: "Código (AWB)",
    oQue: "Código único da encomenda (Waybill No). Clique nele para abrir os detalhes; o ícone ao lado copia o código.",
  },
  col_chegada: {
    titulo: "Chegada ao galpão",
    oQue: "Data e hora em que a encomenda chegou ao galpão (Arrival Time). É a base do “Pendente há” e das faixas de espera.",
  },
  col_status: {
    titulo: "Status",
    oQue: "Último status registrado pela transportadora no relatório (Last Scan Status), por exemplo “Em rota de entrega” ou “Entregue”.",
  },
  hist_saiu: {
    titulo: "Saíram (entre importações)",
    oQue: "Encomendas pendentes na importação anterior que não estão mais pendentes nesta.",
    aviso: "Só é comparável quando os filtros (descarregado, não recebido) foram os mesmos nas duas importações.",
  },
  hist_entrou: {
    titulo: "Entraram (entre importações)",
    oQue: "Encomendas pendentes nesta importação que não estavam na anterior.",
  },
  funil_inicio: {
    titulo: "Linhas no arquivo atualizado",
    oQue: "Total de códigos únicos do relatório atualizado, antes de qualquer filtro. É o ponto de partida do funil.",
    calculo: "Linhas com código de encomenda; repetidos contam uma vez (vale o registro de evento mais recente).",
  },
  piso_problema: {
    titulo: "Problema (conferência de piso)",
    oQue: "O que está errado na atribuição daquela encomenda: o entregador não é um dos aceitos para a região, ele não aparece no histórico, a região tem pouco histórico, falta entregador ou a cidade está fora da abrangência.",
    acao: "Passe o mouse sobre a etiqueta de cada linha para ver o significado do tipo e o que fazer. Use o filtro para ver só um tipo.",
  },
  col_local: {
    titulo: "Cidade · bairro",
    oQue: "Destino da encomenda (cidade e bairro do relatório). É com eles, e com o CEP, que a conferência procura a regra de quem pode entregar ali.",
  },
  piso_origem_regra: {
    titulo: "De onde vem a regra",
    oQue: "A linha pequena diz em que nível a regra foi encontrada (CEP, bairro ou cidade) e de onde ela vem.",
    calculo: "“Mapa de região”: aprendida do histórico no Estudo de regiões. “Derivada”: aprendida do relatório base. “Ajuste manual”: definida por você em Regras de abrangência e tem prioridade sobre as outras.",
    aviso: "Regra aprendida do histórico repete também os erros recorrentes. Confirme antes de corrigir.",
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
