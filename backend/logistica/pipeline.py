"""Orquestração do pipeline (equivalente ao topo do app.py do MVP) e
serialização no contrato JSON consumido pela interface.

Ordem preservada (doc 04): descarregado (opcional) -> não recebido (opcional) ->
FM (sempre) -> fora da jurisdição (sempre) -> comparar -> derivar regras + overrides -> validar piso.
"""
from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime

import pandas as pd

from . import comparador as cmp
from . import excecoes as exc
from . import metricas as met
from . import regras as rg

VERSAO_CONTRATO = 2

# Campos transmitidos para a interface (nomes originais da iMile).
COLUNAS = [
    "Waybill No", "Reference No", "Last Scan Status", "Last Problem Type",
    "Last Problem Reason", "Last Problem Date", "Consignee City", "Consignee Area",
    "Consignee Address", "Consignee Zip Code", "Delivery Associate", "Delivery Count",
    "Delivery Time", "Arrival Time", "Waybill Hold Time", "Estimated Delivery Time",
    "Dispatch Station", "Consignee Route Code", "Sign Date", "Consignee Latitude", "Consignee Longitude",
]
COLUNAS_USADAS_PELA_LOGICA = [
    ("Waybill No", True, "Código da encomenda (AWB) — chave da comparação"),
    ("Consignee City", False, "Cidade — sem ela a encomenda fica fora da jurisdição"),
    ("Delivery Associate", False, "Entregador — usado na conferência de piso e no desempenho"),
    ("Consignee Area", False, "Bairro — conferência de piso em cidades com muitos entregadores"),
    ("Last Scan Status", False, "Status — mudanças de status e filtros de descarregado e não recebido"),
    ("Last Problem Type", False, "Tipo do problema — força maior, exceções, devoluções"),
    ("Last Problem Reason", False, "Motivo do problema — indício de devolução e extravio"),
    ("Delivery Count", False, "Tentativas de entrega — regra de devolução (3 ou mais)"),
    ("Arrival Time", False, "Chegada ao galpão — faixas de tempo e filtro de dias"),
    ("Delivery Time", False, "Saída para entrega — tempo em rota"),
    ("Sign Date", False, "Data de assinatura — entrega confirmada"),
]


@dataclass
class Parametros:
    ignorar_descarregado: bool = True  # padrão ligado desde 2026-10-11 (pedido do usuário)
    ignorar_nao_recebido: bool = True  # padrão ligado desde 2026-10-12 (pedido do usuário)
    limiar_ruido: int = rg.LIMIAR_RUIDO
    cidades_ignoradas: list[str] = field(default_factory=list)
    overrides: dict = field(default_factory=lambda: {"por_cidade": {}, "cidades_ignoradas": []})
    referencia_backlog: pd.Timestamp | None = None
    mapa_regiao: dict | None = None  # quando presente, a conferência de piso valida por região (CEP)


def _valor(v):
    if v is None:
        return None
    if isinstance(v, (pd.Timestamp, datetime)):
        return None if pd.isna(v) else v.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(v, bool):
        return str(v)
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return None if math.isnan(v) else (int(v) if v.is_integer() else v)
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(v, "item"):
        return v.item()
    s = str(v)
    return s if s.strip() != "" else None


def _registros(df: pd.DataFrame) -> list[dict]:
    cols = [c for c in COLUNAS if c in df.columns]
    return [{c: _valor(r[c]) for c in cols} for _, r in df[cols].iterrows()]


# ---------- Passo 2 da importação: validação de um arquivo ----------

