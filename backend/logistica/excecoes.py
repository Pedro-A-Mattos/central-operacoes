"""Exceções (devolução / extravio / insucesso) e justificativas persistidas.

RN-018 devolução por tentativas — revisada (OP-02, decisão de 2026-10-11):
  conta como devolução só quem tem >= 3 tentativas E último motivo de ausência
  ou recusa. Quem tem >= 3 tentativas por outro motivo (ex.: reprogramação a
  pedido do cliente) vai para "revisar tentativas", para não sumir das listas.
RN-019 extravio por palavra-chave · RN-020 insucesso · RN-021 justificativas.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path

import pandas as pd

from .comparador import AWB_COL, MOTIVO_COL, PROBLEMA_COL

LIMITE_AUSENTES = 3
# Motivos que caracterizam ausência ou recusa do destinatário (comparação em minúsculas, por trecho).
MOTIVOS_DEVOLUCAO = ("não recebido", "nao recebido", "local fechado", "telefone não atendido",
                     "telefone nao atendido", "telefone errado", "recusad", "ausente")
PALAVRAS_EXTRAVIO = ("lost", "extravi")
PALAVRAS_AVARIA = ("avaria", "danific")
CONTAGEM_COL = "Delivery Count"


def _contagem(df: pd.DataFrame) -> pd.Series:
    if CONTAGEM_COL not in df.columns:
        return pd.Series(float("nan"), index=df.index)
    return pd.to_numeric(df[CONTAGEM_COL], errors="coerce")


def _texto(df: pd.DataFrame) -> pd.Series:
    t = df[PROBLEMA_COL].astype("string").fillna("") if PROBLEMA_COL in df else pd.Series("", index=df.index)
    m = df[MOTIVO_COL].astype("string").fillna("") if MOTIVO_COL in df else pd.Series("", index=df.index)
    return (t + " " + m).str.lower()


def _tem_problema(df: pd.DataFrame) -> pd.Series:
    if PROBLEMA_COL not in df.columns:
        return pd.Series(False, index=df.index)
    s = df[PROBLEMA_COL]
    return (s.notna() & (s.astype("string").str.strip() != "")).fillna(False).astype(bool)


def _mask_extravio(df: pd.DataFrame) -> pd.Series:
    texto = _texto(df)
    mask = pd.Series(False, index=df.index)
    for p in PALAVRAS_EXTRAVIO:
        mask |= texto.str.contains(p, regex=False).fillna(False)
    return mask.astype(bool)


def _mask_avaria(df: pd.DataFrame) -> pd.Series:
    texto = _texto(df)
    mask = pd.Series(False, index=df.index)
    for p in PALAVRAS_AVARIA:
        mask |= texto.str.contains(p, regex=False).fillna(False)
    return mask.astype(bool)


def _motivo_de_devolucao(df: pd.DataFrame) -> pd.Series:
    texto = _texto(df)
    mask = pd.Series(False, index=df.index)
    for p in MOTIVOS_DEVOLUCAO:
        mask |= texto.str.contains(p, regex=False).fillna(False)
    return mask.astype(bool)


def motivo_de_devolucao(texto: str) -> str | None:
    t = (texto or "").lower()
    return next((p for p in MOTIVOS_DEVOLUCAO if p in t), None)


def pecas_para_devolucao(df: pd.DataFrame, limite: int = LIMITE_AUSENTES) -> pd.DataFrame:
    return df[(_contagem(df) >= limite).fillna(False) & _motivo_de_devolucao(df)].copy()


def tentativas_a_revisar(df: pd.DataFrame, limite: int = LIMITE_AUSENTES) -> pd.DataFrame:
    """>= limite tentativas, mas o último motivo não é ausência nem recusa."""
    return df[(_contagem(df) >= limite).fillna(False) & ~_motivo_de_devolucao(df)].copy()


# nome original do MVP
peças_para_devolucao = pecas_para_devolucao


def extravios(df: pd.DataFrame) -> pd.DataFrame:
    return df[_mask_extravio(df)].copy()


def insucessos(df: pd.DataFrame, limite: int = LIMITE_AUSENTES) -> pd.DataFrame:
    cont = _contagem(df).fillna(0)
    return df[_tem_problema(df) & (cont < limite) & ~_mask_extravio(df)].copy()


@dataclass
class Justificativa:
    motivo: str
    observacao: str = ""
    reavaliar_em: str = ""
    criada_em: str = ""


def carregar_justificativas(caminho: str | Path) -> dict[str, dict]:
    try:
        dados = json.loads(Path(caminho).read_text(encoding="utf-8"))
        return dados if isinstance(dados, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def salvar_justificativa(caminho: str | Path, awb: str, j: Justificativa) -> dict[str, dict]:
    if not j.motivo.strip():
        raise ValueError("Informe um motivo.")
    dados = carregar_justificativas(caminho)
    if not j.criada_em:
        j.criada_em = datetime.now().isoformat(timespec="seconds")
    dados[str(awb)] = asdict(j)
    Path(caminho).write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
    return dados


def remover_justificativa(caminho: str | Path, awb: str) -> dict[str, dict]:
    dados = carregar_justificativas(caminho)
    dados.pop(str(awb), None)
    Path(caminho).write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
    return dados


def separar_justificadas(df: pd.DataFrame, justificativas: dict[str, dict]) -> tuple[pd.DataFrame, pd.DataFrame]:
    mask = df[AWB_COL].isin(set(justificativas))
    just = df[mask].copy()
    just["motivo_alerta"] = just[AWB_COL].map(lambda a: justificativas[a].get("motivo", ""))
    just["reavaliar_em"] = just[AWB_COL].map(lambda a: justificativas[a].get("reavaliar_em", ""))
    return df[~mask].copy(), just
