"""Relatórios sintéticos compartilhados pelos testes da auditoria e pela paridade sintética.

Nada aqui depende das planilhas reais. Cada cenário é um par (base, atualizado) mais os
parâmetros do motor; `gerar_referencia_sintetica.py` grava os pares em .xlsx e o front reproduz.
"""
from __future__ import annotations

import pandas as pd

COLS = ["Waybill No", "Last Scan Status", "Last Problem Type", "Last Problem Reason", "Last Problem Date", "Consignee City", "Consignee Area",
        "Consignee Zip Code", "Delivery Associate", "Delivery Count", "Delivery Time", "Arrival Time", "Sign Date"]


def L(awb, status="Em rota de entrega", prob=None, motivo=None, lpd=None, cidade="Unaí", bairro="Centro", cep="38610-000", ent="Ana", cont=0,
      dt="2026-10-12 08:00:00", arr="2026-10-12 06:00:00", sign=None):
    return {"Waybill No": str(awb), "Last Scan Status": status, "Last Problem Type": prob, "Last Problem Reason": motivo, "Last Problem Date": lpd,
            "Consignee City": cidade, "Consignee Area": bairro, "Consignee Zip Code": cep, "Delivery Associate": ent, "Delivery Count": cont,
            "Delivery Time": dt, "Arrival Time": arr, "Sign Date": sign}


def rel(*linhas) -> pd.DataFrame:
    return pd.DataFrame(list(linhas), columns=COLS)


SEM_OV = {"por_cidade": {}, "cidades_ignoradas": []}
MAPA = {"limiar": 100, "por_cep": {"38610001": ["Ana"], "38610002": ["Bia"]}, "por_bairro": {"Unaí|Goiaminas": ["Duilio"]},
        "por_cidade": {"Unaí": ["Ana", "Bia", "Duilio"]}}


# Mapa v2: traz o SUPORTE de cada regra e a lista de entregadores conhecidos (permite separar "erro provável" de "sem histórico").
MAPA_V2 = {"limiar": 5, "min_participacao": 0.05, "min_suporte": 20,
           "por_cep": {"38610001": ["Ana"], "38610002": ["Bia"], "38610003": ["Ana"]},
           "por_bairro": {"Unaí|Goiaminas": ["Duilio"], "Unaí|Crispim Santana": ["Cris"]},
           "por_cidade": {"Unaí": ["Ana", "Bia", "Cris", "Duilio"]},
           "suporte": {"por_cep": {"38610001": 200, "38610002": 150, "38610003": 4}, "por_bairro": {"Unaí|Goiaminas": 30, "Unaí|Crispim Santana": 12},
                       "por_cidade": {"Unaí": 900}},
           "entregadores": ["Ana", "Bia", "Cris", "Duilio"]}


def _params(**kw):
    p = {"ignorar_descarregado": True, "ignorar_nao_recebido": True, "limiar_ruido": 3, "cidades_ignoradas": [], "referencia_backlog": None}
    p.update(kw)
    return p


def historico_regiao() -> pd.DataFrame:
    """Histórico sintético para derivar o mapa: grafias de bairro/cidade, CEP com e sem hífen, empates, linhas sem dados."""
    linhas = [L(1000 + i, cep="38610-001", bairro="Crispim Santana", ent="Ana") for i in range(30)]
    linhas += [L(2000 + i, cep="38610001", bairro="crispim santana", ent="Ana") for i in range(10)]
    linhas += [L(3000 + i, cep="38610-001", bairro="Crispim  Santana", ent="Bia") for i in range(7)]
    linhas += [L(4000 + i, cep="38610-001", bairro="CRISPIM SANTANA", ent="Cris") for i in range(3)]
    linhas += [L(5000 + i, cep="38610-002", bairro="Centro", ent="Ana") for i in range(5)]
    linhas += [L(6000 + i, cep="38610-002", bairro="Centro", ent="Bia") for i in range(5)]  # empate
    linhas += [L(7000 + i, cep=None, bairro="Centro", cidade="UNAI", ent="Dan") for i in range(4)]
    linhas += [L(7100, cep="02402-100", bairro="Zé", cidade="São Paulo", ent="Ana"), L(7101, cidade=None, ent="Ana"), L(7102, ent=None), L(7103, cep="abc", bairro=None, ent="Eva")]
    return pd.DataFrame(linhas, columns=COLS)