def validar_arquivo(df_bruto: pd.DataFrame, nome: str) -> dict:
    problemas, avisos = [], []
    colunas = []
    for col, obrig, papel in COLUNAS_USADAS_PELA_LOGICA:
        presente = col in df_bruto.columns
        colunas.append({"coluna": col, "obrigatoria": obrig, "presente": presente, "papel": papel})
        if not presente and obrig:
            problemas.append({
                "titulo": "Falta a coluna do código da encomenda",
                "significado": "Sem a coluna 'Waybill No' não é possível comparar os relatórios.",
                "acao": "Exporte novamente o relatório Dispatch completo, sem remover colunas."})
        elif not presente:
            avisos.append(f"Coluna '{col}' não encontrada: {papel.split(' — ')[1] if ' — ' in papel else papel} ficará indisponível.")
    info = {"nome": nome, "linhas": int(len(df_bruto)), "colunas_total": int(len(df_bruto.columns)),
            "colunas": colunas, "problemas": problemas, "avisos": avisos,
            "sem_awb": 0, "duplicadas": 0, "validas": 0, "chegada_min": None, "chegada_max": None, "previa": []}
    if problemas:
        return info
    awb = cmp.normalizar_awb(df_bruto[cmp.AWB_COL])
    info["sem_awb"] = int((awb.isna() | (awb == "")).sum())
    norm = cmp.normalizar_relatorio(df_bruto)
    info["validas"] = int(len(norm))
    info["duplicadas"] = int(len(df_bruto) - info["sem_awb"] - len(norm))
    if info["sem_awb"]:
        avisos.append(f"{info['sem_awb']} linha(s) sem código da encomenda serão descartadas.")
    if info["duplicadas"]:
        avisos.append(f"{info['duplicadas']} código(s) repetido(s): será mantido o registro de evento mais recente de cada um (em empate, a última linha).")
    if cmp.CHEGADA_COL in norm.columns:
        ch = cmp.para_data(norm[cmp.CHEGADA_COL]).dropna()
        if len(ch):
            info["chegada_min"] = ch.min().strftime("%Y-%m-%d %H:%M:%S")
            info["chegada_max"] = ch.max().strftime("%Y-%m-%d %H:%M:%S")
    info["previa"] = _registros(norm.head(5))
    ref, origem = met.referencia_do_relatorio(nome, norm)
    info["referencia_sugerida"] = None if ref is None else ref.strftime("%Y-%m-%d %H:%M:%S")
    info["referencia_origem"] = origem
    info["qualidade"] = qualidade(norm)
    return info


def _canon(v) -> str:
    s = unicodedata.normalize("NFKD", str(v)).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s.lower()).strip()


def _grafias(df: pd.DataFrame, col: str, grupo: str | None) -> list[list[str]]:
    """Grupos de grafias do mesmo valor (caixa, acento, espaços). Opera nos pares ÚNICOS (grupo, valor): o
    laço por linha com iterrows custava ~80% da validação de um arquivo de 20 mil linhas."""
    if col not in df.columns:
        return []
    vals = df[col]
    ok = (vals.notna() & (vals.astype("string").str.strip() != "")).fillna(False).astype(bool)
    if grupo and grupo in df.columns:
        g = df[grupo].astype("string").str.strip().fillna("")
    else:
        g = pd.Series("", index=df.index, dtype="string")
    pares = pd.DataFrame({"g": g[ok].astype(str), "v": vals[ok].astype(str)}).drop_duplicates()
    mapa: dict[str, set[str]] = {}
    for gg, vv in zip(pares["g"], pares["v"]):
        mapa.setdefault(gg + "|" + _canon(vv), set()).add(vv)
    return [sorted(v) for k, v in sorted(mapa.items()) if len(v) > 1]


def _tem_texto(s: pd.Series) -> pd.Series:
    return (s.notna() & (s.astype("string").str.strip() != "")).fillna(False).astype(bool)


