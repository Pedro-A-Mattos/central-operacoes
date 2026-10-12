"""Carga, filtros globais e de-para entre os relatórios base e atualizado.

Reconstruído a partir da documentação do MVP (docs 03, 04, 05, 09).
Quando o código original estiver disponível, este módulo deve ser substituído
por ele — os testes em tests/test_criterios_aceite.py valem para os dois.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

import pandas as pd

AWB_COL = "Waybill No"
STATUS_COL = "Last Scan Status"
PROBLEMA_COL = "Last Problem Type"
MOTIVO_COL = "Last Problem Reason"
CIDADE_COL = "Consignee City"
CHEGADA_COL = "Arrival Time"

# Força maior no Last Problem Type. A iMile usa pelo menos duas grafias:
# "Ocorrênia FM" (com erro de digitação) e "Force majeure". A detecção é por
# conteúdo (texto sem acento) para cobrir as duas e variações futuras:
#  - contém "force majeure" ou "forca maior"; ou
#  - traz a sigla "fm" como palavra isolada (p.ex. "ocorrenia fm", "fm").
VALORES_FM = {"ocorrênia fm", "ocorrencia fm", "force majeure"}  # mantido p/ referência
_RE_FM = re.compile(r"(?:\bfm\b|force\s*majeure|forca\s+maior)")


def _canon_fm(v) -> str:
    s = unicodedata.normalize("NFKD", str(v)).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s.lower()).strip()


def _serie_eh_fm(serie: pd.Series) -> pd.Series:
    canon = serie.astype("string").map(lambda x: _canon_fm(x) if x is not None else "")
    return canon.map(lambda s: bool(_RE_FM.search(s)))
PALAVRAS_DEVOLUCAO = ("devol", "não recebido", "nao recebido", "recusad", "retorno")


def normalizar_awb(serie: pd.Series) -> pd.Series:
    """RN-001: string, sem sufixo .0, sem espaços nas pontas."""
    return serie.astype("string").str.replace(r"\.0$", "", regex=True).str.strip()


def carregar_relatorio(fonte) -> pd.DataFrame:
    """RN-001/RN-002: lê a primeira planilha, normaliza a AWB, descarta nulas e
    mantém a última ocorrência de AWB repetida."""
    df = pd.read_excel(fonte)
    return normalizar_relatorio(df)


def normalizar_relatorio(df: pd.DataFrame) -> pd.DataFrame:
    if AWB_COL not in df.columns:
        raise ValueError(f"Coluna obrigatória ausente: '{AWB_COL}'")
    df = df.copy()
    df[AWB_COL] = normalizar_awb(df[AWB_COL])
    df.loc[df[AWB_COL] == "", AWB_COL] = pd.NA
    df = df.dropna(subset=[AWB_COL])
    df = df.drop_duplicates(subset=[AWB_COL], keep="last")
    return df.reset_index(drop=True)


def aplicar_filtro_descarregado(df: pd.DataFrame, ligado: bool) -> pd.DataFrame:
    """RN-010: opcional, padrão desligado."""
    if not ligado or STATUS_COL not in df.columns:
        return df
    st = df[STATUS_COL].astype("string").str.strip().str.lower()
    return df[~(st == "descarregado").fillna(False)].reset_index(drop=True)


# Grafias de "não recebido" aceitas (com e sem acento).
VALORES_NAO_RECEBIDO = {"não recebido", "nao recebido"}


def aplicar_filtro_nao_recebido(df: pd.DataFrame, ligado: bool) -> pd.DataFrame:
    """RN-012: opcional, padrão ligado. Remove de toda a análise as encomendas
    com 'não recebido' no Last Scan Status OU no Last Problem Type (as duas
    grafias, com e sem acento). Espelha o filtro de descarregado, mas cobre
    também o tipo de problema (decisão do usuário em 2026-10-12)."""
    if not ligado:
        return df
    mask = pd.Series(False, index=df.index)
    for col in (STATUS_COL, PROBLEMA_COL):
        if col in df.columns:
            c = df[col].astype("string").str.strip().str.lower()
            mask = mask | c.isin(VALORES_NAO_RECEBIDO).fillna(False)
    return df[~mask].reset_index(drop=True)


def remover_fm(df: pd.DataFrame) -> pd.DataFrame:
    """RN-008: remove força maior de toda a análise (sempre). Reconhece as duas
    grafias da iMile — 'Ocorrênia FM' e 'Force majeure' — e variações."""
    if PROBLEMA_COL not in df.columns:
        return df
    return df[~_serie_eh_fm(df[PROBLEMA_COL]).fillna(False)].reset_index(drop=True)


def separar_fora_jurisdicao(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """RN-009: cidade nula/vazia => fora da jurisdição (não entra em indicadores)."""
    if CIDADE_COL not in df.columns:
        return df, df.iloc[0:0]
    cidade = df[CIDADE_COL].astype("string").str.strip()
    fora = cidade.isna() | (cidade == "")
    return df[~fora].reset_index(drop=True), df[fora].reset_index(drop=True)


def dias_chegada_disponiveis(df: pd.DataFrame) -> list[str]:
    if CHEGADA_COL not in df.columns:
        return []
    datas = pd.to_datetime(df[CHEGADA_COL], errors="coerce").dropna()
    return sorted({d.strftime("%Y-%m-%d") for d in datas})


def filtrar_por_dias_chegada(df: pd.DataFrame, dias: list[str] | None) -> pd.DataFrame:
    """RN-011: vazio = todos."""
    if not dias or CHEGADA_COL not in df.columns:
        return df
    datas = pd.to_datetime(df[CHEGADA_COL], errors="coerce").dt.strftime("%Y-%m-%d")
    return df[datas.isin(set(dias)).fillna(False)].reset_index(drop=True)


def _texto_problema(df: pd.DataFrame) -> pd.Series:
    tipo = df[PROBLEMA_COL].astype("string").fillna("") if PROBLEMA_COL in df else pd.Series("", index=df.index)
    motivo = df[MOTIVO_COL].astype("string").fillna("") if MOTIVO_COL in df else pd.Series("", index=df.index)
    return (tipo + " " + motivo).str.lower()


def _tem_indicio_devolucao(df: pd.DataFrame) -> pd.Series:
    """RN-005: heurística textual (sugestão, não fato)."""
    texto = _texto_problema(df)
    mask = pd.Series(False, index=df.index)
    for palavra in PALAVRAS_DEVOLUCAO:
        mask |= texto.str.contains(palavra, regex=False).fillna(False)
    return mask.astype(bool)


@dataclass
class ResultadoComparacao:
    pendentes: pd.DataFrame
    saiu_entregue: pd.DataFrame
    saiu_devolucao: pd.DataFrame
    novas: pd.DataFrame
    mudou_status: pd.DataFrame
    resumo: dict = field(default_factory=dict)


def comparar(base: pd.DataFrame, ultima: pd.DataFrame) -> ResultadoComparacao:
    """RN-003/004/006/007: de-para por presença/ausência da AWB."""
    base_ids = set(base[AWB_COL])
    ult_ids = set(ultima[AWB_COL])

    pendentes = ultima.copy()
    novas = ultima[~ultima[AWB_COL].isin(base_ids)].copy()
    saiu = base[~base[AWB_COL].isin(ult_ids)].copy()
    mask_dev = _tem_indicio_devolucao(saiu)
    saiu_devolucao = saiu[mask_dev].copy()
    saiu_entregue = saiu[~mask_dev].copy()

    linhas = []
    em_ambas = base_ids & ult_ids
    if STATUS_COL in base.columns and STATUS_COL in ultima.columns and em_ambas:
        sb_map = base.set_index(AWB_COL)[STATUS_COL]
        su_map = ultima.set_index(AWB_COL)[STATUS_COL]
        for awb in ultima[AWB_COL]:
            if awb not in em_ambas:
                continue
            sb, su = sb_map.get(awb), su_map.get(awb)
            if (pd.isna(sb) != pd.isna(su)) or (str(sb) != str(su)):
                linhas.append({AWB_COL: awb,
                               "status_base": None if pd.isna(sb) else sb,
                               "status_ultima": None if pd.isna(su) else su})
    mudou_status = pd.DataFrame(linhas, columns=[AWB_COL, "status_base", "status_ultima"])

    resumo = {
        "base_total": len(base),
        "ultima_total": len(ultima),
        "pendentes": len(pendentes),
        "saiu_entregue": len(saiu_entregue),
        "saiu_devolucao": len(saiu_devolucao),
        "novas": len(novas),
        "mudou_status": len(mudou_status),
    }
    return ResultadoComparacao(pendentes, saiu_entregue, saiu_devolucao, novas, mudou_status, resumo)
