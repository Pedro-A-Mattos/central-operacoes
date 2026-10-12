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

`make test` roda, nesta ordem: pytest (critérios de aceite, regras revisadas e
a API FastAPI de verdade, subindo o uvicorn), referência do motor Python,
`tsc --noEmit` em modo estrito, paridade motor local × Python (5 cenários:
análise, validação, qualidade, referência e simulação), build, smoke do
bundle, filtro por coluna e escrita de .xlsx (com leitura cruzada no openpyxl
e no pandas). Os testes rodam localmente (`make test`); eles dependem de
planilhas reais em `backend/dados_exemplo/`, que ficam fora do repositório
público (contêm dados de clientes).

## Publicação (GitHub Pages)

`.github/workflows/pages.yml` publica **apenas a interface** no GitHub Pages a
cada push na branch `main`. O build usa `node build.mjs --publico`, que liga o
**modo efêmero**: sem backend, sem persistência e começando vazio — o usuário
faz o upload dos dois relatórios a cada sessão e, ao fechar a aba, nada é
guardado. É o modo sem custo de infraestrutura. Os dados reais e os artefatos
de build (`frontend/dist/`, `backend/dados_exemplo/`, `backend/dados/`) ficam
fora do repositório.

## Telas

| Área | Tela | Responde |
|---|---|---|
| — | Torre de controle | Como está a operação e o que precisa da minha atenção? |
| Agir agora | Conferência de piso | Alguma encomenda está com a cidade ou o entregador errado? (tabela ou roteiro por entregador) |
| Agir agora | Exceções | O que saiu do fluxo normal e precisa de decisão? |
| Monitorar | Pendências | Quantas faltam, onde estão e há quanto tempo esperam? |
| Monitorar | Entregadores | Como está cada entregador? (rosca de resumo, ritmo) |
| Monitorar | Histórico | As pendências estão caindo? O que mudou entre importações? |
| Monitorar | Mapa | Onde estão as pendências e onde se concentram os problemas? |
| Consultar | Encomendas a entregar · O que mudou · Fora da jurisdição | Listas de consulta e auditoria |
| Consultar | Regras de abrangência · Importação e critérios | Quem entrega onde (com impacto antes de salvar); de onde vêm os números |

Todo indicador e toda barra levam aos registros; todo código de encomenda
abre o painel com "Por que esta classificação". O "?" ao lado de títulos, indicadores,
gráficos e filtros abre a explicação completa do conceito; os textos ficam
centralizados em `frontend/src/06b_glossario.ts`. A busca (atalho `/`) abre
qualquer AWB direto.
