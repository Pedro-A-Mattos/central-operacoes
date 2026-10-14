"""Critérios de aceite CA-001..015 (doc 11) contra as planilhas de exemplo.

Rodar:  pytest tests/            (ou)  python tests/test_criterios_aceite.py
"""
from __future__ import annotations

import sys
import tempfile
import warnings
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
warnings.filterwarnings("ignore")

from logistica import comparador as cmp  # noqa: E402
from logistica import excecoes as exc  # noqa: E402
from logistica import metricas as met  # noqa: E402
from logistica import regras as rg  # noqa: E402
from logistica.pipeline import Parametros, analisar  # noqa: E402

DADOS = RAIZ / "dados_exemplo"
_cache: dict = {}


def test_auditoria_metricas_par_real():
    """Validação independente (para produção): recomputa cada métrica da torre
    por fora do motor, no par ultima_tabela × dispatch_2026-10-11, e compara.
    Garante que 'novas', 'saíram', 'mudou status' etc. não têm erro de fórmula."""
    base_raw = pd.read_excel(DADOS / "ultima_tabela.xlsx")
    atual_raw = pd.read_excel(DADOS / "dispatch_2026-10-11.xlsx")
    ref = pd.Timestamp("2026-10-11 18:57:14")
    a = analisar(base_raw, atual_raw, Parametros(ignorar_descarregado=False, ignorar_nao_recebido=False, referencia_backlog=ref))
    base = cmp.normalizar_relatorio(base_raw)
    atual = cmp.normalizar_relatorio(atual_raw)
    bf = cmp.separar_fora_jurisdicao(cmp.remover_fm(base))[0]
    af = cmp.separar_fora_jurisdicao(cmp.remover_fm(atual))[0]
    bi, ai = set(bf[cmp.AWB_COL]), set(af[cmp.AWB_COL])
    sb = dict(zip(bf[cmp.AWB_COL], bf["Last Scan Status"]))
    su = dict(zip(af[cmp.AWB_COL], af["Last Scan Status"]))
    mud = sum(1 for w in (ai & bi) if (pd.isna(sb.get(w)) != pd.isna(su.get(w))) or str(sb.get(w)) != str(su.get(w)))
    saiu = bf[~bf[cmp.AWB_COL].isin(ai)]
    txt = (saiu["Last Problem Type"].astype("string").fillna("") + " " + saiu["Last Problem Reason"].astype("string").fillna("")).str.lower()
    dev = int(txt.apply(lambda t: any(p in t for p in cmp.PALAVRAS_DEVOLUCAO)).sum())
    r = a["resumo"]
    assert r["pendentes"] == len(af)
    assert r["novas"] == len(ai - bi) == sum(1 for x in a["atual"] if x["nova"])
    # Auditoria C-01/M-01: o que saiu se parte em quatro categorias; "devolução" agora também inclui 3+ tentativas por ausência.
    assert r["saiu_entregue"] + r["saiu_devolucao"] + r["saiu_ja_entregue"] + r["saiu_com_ocorrencia"] == len(saiu)
    assert r["saiu_devolucao"] >= dev
    assert r["mudou_status"] == mud
    assert r["base_total"] == len(bf) and r["ultima_total"] == len(af)
    # Neste par específico, não há encomendas novas (todos os AWBs do atual já
    # existiam na base) — "Novas = 0" é correto, não um defeito.
    assert r["novas"] == 0


def _base():
    if "b" not in _cache:
        _cache["b"] = cmp.carregar_relatorio(DADOS / "tabela_base.xlsx")
        _cache["u"] = cmp.carregar_relatorio(DADOS / "ultima_tabela.xlsx")
    return _cache["b"], _cache["u"]


def _fluxo_app():
    b, u = _base()
    bf, _ = cmp.separar_fora_jurisdicao(cmp.remover_fm(b))
    uf, ufora = cmp.separar_fora_jurisdicao(cmp.remover_fm(u))
    return bf, uf, ufora