def qualidade(norm: pd.DataFrame) -> list[dict]:
    """Checagens de qualidade exibidas na importação. Só informam: nada é corrigido."""
    out = []
    def add(codigo, titulo, n, impacto, exemplos=None, tom="atencao"):
        if n:
            out.append({"codigo": codigo, "titulo": titulo, "n": int(n), "impacto": impacto,
                        "exemplos": exemplos or [], "tom": tom})
    g = _grafias(norm, rg.AREA_COL, cmp.CIDADE_COL)
    add("grafia_bairro", "bairros escritos de formas diferentes", len(g),
        "Na conferência por bairro, cada grafia vira um bairro separado com regra própria.",
        [" / ".join(x) for x in g[:3]])
    g = _grafias(norm, cmp.CIDADE_COL, None)
    add("grafia_cidade", "cidades escritas de formas diferentes", len(g),
        "Cada grafia vira uma cidade separada nos indicadores e na conferência.", [" / ".join(x) for x in g[:3]])
    g = _grafias(norm, rg.ENTREGADOR_COL, None)
    add("grafia_entregador", "entregadores com nomes escritos de formas diferentes", len(g),
        "O desempenho de uma mesma pessoa fica dividido.", [" / ".join(x) for x in g[:3]])
    tem = lambda c: norm[c].notna() & (norm[c].astype("string").str.strip() != "") if c in norm.columns else pd.Series(False, index=norm.index)
    com_cidade = tem(cmp.CIDADE_COL)
    add("sem_cidade", "linhas sem cidade de destino", int((~com_cidade).sum()),
        "Ficam em “Fora da jurisdição” e não entram em nenhum indicador.", tom="info")
    if cmp.CHEGADA_COL in norm.columns:
        add("sem_chegada", "linhas sem data de chegada válida",
            int(cmp.para_data(norm[cmp.CHEGADA_COL]).isna().sum()),
            "Ficam fora das faixas de tempo de espera e do filtro por dia.")
    cols_data = [c for c in met.COLUNAS_EVENTO if c in norm.columns]
    invalidas = sum(int((_tem_texto(norm[c]) & cmp.para_data(norm[c]).isna()).sum()) for c in cols_data)
    add("datas_invalidas", "datas em formato não reconhecido", invalidas,
        "Ficam sem data: afetam faixas de espera, tempo em rota e a data de referência. Aceitos: aaaa-mm-dd hh:mm:ss e dd/mm/aaaa hh:mm.")
    add("sem_entregador", "linhas com cidade e sem entregador", int((com_cidade & ~tem(rg.ENTREGADOR_COL)).sum()),
        "Aparecem como “Sem entregador” na conferência de piso.")
    add("sem_bairro", "linhas com cidade e sem bairro", int((com_cidade & ~tem(rg.AREA_COL)).sum()),
        "Nas cidades conferidas por bairro, são conferidas pela regra da cidade.", tom="info")
    add("entregue_confirmada", "encomendas já constam como entregues", int(met.entrega_confirmada(norm).sum()),
        "Se este for o relatório atualizado, elas seguem contadas como pendentes (regra RN-003).", tom="info")
    return out


def _ultimo_evento(df: pd.DataFrame) -> pd.Timestamp | None:
    datas = [cmp.para_data(df[c]).max() for c in met.COLUNAS_EVENTO if c in df.columns]
    datas = [d for d in datas if not pd.isna(d)]
    return max(datas) if datas else None


def indicio_ordem(base: pd.DataFrame, atual: pd.DataFrame) -> dict:
    """OP-07 (alerta, nunca troca a ordem sozinho). Auditoria H-02: a ordem vem das DATAS.
    O relatório mais novo registra o evento mais recente; se a base tem evento posterior ao do
    atualizado, os arquivos provavelmente estão invertidos. O volume NÃO serve de sinal: o
    atualizado costuma crescer (chegadas novas) e a regra antiga acusava o par correto e deixava
    passar o invertido. Sem datas nos dois lados, cai na comparação de códigos (sinal fraco)."""
    b, a = set(base[cmp.AWB_COL]), set(atual[cmp.AWB_COL])
    so_atual, so_base = len(a - b), len(b - a)
    ev_b, ev_a = _ultimo_evento(base), _ultimo_evento(atual)
    if ev_b is not None and ev_a is not None:
        suspeito = ev_b > ev_a
    else:
        suspeito = so_atual > so_base and len(a) > len(b)
    fmt = lambda d: None if d is None else d.strftime("%Y-%m-%d %H:%M:%S")
    return {"so_no_atual": so_atual, "so_na_base": so_base, "em_ambos": len(a & b),
            "linhas_base": len(b), "linhas_atual": len(a), "possivel_inversao": bool(suspeito),
            "evento_base": fmt(ev_b), "evento_atual": fmt(ev_a)}


