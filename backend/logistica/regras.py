"""Regras de abrangência (quem entrega onde) e conferência de piso.

RN-012 derivação a partir da base · RN-013 overrides manuais · RN-014 tipos de erro.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from .comparador import AWB_COL, CIDADE_COL, ZIP_COL

AREA_COL = "Consignee Area"
ENTREGADOR_COL = "Delivery Associate"

LIMIAR_RUIDO = 3
MIN_ENTREGADORES_URBANO = 3
LIMIAR_REGIAO = 10  # padrão do Modo Estudo (histórico grande, confiança alta)

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


# =====================================================================
# Modo Estudo / Validação por REGIÃO (CEP), independente da conferência
# de piso acima. F1 deriva o mapa região->entregadores; F2 valida uma
# planilha contra esse mapa. Fallback: CEP -> bairro -> cidade.
# =====================================================================

ERRO_REGIAO_FORA = "Entregador fora da região"
ERRO_REGIAO_SEM_ENTREGADOR = "Sem entregador"
ERRO_REGIAO_SEM_REGRA = "Região sem regra conhecida"


def canon_cep(v) -> str | None:
    """Normaliza o CEP para só dígitos (ex.: '38613-394' -> '38613394').
    Mantém como chave estável; devolve None se não houver dígitos."""
    s = _txt(v)
    if s is None:
        return None
    digitos = "".join(ch for ch in s if ch.isdigit())
    return digitos or None


def derivar_regras_regiao(base: pd.DataFrame, limiar: int = LIMIAR_REGIAO) -> dict:
    """F1: mapa de atendimento por região a partir de um histórico grande.
    Guarda por CEP, por bairro (cidade|bairro) e por cidade — todos os
    entregadores com >= limiar entregas, mais o dominante de cada região.
    Permite múltiplos entregadores por região (alta demanda)."""
    cols = [c for c in (ZIP_COL, AREA_COL, CIDADE_COL, ENTREGADOR_COL) if c in base.columns]
    df = base[cols].copy()
    for c in cols:
        df[c] = df[c].map(_txt)
    if ENTREGADOR_COL not in df.columns:
        return {"limiar": int(limiar), "por_cep": {}, "por_bairro": {}, "por_cidade": {}}
    df = df.dropna(subset=[ENTREGADOR_COL])

    por_cep: dict[str, list[str]] = {}
    if ZIP_COL in df.columns:
        d = df.copy()
        d["_cep"] = d[ZIP_COL].map(canon_cep)
        d = d.dropna(subset=["_cep"])
        for cep, g in d.groupby("_cep"):
            validos = _conjunto_valido(g[ENTREGADOR_COL].value_counts(), limiar)
            if validos:
                por_cep[cep] = sorted(validos)

    por_bairro: dict[str, list[str]] = {}
    if AREA_COL in df.columns and CIDADE_COL in df.columns:
        d = df.dropna(subset=[AREA_COL, CIDADE_COL])
        for (cidade, bairro), g in d.groupby([CIDADE_COL, AREA_COL]):
            validos = _conjunto_valido(g[ENTREGADOR_COL].value_counts(), limiar)
            if validos:
                por_bairro[f"{cidade}|{bairro}"] = sorted(validos)

    por_cidade: dict[str, list[str]] = {}
    if CIDADE_COL in df.columns:
        d = df.dropna(subset=[CIDADE_COL])
        for cidade, g in d.groupby(CIDADE_COL):
            validos = _conjunto_valido(g[ENTREGADOR_COL].value_counts(), limiar)
            if validos:
                por_cidade[cidade] = sorted(validos)

    return {"limiar": int(limiar),
            "por_cep": {k: por_cep[k] for k in sorted(por_cep)},
            "por_bairro": {k: por_bairro[k] for k in sorted(por_bairro)},
            "por_cidade": {k: por_cidade[k] for k in sorted(por_cidade)}}


def _validos_regiao(mapa: dict, cep, bairro, cidade) -> tuple[set[str], str, bool]:
    """Resolve a regra para uma linha com fallback CEP -> bairro -> cidade.
    Retorna (conjunto, escopo, tem_regra)."""
    c = canon_cep(cep)
    if c and c in (mapa.get("por_cep") or {}):
        return set(mapa["por_cep"][c]), "cep", True
    b = _txt(bairro)
    ci = _txt(cidade)
    if ci and b and f"{ci}|{b}" in (mapa.get("por_bairro") or {}):
        return set(mapa["por_bairro"][f"{ci}|{b}"]), "bairro", True
    if ci and ci in (mapa.get("por_cidade") or {}):
        return set(mapa["por_cidade"][ci]), "cidade", True
    return set(), "regiao", False


def validar_regiao(df: pd.DataFrame, mapa: dict) -> pd.DataFrame:
    """F2: audita a atribuição de cada linha contra o mapa de regiões.
    Aponta 'sem entregador', 'fora da região' e 'região sem regra'."""
    erros = []
    for _, linha in df.iterrows():
        validos, escopo, tem_regra = _validos_regiao(
            mapa, linha.get(ZIP_COL), linha.get(AREA_COL), linha.get(CIDADE_COL))
        entregador = _txt(linha.get(ENTREGADOR_COL))
        if not tem_regra:
            d = _erro(linha, ERRO_REGIAO_SEM_REGRA, "Região sem regra no mapeamento; não dá para julgar.", None)
            d["escopo"] = escopo
            erros.append(d)
            continue
        if not entregador:
            d = _erro(linha, ERRO_REGIAO_SEM_ENTREGADOR, "Entrega sem entregador atribuído.", validos)
            d["escopo"] = escopo
            erros.append(d)
            continue
        if entregador not in validos:
            d = _erro(linha, ERRO_REGIAO_FORA, f"{entregador} não costuma atender esta região.", validos)
            d["escopo"] = escopo
            erros.append(d)
    colunas = list(df.columns) + ["tipo_erro", "detalhe", "entregadores_esperados", "escopo"]
    return pd.DataFrame(erros, columns=colunas)


def validar_piso_por_regiao(pendentes: pd.DataFrame, mapa: dict,
                            cidades_ignoradas: list[str] | None = None) -> pd.DataFrame:
    """Conferência de piso usando o MAPA DE REGIÃO (CEP->bairro->cidade). Reaproveita
    os MESMOS tipos de erro da conferência de piso para a tela não mudar."""
    ignoradas = set(cidades_ignoradas or [])
    erros = []
    for _, linha in pendentes.iterrows():
        cidade = _txt(linha.get(CIDADE_COL))
        if cidade in ignoradas:
            continue
        validos, escopo, tem_regra = _validos_regiao(
            mapa, linha.get(ZIP_COL), linha.get(AREA_COL), linha.get(CIDADE_COL))
        if not tem_regra:
            d = _erro(linha, ERRO_CIDADE_FORA, "Região (CEP/bairro/cidade) sem regra no mapeamento do estudo.", None)
        else:
            entregador = _txt(linha.get(ENTREGADOR_COL))
            if not entregador:
                d = _erro(linha, ERRO_SEM_ENTREGADOR, "Peça sem entregador atribuído.", validos)
            elif entregador not in validos:
                d = _erro(linha, ERRO_FORA_AREA, f"{entregador} não costuma atender esta região.", validos)
            else:
                continue
        d["escopo"] = escopo
        d["origem_regra"] = "mapa de região"
        erros.append(d)
    colunas = list(pendentes.columns) + ["tipo_erro", "detalhe", "entregadores_esperados", "escopo", "origem_regra"]
    return pd.DataFrame(erros, columns=colunas)
