# Decisões, validação e lacunas

## 1. Fonte de verdade

O código do MVP não foi entregue — só a documentação (`product_handoff/`) e as
planilhas. Por isso `backend/logistica/` foi **reconstruído a partir da
documentação** e validado contra os números comprovados nos critérios de
aceite. Quando o código original estiver disponível, ele deve substituir
estes módulos; os testes valem para os dois.

Uma interpretação precisou ser escolhida: no desempenho por entregador,
"anormal" e "pendente" contam as encomendas **do entregador na base que
continuam no atualizado** (com o problema do registro atualizado). É a única
leitura que reproduz os números de CA-009 nos dois cenários e respeita a
invariante `entregue + anormal + pendente ≤ total`.

## 2. Duas implementações, uma verdade

- **Motor Python** (`backend/logistica`): fonte de verdade, usado pela API.
- **Motor local** (`frontend/src/03_motor.ts`): necessário para a página
  funcionar sem servidor (demonstração e uso pontual). Não é uma segunda
  regra: `tests/paridade.mjs` compara os dois em **todos os campos** do contrato
  — resumo, etapas, cada AWB, piso, exceções, regras, desempenho, validação e
  qualidade da importação, referência e simulação de regras — em dois conjuntos:
  as planilhas reais de exemplo (cenários do `gerar_referencia.py`) e cenários
  **sintéticos** autocontidos (`gerar_referencia_sintetica.py`), que cobrem o
  piso com mapa de região, ajuste manual, duplicatas, formatos de data e AWB,
  filtros cruzados e saídas do relatório. `make test` roda os dois.
- Regra para evoluir: toda mudança de regra entra primeiro no Python e no
  teste de paridade; o motor local acompanha ou é desligado.

## 3. Critérios de aceite

| CA | Como foi verificado | Resultado |
|---|---|---|
| 001 Normalização AWB | teste unitário (float × int × espaços) | ok |
| 002 Deduplicação | teste unitário (fica a última) | ok |
| 003 Categorias | exemplos sem filtro: novas 6, saíram 1357, base 1903, última 552 | ok |
| 004 Heurística devolução | teste sintético "Não recebido" | ok |
| 005 FM | 119 removidas na última | ok |
| 006 Fora da jurisdição | 20 na última | ok |
| 007 Tipos de erro de piso | 28 fora da área + 3 sem entregador, com "descarregado" desligado como no MVP | ok (motor e tela) |
| 008 Ajuste Arinos | 14 erros em Arinos | ok (motor e tela, ida e volta) |
| 009 Desempenho | Jessica 270/126/46/97 (46,7%) e 203/100/5/97 (49,3%) | ok (motor e tela) |
| 010 Faixas | rótulos e limites `[0,2) [2,4) [4,∞)` | ok |
| 011 Devolução | **revisado pela OP-02**: a AWB 3320120101920 (3 reprogramações) sai de devolução e vai para "3+ tentativas, revisar" | ok |
| 012 Extravio × insucesso | conjuntos disjuntos (2 e 59) | ok |
| 013 Justificativas | grava, sai das ativas, reativa (JSON do servidor e armazenamento do navegador; o banco da página publicada ainda não foi exercitado por um uso real) | ok |
| 014 Exportação | .xlsx baixado tem `Waybill No`, `Consignee City`…; lido no openpyxl e no pandas | ok |
| 015 Filtro de dias local | só afeta a tela; Entregadores recalcula a comparação | ok |

## 4. Experiência (teste automatizado em Chromium)

Também em 11/10: importação real com referência e qualidade, histórico com duas
importações, mapa com clique, roteiro com export, simulação de regra, rosca,
exceção "revisar" e tempo em rota; 400 px e tema escuro em todas as telas.


Verificado: clique em indicador abre a lista filtrada; barra seleciona e
filtra a tabela; "Voltar para…" e "Limpar filtros"; painel da AWB com motivos;
busca por AWB (inclusive inexistente); justificar com e sem motivo; reativar;
ajuste de regra recalcula; importação com arquivo inválido (mensagem em três
partes); alerta de inversão com troca; tema escuro; 400 px sem rolagem
horizontal em todas as telas; modo servidor ponta a ponta (servidor de teste
Starlette sobre `api/servico.py`; desde 11/10 a API FastAPI real é testada
no pytest, subindo o uvicorn); nenhum erro de script.

## 5. Regras revisadas em 11/10/2026 (aprovadas pelo usuário)

Todas entraram primeiro no motor Python, com teste, e depois no motor local,
com paridade.