def test_ca001_normalizacao_awb():
    df = pd.DataFrame({"Waybill No": [3320120101920.0, " 3320120101920 "]})
    n = cmp.normalizar_relatorio(df)
    assert list(n["Waybill No"]) == ["3320120101920"]


def test_ca002_deduplicacao_ultima_ocorrencia():
    df = pd.DataFrame({"Waybill No": ["1", "1"], "Consignee City": ["A", "B"]})
    n = cmp.normalizar_relatorio(df)
    assert len(n) == 1 and n.iloc[0]["Consignee City"] == "B"


def test_ca003_categorias_sem_filtros():
    b, u = _base()
    r = cmp.comparar(b, u)
    assert r.resumo["base_total"] == 1903 and r.resumo["ultima_total"] == 552
    assert r.resumo["novas"] == 6
    assert r.resumo["saiu_entregue"] + r.resumo["saiu_devolucao"] == 1357
    assert r.resumo["saiu_devolucao"] == 18


def test_ca004_heuristica_devolucao():
    base = pd.DataFrame({"Waybill No": ["100", "200"], "Last Problem Type": [None, "Não recebido"]})
    ult = pd.DataFrame({"Waybill No": ["999"]})
    r = cmp.comparar(cmp.normalizar_relatorio(base), cmp.normalizar_relatorio(ult))
    assert list(r.saiu_entregue["Waybill No"]) == ["100"]
    assert list(r.saiu_devolucao["Waybill No"]) == ["200"]


def test_ca005_remocao_fm():
    _, u = _base()
    assert len(u) - len(cmp.remover_fm(u)) == 119


def test_ca005b_remocao_fm_duas_grafias_e_variacoes():
    # RN-008: 'Ocorrênia FM' e 'Force majeure' (as duas grafias reais da iMile),
    # além de variações, devem todas ser removidas. Tipos normais ficam.
    df = pd.DataFrame({
        "Waybill No": ["1", "2", "3", "4", "5", "6", "7"],
        "Last Problem Type": ["Ocorrênia FM", "Force majeure", "Ocorrência FM",
                              "Força maior", "FM", "Não entregue", "Lost package"],
    })
    df = cmp.normalizar_relatorio(df)
    restante = cmp.remover_fm(df)
    assert list(restante["Waybill No"]) == ["6", "7"]  # só os não-FM sobram
    # nenhum valor de FM/majeure permanece
    import re as _re
    resto = restante["Last Problem Type"].astype("string").dropna().tolist()
    assert not any(_re.search(r"fm|majeure|maior", v, _re.I) for v in resto)


def test_ca006_fora_da_jurisdicao():
    _, u = _base()
    dentro, fora = cmp.separar_fora_jurisdicao(u)
    assert len(fora) == 20 and len(dentro) + len(fora) == len(u)
    assert dentro["Consignee City"].notna().all()


def test_ca007_tipos_de_erro_piso():
    bf, uf, _ = _fluxo_app()
    res = cmp.comparar(bf, uf)
    erros = rg.validar_piso(res.pendentes, rg.derivar_regras(bf))
    cont = erros["tipo_erro"].value_counts().to_dict()
    assert cont == {rg.ERRO_FORA_AREA: 28, rg.ERRO_SEM_ENTREGADOR: 3}


def test_ca008_override_de_piso():
    bf, uf, _ = _fluxo_app()
    res = cmp.comparar(bf, uf)
    regras = rg.aplicar_overrides(rg.derivar_regras(bf), {"por_cidade": {"Arinos": ["Giliard Barbosa de Oliveira"]}})
    erros = rg.validar_piso(res.pendentes, regras)
    arinos = erros[erros["Consignee City"] == "Arinos"]
    assert len(arinos) == 14 and set(arinos["tipo_erro"]) == {rg.ERRO_FORA_AREA}


def _jessica(df):
    return df[df["entregador"] == "Jessica Duraes D'Abadia"].iloc[0]


