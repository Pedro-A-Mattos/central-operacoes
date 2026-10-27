"""Regras de abrangência (quem entrega onde) e conferência de piso.

RN-012 derivação a partir da base · RN-013 overrides manuais · RN-014 tipos de erro.
"""
from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from .comparador import AWB_COL, CIDADE_COL, ZIP_COL

AREA_COL = "Consignee Area"
ENTREGADOR_COL = "Delivery Associate"

LIMIAR_RUIDO = 3
MIN_ENTREGADORES_URBANO = 3
LIMIAR_REGIAO = 5  # mínimo de entregas para valer numa região (calibrado em hold-out; ver docs/CALIBRACAO_REGIAO.md)
MIN_PARTICIPACAO = 0.05  # e pelo menos 5% das entregas da região
MIN_SUPORTE = 20  # região com menos entregas que isto no histórico é "pouco histórico", não "erro provável"

ERRO_CIDADE_AUSENTE = "Cidade ausente"
ERRO_CIDADE_FORA = "Cidade fora da abrangência"
ERRO_SEM_ENTREGADOR = "Sem entregador"
ERRO_FORA_AREA = "Entregador fora da área"
ERRO_SEM_HISTORICO = "Entregador sem histórico"
ERRO_POUCO_HISTORICO = "Região com pouco histórico"
TIPOS_ERRO = [ERRO_FORA_AREA, ERRO_SEM_HISTORICO, ERRO_POUCO_HISTORICO, ERRO_SEM_ENTREGADOR, ERRO_CIDADE_FORA, ERRO_CIDADE_AUSENTE]


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
        """Retorna (conjunto válido, escopo) — escopo 'bairro' ou 'cidade'.
        Chaves de bairro EXATAS (caixa e acento contam): unificar grafias aqui é decisão pendente
        (docs/DECISOES_E_VALIDACAO.md §7) e mudaria CA-007/008. O caminho com mapa já normaliza."""
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
        sem_prazo = dados.get("cidades_sem_prazo")
        return {"por_cidade": dict(dados.get("por_cidade", {})),
                "cidades_ignoradas": list(dados.get("cidades_ignoradas", [])),
                # cidades em que toda peça é pendência, qualquer que seja a data de chegada (regra da tela, não do motor).
                # None = nunca definido (a tela usa o padrão, Unaí); lista vazia = escolha de não ter nenhuma.
                "cidades_sem_prazo": list(sem_prazo) if isinstance(sem_prazo, list) else None}
    except (OSError, json.JSONDecodeError, AttributeError):
        return {"por_cidade": {}, "cidades_ignoradas": [], "cidades_sem_prazo": None}


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
# Estudo / validação por REGIÃO. O mapa região -> entregadores é derivado de um histórico grande
# (ver scripts/gerar_mapa_regiao.py) e guarda, além dos conjuntos válidos, o SUPORTE de cada regra
# (quantas entregas a sustentam) e a lista de entregadores conhecidos. CEP e bairro somam; a
# cidade é o último recurso. Chaves de bairro e cidade são normalizadas (caixa, acento, espaços).
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


def canon_chave(v) -> str | None:
    """Chave de comparação de cidade/bairro: sem acento, minúscula, espaços colapsados.
    'Crispim Santana', 'crispim  santana' e 'Crispim santana' viram a mesma região (auditoria M-05)."""
    s = _txt(v)
    if s is None:
        return None
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s.lower()).strip() or None


