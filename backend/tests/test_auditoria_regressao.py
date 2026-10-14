"""Regressões da auditoria de confiabilidade (13/10/2026).

Todos os dados são sintéticos: o arquivo não depende das planilhas reais. Cada defeito
conhecido está marcado com `xfail(strict=True)`: enquanto existir, o teste "falha de propósito";
quando for corrigido, vira XPASS e o `strict` obriga a remover a marcação. Os códigos
(C-01, H-02...) são os do relatório da auditoria.

Rodar:  pytest tests/test_auditoria_regressao.py
"""
from __future__ import annotations

import sys
import warnings
from pathlib import Path

import pandas as pd
import pytest

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(Path(__file__).resolve().parent))
warnings.filterwarnings("ignore")

from logistica import comparador as cmp  # noqa: E402
from logistica import metricas as met  # noqa: E402
from logistica import regras as rg  # noqa: E402
from logistica.pipeline import Parametros, analisar, indicio_ordem  # noqa: E402

from fixtures_sinteticos import L, MAPA, MAPA_V2, par_ordenado, rel  # noqa: E402


def rodar(base, atual, **kw):
    return analisar(base, atual, Parametros(**kw), {}, ("base.xlsx", "atual.xlsx"))


def reg(analise, awb):
    return next(x for x in analise["atual"] if x["dados"]["Waybill No"] == str(awb))


# ----------------------------------------------------------------- H-02 ordem dos relatórios
def test_h02_par_na_ordem_correta_nao_e_acusado_como_invertido():
    base, atual = par_ordenado()
    assert indicio_ordem(cmp.normalizar_relatorio(base), cmp.normalizar_relatorio(atual))["possivel_inversao"] is False
    assert rodar(base, atual)["ordem"]["possivel_inversao"] is False


def test_h02_par_invertido_e_acusado_mesmo_com_o_volume_a_favor():
    base, atual = par_ordenado()
    # troca: o relatório mais novo entra como "base"
    assert indicio_ordem(cmp.normalizar_relatorio(atual), cmp.normalizar_relatorio(base))["possivel_inversao"] is True
    assert rodar(atual, base)["ordem"]["possivel_inversao"] is True


# ----------------------------------------------------------------- contrato atual (oráculo independente)
def test_funil_de_totais_fecha():
    base = rel(L(1), L(2))
    atual = rel(L(1), L(2), L(3, status="descarregado"), L(4, prob="Ocorrênia FM", motivo="x", lpd="2026-10-12 07:00:00", cont=1),
                L(5, status="Não recebido"), L(6, cidade=None), L(7), L(7))
    a = rodar(base, atual)
    e = a["etapas"]
    assert e["atual_lidas"] - e["descarregado_atual"] - e["nao_recebido_atual"] - e["fm_atual"] - e["fora_atual"] - e["cruzadas_atual"] == a["resumo"]["ultima_total"]
    assert (e["descarregado_atual"], e["nao_recebido_atual"], e["fm_atual"], e["fora_atual"]) == (1, 1, 1, 1)