def test_ca009_desempenho_entregador():
    b, u = _base()
    r = cmp.comparar(b, u)
    ids = set(r.saiu_entregue["Waybill No"])
    j = _jessica(met.desempenho_entregadores(b, u, ids))
    assert (j.total, j.entregue, j.anormal, j.pendente, j.pct_entregue) == (270, 126, 46, 97, 46.7)

    bf, uf, _ = _fluxo_app()
    r = cmp.comparar(bf, uf)
    ids = set(r.saiu_entregue["Waybill No"])
    tab = met.desempenho_entregadores(bf, uf, ids)
    j = _jessica(tab)
    assert (j.total, j.entregue, j.anormal, j.pendente, j.pct_entregue) == (203, 100, 5, 97, 49.3)
    assert ((tab.entregue + tab.anormal + tab.pendente) <= tab.total).all()
    linhas = met.linhas_classificadas_entregador(bf, uf, ids)
    assert len(linhas) == int((tab.entregue + tab.anormal + tab.pendente).sum())


def test_ca010_faixas_backlog():
    assert met.FAIXAS_BACKLOG == ["0-1 dia", "2-3 dias", "4+ dias"]
    ref = pd.Timestamp("2026-10-10 00:00:00")
    df = pd.DataFrame({"Arrival Time": ["2026-10-09 00:00:01", "2026-10-08 00:00:00", "2026-10-06 00:00:00"]})
    assert list(met.faixa_backlog_por_linha(df, ref)) == ["0-1 dia", "2-3 dias", "4+ dias"]


def test_ca011_devolucao_por_tentativas():
    """Revisado pela OP-02 (aprovada em 2026-10-11): a AWB 3320120101920 tem 3
    tentativas por "Reprogramação" (pedido do cliente) — deixa de ser devolução
    e vai para "revisar tentativas"."""
    _, uf, _ = _fluxo_app()
    assert list(exc.pecas_para_devolucao(uf)["Waybill No"]) == []
    assert list(exc.tentativas_a_revisar(uf)["Waybill No"]) == ["3320120101920"]
    caso = pd.DataFrame({"Waybill No": ["1", "2", "3"], "Delivery Count": [3, 3, 2],
                         "Last Problem Type": ["Não entregue", "Reprogramação", "Não entregue"],
                         "Last Problem Reason": ["Telefone não atendido", "Mudança de horário de entrega", "Local Fechado"]})
    assert list(exc.pecas_para_devolucao(caso)["Waybill No"]) == ["1"]
    assert list(exc.tentativas_a_revisar(caso)["Waybill No"]) == ["2"]


def test_ca012_extravio_e_insucesso_disjuntos():
    _, uf, _ = _fluxo_app()
    e, i = set(exc.extravios(uf)["Waybill No"]), set(exc.insucessos(uf)["Waybill No"])
    assert e and i and not (e & i)


def test_ca013_justificativas_persistidas():
    with tempfile.TemporaryDirectory() as d:
        arq = Path(d) / "justificativas.json"
        exc.salvar_justificativa(arq, "3320120101920", exc.Justificativa(motivo="Cliente reagendou"))
        _, uf, _ = _fluxo_app()
        ativas, just = exc.separar_justificadas(exc.tentativas_a_revisar(uf), exc.carregar_justificativas(arq))
        assert ativas.empty and list(just["Waybill No"]) == ["3320120101920"]
        exc.remover_justificativa(arq, "3320120101920")
        assert exc.carregar_justificativas(arq) == {}


def test_ca015_filtro_dias_local():
    bf, uf, _ = _fluxo_app()
    dias = cmp.dias_chegada_disponiveis(uf)
    assert len(cmp.filtrar_por_dias_chegada(uf, [])) == len(uf)
    assert len(cmp.filtrar_por_dias_chegada(uf, dias[:1])) < len(uf)


def test_pipeline_contrato():
    b = pd.read_excel(DADOS / "tabela_base.xlsx")
    u = pd.read_excel(DADOS / "ultima_tabela.xlsx")
    a = analisar(b, u, Parametros(ignorar_descarregado=False, ignorar_nao_recebido=False, referencia_backlog=pd.Timestamp("2026-10-10 18:00")))
    assert a["resumo"]["pendentes"] == 413 and a["etapas"]["fm_atual"] == 119
    assert sum(1 for x in a["atual"] if x["erro_piso"]) == 31
    assert not a["ordem"]["possivel_inversao"]