- **OP-01 · "Entregue" = entrega confirmada.** Nos três relatórios de exemplo,
  `Delivery Time` aparece cerca de 2 h após a chegada em **toda** encomenda
  "Em rota de entrega"; a entrega real vem com status "Entregue" e `Sign Date`.
  Conclusão: `Delivery Time` é a saída para entrega. A classe operacional
  passou a considerar entregue só status de entregue ou `Sign Date`. No
  exemplo, 351 pendentes deixam de aparecer como "Entregue". `Delivery Time`
  passa a alimentar o **tempo em rota** (substitui o "atraso contra a previsão":
  `Estimated Delivery Time` vem sempre vazio). *Interpretação a confirmar com a iMile.*
- **OP-02 · Devolução pelo motivo.** Conta como devolução quem tem 3+
  tentativas **e** último motivo de ausência ou recusa (`MOTIVOS_DEVOLUCAO`).
  Com outro motivo vai para a nova lista "3+ tentativas, revisar". O relatório
  traz só o último motivo, não o de cada tentativa.
- **OP-06 · Referência fixa.** Horário no nome do arquivo atualizado
  (`…2026-10-11T185714…`); senão, o evento mais recente do relatório (chegada,
  problema, saída ou assinatura); ajustável na confirmação da importação.
- **"Descarregado" ignorado por padrão** (no MVP era desligado). Efeito no
  exemplo: 413 → 410 pendentes; os 3 "Sem entregador" do piso eram
  descarregados (31 → 28 erros).

Preservado como no MVP e sinalizado na tela: **OP-05** (selo "Regra derivada"
× "Ajuste manual") e **OP-07** (alerta de inversão, nunca troca sozinho).

Renomeações de apresentação: "Limiar de ruído" → "Rigor da conferência";
"Backlog" → "Há quanto tempo aguardam"; "AWB" → "Código da encomenda (AWB)";
em Entregadores, "Anormal"/"Pendente" → "Pendente com/sem ocorrência".
Exportações mantêm os nomes originais.

## 6. Funcionalidades novas (11/10/2026)

Histórico de importações (servidor: `historico.json`; página: banco do
artefato ou navegador), ritmo por entregador (> 15 p.p. acima da média de
trabalho na rua), tempo em rota, mapa esquemático (sem mapa de fundo: o CSP
da página não permite servidores de mapa), simulação de impacto antes de
salvar regras, roteiro de correção do piso com checklist e export, rosca de
resumo, checagens de qualidade na importação.

## 7. Decisões pendentes

- **Entregas confirmadas no relatório atualizado** seguem contadas como
  pendentes (RN-003). No arquivo de 11/10 são 71 (base `ultima_tabela`). Tirá-las
  das pendentes muda pendências, piso e exceções.
- **Grafias de bairro**: 54 bairros com mais de uma grafia no base. Unificar
  na conferência por bairro mudaria as regras derivadas de Unaí.
- **`Waybill Hold Time`** vem negativo em quase todas as linhas; significado
  incerto, por isso não é usado em cálculo.

## 8. Lacunas

- **Sem autenticação, perfis ou isolamento por usuário.** A API guarda
  uploads em memória por 2 h e persiste em JSON local, como o MVP. Para
  produção: banco de dados, usuários e trilha de auditoria.
- **Persistência na página publicada:** banco do artefato, compartilhado com
  quem tem acesso a ela; fora dele, só o navegador (a tela avisa qual).
- **Limites:** 20 MB e 200 mil linhas por relatório (configuráveis por
  variável de ambiente). Tabelas paginadas; acima de ~50 mil pendentes, mover
  filtros e paginação para a API.
- **Mapa** não é navegável por teclado ponto a ponto; a alternativa acessível
  é a lista em Pendências (link na própria tela).
- **Ainda não implementado:** parâmetros fixos configuráveis (OP-03),
  cadastro oficial de abrangência (OP-05), relacionar AWB nova à antiga,
  classificação de motivos por IA.

## 9. Auditoria de confiabilidade (13/10/2026)

Uma auditoria somente leitura procurou premissas que fazem os números dizerem mais (ou menos) do que representam. Os
testes dos achados estão em `backend/tests/test_auditoria_regressao.py`. Decisões tomadas com o usuário:

| Decisão | Resultado |
|---|---|
| **D1** O que é "% de entrega" | Progresso sobre as peças **abertas** do entregador na base, no intervalo entre os dois relatórios |
| **D2** Ajuste manual × mapa | O ajuste manual por cidade **prevalece** sobre o mapa (OP-05) |
| **D3** Entregador ausente do mapa | Categoria própria: **"Entregador sem histórico"** (revisar), separada de "fora da área" |
| **D4** Amostra rotulada | Não existe; critério calibrado por hold-out (`docs/CALIBRACAO_REGIAO.md`) |
| **D5** 3 tentativas por reprogramação | Fica na lista de devolução com a ação "Confirmar devolução"; **a validar com o operador** |
| **D7** Lista de força maior | Não há lista; o funil da Torre mostra a quantidade e a busca por AWB explica |