def test_desempenho_confere_com_reconstrucao_independente():
    """Recalcula o desempenho SEM pandas (laços sobre dicionários) e compara com o motor.
    Definição (C-01, decisão D1): universo = peças do entregador na base AINDA NÃO entregues."""
    base = rel(L(1, ent="Ana"), L(2, ent="Ana"), L(3, ent="Ana"), L(4, ent="Ana", status="Entregue", sign="2026-10-11 09:00:00"),
               L(5, ent="Bia", prob="Não entregue", motivo="Telefone não atendido", lpd="2026-10-11 09:00:00", cont=1),
               L(6, ent="Bia"), L(7, ent="Bia"), L(8, ent="Bia", prob="Lost package", motivo="Encomenda extraviada", lpd="2026-10-11 09:00:00", cont=1))
    atual = rel(L(1, ent="Ana"),  # pendente sem ocorrência
                L(3, ent="Ana", prob="Não entregue", motivo="Telefone não atendido", lpd="2026-10-12 09:00:00", cont=1, dt="2026-10-12 08:00:00"),  # ocorrência vigente
                L(5, ent="Bia", prob="Não entregue", motivo="Telefone não atendido", lpd="2026-10-12 07:00:00", cont=1, dt="2026-10-12 08:00:00"),  # já em rota de novo
                L(6, ent="Bia", status="Entregue", sign="2026-10-12 09:00:00"))  # entrega confirmada
    a = rodar(base, atual)
    b_recs = {r["Waybill No"]: r for r in base.to_dict("records")}
    u_recs = {r["Waybill No"]: r for r in atual.to_dict("records")}
    vazio = lambda v: v is None or v != v  # None ou NaN (célula vazia lida pelo pandas)
    esperado = {}
    for k, r in b_recs.items():
        e = esperado.setdefault(r["Delivery Associate"], {"total": 0, "entregue": 0, "anormal": 0, "tratada": 0, "pendente": 0, "ja_entregues": 0})
        if r["Last Scan Status"] == "Entregue" or not vazio(r["Sign Date"]):
            e["ja_entregues"] += 1
            continue
        e["total"] += 1
        if k in u_recs:
            u = u_recs[k]
            if u["Last Scan Status"] == "Entregue" or not vazio(u["Sign Date"]):
                e["entregue"] += 1
            elif not vazio(u["Last Problem Type"]):
                e["tratada" if u["Delivery Time"] > u["Last Problem Date"] else "anormal"] += 1  # datas ISO comparam como texto
            else:
                e["pendente"] += 1
        else:
            texto = f"{r['Last Problem Type']} {r['Last Problem Reason']}".lower()
            if not any(p in texto for p in ("lost", "extravi", "avaria", "danific", "devol", "recusad", "retorno")):
                e["entregue"] += 1
    obtido = {d["entregador"]: {k: d[k] for k in ("total", "entregue", "anormal", "tratada", "pendente", "ja_entregues")} for d in a["desempenho"]["linhas"]}
    assert obtido == esperado
    assert obtido["Ana"] == {"total": 3, "entregue": 1, "anormal": 1, "tratada": 0, "pendente": 1, "ja_entregues": 1}  # a peça 2 sumiu: provável entrega
    assert obtido["Bia"]["tratada"] == 1 and obtido["Bia"]["entregue"] == 2  # 6 confirmada + 7 sumiu; a 8 (Lost) NÃO conta


# ----------------------------------------------------------------- C-01 progresso de entrega
def test_c01_entrega_anterior_a_base_nao_conta_como_progresso():
    base = rel(L(1, status="Entregue", sign="2026-10-11 09:00:00"), L(2, status="Entregue", sign="2026-10-11 09:30:00"), L(3), L(4))
    atual = rel(L(3), L(4))  # as duas já entregues saíram do relatório; nada novo foi entregue
    linha = next(d for d in rodar(base, atual)["desempenho"]["linhas"] if d["entregador"] == "Ana")
    assert linha["entregue"] == 0 and linha["pct_entregue"] == 0.0


# ----------------------------------------------------------------- H-03 filtros assimétricos
@pytest.mark.parametrize("alteracao", [{"status": "descarregado"}, {"prob": "Ocorrênia FM", "motivo": "x", "lpd": "2026-10-12 07:00:00", "cont": 1},
                                       {"status": "Não recebido"}, {"cidade": None}])
def test_h03_peca_presente_nos_dois_relatorios_nunca_sai(alteracao):
    base = rel(L(1), L(2))
    atual = rel(L(2), L(1, **alteracao))
    a = rodar(base, atual)
    assert "1" not in {s["dados"]["Waybill No"] for s in a["sairam"]}


def test_h03_retirada_cruzada_e_contabilizada():
    """Peça que vira FM no atualizado sai da base também; o funil e a busca explicam o motivo."""
    base = rel(L(1), L(2), L(3))
    atual = rel(L(2), L(3), L(1, prob="Ocorrênia FM", motivo="x", lpd="2026-10-12 07:00:00", cont=1))
    a = rodar(base, atual)
    assert a["etapas"]["fm_atual"] == 1 and a["etapas"]["cruzadas_base"] == 1 and a["etapas"]["cruzadas_atual"] == 0
    assert a["resumo"]["base_total"] == 2 and a["resumo"]["pendentes"] == 2
    assert a["removidas"]["cruzadas"] == ["1"] and a["removidas"]["fm"] == ["1"]
    assert a["resumo"]["saiu_entregue"] == 0  # nada "saiu": o AWB 1 foi retirado dos dois relatórios


