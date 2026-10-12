"""Agregações, backlog, classificação operacional e desempenho por entregador.

RN-015 classificação (visão pendentes) · RN-016 desempenho · RN-017 backlog.

OP-01 (decisão de 2026-10-11): "Entregue" na classificação passa a ser só a
ENTREGA CONFIRMADA pelo relatório (status de entregue ou data de assinatura).
`Delivery Time` deixou de contar como entrega: nos relatórios Dispatch ele é
preenchido ~2 h após a chegada em toda encomenda "Em rota de entrega", ou seja,
marca a SAÍDA PARA ENTREGA. Ele passa a alimentar o tempo em rota.

OP-06 (decisão de 2026-10-11): a referência do tempo de espera vem do próprio
relatório (horário no nome do arquivo ou o evento mais recente registrado),
para que o mesmo arquivo produza sempre os mesmos números.
"""
from __future__ import annotations

import re

import numpy as np
import pandas as pd

from .comparador import AWB_COL, CHEGADA_COL, CIDADE_COL, PROBLEMA_COL, STATUS_COL
from .regras import ENTREGADOR_COL

DELIVERY_TIME_COL = "Delivery Time"  # saída para entrega
SIGN_DATE_COL = "Sign Date"  # entrega confirmada (assinatura)
COLUNAS_EVENTO = ["Arrival Time", "Last Problem Date", "Delivery Time", "Sign Date"]
_RE_HORARIO_NOME = re.compile(r"(\d{4})-(\d{2})-(\d{2})[T_ ](\d{2})[:h-]?(\d{2})[:m-]?(\d{2})")
_STATUS_ENTREGUE = {"entregue", "assinado", "signed", "delivered"}

FAIXAS_BACKLOG = ["0-1 dia", "2-3 dias", "4+ dias"]
_BINS_BACKLOG = [0, 2, 4, np.inf]

CLASSE_ENTREGUE = "Entregue"
CLASSE_NAO_ENTREGUE = "Não entregue"
CLASSE_ANORMAL = "Anormal"
SEM_ENTREGADOR = "(sem entregador)"


def _tem(df: pd.DataFrame, col: str) -> pd.Series:
    if col not in df.columns:
        return pd.Series(False, index=df.index)
    s = df[col]
    return (s.notna() & (s.astype("string").str.strip() != "")).fillna(False).astype(bool)


def calcular_backlog_dias(df: pd.DataFrame, referencia: pd.Timestamp | None = None) -> pd.Series:
    """Dias desde a chegada. Referência padrão = relógio (OP-06, preservado)."""
    ref = referencia if referencia is not None else pd.Timestamp.now()
    chegada = pd.to_datetime(df.get(CHEGADA_COL), errors="coerce")
    if chegada is None:
        return pd.Series(np.nan, index=df.index)
    return (ref - chegada).dt.total_seconds() / 86400.0