# ---------- Análise completa ----------

def _palavra_devolucao(texto: str) -> str | None:
    t = (texto or "").lower()
    for p in cmp.PALAVRAS_DEVOLUCAO:
        if p in t:
            return p
    return None


_NR = {"não recebido", "nao recebido"}


def _nao_recebido_com_entrega(ult: pd.DataFrame) -> list[dict]:
    """Linhas 'não recebido' (status OU tipo de problema) que têm indício de
    entrega: status de entrega/assinatura (entrega_confirmada) OU Delivery Time
    preenchido. Calculado do atual bruto (antes dos filtros opcionais)."""
    if ult is None or not len(ult):
        return []
    st = ult.get(cmp.STATUS_COL)
    pt = ult.get(cmp.PROBLEMA_COL)
    st_l = st.astype("string").str.strip().str.lower() if st is not None else pd.Series("", index=ult.index)
    pt_l = pt.astype("string").str.strip().str.lower() if pt is not None else pd.Series("", index=ult.index)
    eh_nr = st_l.isin(_NR).fillna(False) | pt_l.isin(_NR).fillna(False)
    sub = ult[eh_nr]
    if not len(sub):
        return []
    confirmada = met.entrega_confirmada(sub)
    dt = cmp.para_data(sub["Delivery Time"]) if "Delivery Time" in sub.columns else pd.Series(pd.NaT, index=sub.index)
    tem_dt = dt.notna()
    out = []
    for i, (_, linha) in enumerate(sub.iterrows()):
        conf = bool(confirmada.iloc[i])
        tdt = bool(tem_dt.iloc[i])
        if not (conf or tdt):
            continue
        out.append({"dados": {c: _valor(linha[c]) for c in COLUNAS if c in sub.columns},
                    "categoria": "Com Delivery Time" if tdt else "Sem Delivery Time",
                    "confirmada": conf})
    return out


CAT_PROVAVEL, CAT_DEVOLUCAO, CAT_JA_ENTREGUE, CAT_OCORRENCIA = "provavel_entrega", "possivel_devolucao", "ja_entregue", "saiu_com_ocorrencia"


def classificar_saidas(saiu: pd.DataFrame) -> pd.Series:
    """Categoria de cada AWB que SAIU do relatório (auditoria C-01 e M-01). Do mais ao menos específico:
      ja_entregue          já constava entregue (status/assinatura) na base: sair é só a purga do relatório, não progresso;
      possivel_devolucao   palavra de devolução OU 3+ tentativas com último motivo de ausência/recusa;
      saiu_com_ocorrencia  extravio ou avaria no último problema: sumir não prova entrega;
      provavel_entrega     o resto: peça aberta que deixou o relatório (inferido; o relatório não confirma)."""
    cat = pd.Series(CAT_PROVAVEL, index=saiu.index, dtype="object")
    if saiu.empty:
        return cat
    ocorrencia = exc._mask_extravio(saiu) | exc._mask_avaria(saiu)
    devolucao = cmp._tem_indicio_devolucao(saiu) | ((exc._contagem(saiu) >= exc.LIMITE_AUSENTES).fillna(False) & exc._motivo_de_devolucao(saiu))
    cat[ocorrencia] = CAT_OCORRENCIA
    cat[devolucao] = CAT_DEVOLUCAO
    cat[met.entrega_confirmada(saiu)] = CAT_JA_ENTREGUE
    return cat


