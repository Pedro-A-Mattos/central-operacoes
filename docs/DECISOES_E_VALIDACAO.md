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
  regra: `tests/paridade.mjs` compara os dois em 5 cenários (padrão; ajuste
  de piso + descarregado + rigor 5 + cidade ignorada; referência pelo nome do
  arquivo; referência pelo último evento; arquivos invertidos) em **todos os
  campos** do contrato — resumo, etapas, cada AWB, piso, exceções, regras,
  desempenho, validação e qualidade da importação, referência e simulação de
  regras. Resultado atual: paridade completa (150 verificações).
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
