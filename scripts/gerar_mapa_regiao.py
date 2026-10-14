#!/usr/bin/env python3
"""Gera o mapa de regiões publicado (frontend/public/regras_regiao.b64) a partir do arquivo de estudo.

    python scripts/gerar_mapa_regiao.py "base de estudo.xlsx"            # grava o mapa
    python scripts/gerar_mapa_regiao.py "base de estudo.xlsx" --dry-run  # só mostra o resumo

Reprodutível: a mesma planilha e os mesmos parâmetros geram o mesmo mapa (muda só `meta.gerado_em`).
O mapa guarda, além de quem atende cada região, o SUPORTE (entregas que sustentam cada regra), a lista de
entregadores vistos e a proveniência (arquivo, período, linhas). Critério padrão calibrado em hold-out
(docs/CALIBRACAO_REGIAO.md): vale quem tem >= 5 entregas e >= 5% da região; suporte mínimo de 20.
A planilha de estudo contém dados de clientes: fica fora do Git (*.xlsx no .gitignore).
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import sys
import warnings
import zlib
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "backend"))
warnings.filterwarnings("ignore")

from logistica import comparador as cmp  # noqa: E402
from logistica import regras as rg  # noqa: E402

SAIDA_PADRAO = RAIZ / "frontend" / "public" / "regras_regiao.b64"


def preparar(df):
    """Mesmo preparo do front (prepRegiao): normaliza o AWB, remove força maior e descarta linhas sem cidade."""
    return cmp.separar_fora_jurisdicao(cmp.remover_fm(cmp.normalizar_relatorio(df)))[0]


def gerar(caminho: Path, limiar: int, participacao: float, suporte: int) -> tuple[dict, dict]:
    bruto = cmp.ler_planilha(caminho)
    usado = preparar(bruto)
    mapa = rg.derivar_regras_regiao(usado, limiar, participacao, suporte)
    chegada = cmp.para_data(usado[cmp.CHEGADA_COL]).dropna() if cmp.CHEGADA_COL in usado.columns else []
    mapa["versao"] = 2
    mapa["meta"] = {
        "gerado_em": datetime.now().isoformat(timespec="seconds"),
        "fonte": caminho.name,
        "sha1": hashlib.sha1(caminho.read_bytes()).hexdigest()[:12],
        "periodo": ({"inicio": chegada.min().strftime("%Y-%m-%d"), "fim": chegada.max().strftime("%Y-%m-%d")} if len(chegada) else None),
        "linhas": int(len(bruto)),
        "linhas_usadas": int(len(usado)),
    }
    return mapa, {"linhas": len(bruto), "usadas": len(usado)}


def empacotar(mapa: dict) -> str:
    """JSON compacto -> deflate bruto -> base64: o formato que a interface lê (DecompressionStream 'deflate-raw')."""
    bruto = json.dumps(mapa, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    z = zlib.compressobj(9, zlib.DEFLATED, -15)
    return base64.b64encode(z.compress(bruto) + z.flush()).decode("ascii")


def resumo(mapa: dict) -> str:
    sup = mapa["suporte"]["por_cep"]
    faixa = lambda lo, hi: sum(1 for n in sup.values() if lo <= n < hi)
    m = mapa["meta"]
    return "\n".join([
        f"fonte: {m['fonte']} (sha1 {m['sha1']}) · período {m['periodo']} · {m['linhas']} linhas, {m['linhas_usadas']} usadas",
        f"critério: >= {mapa['limiar']} entregas e >= {mapa['min_participacao']:.0%} da região · suporte mínimo {mapa['min_suporte']}",
        f"CEPs {len(mapa['por_cep'])} · bairros {len(mapa['por_bairro'])} · cidades {len(mapa['por_cidade'])} · entregadores {len(mapa['entregadores'])}",
        f"CEPs por suporte: >=100: {faixa(100, 10**9)} · 20-99: {faixa(20, 100)} · <20 (\"pouco histórico\"): {faixa(0, 20)}",
        f"CEPs com mais de um entregador: {sum(1 for v in mapa['por_cep'].values() if len(v) > 1)}",
    ])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("planilha", type=Path)
    ap.add_argument("--saida", type=Path, default=SAIDA_PADRAO)
    ap.add_argument("--limiar", type=int, default=rg.LIMIAR_REGIAO)
    ap.add_argument("--participacao", type=float, default=rg.MIN_PARTICIPACAO)
    ap.add_argument("--suporte", type=int, default=rg.MIN_SUPORTE)
    ap.add_argument("--dry-run", action="store_true", help="mostra o resumo sem gravar")
    a = ap.parse_args()
    if not a.planilha.is_file():
        print(f"Arquivo não encontrado: {a.planilha}", file=sys.stderr)
        return 2
    mapa, _ = gerar(a.planilha, a.limiar, a.participacao, a.suporte)
    print(resumo(mapa))
    if a.dry_run:
        print("(simulação: nada foi gravado)")
        return 0
    a.saida.write_text(empacotar(mapa), encoding="ascii")
    print(f"gravado: {a.saida} ({a.saida.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