def _conjunto_regiao(contagem: dict[str, int], limiar: int, min_participacao: float) -> list[str]:
    """Quem atendeu a região: >= limiar entregas E >= min_participacao do total. O dominante sempre entra
    (a região precisa de ao menos uma pessoa); a baixa confiança dessa regra aparece no SUPORTE."""
    total = sum(contagem.values())
    dominante = sorted(contagem.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
    validos = {e for e, c in contagem.items() if c >= limiar and c / total >= min_participacao}
    validos.add(dominante)
    return sorted(validos)


def _melhor_grafia(grafias: Counter) -> str:
    return sorted(grafias.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]


def derivar_regras_regiao(base: pd.DataFrame, limiar: int = LIMIAR_REGIAO, min_participacao: float = MIN_PARTICIPACAO,
                          min_suporte: int = MIN_SUPORTE) -> dict:
    """Mapa de atendimento por região a partir de um histórico: por CEP, por bairro (cidade|bairro) e por
    cidade. Devolve também o suporte (n de entregas) de cada região e a lista de entregadores vistos."""
    mapa = {"limiar": int(limiar), "min_participacao": float(min_participacao), "min_suporte": int(min_suporte),
            "por_cep": {}, "por_bairro": {}, "por_cidade": {},
            "suporte": {"por_cep": {}, "por_bairro": {}, "por_cidade": {}}, "entregadores": []}
    cols = [c for c in (ZIP_COL, AREA_COL, CIDADE_COL, ENTREGADOR_COL) if c in base.columns]
    if ENTREGADOR_COL not in cols:
        return mapa
    df = base[cols].copy()
    for c in cols:
        df[c] = df[c].map(_txt)
    df = df.dropna(subset=[ENTREGADOR_COL])

    cep_c: dict[str, Counter] = {}
    bai_c: dict[str, Counter] = {}
    bai_g: dict[str, Counter] = {}
    cid_c: dict[str, Counter] = {}
    cid_g: dict[str, Counter] = {}
    for r in df.to_dict("records"):
        e = r[ENTREGADOR_COL]
        cep = canon_cep(r.get(ZIP_COL))
        if cep:
            cep_c.setdefault(cep, Counter())[e] += 1
        cid, bai = r.get(CIDADE_COL), r.get(AREA_COL)
        cc = canon_chave(cid)
        if not cc:
            continue
        cid_c.setdefault(cc, Counter())[e] += 1
        cid_g.setdefault(cc, Counter())[cid] += 1
        bc = canon_chave(bai)
        if bc:
            k = cc + "|" + bc
            bai_c.setdefault(k, Counter())[e] += 1
            bai_g.setdefault(k, Counter())[f"{cid}|{bai}"] += 1

    for chave in sorted(cep_c):
        mapa["por_cep"][chave] = _conjunto_regiao(cep_c[chave], limiar, min_participacao)
        mapa["suporte"]["por_cep"][chave] = sum(cep_c[chave].values())
    for k in sorted(bai_c, key=lambda k: _melhor_grafia(bai_g[k])):
        nome = _melhor_grafia(bai_g[k])
        mapa["por_bairro"][nome] = _conjunto_regiao(bai_c[k], limiar, min_participacao)
        mapa["suporte"]["por_bairro"][nome] = sum(bai_c[k].values())
    for k in sorted(cid_c, key=lambda k: _melhor_grafia(cid_g[k])):
        nome = _melhor_grafia(cid_g[k])
        mapa["por_cidade"][nome] = _conjunto_regiao(cid_c[k], limiar, min_participacao)
        mapa["suporte"]["por_cidade"][nome] = sum(cid_c[k].values())
    mapa["entregadores"] = sorted(set(df[ENTREGADOR_COL]))
    return mapa


def _indexar_mapa(mapa: dict) -> dict:
    """Índice de consulta com chaves normalizadas. Mapas antigos, com grafias duplicadas, viram a UNIÃO.
    Cada entrada é (conjunto de entregadores, suporte|None); o suporte é None em mapas sem 'suporte'."""
    sup = mapa.get("suporte") or {}

    def junta(d, suporte, chave_fn):
        out: dict = {}
        for k, v in (d or {}).items():
            ck = chave_fn(k)
            if ck is None:
                continue
            conj, n = out.get(ck, (set(), None))
            s = (suporte or {}).get(k)
            out[ck] = (conj | set(v), n if s is None else (n or 0) + s)
        return out

    def chave_bairro(k):
        cid, _, bai = str(k).partition("|")
        cc, bc = canon_chave(cid), canon_chave(bai)
        return f"{cc}|{bc}" if cc and bc else None

    conhecidos = mapa.get("entregadores")
    return {"cep": junta(mapa.get("por_cep"), sup.get("por_cep"), canon_cep),
            "bairro": junta(mapa.get("por_bairro"), sup.get("por_bairro"), chave_bairro),
            "cidade": junta(mapa.get("por_cidade"), sup.get("por_cidade"), canon_chave),
            "conhecidos": set(conhecidos) if conhecidos else None,
            "min_suporte": int(mapa.get("min_suporte") or 0)}


def _maior(a, b):
    xs = [x for x in (a, b) if x is not None]
    return max(xs) if xs else None


def _resolver_regiao(idx: dict, cep, bairro, cidade) -> tuple[set[str], str, bool, int | None]:
    """Resolve a regra de uma linha. CEP e bairro SOMAM: vale quem atende o CEP OU o bairro, porque um CEP
    genérico (ex.: o da sede) cobre distritos que o bairro distingue. A cidade só entra quando nenhum dos
    dois tem regra. Retorna (conjunto, escopo, tem_regra, suporte); escopo: cep, bairro, cep+bairro, cidade."""
    c, cc, bc = canon_cep(cep), canon_chave(cidade), canon_chave(bairro)
    do_cep = idx["cep"].get(c) if c else None
    do_bairro = idx["bairro"].get(f"{cc}|{bc}") if cc and bc else None
    if do_cep is not None and do_bairro is not None:
        return do_cep[0] | do_bairro[0], "cep+bairro", True, _maior(do_cep[1], do_bairro[1])
    if do_cep is not None:
        return do_cep[0], "cep", True, do_cep[1]
    if do_bairro is not None:
        return do_bairro[0], "bairro", True, do_bairro[1]
    if cc and cc in idx["cidade"]:
        v, n = idx["cidade"][cc]
        return set(v), "cidade", True, n
    return set(), "regiao", False, None


def _validos_regiao(mapa: dict, cep, bairro, cidade) -> tuple[set[str], str, bool]:
    """Compatibilidade: igual a _resolver_regiao, sem o suporte."""
    v, esc, ok, _ = _resolver_regiao(_indexar_mapa(mapa), cep, bairro, cidade)
    return v, esc, ok


def validar_regiao(df: pd.DataFrame, mapa: dict) -> pd.DataFrame:
    """Modo Validação (tela Estudo de regiões): audita a atribuição de cada linha contra o mapa.
    Aponta 'sem entregador', 'fora da região' e 'região sem regra'."""
    idx = _indexar_mapa(mapa)
    erros = []
    for _, linha in df.iterrows():
        validos, escopo, tem_regra, _sup = _resolver_regiao(idx, linha.get(ZIP_COL), linha.get(AREA_COL), linha.get(CIDADE_COL))
        entregador = _txt(linha.get(ENTREGADOR_COL))
        if not tem_regra:
            d = _erro(linha, ERRO_REGIAO_SEM_REGRA, "Região sem regra no mapeamento; não dá para julgar.", None)
        elif not entregador:
            d = _erro(linha, ERRO_REGIAO_SEM_ENTREGADOR, "Entrega sem entregador atribuído.", validos)
        elif entregador not in validos:
            d = _erro(linha, ERRO_REGIAO_FORA, f"{entregador} não costuma atender esta região.", validos)
        else:
            continue
        d["escopo"] = escopo
        erros.append(d)
    colunas = list(df.columns) + ["tipo_erro", "detalhe", "entregadores_esperados", "escopo"]
    return pd.DataFrame(erros, columns=colunas)


def validar_piso_por_regiao(pendentes: pd.DataFrame, mapa: dict, cidades_ignoradas: list[str] | None = None,
                            overrides: dict | None = None) -> pd.DataFrame:
    """Conferência de piso com o MAPA DE REGIÃO. Ordem de autoridade:
      1. Ajuste manual por cidade (`overrides.por_cidade`): prevalece sobre o mapa (OP-05).
      2. Mapa: CEP e bairro somam; cidade como último recurso.
    Veredito, do mais ao menos firme: 'Entregador fora da área' (regra com suporte suficiente);
    'Região com pouco histórico' (suporte abaixo do mínimo); 'Entregador sem histórico' (nome que não
    aparece no histórico que gerou o mapa: pode ser entregador novo, não necessariamente erro)."""
    ignoradas = set(cidades_ignoradas or [])
    manual = (overrides or {}).get("por_cidade") or {}
    idx = _indexar_mapa(mapa)
    erros = []
    for _, linha in pendentes.iterrows():
        cidade = _txt(linha.get(CIDADE_COL))
        if cidade in ignoradas:
            continue
        entregador = _txt(linha.get(ENTREGADOR_COL))
        origem = "mapa de região"
        if cidade in manual:
            origem = "ajuste manual"
            validos, escopo = set(manual[cidade]), "cidade"
            if not entregador:
                d = _erro(linha, ERRO_SEM_ENTREGADOR, "Peça sem entregador atribuído.", validos)
            elif entregador not in validos:
                d = _erro(linha, ERRO_FORA_AREA, f"{entregador} não está no ajuste manual de {cidade}.", validos)
            else:
                continue
        else:
            validos, escopo, tem_regra, suporte = _resolver_regiao(idx, linha.get(ZIP_COL), linha.get(AREA_COL), linha.get(CIDADE_COL))
            if not tem_regra:
                d = _erro(linha, ERRO_CIDADE_FORA, "Região (CEP/bairro/cidade) sem regra no mapeamento do estudo.", None)
            elif not entregador:
                d = _erro(linha, ERRO_SEM_ENTREGADOR, "Peça sem entregador atribuído.", validos)
            elif entregador in validos:
                continue
            elif idx["conhecidos"] is not None and entregador not in idx["conhecidos"]:
                d = _erro(linha, ERRO_SEM_HISTORICO, f"{entregador} não aparece no histórico que gerou o mapa de região (entregador novo?).", validos)
            elif suporte is not None and idx["min_suporte"] and suporte < idx["min_suporte"]:
                d = _erro(linha, ERRO_POUCO_HISTORICO, f"Região com poucas entregas no histórico ({suporte}); {entregador} não está entre quem atendeu.", validos)
            else:
                d = _erro(linha, ERRO_FORA_AREA, f"{entregador} não costuma atender esta região.", validos)
        d["escopo"] = escopo
        d["origem_regra"] = origem
        erros.append(d)
    colunas = list(pendentes.columns) + ["tipo_erro", "detalhe", "entregadores_esperados", "escopo", "origem_regra"]
    return pd.DataFrame(erros, columns=colunas)