def filtrar_relatorios(base: pd.DataFrame, ult: pd.DataFrame, ignorar_descarregado: bool, ignorar_nao_recebido: bool) -> dict:
    """Filtros globais, aplicados de forma SIMÉTRICA (auditoria H-03). Cada filtro age por relatório
    (descarregado, não recebido, força maior, sem cidade); uma peça retirada de UM deles também sai do OUTRO.
    Sem isso, uma peça que continua no atualizado mas virou FM/descarregado/etc. "sumia" e era contada como
    entrega. `cruzadas_*` contam as peças retiradas só por causa do outro relatório."""
    b1 = cmp.aplicar_filtro_descarregado(base, ignorar_descarregado)
    u1 = cmp.aplicar_filtro_descarregado(ult, ignorar_descarregado)
    b1b = cmp.aplicar_filtro_nao_recebido(b1, ignorar_nao_recebido)
    u1b = cmp.aplicar_filtro_nao_recebido(u1, ignorar_nao_recebido)
    b2, u2 = cmp.remover_fm(b1b), cmp.remover_fm(u1b)
    base_f, base_fora = cmp.separar_fora_jurisdicao(b2)
    ult_f, ult_fora = cmp.separar_fora_jurisdicao(u2)
    excluir = (set(base[cmp.AWB_COL]) - set(base_f[cmp.AWB_COL])) | (set(ult[cmp.AWB_COL]) - set(ult_f[cmp.AWB_COL]))
    cruz_b = base_f[cmp.AWB_COL].isin(excluir)
    cruz_u = ult_f[cmp.AWB_COL].isin(excluir)
    ids = sorted(set(base_f.loc[cruz_b, cmp.AWB_COL]) | set(ult_f.loc[cruz_u, cmp.AWB_COL]))
    return {"b1": b1, "u1": u1, "b1b": b1b, "u1b": u1b, "b2": b2, "u2": u2,
            "base_f": base_f[~cruz_b].reset_index(drop=True), "ult_f": ult_f[~cruz_u].reset_index(drop=True),
            "base_fora": base_fora, "ult_fora": ult_fora,
            "cruzadas_base": int(cruz_b.sum()), "cruzadas_atual": int(cruz_u.sum()), "cruzadas_ids": ids}