### O que mudou nas métricas

- **Entrega por entregador (C-01).** O universo exclui peças que já estavam entregues na base (elas só saíram do
  relatório). "Entrega" = confirmada no atualizado ou provável (sumiu sem sinal de devolução, extravio ou avaria). No
  arquivo de exemplo: de 74 "prováveis entregas" (18,5%), 69 já estavam entregues na base; sobre as 330 abertas, o
  progresso é **2,7%**. "Abaixo do ritmo" passou de 8 entregadores para 0.
- **O que saiu do relatório (M-01).** Quatro categorias: provável entrega, possível devolução (agora também 3+ tentativas
  por ausência), saiu com ocorrência (extravio/avaria) e já entregue antes. Sumir não prova entrega.
- **Filtros simétricos (H-03).** Peça retirada de um relatório (FM, descarregado, não recebido, sem cidade) sai dos dois;
  antes podia virar "entrega". O funil e a busca por AWB explicam a retirada.
- **Ocorrência vigente × tratada (H-04).** O último problema fica no relatório mesmo depois de a peça voltar à rua.
  "Ocorrência vigente" = problema sem saída para rota depois dele; "já tratada" = saída posterior. Entregue com problema
  anterior é "Entregue", não "Anormal".
- **Ordem dos relatórios (H-02).** Vem das datas dos eventos, não do volume (a regra antiga acusava o par correto).
- **Duplicatas (M-02).** Vale o registro de evento mais recente; em empate, a última linha.
- **Datas e AWB (M-04).** Uma só regra nos dois motores (ISO e dd/mm/aaaa; resto = sem data, contado na qualidade). O AWB
  é lido como texto (zeros à esquerda não se fundem). `backlog_dias` arredonda meio para cima nos dois motores.
- **Piso (C-02, H-01, H-05, M-05).** Mapa com suporte, entregadores conhecidos e proveniência; chaves normalizadas; ajuste
  manual e simulação usam o mesmo validador do resultado; "Rigor" não se aplica com mapa ativo (a tela avisa).

### Efeito nos critérios de aceite

CA-003, CA-007, CA-008 e CA-009 não mudam: `comparar`, `desempenho_entregadores` e o caminho de piso **sem mapa** foram
mantidos como estavam (o app passou a usar `classificar_saidas` e `desempenho_progresso`). O teste
`test_auditoria_metricas_par_real` foi atualizado para a partição das saídas em quatro categorias.
**Rode `make test` com as planilhas originais antes de publicar.**

### Histórico

Registros guardados antes de 13/10 usam a definição antiga de "prováveis entregas" e o campo `excecoes`; os novos
guardam também `acoes` e os filtros usados. O histórico marca "não comparável" quando os filtros diferem entre duas
importações.

### Velocidade da importação (13/10/2026)

Medido com o arquivo de estudo (8,9 MB, 21.665 linhas): o gargalo era **abrir o .xlsx**, não o pandas. O motor padrão
(`openpyxl`) levava 14,6 s; o cálculo do pandas depois da leitura leva menos de 0,4 s. Mudanças (sem alterar resultados:
conteúdo das colunas e análise completa idênticos, paridade intacta):

- `ler_planilha` usa **`python-calamine`** (leitor em Rust, 1,8 s) quando instalado, com `openpyxl` como plano B
  (`backend/requirements.txt`; o pacote é opcional).
- `qualidade()` deixou de usar `iterrows` por linha (3,3 s → 0,12 s) e `para_data` ganhou caminho vetorizado.
- No navegador, o envio ao servidor e a leitura local do mesmo arquivo passaram a andar em **paralelo**.

Resultado na tela: envio do arquivo de estudo de **19,9 s para 2,5 s**. DuckDB e Polars não entram: não atacam esse
gargalo e o volume (dezenas de milhares de linhas) não justifica reescrever o motor, que também existe em TypeScript.

### Avaria e peça sem tentativa (13/10/2026)

Achado no uso: uma peça com **0 tentativas** e problema "Avaria" (nunca saiu do galpão) aparecia em "1 tentativa →
colocar em rota de novo", porque `insucesso` é "qualquer problema com menos de 3 tentativas" e a lista usava "até 1".
Corrigido sem mexer na definição de `insucesso` (mantém os totais dos critérios de aceite):