# ----------------------------------------------------------------- M-01 ausência não é entrega
@pytest.mark.parametrize("linha,esperada", [
    (L(1, prob="Lost package", motivo="Encomenda extraviada", lpd="2026-10-11 09:00:00", cont=1), "saiu_com_ocorrencia"),
    (L(1, prob="Avaria", motivo="Caixa danificada", lpd="2026-10-11 09:00:00"), "saiu_com_ocorrencia"),
    (L(1, prob="Não entregue", motivo="Telefone não atendido", lpd="2026-10-11 09:00:00", cont=3), "possivel_devolucao"),
    (L(1, prob="Não entregue", motivo="Cliente recusado", lpd="2026-10-11 09:00:00", cont=1), "possivel_devolucao"),
    (L(1, status="Entregue", sign="2026-10-11 10:00:00"), "ja_entregue"),
    (L(1), "provavel_entrega"),
])
def test_m01_categoria_das_saidas(linha, esperada):
    a = rodar(rel(linha, L(2)), rel(L(2)))
    assert {s["dados"]["Waybill No"]: s["categoria"] for s in a["sairam"]}["1"] == esperada


def test_m01_saidas_particionam_o_que_sumiu():
    base = rel(L(1), L(2, prob="Lost package", motivo="x", lpd="2026-10-11 09:00:00", cont=1), L(3, status="Entregue", sign="2026-10-11 10:00:00"),
               L(4, prob="Não entregue", motivo="Telefone não atendido", lpd="2026-10-11 09:00:00", cont=3), L(5))
    r = rodar(base, rel(L(5)))["resumo"]
    assert (r["saiu_entregue"], r["saiu_com_ocorrencia"], r["saiu_ja_entregue"], r["saiu_devolucao"]) == (1, 1, 1, 1)


# ----------------------------------------------------------------- H-04 ocorrência vigente x tratada
def test_h04_entregue_apos_problema_e_entregue_nao_anormal():
    df = rel(L(1, status="Entregue", sign="2026-10-12 09:00:00", prob="Não entregue", motivo="x", lpd="2026-10-11 09:00:00", cont=1),
             L(2, prob="Não entregue", motivo="x", lpd="2026-10-11 09:00:00", cont=1))
    assert list(met.classificar(df)) == ["Entregue", "Anormal"]


def test_h04_ocorrencia_ja_em_rota_nao_e_vigente():
    atual = rel(L(1, prob="Não entregue", motivo="x", lpd="2026-10-12 07:00:00", cont=1, dt="2026-10-12 08:00:00"),   # saiu de novo depois
                L(2, prob="Não entregue", motivo="x", lpd="2026-10-12 09:00:00", cont=1, dt="2026-10-12 08:00:00"))  # problema depois da saída
    a = rodar(rel(L(9)), atual)
    assert (reg(a, 1)["reroteada"], reg(a, 2)["reroteada"]) == (True, False)


# ----------------------------------------------------------------- avaria e peça sem tentativa
def test_avaria_nao_e_tentativa_de_entrega():
    atual = rel(L(1, status="recebido no DS", prob="Avaria", motivo="Embalagem danificada", lpd="2026-10-12 05:33:00", cont=0, dt=None, ent=None),
                L(2, prob="Avaria", motivo="Caixa danificada", lpd="2026-10-12 07:00:00", cont=1, dt=None),
                L(3, prob="Lost package", motivo="Encomenda danificada e extraviada", lpd="2026-10-12 07:00:00", cont=1, dt=None),
                L(4, prob="Não entregue", motivo="Telefone não atendido", lpd="2026-10-12 07:00:00", cont=1, dt=None),
                L(5))
    a = rodar(rel(L(9)), atual)
    assert "avaria" in reg(a, 1)["excecoes"] and "avaria" in reg(a, 2)["excecoes"]
    assert "avaria" not in reg(a, 3)["excecoes"] and "extravio" in reg(a, 3)["excecoes"]  # extravio tem precedência
    assert reg(a, 4)["excecoes"] == ["insucesso"] and reg(a, 5)["excecoes"] == []


# ----------------------------------------------------------------- M-02 deduplicação
def test_m02_duplicata_vale_o_evento_mais_recente():
    mais_novo = L(1, prob="Não entregue", motivo="x", lpd="2026-10-12 11:00:00", cont=1)
    for ordem in ((mais_novo, L(1)), (L(1), mais_novo)):
        a = rodar(rel(L(9)), rel(*ordem))
        assert reg(a, 1)["dados"]["Last Problem Type"] == "Não entregue"  # o de evento mais recente, em qualquer ordem
    # sem datas que desempatem, vale a última linha
    sem_datas = lambda ent: L(2, ent=ent, dt=None, arr=None)
    assert reg(rodar(rel(L(9)), rel(sem_datas("Ana"), sem_datas("Bia"))), 2)["dados"]["Delivery Associate"] == "Bia"