def analisar(base_bruto: pd.DataFrame, atual_bruto: pd.DataFrame, p: Parametros,
             justificativas: dict | None = None, nomes: tuple[str, str] = ("base", "atual")) -> dict:
    base = cmp.normalizar_relatorio(base_bruto)
    ult = cmp.normalizar_relatorio(atual_bruto)
    if p.referencia_backlog is not None:
        ref, ref_origem = p.referencia_backlog, "definida"
    else:
        ref, ref_origem = met.referencia_do_relatorio(nomes[1], ult)
        if ref is None:
            ref, ref_origem = pd.Timestamp.now().floor("s"), "relogio"

    fl = filtrar_relatorios(base, ult, p.ignorar_descarregado, p.ignorar_nao_recebido)
    b1, u1, b1b, u1b, b2, u2 = fl["b1"], fl["u1"], fl["b1b"], fl["u1b"], fl["b2"], fl["u2"]
    base_f, ult_f, base_fora, ult_fora = fl["base_f"], fl["ult_f"], fl["base_fora"], fl["ult_fora"]

    res = cmp.comparar(base_f, ult_f)
    overrides = p.overrides or {"por_cidade": {}, "cidades_ignoradas": []}
    regras = rg.aplicar_overrides(rg.derivar_regras(base_f, p.limiar_ruido), overrides)
    ignoradas = list(dict.fromkeys(list(overrides.get("cidades_ignoradas", [])) + list(p.cidades_ignoradas)))
    usar_regiao = bool(p.mapa_regiao and (p.mapa_regiao.get("por_cep") or p.mapa_regiao.get("por_bairro") or p.mapa_regiao.get("por_cidade")))
    if usar_regiao:
        erros = rg.validar_piso_por_regiao(res.pendentes, p.mapa_regiao, ignoradas, overrides)
    else:
        erros = rg.validar_piso(res.pendentes, regras, ignoradas)

    pend = res.pendentes.copy()
    classe = met.classificar(pend)
    dias = met.calcular_backlog_dias(pend, ref)
    faixa = met.faixa_backlog_por_linha(pend, ref)
    em_rota = met.minutos_em_rota(pend, ref)
    confirmada = met.entrega_confirmada(pend)
    reroteadas = met.reroteada(pend)
    base_ids = set(base_f[cmp.AWB_COL])
    ent_base = dict(zip(base_f[cmp.AWB_COL], base_f.get(rg.ENTREGADOR_COL, pd.Series(dtype=object))))
    mudou = {r[cmp.AWB_COL]: (r["status_base"], r["status_ultima"]) for _, r in res.mudou_status.iterrows()}
    status_base = dict(zip(base_f[cmp.AWB_COL], base_f.get(cmp.STATUS_COL, pd.Series(dtype=object))))
    erro_por_awb = {r[cmp.AWB_COL]: r for _, r in erros.iterrows()}
    dev_ids = set(exc.pecas_para_devolucao(pend)[cmp.AWB_COL])
    ext_ids = set(exc.extravios(pend)[cmp.AWB_COL])
    ins_ids = set(exc.insucessos(pend)[cmp.AWB_COL])
    rev_ids = set(exc.tentativas_a_revisar(pend)[cmp.AWB_COL])
    avr_ids = set(exc.avarias(pend)[cmp.AWB_COL])

    atual = []
    for i, reg in enumerate(_registros(pend)):
        awb = reg[cmp.AWB_COL]
        d = {"dados": reg}
        d["nova"] = awb not in base_ids
        d["classe_operacional"] = classe.iloc[i]
        d["backlog_dias"] = None if pd.isna(dias.iloc[i]) else math.floor(float(dias.iloc[i]) * 100 + 0.5) / 100
        d["faixa_backlog"] = None if pd.isna(faixa.iloc[i]) else faixa.iloc[i]
        d["em_rota_min"] = None if pd.isna(em_rota.iloc[i]) else int(em_rota.iloc[i])
        d["entrega_confirmada"] = bool(confirmada.iloc[i])
        d["reroteada"] = bool(reroteadas.iloc[i])
        d["status_base"] = _valor(status_base.get(awb)) if awb in base_ids else None
        d["mudou_status"] = awb in mudou
        d["entregador_base"] = _valor(ent_base.get(awb)) if awb in base_ids else None
        e = erro_por_awb.get(awb)
        if e is not None:
            cidade = reg.get(cmp.CIDADE_COL)
            bairro = reg.get(rg.AREA_COL)
            if usar_regiao:
                escopo = e.get("escopo", "cidade")
                origem = e.get("origem_regra", "mapa de região")
            else:
                _, escopo = regras.entregadores_validos(cidade, bairro) if cidade else (set(), "cidade")
                origem = regras.origem_cidade.get(cidade, "sem regra")
            d["erro_piso"] = {"tipo": e["tipo_erro"], "detalhe": e["detalhe"],
                              "esperados": [x for x in e["entregadores_esperados"].split(", ") if x],
                              "escopo": escopo,
                              "origem_regra": origem}
        else:
            d["erro_piso"] = None
        tipos = []
        if awb in dev_ids: tipos.append("devolucao")
        if awb in ext_ids: tipos.append("extravio")
        if awb in ins_ids: tipos.append("insucesso")
        if awb in rev_ids: tipos.append("revisar_tentativas")
        if awb in avr_ids: tipos.append("avaria")
        d["excecoes"] = tipos
        d["motivo_devolucao"] = exc.motivo_de_devolucao(f"{reg.get(cmp.PROBLEMA_COL) or ''} {reg.get(cmp.MOTIVO_COL) or ''}")
        atual.append(d)

    saiu = base_f[~base_f[cmp.AWB_COL].isin(set(ult_f[cmp.AWB_COL]))]
    cats = classificar_saidas(saiu)
    sairam = []
    for reg, cat in zip(_registros(saiu), cats.tolist()):
        txt = f"{reg.get(cmp.PROBLEMA_COL) or ''} {reg.get(cmp.MOTIVO_COL) or ''}"
        indicio = _palavra_devolucao(txt) or (exc.motivo_de_devolucao(txt) if cat == CAT_DEVOLUCAO else None)
        sairam.append({"dados": reg, "categoria": cat, "indicio": indicio})
    n_cat = cats.value_counts()
    resumo = {**res.resumo, "saiu_entregue": int(n_cat.get(CAT_PROVAVEL, 0)), "saiu_devolucao": int(n_cat.get(CAT_DEVOLUCAO, 0)),
              "saiu_ja_entregue": int(n_cat.get(CAT_JA_ENTREGUE, 0)), "saiu_com_ocorrencia": int(n_cat.get(CAT_OCORRENCIA, 0))}

    regras_out = {
        "por_cidade": {c: {"entregadores": sorted(v), "origem": regras.origem_cidade.get(c, "derivada"),
                           "urbana": c in regras.cidades_urbanas} for c, v in sorted(regras.por_cidade.items())},
        "por_bairro": [{"cidade": c, "bairro": b, "entregadores": sorted(v)}
                       for (c, b), v in sorted(regras.por_bairro.items())],
        "cidades_ignoradas": ignoradas,
    }

    # "Não recebido, com indício de entrega": calculado do ATUAL bruto (antes dos
    # filtros opcionais), senão o filtro de não recebido esvaziaria a análise.
    nr_entregue = _nao_recebido_com_entrega(ult)

    return {
        "versao": VERSAO_CONTRATO,
        "motor": "python",
        "gerado_em": datetime.now().isoformat(timespec="seconds"),
        "referencia_backlog": ref.strftime("%Y-%m-%d %H:%M:%S"),
        "referencia_origem": ref_origem,
        "arquivos": {"base": nomes[0], "atual": nomes[1]},
        "parametros": {"ignorar_descarregado": p.ignorar_descarregado,
                       "ignorar_nao_recebido": p.ignorar_nao_recebido, "limiar_ruido": p.limiar_ruido,
                       "min_entregadores_urbano": rg.MIN_ENTREGADORES_URBANO,
                       "limite_tentativas": exc.LIMITE_AUSENTES, "cidades_ignoradas": ignoradas,
                       "motivos_devolucao": list(exc.MOTIVOS_DEVOLUCAO)},
        "etapas": {
            "base_lidas": len(base), "atual_lidas": len(ult),
            "descarregado_base": len(base) - len(b1), "descarregado_atual": len(ult) - len(u1),
            "nao_recebido_base": len(b1) - len(b1b), "nao_recebido_atual": len(u1) - len(u1b),
            "fm_base": len(b1b) - len(b2), "fm_atual": len(u1b) - len(u2),
            "fora_base": len(base_fora), "fora_atual": len(ult_fora),
            "cruzadas_base": fl["cruzadas_base"], "cruzadas_atual": fl["cruzadas_atual"],
        },
        "removidas": {
            "fm": sorted(set(b1b[cmp.AWB_COL]) - set(b2[cmp.AWB_COL]) | set(u1b[cmp.AWB_COL]) - set(u2[cmp.AWB_COL])),
            "descarregado": sorted(set(base[cmp.AWB_COL]) - set(b1[cmp.AWB_COL]) | set(ult[cmp.AWB_COL]) - set(u1[cmp.AWB_COL])),
            "nao_recebido": sorted(set(b1[cmp.AWB_COL]) - set(b1b[cmp.AWB_COL]) | set(u1[cmp.AWB_COL]) - set(u1b[cmp.AWB_COL])),
            "cruzadas": fl["cruzadas_ids"],
        },
        "resumo": resumo,
        "entregues_confirmadas": int(confirmada.sum()),
        "ordem": indicio_ordem(base, ult),
        "atual": atual,
        "sairam": sairam,
        "mudou_status": [{"awb": k, "status_base": _valor(v[0]), "status_atual": _valor(v[1])} for k, v in mudou.items()],
        "fora": {"base": _registros(base_fora), "atual": _registros(ult_fora)},
        "nao_recebido_entregue": nr_entregue,
        "regras": regras_out,
        "dias_chegada": cmp.dias_chegada_disponiveis(ult_f),
        "dias_chegada_entregadores": sorted(set(cmp.dias_chegada_disponiveis(base_f)) | set(cmp.dias_chegada_disponiveis(ult_f))),
        "desempenho": desempenho(base_f, ult_f, []),
        "justificativas": justificativas or {},
    }