- Nova marca `avaria` em `excecoes` (Python e motor local, em paridade): texto com "avaria"/"danific" e que não é extravio.
- "1 tentativa" passa a exigir **exatamente 1** tentativa; avaria não entra em 1/2/3 tentativas nem em "Já em rota".
- Lista própria **Avarias** em Pendências de entrega e alerta na Torre, com a ação "seguir o processo de avaria".
- Limite conhecido: o relatório não traz o horário de deslacre, então os prazos de 4 h (iMile) e 2 h (Anjun) não são medidos.
- Peça com 0 tentativas e outro problema (ex.: "Não recebido", que o filtro padrão já remove) não vira "1 tentativa".

### Continua pendente

- **Grafias de bairro no caminho sem mapa** (§7): unificar mudaria CA-007/008. O caminho com mapa já normaliza.
- **RN-003** (entregues confirmadas seguem como pendentes): 17 de 1.435 no exemplo.
- **`Delivery Time`** é tratado como saída para entrega; a regra de "já em rota" e o alerta de "mais de 24 h em rota"
  dependem disso e ainda precisam de confirmação com a iMile (a mediana é 2,4 h após a chegada).
- **Piso "antes do carregamento":** 84 de 92 alertas do exemplo já têm saída para entrega registrada. Falta saber se o
  Dispatch é gerado antes ou depois do carregamento.

## 10. Ajustes pedidos pela operação (24/10/2026)

Origem: uso real da torre de controle e das telas de pendência. Tudo abaixo vive só na interface, exceto o desempenho por cidade (motor Python e motor local, com paridade).

### Conferência de piso
- **Conferidas × lidas.** A tela mostra "N de M linhas do arquivo foram conferidas" e o funil de totais, que agora continua até as encomendas conferidas (descontando as cidades fora da conferência). Na amostra: 1.809 linhas, 1.435 conferidas; saíram 299 de força maior, 40 sem cidade, 18 descarregadas e 17 "não recebido". A conferência nunca avaliou essas peças: o funil só passou a mostrar isso.
- **Endereço.** Coluna "Endereço" (com CEP) na tabela de correções; o bairro continua abaixo da cidade.

### Pendentes por data de chegada (substitui as faixas 0-1 / 2-3 / 4+ dias na navegação)
- Tabela dinâmica cidade × dia de chegada (Pendências e aba Pendentes de Pendências de entrega). Caixas "Detalhar por" abrem entregador, bairro e endereço, nessa ordem; caixas de data tiram um dia da soma; clicar num número lista as encomendas; exportação em .xlsx.
- A idade de cada data é em **dias de calendário** até o dia da referência do relatório. Peça sem data de chegada vai para a coluna "Sem data".
- As faixas seguem nos dois motores e na gaveta de alguns alertas, mas deixaram de ser o caminho de navegação.
- **Estado da tabela.** Pendências e a aba Pendentes de Pendências de entrega têm cada uma o seu estado (datas tiradas, célula, linhas recolhidas): mexer numa não muda a outra. Quem chega por um atalho de outra tela (Torre, Mapa) encontra a tabela sem datas tiradas nem célula selecionada, para o número bater com o que foi clicado; o desenho (entregador, bairro, endereço) fica como o usuário deixou. Abrir pelo menu mantém tudo. Teste: `frontend/tests/estado_pivot.mjs`.

### Regra de pendência (aba "Pendentes")
- É pendência: toda peça de **Unaí**, qualquer que seja a data de chegada; nas demais cidades, a peça que chegou **antes do dia da referência**.
- Não é pendência: peça de outra cidade que chegou no dia da referência; entrega confirmada; peça com **tentativa de entrega no dia da referência** (ela aparece nas listas de tentativas). Sem data de chegada conta como pendência.
- Substitui a regra antiga ("2 dias ou mais"). A gaveta da encomenda explica, em cada caso, por que ela conta ou não.
- **A validar com a operação:** o dia da referência é o do relatório atualizado (não o dia de hoje); "tentativa no dia" usa `Last Problem Date` com `Delivery Count` ≥ 1.

### 1 e 2 tentativas
- As abas passam a listar **toda** peça com ocorrência e exatamente 1 (ou 2) tentativas, inclusive a que já saiu para rota de novo, marcada "Já em rota: acompanhar". Antes essa peça sumia das duas abas e ia só para "Já em rota", o que fazia o total do topo não bater com o que o operador via.
- Só a que **não** saiu para rota entra nos alertas e no "pedem uma ação sua". "Já em rota" segue como aba própria.

### Entregadores
- Quantidade e percentual juntos ("126 de 270 · 46,7%").
- Nova visão **por cidade e entregador**. O motor devolve `desempenho.por_cidade`: uma linha por (cidade, entregador), com os AWBs por classe. A cidade é a da peça **na base** (o universo do indicador). Somando as cidades de um entregador sai exatamente a linha dele (teste `test_desempenho_por_cidade_soma_igual_ao_por_entregador`; paridade `desempenho.por_cidade`).