# ---------- regras revisadas em 2026-10-11 ----------

def test_op06_referencia_vem_do_relatorio():
    ref, origem = met.referencia_do_relatorio("Dispatch waybill query - 2026-10-11T185714.610.xlsx", None)
    assert (ref, origem) == (pd.Timestamp("2026-10-11 18:57:14"), "nome_arquivo")
    _, u = _base()
    ref, origem = met.referencia_do_relatorio("ultima_tabela.xlsx", u)
    assert (ref, origem) == (pd.Timestamp("2026-10-11 14:42:55"), "ultimo_evento")


def test_op06_mesmo_arquivo_mesmos_numeros():
    b = pd.read_excel(DADOS / "tabela_base.xlsx")
    u = pd.read_excel(DADOS / "ultima_tabela.xlsx")
    nomes = ("tabela_base.xlsx", "ultima_tabela.xlsx")
    a1 = analisar(b, u, Parametros(), None, nomes)
    a2 = analisar(b, u, Parametros(), None, nomes)
    assert a1["referencia_origem"] == "ultimo_evento"
    assert [x["backlog_dias"] for x in a1["atual"]] == [x["backlog_dias"] for x in a2["atual"]]


def test_op01_entregue_so_confirmada():
    df = pd.DataFrame({"Last Scan Status": ["Em rota de entrega", "Entregue", "Em rota de entrega"],
                       "Delivery Time": ["2026-10-10 08:00:00", "2026-10-10 08:00:00", None],
                       "Sign Date": [None, "2026-10-10 15:00:00", "2026-10-10 16:00:00"],
                       "Last Problem Type": [None, None, None]})
    assert list(met.classificar(df)) == ["Não entregue", "Entregue", "Entregue"]
    h = met.minutos_em_rota(df, pd.Timestamp("2026-10-11 08:00:00"))
    assert h.iloc[0] == 24 * 60 and pd.isna(h.iloc[1]) and pd.isna(h.iloc[2])


def test_descarregado_ligado_por_padrao():
    b = pd.read_excel(DADOS / "tabela_base.xlsx")
    u = pd.read_excel(DADOS / "ultima_tabela.xlsx")
    a = analisar(b, u, Parametros())
    assert a["parametros"]["ignorar_descarregado"] and a["etapas"]["descarregado_atual"] == 3
    # Padrão: descarregado (3) e não recebido (3, no tipo de problema) ligados.
    # Sem filtros seriam 413; 413 - 3 - 3 = 407.
    assert a["etapas"]["nao_recebido_atual"] == 3
    assert a["resumo"]["pendentes"] == 407


def test_nao_recebido_ligado_por_padrao_e_remove_status():
    # RN-012: filtro ligado por padrão; remove "não recebido" (com/sem acento)
    # quando aparece no Last Scan Status OU no Last Problem Type.
    assert Parametros().ignorar_nao_recebido is True
    df = pd.DataFrame({
        "Waybill No": ["1", "2", "3", "4", "5", "6"],
        "Last Scan Status": ["Em rota de entrega", "não recebido", "Nao Recebido", "Em rota de entrega", "descarregado", "Em rota de entrega"],
        "Last Problem Type": [None, None, None, "Não recebido", None, "Reprogramação"],
    })
    df = cmp.normalizar_relatorio(df)
    ligado = cmp.aplicar_filtro_nao_recebido(df, True)
    # remove por status ("2","3") e por tipo de problema ("4"); mantém "1","5","6"
    assert list(ligado["Waybill No"]) == ["1", "5", "6"]
    desligado = cmp.aplicar_filtro_nao_recebido(df, False)
    assert len(desligado) == 6
    # nos dados de exemplo: 3 no status não; 3 "Não recebido" no tipo de problema saem
    b = pd.read_excel(DADOS / "tabela_base.xlsx")
    u = pd.read_excel(DADOS / "ultima_tabela.xlsx")
    a = analisar(b, u, Parametros(referencia_backlog=pd.Timestamp("2026-10-10 18:00")))
    assert a["parametros"]["ignorar_nao_recebido"] is True
    assert a["etapas"]["nao_recebido_atual"] == 3  # 3 "Não recebido" no Last Problem Type
    assert len(a["removidas"]["nao_recebido"]) >= 3