def minutos_em_rota(df: pd.DataFrame, referencia: pd.Timestamp) -> pd.Series:
    """Minutos inteiros (truncados) desde a saída para entrega (Delivery Time), só
    para quem não tem entrega confirmada. Inteiro para ser idêntico nos dois motores."""
    saida = pd.to_datetime(df.get(DELIVERY_TIME_COL), errors="coerce")
    if saida is None:
        return pd.Series(np.nan, index=df.index)
    h = ((referencia - saida).dt.total_seconds() // 60)
    h[entrega_confirmada(df)] = np.nan
    h[h < 0] = np.nan
    return h


def referencia_do_relatorio(nome: str | None, df: pd.DataFrame | None) -> tuple[pd.Timestamp | None, str]:
    """OP-06: 1) horário no nome do arquivo exportado; 2) evento mais recente do relatório."""
    m = _RE_HORARIO_NOME.search(nome or "")
    if m:
        try:
            return pd.Timestamp(*map(int, m.groups())), "nome_arquivo"
        except ValueError:
            pass
    if df is not None:
        datas = [pd.to_datetime(df[c], errors="coerce").max() for c in COLUNAS_EVENTO if c in df.columns]
        datas = [d for d in datas if not pd.isna(d)]
        if datas:
            return max(datas), "ultimo_evento"
    return None, "relogio"


def faixa_backlog_por_linha(df: pd.DataFrame, referencia: pd.Timestamp | None = None) -> pd.Series:
    dias = calcular_backlog_dias(df, referencia)
    return pd.cut(dias, bins=_BINS_BACKLOG, labels=FAIXAS_BACKLOG, right=False).astype("object")


def resumo_backlog(df: pd.DataFrame, referencia: pd.Timestamp | None = None) -> pd.Series:
    return faixa_backlog_por_linha(df, referencia).value_counts().reindex(FAIXAS_BACKLOG, fill_value=0)


def entrega_confirmada(df: pd.DataFrame) -> pd.Series:
    """Entregue segundo o próprio relatório: status de entregue ou data de assinatura."""
    status = df[STATUS_COL].astype("string").str.strip().str.lower() if STATUS_COL in df else pd.Series("", index=df.index)
    return (status.isin(_STATUS_ENTREGUE).fillna(False) | _tem(df, SIGN_DATE_COL)).astype(bool)


def classificar(df: pd.DataFrame) -> pd.Series:
    """RN-015 (revisada OP-01): Anormal (tem problema) > Entregue (confirmada) > Não entregue."""
    anormal = _tem(df, PROBLEMA_COL)
    entregue = entrega_confirmada(df)
    out = pd.Series(CLASSE_NAO_ENTREGUE, index=df.index, dtype="object")
    out[entregue & ~anormal] = CLASSE_ENTREGUE
    out[anormal] = CLASSE_ANORMAL
    return out


def kpis_gerais(df: pd.DataFrame, referencia: pd.Timestamp | None = None) -> dict:
    dias = calcular_backlog_dias(df, referencia)
    media = float(dias.mean()) if dias.notna().any() else 0.0
    return {
        "pendentes": int(len(df)),
        "cidades": int(df[CIDADE_COL].nunique()) if CIDADE_COL in df else 0,
        "entregadores": int(df[ENTREGADOR_COL].nunique()) if ENTREGADOR_COL in df else 0,
        "com_problema": int(_tem(df, PROBLEMA_COL).sum()),
        "backlog_medio_dias": round(media, 1),
        "backlog_7mais": int((dias >= 7).sum()),
    }


def por_cidade(df: pd.DataFrame) -> pd.Series:
    return df[CIDADE_COL].value_counts()


def por_entregador(df: pd.DataFrame, top: int = 15) -> pd.Series:
    return df[ENTREGADOR_COL].fillna(SEM_ENTREGADOR).value_counts().head(top)


def por_problema(df: pd.DataFrame) -> pd.Series:
    return df[PROBLEMA_COL].dropna().value_counts()


def desempenho_entregadores(base: pd.DataFrame, ultima: pd.DataFrame, entregues_ids: set[str]) -> pd.DataFrame:
    """RN-016: universo = peças do entregador na base.
    entregue = AWBs da base em saiu_entregue; anormal/pendente = peças do
    entregador na última com/sem problema. Soma pode ser < total (devoluções)."""
    b = base.assign(_ent=base[ENTREGADOR_COL].fillna(SEM_ENTREGADOR))
    prob_ult = dict(zip(ultima[AWB_COL], _tem(ultima, PROBLEMA_COL)))
    linhas = []
    for ent, g in b.groupby("_ent"):
        total = len(g)
        entregue = int(g[AWB_COL].isin(entregues_ids).sum())
        ainda = [prob_ult[a] for a in g[AWB_COL] if a in prob_ult]  # continuam na última
        anormal = int(sum(ainda))
        pendente = int(len(ainda) - anormal)
        linhas.append({"entregador": ent, "total": total, "entregue": entregue,
                       "anormal": anormal, "pendente": pendente,
                       "pct_entregue": round(100 * entregue / total, 1) if total else 0.0})
    return pd.DataFrame(linhas, columns=["entregador", "total", "entregue", "anormal", "pendente", "pct_entregue"])


def linhas_classificadas_entregador(base: pd.DataFrame, ultima: pd.DataFrame, entregues_ids: set[str]) -> pd.DataFrame:
    """Linhas por entregador × classe (Entregue/Anormal/Pendente) para o drill-down."""
    ent_base = dict(zip(base[AWB_COL], base[ENTREGADOR_COL].fillna(SEM_ENTREGADOR)))
    ent_b = base[base[AWB_COL].isin(entregues_ids)].assign(classe="Entregue")
    ainda = ultima[ultima[AWB_COL].isin(set(ent_base))]
    prob = _tem(ainda, PROBLEMA_COL)
    an = ainda[prob].assign(classe="Anormal")
    pe = ainda[~prob].assign(classe="Pendente")
    out = pd.concat([ent_b, an, pe], ignore_index=True)
    # o entregador considerado é o da base (universo do indicador)
    out["entregador"] = out[AWB_COL].map(ent_base)
    return out