def test_m02_duplicata_nao_depende_da_ordem_das_linhas():
    novo = L(1, prob="Não entregue", motivo="Telefone não atendido", lpd="2026-10-12 11:00:00", cont=1)
    antigo = L(1, dt="2026-10-12 08:00:00")
    base = rel(L(9))
    r1, r2 = rodar(base, rel(novo, antigo)), rodar(base, rel(antigo, novo))
    assert reg(r1, 1)["classe_operacional"] == reg(r2, 1)["classe_operacional"]


# ----------------------------------------------------------------- C-02 / H-01 piso
def _tipos(err):
    return {r["Waybill No"]: r["tipo_erro"] for _, r in err.iterrows()}


def test_c02_entregador_desconhecido_nao_e_erro_de_piso():
    """Quem não aparece no histórico que gerou o mapa é 'sem histórico' (revisar), não 'fora da área'."""
    p = rel(L(1, cep="38610-001", ent="Entregador Novo"), L(2, cep="38610-001", ent="Bia"))
    t = _tipos(rg.validar_piso_por_regiao(p, MAPA_V2))
    assert t["1"] == rg.ERRO_SEM_HISTORICO
    assert t["2"] == rg.ERRO_FORA_AREA  # Bia é conhecida e a região tem suporte (200): erro provável


def test_c02_regiao_com_pouco_historico_nao_acusa_erro_firme():
    p = rel(L(1, cep="38610-003", ent="Bia"))  # CEP com só 4 entregas no histórico (mínimo 20)
    assert _tipos(rg.validar_piso_por_regiao(p, MAPA_V2)) == {"1": rg.ERRO_POUCO_HISTORICO}


def test_c02_mapa_antigo_sem_suporte_mantem_o_comportamento_anterior():
    p = rel(L(1, cep="38610-001", ent="Entregador Novo"))
    assert _tipos(rg.validar_piso_por_regiao(p, MAPA)) == {"1": rg.ERRO_FORA_AREA}


def test_c02_entregador_conhecido_fora_do_conjunto_e_erro():
    p = rel(L(1, cep="38610-001", ent="Bia"))
    assert list(rg.validar_piso_por_regiao(p, MAPA_V2)["tipo_erro"]) == [rg.ERRO_FORA_AREA]


def test_h01_ajuste_manual_vale_com_mapa_ativo():
    """Decisão D2 (13/10): o ajuste manual por cidade prevalece sobre o mapa."""
    ov = {"por_cidade": {"Unaí": ["Bia"]}, "cidades_ignoradas": []}
    a = rodar(rel(L(1, cep="38610-001", ent="Bia"), L(2, cep="38610-001", ent="Ana")), rel(L(1, cep="38610-001", ent="Bia"), L(2, cep="38610-001", ent="Ana")),
              mapa_regiao=MAPA_V2, overrides=ov)
    assert reg(a, 1)["erro_piso"] is None  # Bia: errada pelo mapa, mas certa pelo ajuste manual
    e2 = reg(a, 2)["erro_piso"]
    assert e2["tipo"] == rg.ERRO_FORA_AREA and e2["origem_regra"] == "ajuste manual"


def test_h01_simulacao_usa_o_mesmo_validador_do_resultado():
    from logistica.pipeline import simular_regras
    pend = rel(L(1, cep="38610-001", ent="Bia"), L(2, cep="38610-001", ent="Ana"))
    sem = {"por_cidade": {}, "cidades_ignoradas": []}
    com = {"por_cidade": {"Unaí": ["Bia"]}, "cidades_ignoradas": []}
    sim = simular_regras(pend, pend, {"overrides": sem, "mapa_regiao": MAPA_V2}, {"overrides": com, "mapa_regiao": MAPA_V2})
    real = lambda ov: len(rg.validar_piso_por_regiao(pend, MAPA_V2, [], ov))
    assert (sim["erros_antes"], sim["erros_depois"]) == (real(sem), real(com))


def test_m05_chaves_normalizadas_no_mapa():
    """'GOIAMINAS ', 'goiaminas' e 'Goiaminas' são o mesmo bairro; 'crispim  santana' casa com 'Crispim Santana'."""
    p = rel(L(5, cep="38610-000", bairro="GOIAMINAS ", ent="Duilio"), L(6, cep="38610-001", bairro="goiaminas", ent="Duilio"),
            L(7, cep="99999-999", bairro="crispim  santana", ent="Cris"), L(8, cep="99999-999", bairro="Crispim santana", ent="Ana"))
    t = _tipos(rg.validar_piso_por_regiao(p, MAPA_V2))
    assert "5" not in t and "6" not in t and "7" not in t  # regra do bairro encontrada apesar da grafia
    assert t["8"] == rg.ERRO_POUCO_HISTORICO  # Ana não atende o bairro; suporte 12 (< 20)


