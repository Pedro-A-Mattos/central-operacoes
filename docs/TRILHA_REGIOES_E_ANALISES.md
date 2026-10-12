# Trilha de desenvolvimento — Regiões, validação de atribuição e análises

Documento de planejamento. Nada aqui foi implementado ainda. Serve para você
revisar, marcar as caixas que fazem sentido e eu seguir a trilha aprovada.

Prioridade declarada pelo usuário: **identificação preventiva de entregas
atribuídas a entregadores incorretos** (antecipar erro operacional, apoiar a
cobrança correta e aumentar a confiabilidade das métricas).

---

## Visão geral das 4 entregas

| # | Entrega | Valor | Esforço | Depende de |
|---|---------|-------|---------|------------|
| F1 | Modo Estudo — consolidar regras de região (CEP) e baixar JSON | Alto (base de tudo) | Médio | — |
| F2 | Modo Validação — auditar 1 planilha contra o JSON de regras | **Altíssimo (prioridade)** | Médio | F1 |
| F3 | Filtros por cidade **e** bairro | Médio | Baixo | — |
| F4 | Análise "não recebido, mas entregue" (com/sem Delivery Time) | Médio | Médio | — |

Ordem sugerida: **F3 → F1 → F2 → F4**. F3 é rápido e melhora as telas atuais;
F1 produz o insumo que F2 consome; F2 é a prioridade de valor; F4 é independente.

---

## O que já existe e será reaproveitado (medido no código atual)

- `derivar_regras` (backend/logistica/regras.py): já calcula "quem entrega onde"
  por cidade/bairro, com limiar de ruído e suportando **conjunto** de
  entregadores por região (ou seja, já cobre "2 entregadores no mesmo CEP").
  Medição: deriva ~20.000 linhas em ~54 ms.
- `validar_piso` (regras.py): já aponta "entregador fora da área", "sem
  entregador", "cidade fora da abrangência". É exatamente o motor do Modo
  Validação; muda só a **fonte** das regras.
- Tela "Conferência de piso" (11_agir.ts): tabela + roteiro por entregador +
  exportação .xlsx. Reusada quase inteira pelo Modo Validação.
- Leitura de regras publicadas (04_servico.ts `lerRegrasPublicadas`): o padrão
  "GitHub → aplicação, só leitura" já existe para `regras_piso.json`.
- Componentes de UI: `tabela()`, `barras()`, `rosca()`, `kpi()`,
  `barraFiltros()`+`multi()`, `abas()`, `botaoExportar()`.
- Contrato de dados já transmite ao front: CEP (`Consignee Zip Code`),
  `Consignee Area`, `Consignee City`, `Delivery Associate`, `Last Scan Status`,
  `Last Problem Type`, `Delivery Time`, `Sign Date`.

Novo de verdade: fluxo de **1 planilha** (sem comparação base × atual),
derivação por **CEP**, tela de consolidação + **download de JSON**, e a tela de
estudo "não recebido, mas entregue".

---

## F3 — Filtros por cidade e por bairro (rápido, começa por aqui)

Hoje a cidade urbana (ex.: Unaí) aparece segmentada por bairro em algumas
visões. Objetivo: alternar entre ver a **cidade inteira** e **refinar por
bairro**, de forma combinável.

Checklist (marque o que quer):
- [ ] (F3.1) Adicionar filtro de **Bairro** (`Consignee Area`) ao lado do de
      Cidade em **Pendências**.
- [ ] (F3.2) Idem em **Exceções**.
- [ ] (F3.3) Idem em **Conferência de piso**.
- [ ] (F3.4) Alternador "Ver por: Cidade | Bairro" nas visões que agrupam por
      bairro (define o nível de agregação dos gráficos).
- [ ] (F3.5) Aplicar também na nova tela de Estudo (F1) e nas análises novas.

Dúvida para você:
- Quer o filtro de bairro em **todas** as telas com cidade (F3.1–F3.3) ou só
  onde já há agrupamento por bairro? _(recomendo todas, é barato)_

---

## F1 — Modo Estudo: consolidar regras de região por CEP

