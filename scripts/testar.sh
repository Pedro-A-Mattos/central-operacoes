#!/usr/bin/env bash
# Roda TODOS os testes do projeto e falha se qualquer um falhar.
#   make test            (ou)   bash scripts/testar.sh
# Variáveis opcionais: PYTHON (padrão python3), TSC (caminho do tsc; padrão frontend/node_modules/.bin/tsc)
set -uo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PY="${PYTHON:-python3}"
TSC="${TSC:-$RAIZ/frontend/node_modules/.bin/tsc}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export NODE_NO_WARNINGS=1
falhas=(); passou=()

etapa() {  # etapa "nome" comando...
  local nome="$1"; shift
  printf '\n\033[1m▶ %s\033[0m\n' "$nome"
  if "$@"; then passou+=("$nome"); else falhas+=("$nome"); printf '\033[31m✗ %s falhou\033[0m\n' "$nome"; fi
}

cd "$RAIZ/backend"
etapa "Critérios de aceite e API (pytest)" "$PY" -m pytest -q tests/
etapa "Referência do motor Python" bash -c "\"$PY\" tests/gerar_referencia.py > \"$TMP/ref.json\""

cd "$RAIZ/frontend"
if [ -x "$TSC" ]; then etapa "Checagem de tipos (tsc --noEmit)" "$TSC" -p tsconfig.json
else falhas+=("Checagem de tipos (tsc não encontrado: rode 'npm install' em frontend/)"); fi
etapa "Paridade motor local × Python" node tests/paridade.mjs "$TMP/ref.json"
etapa "Build" node build.mjs
etapa "Smoke do bundle" node tests/smoke_bundle.mjs
etapa "Filtro por coluna" node tests/filtro_coluna.mjs
etapa "Escrita de .xlsx (round-trip)" env SAIDA_XLSX="$TMP/saida.xlsx" node tests/escrita_xlsx.mjs
etapa "Escrita de .xlsx (openpyxl e pandas)" "$PY" "$RAIZ/backend/tests/conferir_xlsx.py" "$TMP/saida.xlsx"

printf '\n\033[1mResumo:\033[0m %d ok, %d falha(s)\n' "${#passou[@]}" "${#falhas[@]}"
for f in "${falhas[@]}"; do printf '  \033[31m✗\033[0m %s\n' "$f"; done
[ ${#falhas[@]} -eq 0 ]