def test_derivacao_mapa_v2_tem_suporte_conhecidos_e_chaves_unificadas():
    hist = rel(*[L(i, cep="38610-001", bairro="Crispim Santana", ent="Ana") for i in range(30)],
               *[L(100 + i, cep="38610-001", bairro="crispim santana", ent="Ana") for i in range(10)],
               *[L(200 + i, cep="38610-001", bairro="Crispim Santana", ent="Bia") for i in range(6)],
               *[L(300 + i, cep="38610-001", bairro="Crispim Santana", ent="Cris") for i in range(2)])
    m = rg.derivar_regras_regiao(hist)  # critério padrão: >=5 entregas e >=5%
    assert list(m["por_bairro"]) == ["Unaí|Crispim Santana"]  # grafia mais frequente; variantes fundidas
    assert m["suporte"]["por_bairro"]["Unaí|Crispim Santana"] == 48
    assert m["por_cep"]["38610001"] == ["Ana", "Bia"]  # Cris (2 entregas) fica de fora
    assert m["entregadores"] == ["Ana", "Bia", "Cris"]
    assert m["min_suporte"] == 20 and m["min_participacao"] == 0.05


# ----------------------------------------------------------------- M-05 grafia de bairro
@pytest.mark.xfail(strict=True, reason="M-05 (caminho SEM mapa): unificar grafias de bairro é decisão pendente (DECISOES §7) e mudaria CA-007/008; com mapa já normaliza")
def test_m05_grafia_de_bairro_nao_cria_falso_negativo():
    base = rel(*[L(i, bairro="Centro", ent="Ana") for i in range(10)], *[L(100 + i, bairro="Bairro B", ent="Bia") for i in range(10)],
               *[L(200 + i, bairro="Bairro C", ent="Cris") for i in range(10)])
    regras = rg.derivar_regras(base, 3)
    err = rg.validar_piso(rel(L(9001, bairro="centro", ent="Bia")), regras)
    assert list(err["tipo_erro"]) == [rg.ERRO_FORA_AREA]


# ----------------------------------------------------------------- M-04 formato de data e AWB (corrigido)
def test_m04_data_ambigua_nao_vira_data_errada():
    atual = rel(L(1, arr="12/10/2026 06:00"))
    d = met.calcular_backlog_dias(cmp.normalizar_relatorio(atual), pd.Timestamp("2026-10-12 12:00:00")).iloc[0]
    assert d == pytest.approx(0.25)  # dd/mm/aaaa: 12 de outubro, 6h


@pytest.mark.parametrize("texto,esperado", [
    ("2026-10-12 06:00:00", "2026-10-12 06:00:00"), ("2026-10-12T06:00:00", "2026-10-12 06:00:00"), ("2026-10-12", "2026-10-12 00:00:00"),
    ("12/10/2026 06:00", "2026-10-12 06:00:00"), ("12/10/2026", "2026-10-12 00:00:00"),
    ("31/02/2026", None), ("2026-13-01", None), ("12/10/2026 25:00", None), ("texto qualquer", None), ("", None), ("12/10/2026 lixo", None),
])
def test_m04_regra_unica_de_datas(texto, esperado):
    v = cmp.para_data(pd.Series([texto])).iloc[0]
    assert (pd.isna(v) if esperado is None else v == pd.Timestamp(esperado))


def test_m04_awb_com_zeros_a_esquerda_nao_funde_com_o_numerico(tmp_path):
    arq = tmp_path / "r.xlsx"
    rel(L("000123"), L(123), L(" 777 ")).to_excel(arq, index=False)
    awbs = list(cmp.carregar_relatorio(arq)["Waybill No"])
    assert awbs == ["000123", "123", "777"]


def test_m04_data_nao_reconhecida_aparece_na_qualidade():
    from logistica.pipeline import validar_arquivo
    info = validar_arquivo(rel(L(1, arr="12/10/2026 06:00"), L(2, arr="amanhã cedo"), L(3)), "r.xlsx")
    item = next(q for q in info["qualidade"] if q["codigo"] == "datas_invalidas")
    assert item["n"] == 1  # só "amanhã cedo": a data brasileira é aceita