def test_qualidade_na_importacao():
    from logistica.pipeline import validar_arquivo
    v = validar_arquivo(pd.read_excel(DADOS / "tabela_base.xlsx"), "tabela_base.xlsx")
    q = {x["codigo"]: x for x in v["qualidade"]}
    assert q["grafia_bairro"]["n"] == 54 and len(q["grafia_bairro"]["exemplos"]) == 3
    assert q["sem_cidade"]["n"] == 18 and q["sem_chegada"]["n"] == 20


def test_simulacao_de_regra():
    from logistica.pipeline import simular_regras
    bf, uf, _ = _fluxo_app()
    atual = {"overrides": {}, "limiar_ruido": 3}
    sim = simular_regras(bf, uf, atual, {"overrides": {"por_cidade": {"Arinos": ["Giliard Barbosa de Oliveira", "Pedro Lopes de Jesus (Arinos)"]}}, "limiar_ruido": 3})
    assert sim["erros_antes"] == 31 and sim["deixam_de_ser_erro"] == 14 and sim["erros_depois"] == 17
    assert simular_regras(bf, uf, atual, atual)["mudancas"] == []


# ---------- F1/F2: regras por região (CEP) ----------

def test_regiao_canon_cep():
    assert rg.canon_cep("38613-394") == "38613394"
    assert rg.canon_cep(" 38610079 ") == "38610079"
    assert rg.canon_cep(None) is None and rg.canon_cep("  ") is None


def test_regiao_derivar_mapa_cep():
    df = pd.DataFrame({
        "Waybill No": [str(i) for i in range(1, 8)],
        "Consignee Zip Code": ["38610-001"] * 5 + ["38610-002", "38610-002"],
        "Consignee City": ["Unaí"] * 7,
        "Consignee Area": ["Centro"] * 7,
        "Delivery Associate": ["Ana", "Ana", "Ana", "Bruno", "Bruno", "Caio", "Ana"],
    })
    df = cmp.normalizar_relatorio(df)
    mapa = rg.derivar_regras_regiao(df, limiar=2)
    # CEP ...001: Ana (3) e Bruno (2) >= limiar 2 -> ambos; Caio (0 nesse CEP) ausente
    assert set(mapa["por_cep"]["38610001"]) == {"Ana", "Bruno"}
    # CEP ...002: Caio (1) e Ana (1) < limiar; dominante garante pelo menos 1
    assert len(mapa["por_cep"]["38610002"]) >= 1
    assert mapa["limiar"] == 2


def test_regiao_validar_contra_mapa():
    mapa = {"limiar": 2,
            "por_cep": {"38610001": ["Ana", "Bruno"]},
            "por_bairro": {"Unaí|Centro": ["Ana"]},
            "por_cidade": {"Unaí": ["Ana", "Bruno", "Caio"]}}
    df = pd.DataFrame({
        "Waybill No": ["1", "2", "3", "4", "5"],
        "Consignee Zip Code": ["38610-001", "38610-001", "38610-999", "38610-001", None],
        "Consignee City": ["Unaí", "Unaí", "Cidade X", "Unaí", "Unaí"],
        "Consignee Area": ["Centro", "Centro", None, "Centro", "Centro"],
        "Delivery Associate": ["Ana", "Zé", "Ana", None, "Ana"],
    })
    df = cmp.normalizar_relatorio(df)
    err = rg.validar_regiao(df, mapa)
    por = {r["Waybill No"]: r["tipo_erro"] for _, r in err.iterrows()}
    assert "1" not in por  # Ana no CEP ...001: correta
    assert por["2"] == rg.ERRO_REGIAO_FORA  # Zé não atende o CEP
    assert por["3"] == rg.ERRO_REGIAO_SEM_REGRA  # CEP/cidade sem regra
    assert por["4"] == rg.ERRO_REGIAO_SEM_ENTREGADOR  # sem entregador
    assert "5" not in por  # sem CEP, cai para bairro Unaí|Centro -> Ana ok