Enviar **uma** planilha grande (ex.: 20 mil linhas), derivar com limiar alto
quem atende cada **CEP** (permitindo vários entregadores por região), revisar a
matriz e **baixar um JSON** com o mapeamento CEP → entregadores.

O que será feito:
- Novo fluxo de upload de **1 arquivo** (sem base × atual).
- Estender `derivar_regras` para o nível **CEP** (`Consignee Zip Code`),
  reusando a mesma lógica de limiar/dominante (poucas linhas; já suporta
  conjunto de entregadores).
- Tela de revisão: matriz região → {entregadores} com volume e dominante,
  destacando regiões com múltiplos entregadores (reusa `tabela()`/`barras()`).
- Botão **"Baixar JSON"** com o mapeamento consolidado.

Checklist — granularidade da regra:
- [ ] (F1.a) Só **CEP**.
- [ ] (F1.b) **CEP com fallback** para bairro e depois cidade quando o CEP não
      tiver regra. _(recomendado: cobre CEPs raros sem perder a regra de CEP)_
- [ ] (F1.c) CEP **e** bairro **e** cidade, as três guardadas no JSON.

Checklist — limiar (nível de confiança):
- [ ] (F1.d) Limiar **ajustável na tela**, com padrão sugerido.
      Padrão sugerido: ____ (ex.: 10). _(recomendo ajustável)_
- [ ] (F1.e) Limiar **fixo** no código. Valor: ____.

Checklist — múltiplos entregadores por região:
- [ ] (F1.f) Manter **todos** acima do limiar (+ o dominante). _(recomendado)_
- [ ] (F1.g) Limitar a um **top N** por região. N = ____.

Checklist — formato/arquivo do JSON:
- [ ] (F1.h) Arquivo **separado** `regras_regiao.json`. _(recomendado: não
      mistura com o override de piso atual)_
- [ ] (F1.i) **Estender** o `regras_piso.json` atual com uma seção `por_cep`.

Esquema proposto do JSON (se F1.h):
```json
{
  "gerado_em": "2026-10-12T11:00:00",
  "limiar": 10,
  "por_cep": { "38613-394": ["Entregador A", "Entregador B"] },
  "por_bairro": { "Unaí|Centro": ["Entregador A"] },
  "por_cidade": { "Unaí": ["Entregador A", "Entregador B"] }
}
```

Dúvida de escala:
- 20 mil linhas no **modo efêmero** (navegador, sem backend) é viável pela
  medição, mas o parse de .xlsx grande consome memória. Valido o limite real na
  implementação e, se preciso, oriento o tamanho máximo ou otimizo o parser.
- [ ] (F1.j) Ok validar o limite de tamanho na implementação e me avisar se
      precisar de ajuste. _(recomendado)_

---

## F2 — Modo Validação: auditar 1 planilha contra o JSON (PRIORIDADE)

Enviar **uma** planilha (só as entregas a validar) e verificar se cada entrega
está com um entregador compatível com as regras, apontando atribuições
incorretas. Esta é a funcionalidade de maior valor.

O que será feito:
- Novo fluxo de upload de **1 arquivo**.
- Carregar o mapeamento de regiões (JSON do F1) como fonte das regras.
- Rodar `validar_piso` por CEP contra esse mapa.
- Exibir reusando a **Conferência de piso** (tabela + roteiro + exportação).

Checklist — origem do JSON de regras no Modo Validação:
- [ ] (F2.a) Ler do **arquivo publicado no GitHub** (como as regras de piso
      hoje). _(recomendado para regra "oficial" compartilhada)_
- [ ] (F2.b) **Upload do JSON** junto com a planilha, a cada auditoria.
- [ ] (F2.c) **Ambos**: usa o do GitHub por padrão e permite subir um JSON
      alternativo pontual.

Checklist — como disparar o Modo Validação:
- [ ] (F2.d) **Opção na tela de importação**: "Analisar 1 planilha: conferir
      atribuição". _(recomendado: aproveita o fluxo existente)_
- [ ] (F2.e) **Tela separada** dedicada à validação.