def desempenho(base_f: pd.DataFrame, ult_f: pd.DataFrame, dias: list[str]) -> dict:
    """Aba Entregadores: progresso sobre as peças ABERTAS do entregador na base (C-01); o filtro de dias
    recalcula a comparação (RN-011). As já entregues na base ficam fora do universo e aparecem em `ja_entregues`."""
    b = cmp.filtrar_por_dias_chegada(base_f, dias)
    u = cmp.filtrar_por_dias_chegada(ult_f, dias)
    saiu = b[~b[cmp.AWB_COL].isin(set(u[cmp.AWB_COL]))]
    categoria = dict(zip(saiu[cmp.AWB_COL], classificar_saidas(saiu).tolist()))
    tab = met.desempenho_progresso(b, u, categoria)
    cl = met.classes_progresso(b, u, categoria)
    classes: dict = {}
    for awb, ent, c in zip(cl[cmp.AWB_COL], cl["entregador"], cl["classe"]):
        if c in met.CLASSES_PROGRESSO:
            classes.setdefault(ent, {}).setdefault(c, []).append(awb)
    return {"dias": list(dias or []), "linhas": tab.to_dict(orient="records"), "awbs": classes}


def simular_regras(base_f: pd.DataFrame, ult_f: pd.DataFrame, atual: dict, novo: dict) -> dict:
    """Impacto de uma mudança de regra ANTES de salvar: compara a conferência de
    piso com as regras atuais e com as propostas. `atual`/`novo`:
    {"overrides": {...}, "limiar_ruido": int, "cidades_ignoradas": [...]}"""
    def erros(cfg):
        ov = cfg.get("overrides") or {"por_cidade": {}, "cidades_ignoradas": []}
        ign = list(dict.fromkeys(list(ov.get("cidades_ignoradas", [])) + list(cfg.get("cidades_ignoradas", []))))
        mapa = cfg.get("mapa_regiao")
        if mapa and (mapa.get("por_cep") or mapa.get("por_bairro") or mapa.get("por_cidade")):
            # mesmo validador do resultado real: a simulação não pode prever outra coisa (auditoria H-01)
            e = rg.validar_piso_por_regiao(ult_f, mapa, ign, ov)
        else:
            regras = rg.aplicar_overrides(rg.derivar_regras(base_f, int(cfg.get("limiar_ruido", rg.LIMIAR_RUIDO))), ov)
            e = rg.validar_piso(ult_f, regras, ign)
        return {r[cmp.AWB_COL]: r["tipo_erro"] for _, r in e.iterrows()}
    antes, depois = erros(atual), erros(novo)
    dados = {r[cmp.AWB_COL]: r for _, r in ult_f.iterrows()}
    mudancas = []
    for awb in sorted(set(antes) | set(depois)):
        if antes.get(awb) != depois.get(awb):
            r = dados[awb]
            mudancas.append({"awb": awb, "cidade": _valor(r.get(cmp.CIDADE_COL)), "entregador": _valor(r.get(rg.ENTREGADOR_COL)),
                             "antes": antes.get(awb), "depois": depois.get(awb)})
    return {"erros_antes": len(antes), "erros_depois": len(depois),
            "passam_a_erro": sum(1 for m in mudancas if m["antes"] is None),
            "deixam_de_ser_erro": sum(1 for m in mudancas if m["depois"] is None),
            "mudam_tipo": sum(1 for m in mudancas if m["antes"] and m["depois"]),
            "mudancas": mudancas}
