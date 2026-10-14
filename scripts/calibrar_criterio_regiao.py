#!/usr/bin/env python3
"""Calibra o critério do mapa de regiões SEM amostra rotulada (hold-out temporal + troca simulada).

    python scripts/calibrar_criterio_regiao.py "base de estudo.xlsx" [--corte 2026-09-26]

Deriva as regras do período ANTERIOR ao corte e confere as entregas reais do período POSTERIOR:
  * taxa de alerta nessas entregas reais  -> proxy de FALSO POSITIVO (quase todas estão certas);
  * taxa de detecção quando o entregador é trocado por outro conhecido (sorteio com semente fixa)
    -> proxy de SENSIBILIDADE. A troca aleatória é mais fácil de detectar que um erro real entre
    bairros vizinhos, então a detecção é um teto, não uma garantia.
Resultado e leitura: docs/CALIBRACAO_REGIAO.md. A planilha contém dados de clientes (fora do Git).
"""
from __future__ import annotations

import argparse
import random
import sys
import warnings
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "backend"))
warnings.filterwarnings("ignore")

from logistica import comparador as cmp  # noqa: E402
from logistica import regras as rg  # noqa: E402

ENT = rg.ENTREGADOR_COL


def preparar(planilha: Path) -> pd.DataFrame:
    n = cmp.separar_fora_jurisdicao(cmp.remover_fm(cmp.normalizar_relatorio(cmp.ler_planilha(planilha))))[0]
    n = n.dropna(subset=[ENT]).copy()
    n["cep"] = n[rg.ZIP_COL].map(rg.canon_cep)
    n["cid"] = n[rg.CIDADE_COL].map(rg.canon_chave)
    n["chave_b"] = [f"{c}|{rg.canon_chave(b)}" if c and rg.canon_chave(b) else None for c, b in zip(n["cid"], n[rg.AREA_COL])]
    n["t"] = cmp.para_data(n[cmp.CHEGADA_COL])
    return n.dropna(subset=["t"])


def contagens(df: pd.DataFrame, col: str) -> dict:
    return {k: g[ENT].value_counts().to_dict() for k, g in df.dropna(subset=[col]).groupby(col)}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("planilha", type=Path)
    ap.add_argument("--corte", default="2026-09-26")
    a = ap.parse_args()
    n = preparar(a.planilha)
    corte = pd.Timestamp(a.corte)
    tr, te = n[n.t < corte], n[n.t >= corte].reset_index(drop=True)
    conhecidos = set(tr[ENT])
    print(f"treino {len(tr)} ({tr.t.min().date()}..{tr.t.max().date()}) | teste {len(te)} ({te.t.min().date()}..{te.t.max().date()}) | entregadores novos no teste: {sorted(set(te[ENT]) - conhecidos)}")
    cc, cb, cd = contagens(tr, "cep"), contagens(tr, "chave_b"), contagens(tr, "cid")

    def validos(cont, m, p):
        tot = sum(cont.values())
        dom = sorted(cont.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        return {e for e, c in cont.items() if c >= m and c / tot >= p} | {dom}, tot

    def veredito(r, m, p, S, ent):
        if ent not in conhecidos:
            return "sem_historico"
        conj, sup = [], []
        for tab, chave in ((cc, r["cep"]), (cb, r["chave_b"])):
            if chave in tab:
                v, t = validos(tab[chave], m, p); conj.append(v); sup.append(t)
        if not conj:
            if r["cid"] in cd:
                v, t = validos(cd[r["cid"]], m, p); conj.append(v); sup.append(t)
            else:
                return "sem_regra"
        if ent in set().union(*conj):
            return "ok"
        return "pouco_historico" if max(sup) < S else "fora_da_area"

    rows = te.to_dict("records")
    rng = random.Random(42)
    ents = sorted(conhecidos)
    troca = [rng.choice([e for e in ents if e != r[ENT]]) if r[ENT] in conhecidos else None for r in rows]
    print("\n m   part  S | FP real: fora  pouco | detecção das trocas: fora da área / qualquer alerta")
    for m in (1, 3, 5, 10, 20, 50, 100):
        for p in (0.0, 0.05, 0.10):
            for S in (20,):
                v = pd.Series([veredito(r, m, p, S, r[ENT]) for r in rows]).value_counts()
                w = pd.Series([veredito(r, m, p, S, s) for r, s in zip(rows, troca) if s]).value_counts()
                tv, tw = v.sum(), w.sum()
                print(f"{m:>3} {p:>5.2f} {S:>2} | {100 * v.get('fora_da_area', 0) / tv:6.2f}% {100 * v.get('pouco_historico', 0) / tv:5.2f}% | {100 * w.get('fora_da_area', 0) / tw:6.2f}% / {100 * (tw - w.get('ok', 0)) / tw:6.2f}%")
    return 0


if __name__ == "__main__":
    sys.exit(main())