Checklist — critério de "errado":
- [ ] (F2.f) Errado = entregador **não** está no conjunto do CEP (com fallback
      bairro/cidade se F1.b). _(recomendado)_
- [ ] (F2.g) Além de "errado", sinalizar também "sem entregador" e "CEP sem
      regra conhecida" (não dá para julgar). _(recomendado)_

---

## F4 — "Não recebido, mas entregue" (análise de estudo)

Dar visibilidade aos casos registrados como "não recebido" que depois aparecem
como entregues, agrupados por entregador. Natureza informativa (não é cobrança).

Ponto crítico de arquitetura: o filtro global "Ignorar não recebido" (ativo)
remove esses casos da análise principal. Esta tela precisa olhar os dados
**antes** desse filtro — terá sua própria fonte.

Categorias pedidas:
- Entregue **sem** Delivery Time (registrado como não recebido, consta entregue,
  sem tempo de entrega).
- Entregue **com** Delivery Time (idem, com tempo de entrega registrado).

Medição nos dados de exemplo: 6 linhas com `Last Problem Type` = "não recebido";
3 com Delivery Time, 3 sem. Confirma que a separação é significativa.

O que será feito:
- Universo = linhas "não recebido" (status OU tipo de problema), **antes** do
  filtro global.
- Classificação por entregador nas categorias acima; KPIs, `barras()` por
  entregador e `tabela()` com exportação (reusa o esqueleto da tela
  Entregadores).

Checklist — definição de "foi entregue mesmo assim":
- [ ] (F4.a) Considerar entregue por **status** entregue/assinado OU **Sign
      Date** OU **Delivery Time**. _(mais abrangente)_
- [ ] (F4.b) Considerar entregue **só** por Delivery Time / Sign Date (ignorar
      status). _(mais conservador; foca no que você descreveu)_

Checklist — categorias/termo:
- [ ] (F4.c) Duas categorias: **com** e **sem** Delivery Time. _(seu pedido)_
- [ ] (F4.d) Três categorias: + "entrega confirmada por status/Sign Date".
- [ ] (F4.e) Rótulo da tela: "Entregue, mas marcado como não recebido".
- [ ] (F4.f) Rótulo alternativo (escreva o seu): __________________________.

Checklist — onde colocar:
- [ ] (F4.g) **Tela própria** (Monitorar/Consultar). _(recomendado: universo é
      diferente, antes do filtro)_
- [ ] (F4.h) **Aba** dentro de Entregadores.

---

## Decisões transversais

- [ ] (T1) Testes + paridade motor local × Python para toda lógica nova
      (derivação por CEP, validação, classificação). _(recomendado/padrão do projeto)_
- [ ] (T2) Publicar no GitHub Pages ao final de cada fase aprovada.
- [ ] (T3) Manter o modo efêmero (sem persistência) — o JSON de regiões é
      baixado pelo usuário e, se "oficial", versionado por você no repositório.

---

## Marcos de entrega (como eu entregaria)

1. **M1 — F3**: filtros cidade/bairro. Pequeno, isolado, publicável sozinho.
2. **M2 — F1**: tela de Estudo + derivação por CEP + download de JSON.
3. **M3 — F2**: Modo Validação reusando a Conferência de piso. (prioridade)
4. **M4 — F4**: análise "não recebido, mas entregue".

Cada marco: implementação → `make test` (com paridade) → verificação headless
quando fizer sentido → publicação.

---

## Resumo das dúvidas a responder

1. F3: filtro de bairro em todas as telas com cidade, ou só onde há bairro?
2. F1: granularidade (F1.a/b/c)?
3. F1: limiar ajustável ou fixo, e qual padrão (F1.d/e)?
4. F1: múltiplos entregadores — todos acima do limiar ou top N (F1.f/g)?
5. F1: JSON separado ou estender o atual (F1.h/i)?
6. F2: origem do JSON — GitHub, upload, ou ambos (F2.a/b/c)?
7. F2: disparo — opção na importação ou tela separada (F2.d/e)?
8. F4: definição de "entregue" (F4.a/b) e nº de categorias (F4.c/d)?
9. F4: rótulo e local (F4.e/f/g/h)?
