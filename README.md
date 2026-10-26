# Central Inteligente de Operações Logísticas

Evolução do MVP em Streamlit para uma aplicação operacional: importa os dois
relatórios Dispatch (base e atualizado), compara por AWB e leva o usuário da
torre de controle até a encomenda, com conferência de piso, exceções,
desempenho por entregador e exportações com os nomes de coluna originais.

## Estrutura

```
backend/
  logistica/        motor de regras (comparador, regras, metricas, excecoes, pipeline)
  api/              FastAPI (main.py) + camada de serviço testável (servico.py)
  tests/            critérios de aceite + regras revisadas, API FastAPI ponta a ponta, referência de paridade
  dados_exemplo/    tabela_base.xlsx, ultima_tabela.xlsx, dispatch_2026-10-11.xlsx
frontend/
  src/              TypeScript sem framework e sem dependências (01_tipos … 14_app), estilos.css
  tipos/            declarações globais só para o tsc
  build.mjs         remove os tipos (Node ≥ 22.13) e gera um HTML único
  tests/            paridade, smoke do bundle, filtro por coluna, escrita de .xlsx
scripts/testar.sh   roda todos os testes (make test)
.github/workflows/  pages.yml: publica a interface (modo efêmero) no GitHub Pages
docs/DECISOES_E_VALIDACAO.md
```

## Rodar

```bash
# 1. Interface
cd frontend && node build.mjs            # gera dist/index.html

# 2. API (serve a interface em http://localhost:8000)
cd ../backend
pip install -r requirements.txt
uvicorn api.main:app --reload
```

Com a API no ar, a interface detecta `/api/saude` e usa o **motor Python**
(regras, justificativas e ajustes de piso gravados em `backend/dados/*.json`,
como no MVP). Sem API — por exemplo, aberta como arquivo ou publicada como
página — ela usa o **motor local**, uma porta do motor Python validada por
teste de paridade, e marca isso na barra lateral.

`node build.mjs --demo` gera `dist/demo.html` com as planilhas de exemplo
embutidas, que abre direto na torre de controle.

## Testes

```bash
make instalar   # uma vez: pip install -r backend/requirements.txt && npm install em frontend/
make test       # tudo; falha se qualquer etapa falhar
```

`make test` roda, nesta ordem: pytest (critérios de aceite, regras revisadas, regressões
da auditoria com dados sintéticos e a API FastAPI de verdade, subindo o uvicorn), referências do
motor Python (reais e sintéticas),
`tsc --noEmit` em modo estrito, paridade motor local × Python (5 cenários:
análise, validação, qualidade, referência e simulação), build, smoke do
bundle, filtro por coluna e escrita de .xlsx (com leitura cruzada no openpyxl
e no pandas). Os testes rodam localmente (`make test`); eles dependem de
planilhas reais em `backend/dados_exemplo/`, que ficam fora do repositório
público (contêm dados de clientes).

## Mapa de região e calibração

O mapa publicado (`frontend/public/regras_regiao.b64`) é gerado, de forma reproduzível, a partir do arquivo de estudo
(dados de clientes: fora do Git):

```bash
python scripts/gerar_mapa_regiao.py "base de estudo.xlsx"          # regera o mapa, com proveniência e suporte
python scripts/calibrar_criterio_regiao.py "base de estudo.xlsx"   # reproduz a calibração do critério
```

A tela de piso mostra de que arquivo e período o mapa veio. Critério e resultados: `docs/CALIBRACAO_REGIAO.md`.
Decisões e o que mudou na auditoria de 13/10/2026: `docs/DECISOES_E_VALIDACAO.md` §9.

## Publicação (GitHub Pages)

`.github/workflows/pages.yml` publica **apenas a interface** no GitHub Pages a
cada push na branch `main`. O build usa `node build.mjs --publico`, que liga o
**modo efêmero**: sem backend, sem persistência de dados e começando vazio — o usuário
faz o upload dos dois relatórios a cada sessão e, ao fechar a aba, nenhum dado é
guardado (só preferências de tela, como o desenho da tabela por data, ficam no
navegador; há "Esquecer preferências" em Importação e critérios). É o modo sem
custo de infraestrutura. Os dados reais e os artefatos
de build (`frontend/dist/`, `backend/dados_exemplo/`, `backend/dados/`) ficam
fora do repositório.

No modo efêmero, as **regras de piso** (`frontend/public/regras_piso.json`) são
publicadas junto do site e lidas pela aplicação ao abrir (GitHub → aplicação,
**somente leitura**). As edições de regra feitas na interface valem apenas para
a sessão e somem ao recarregar; a aplicação nunca escreve de volta no
repositório. Para mudar as regras "oficiais", edite o arquivo versionado e dê
push — o site republica automaticamente.

## Telas

| Área | Tela | Responde |
|---|---|---|
| — | Torre de controle | Como está a operação e o que precisa da minha atenção? |
| Agir agora | Conferência de piso | Alguma encomenda está com a cidade ou o entregador errado? (tabela ou roteiro por entregador) |
| Agir agora | Pendências de entrega | O que preciso colocar em rota, cobrar ou devolver? (Pendentes: Unaí sempre, demais cidades se chegaram antes do dia da referência; 1, 2 e 3 tentativas; extravios; avarias) |
| Monitorar | Pendências | Quantas faltam, onde estão e há quanto tempo esperam? (tabela cidade × data de chegada, com entregador, bairro e endereço sob demanda) |
| Monitorar | Entregadores | Como está cada entregador? Quantidade e %, por entregador ou por cidade e entregador (rosca de resumo, ritmo) |
| Monitorar | Histórico | As pendências estão caindo? O que mudou entre importações? |
| Monitorar | Mapa | Onde estão as pendências e onde se concentram os problemas? |
| Consultar | Encomendas a entregar · O que mudou · Fora da jurisdição | Listas de consulta e auditoria |
| Consultar | Regras de abrangência · Importação e critérios | Quem entrega onde (com impacto antes de salvar); de onde vêm os números |

Todo indicador e toda barra levam aos registros; todo código de encomenda
abre o painel com "Por que esta classificação". O "?" ao lado de títulos, indicadores,
gráficos e filtros abre a explicação completa do conceito; os textos ficam
centralizados em `frontend/src/06b_glossario.ts`. Passar o mouse (ou focar com o
teclado) sobre um rótulo com explicação (chips, legendas, abas, cabeçalhos de coluna,
indicadores, etapas do funil) mostra um balão curto com o mesmo texto; o rótulo é
reconhecido pelo título do verbete ou por um apelido em `frontend/src/06c_dicas.ts`,
então um verbete novo já passa a valer em todas as telas. A busca (atalho `/`) abre
qualquer AWB direto.