def test_regiao_dados_exemplo():
    u = cmp.normalizar_relatorio(pd.read_excel(DADOS / "ultima_tabela.xlsx"))
    mapa = rg.derivar_regras_regiao(u, limiar=3)
    assert len(mapa["por_cep"]) > 0 and len(mapa["por_cidade"]) == 11
    err = rg.validar_regiao(u, mapa)
    assert set(err["tipo_erro"].unique()) <= {rg.ERRO_REGIAO_FORA, rg.ERRO_REGIAO_SEM_ENTREGADOR, rg.ERRO_REGIAO_SEM_REGRA}


def test_piso_usa_mapa_regiao_quando_presente():
    # Com mapa_regiao, a conferência de piso valida por CEP (escopo 'cep',
    # origem 'mapa de região'); sem mapa, mantém a derivada da base.
    b = pd.read_excel(DADOS / "tabela_base.xlsx")
    u = pd.read_excel(DADOS / "ultima_tabela.xlsx")
    base_prep = cmp.separar_fora_jurisdicao(cmp.remover_fm(cmp.normalizar_relatorio(b)))[0]
    mapa = rg.derivar_regras_regiao(base_prep, limiar=3)
    a_sem = analisar(b, u, Parametros(referencia_backlog=pd.Timestamp("2026-10-10 18:00")))
    a_com = analisar(b, u, Parametros(referencia_backlog=pd.Timestamp("2026-10-10 18:00"), mapa_regiao=mapa))
    assert sum(1 for x in a_sem["atual"] if x["erro_piso"]) == 27  # default: filtros opcionais ligados
    # com mapa: todos os erros têm origem 'mapa de região' e escopo de região
    erros_com = [x["erro_piso"] for x in a_com["atual"] if x["erro_piso"]]
    assert erros_com and all(e["origem_regra"] == "mapa de região" for e in erros_com)
    assert all(e["escopo"] in ("cep", "bairro", "cep+bairro", "cidade") for e in erros_com)


def test_regiao_cep_e_bairro_somam():
    # Caso real: o CEP genérico da sede pertence a um entregador, mas o bairro (distrito)
    # é de outro. Vale quem atende o CEP OU o bairro; a cidade só entra sem nenhum dos dois.
    mapa = {"limiar": 100,
            "por_cep": {"38690000": ["Romario"]},
            "por_bairro": {"Formoso|Goiaminas": ["Duilio"], "Formoso|Centro": ["Romario"]},
            "por_cidade": {"Formoso": ["Duilio", "Romario"], "Unai": ["Ana"]}}
    v, esc, ok = rg._validos_regiao(mapa, "38690-000", "Goiaminas", "Formoso")
    assert ok and esc == "cep+bairro" and v == {"Romario", "Duilio"}
    v, esc, _ = rg._validos_regiao(mapa, "38690-000", "Bairro sem regra", "Formoso")
    assert esc == "cep" and v == {"Romario"}
    v, esc, _ = rg._validos_regiao(mapa, None, "Goiaminas", "Formoso")
    assert esc == "bairro" and v == {"Duilio"}
    v, esc, _ = rg._validos_regiao(mapa, "99999999", "Rua X", "Unai")
    assert esc == "cidade" and v == {"Ana"}
    assert rg._validos_regiao(mapa, None, None, "Outra")[2] is False
    linha = pd.DataFrame([{"Waybill No": "1", "Consignee City": "Formoso", "Consignee Area": "Goiaminas",
                           "Consignee Zip Code": "38690-000", "Delivery Associate": "Duilio"}])
    assert rg.validar_piso_por_regiao(linha, mapa).empty


if __name__ == "__main__":
    falhas = 0
    for nome, fn in sorted(globals().items()):
        if nome.startswith("test_") and callable(fn):
            try:
                fn(); print("ok   ", nome)
            except AssertionError as e:
                falhas += 1; print("FALHA", nome, e)
    sys.exit(1 if falhas else 0)
