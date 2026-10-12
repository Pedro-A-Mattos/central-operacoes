"""Regras de abrangência (quem entrega onde) e conferência de piso.

RN-012 derivação a partir da base · RN-013 overrides manuais · RN-014 tipos de erro.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from .comparador import AWB_COL, CIDADE_COL

AREA_COL = "Consignee Area"
ENTREGADOR_COL = "Delivery Associate"

LIMIAR_RUIDO = 3
MIN_ENTREGADORES_URBANO = 3

ERRO_CIDADE_AUSENTE = "Cidade ausente"
ERRO_CIDADE_FORA = "Cidade fora da abrangência"
ERRO_SEM_ENTREGADOR = "Sem entregador"
ERRO_FORA_AREA = "Entregador fora da área"
TIPOS_ERRO = [ERRO_FORA_AREA, ERRO_SEM_ENTREGADOR, ERRO_CIDADE_FORA, ERRO_CIDADE_AUSENTE]


def _txt(v) -> str | None:
    if v is None or (not isinstance(v, str) and pd.isna(v)):
        return None
    s = str(v).strip()
    return s or None


@dataclass
class RegrasAbrangencia:
    por_cidade: dict[str, set[str]] = field(default_factory=dict)
    por_bairro: dict[tuple[str, str], set[str]] = field(default_factory=dict)
    cidades_urbanas: set[str] = field(default_factory=set)
    # origem de cada regra de cidade: "derivada" ou "ajuste manual" (OP-05)
    origem_cidade: dict[str, str] = field(default_factory=dict)

    def entregadores_validos(self, cidade: str, bairro: str | None) -> tuple[set[str], str]:
        """Retorna (conjunto válido, escopo) — escopo 'bairro' ou 'cidade'."""
        if cidade in self.cidades_urbanas and bairro and (cidade, bairro) in self.por_bairro:
            return self.por_bairro[(cidade, bairro)], "bairro"
        return self.por_cidade.get(cidade, set()), "cidade"


def _conjunto_valido(contagem: pd.Series, limiar: int) -> set[str]:
    """Associações com < limiar peças são ruído; o dominante é sempre mantido."""
    if contagem.empty:
        return set()
    validos = set(contagem[contagem >= limiar].index)
    validos.add(contagem.idxmax())
    return validos


def derivar_regras(base: pd.DataFrame, limiar_ruido: int = LIMIAR_RUIDO,
                   min_entregadores_urbano: int = MIN_ENTREGADORES_URBANO) -> RegrasAbrangencia:
    regras = RegrasAbrangencia()
    if CIDADE_COL not in base.columns or ENTREGADOR_COL not in base.columns:
        return regras
    df = base[[CIDADE_COL, ENTREGADOR_COL] + ([AREA_COL] if AREA_COL in base.columns else [])].copy()
    df[CIDADE_COL] = df[CIDADE_COL].map(_txt)
    df[ENTREGADOR_COL] = df[ENTREGADOR_COL].map(_txt)
    if AREA_COL in df.columns:
        df[AREA_COL] = df[AREA_COL].map(_txt)
    df = df.dropna(subset=[CIDADE_COL])
    com_ent = df.dropna(subset=[ENTREGADOR_COL])

    for cidade in df[CIDADE_COL].unique():
        sub = com_ent[com_ent[CIDADE_COL] == cidade]
        contagem = sub[ENTREGADOR_COL].value_counts()
        regras.por_cidade[cidade] = _conjunto_valido(contagem, limiar_ruido)
        regras.origem_cidade[cidade] = "derivada"
        if sub[ENTREGADOR_COL].nunique() >= min_entregadores_urbano:
            regras.cidades_urbanas.add(cidade)
            if AREA_COL in sub.columns:
                for bairro, g in sub.dropna(subset=[AREA_COL]).groupby(AREA_COL):
                    regras.por_bairro[(cidade, bairro)] = _conjunto_valido(
                        g[ENTREGADOR_COL].value_counts(), limiar_ruido)
    return regras


# ---------- overrides (regras_piso.json) ----------

def carregar_overrides(caminho: str | Path) -> dict:
    try:
        dados = json.loads(Path(caminho).read_text(encoding="utf-8"))
        return {"por_cidade": dict(dados.get("por_cidade", {})),
                "cidades_ignoradas": list(dados.get("cidades_ignoradas", []))}
    except (OSError, json.JSONDecodeError, AttributeError):
        return {"por_cidade": {}, "cidades_ignoradas": []}


def salvar_overrides(caminho: str | Path, overrides: dict) -> None:
    Path(caminho).write_text(json.dumps(overrides, ensure_ascii=False, indent=2), encoding="utf-8")


def aplicar_overrides(regras: RegrasAbrangencia, overrides: dict) -> RegrasAbrangencia:
    """RN-013: override por cidade substitui o derivado e força validação por cidade."""
    for cidade, entregadores in (overrides.get("por_cidade") or {}).items():
        regras.por_cidade[cidade] = set(entregadores)
        regras.cidades_urbanas.discard(cidade)
        regras.origem_cidade[cidade] = "ajuste manual"
    return regras


# ---------- validação ----------

def _erro(linha: pd.Series, tipo: str, detalhe: str, esperados: set[str] | None) -> dict:
    d = linha.to_dict()
    d["tipo_erro"] = tipo
    d["detalhe"] = detalhe
    d["entregadores_esperados"] = ", ".join(sorted(esperados)) if esperados else ""
    return d


def validar_piso(pendentes: pd.DataFrame, regras: RegrasAbrangencia,
                 cidades_ignoradas: list[str] | None = None,
                 status_ignorados: list[str] | None = None) -> pd.DataFrame:
    ignoradas = set(cidades_ignoradas or [])
    status_ign = {s.lower() for s in (status_ignorados or [])}
    erros = []
    for _, linha in pendentes.iterrows():
        if status_ign and str(linha.get("Last Scan Status", "")).strip().lower() in status_ign:
            continue
        cidade = _txt(linha.get(CIDADE_COL))
        if cidade in ignoradas:
            continue
        if not cidade:
            erros.append(_erro(linha, ERRO_CIDADE_AUSENTE, "Peça sem cidade de destino.", None))
            continue
        if cidade not in regras.por_cidade:
            erros.append(_erro(linha, ERRO_CIDADE_FORA,
                               f"{cidade} não aparece nas regras de abrangência.", None))
            continue
        entregador = _txt(linha.get(ENTREGADOR_COL))
        bairro = _txt(linha.get(AREA_COL))
        validos, escopo = regras.entregadores_validos(cidade, bairro)
        if not entregador:
            erros.append(_erro(linha, ERRO_SEM_ENTREGADOR,
                               f"Peça de {cidade} sem entregador atribuído.", validos))
            continue
        if entregador not in validos:
            local = f"{bairro} ({cidade})" if escopo == "bairro" else cidade
            erros.append(_erro(linha, ERRO_FORA_AREA,
                               f"{entregador} não costuma entregar em {local}.", validos))
    colunas = list(pendentes.columns) + ["tipo_erro", "detalhe", "entregadores_esperados"]
    return pd.DataFrame(erros, columns=colunas)