def par_ordenado():
    """Base mais antiga e MENOR; atualizado mais novo e MAIOR (crescimento de volume é normal)."""
    base = rel(*[L(i, arr="2026-10-11 06:00:00", dt="2026-10-11 08:00:00") for i in range(1, 4)])
    atual = rel(*[L(i, arr="2026-10-11 06:00:00", dt="2026-10-11 08:00:00") for i in range(1, 4)],
                *[L(i, arr="2026-10-12 06:00:00", dt="2026-10-12 08:00:00") for i in range(10, 16)])
    return base, atual


def cenarios():
    """Lista de cenários: nome, base, atual, parametros, overrides."""
    b_ord, a_ord = par_ordenado()
    out = [
        {"nome": "ordem-correta", "base": b_ord, "atual": a_ord, "parametros": _params(), "overrides": SEM_OV},
        {"nome": "ordem-invertida", "base": a_ord, "atual": b_ord, "parametros": _params(), "overrides": SEM_OV},
        {"nome": "filtros-assimetricos",
         "base": rel(L(1), L(2), L(3), L(4), L(5)),
         "atual": rel(L(1, status="descarregado"), L(2, prob="Ocorrênia FM", motivo="x", lpd="2026-10-12 07:00:00", cont=1),
                      L(3, status="Não recebido"), L(4, cidade=None), L(5)),
         "parametros": _params(), "overrides": SEM_OV},
        {"nome": "ausencia-com-problema",
         "base": rel(L(1, prob="Lost package", motivo="Encomenda extraviada", lpd="2026-10-11 09:00:00", cont=1),
                     L(2, prob="Avaria", motivo="Caixa danificada", lpd="2026-10-11 09:00:00"),
                     L(3, prob="Não entregue", motivo="Telefone não atendido", lpd="2026-10-11 09:00:00", cont=3),
                     L(4, prob="Não entregue", motivo="Cliente recusou", lpd="2026-10-11 09:00:00", cont=1),
                     L(5, status="Entregue", sign="2026-10-11 10:00:00"), L(6), L(7)),
         "atual": rel(L(7)), "parametros": _params(), "overrides": SEM_OV},
        {"nome": "duplicatas",
         "base": rel(L(9)),
         "atual": rel(L(1, prob="Não entregue", motivo="Telefone não atendido", lpd="2026-10-12 11:00:00", cont=1), L(1),
                      L(2), L(2, status="Entregue", sign="2026-10-12 09:00:00")),
         "parametros": _params(), "overrides": SEM_OV},
        {"nome": "status-conflitantes",
         "base": rel(L(9)),
         "atual": rel(L(1, status="Entregue"), L(2, sign="2026-10-12 09:30:00", prob="Não entregue", motivo="Telefone não atendido", lpd="2026-10-12 07:00:00", cont=2),
                      L(3, status="Entregue", prob="Não entregue", motivo="Telefone não atendido", lpd="2026-10-11 07:00:00", cont=1, sign="2026-10-12 09:00:00"),
                      L(4, dt=None), L(5)),
         "parametros": _params(), "overrides": SEM_OV},
        {"nome": "formatos-data-awb",
         "base": rel(L(9)),
         "atual": rel(L("2001", arr="12/10/2026 06:00", dt="12/10/2026 08:00"), L("2002", arr="2026-10-12T06:00:00", dt="2026-10-12T08:00:00"),
                      L("2003", arr="25/10/2026 06:00", dt="texto qualquer"), L("2004", arr="2026-10-12 06:00:00"),
                      L("000123"), L(123), L(" 2005 "), L("2006", cont="2"), L("2007", cont=" 2 "), L("2008", cont="dois")),
         "parametros": _params(referencia_backlog="2026-10-12 12:00:00"), "overrides": SEM_OV},
        {"nome": "referencia-antes-das-chegadas",
         "base": rel(L(9)),
         "atual": rel(L(1, arr="2026-10-12 06:00:00"), L(2, arr="2026-10-12 13:00:00"), L(3, arr="2026-10-10 06:00:00"), L(4, arr=None)),
         "parametros": _params(referencia_backlog="2026-10-12 12:00:00"), "overrides": SEM_OV},
        {"nome": "piso-derivado-grafias",
         "base": rel(*[L(i, bairro="Centro", ent="Ana") for i in range(10)], *[L(100 + i, bairro="Bairro B", ent="Bia") for i in range(10)],
                     *[L(200 + i, bairro="Bairro C", ent="Cris") for i in range(10)]),
         "atual": rel(L(9001, bairro="Centro", ent="Bia"), L(9002, bairro="centro", ent="Bia"), L(9003, bairro="Bairro B", ent="Bia"),
                      L(9004, bairro="Bairro B", ent=None), L(9005, cidade="Outra", ent="Ana")),
         "parametros": _params(), "overrides": SEM_OV},
        {"nome": "piso-com-mapa",
         "base": rel(L(9)),
         "atual": rel(L(1, cep="38610-001", ent="Ana"), L(2, cep="38610-001", ent="Bia"), L(3, cep="38610-001", ent="Entregador Novo"),
                      L(4, cep="38610-000", bairro="Goiaminas", ent="Duilio"), L(5, cep="38610-002", bairro="Goiaminas", ent="Duilio"),
                      L(6, cep="99999-999", bairro="Zzz", ent="Ana"), L(7, cep="38610-001", ent=None), L(8, cidade="Cidade Sem Regra", cep="11111-111", ent="Ana")),
         "parametros": _params(mapa_regiao=MAPA), "overrides": SEM_OV},
        {"nome": "piso-com-mapa-v2",
         "base": rel(L(9)),
         "atual": rel(L(1, cep="38610-001", ent="Ana"), L(2, cep="38610-001", ent="Bia"), L(3, cep="38610-001", ent="Entregador Novo"),
                      L(4, cep="38610-003", ent="Cris"), L(5, cep="38610-000", bairro="GOIAMINAS ", ent="Duilio"), L(6, cep="38610-001", bairro="goiaminas", ent="Duilio"),
                      L(7, cep="99999-999", bairro="crispim  santana", ent="Cris"), L(8, cep="99999-999", bairro="Crispim santana", ent="Ana"),
                      L(9001, cep="38610-001", ent=None), L(9002, cidade="Cidade Sem Regra", cep="11111-111", ent="Ana")),
         "parametros": _params(mapa_regiao=MAPA_V2), "overrides": SEM_OV},
        {"nome": "piso-com-mapa-v2-ajuste-manual",
         "base": rel(L(9)),
         "atual": rel(L(1, cep="38610-001", ent="Ana"), L(2, cep="38610-001", ent="Bia"), L(3, cep="38610-002", ent="Cris"), L(4, cep="38610-001", ent="Novo")),
         "parametros": _params(mapa_regiao=MAPA_V2), "overrides": {"por_cidade": {"Unaí": ["Bia", "Cris"]}, "cidades_ignoradas": []}},
        {"nome": "piso-com-mapa-e-ajuste-manual",
         "base": rel(L(9)),
         "atual": rel(L(1, cep="38610-001", ent="Ana"), L(2, cep="38610-001", ent="Bia"), L(3, cep="38610-002", ent="Cris")),
         "parametros": _params(mapa_regiao=MAPA), "overrides": {"por_cidade": {"Unaí": ["Bia", "Cris"]}, "cidades_ignoradas": []}},
    ]
    return out
