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
    a = analisar(b, u, Parametros(ignorar_descarregado=False, referencia_backlog=pd.Timestamp("2026-10-10 18:00")))
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
    assert a["resumo"]["pendentes"] == 410


def test_nao_recebido_ligado_por_padrao_e_remove_status():
    # RN-012: filtro ligado por padrão, removendo "não recebido" (com/sem acento) do Last Scan Status.
    assert Parametros().ignorar_nao_recebido is True
    df = pd.DataFrame({
        "Waybill No": ["1", "2", "3", "4"],
        "Last Scan Status": ["Em rota de entrega", "não recebido", "Nao Recebido", "descarregado"],
    })
    df = cmp.normalizar_relatorio(df)
    ligado = cmp.aplicar_filtro_nao_recebido(df, True)
    assert list(ligado["Waybill No"]) == ["1", "4"]  # remove "2" e "3"
    desligado = cmp.aplicar_filtro_nao_recebido(df, False)
    assert len(desligado) == 4
    # dados de exemplo não têm esse status: o filtro padrão não muda os números
    b = pd.read_excel(DADOS / "tabela_base.xlsx")
    u = pd.read_excel(DADOS / "ultima_tabela.xlsx")
    a = analisar(b, u, Parametros(referencia_backlog=pd.Timestamp("2026-10-10 18:00")))
    assert a["parametros"]["ignorar_nao_recebido"] is True
    assert a["etapas"]["nao_recebido_base"] == 0 and a["etapas"]["nao_recebido_atual"] == 0
    assert a["removidas"]["nao_recebido"] == []


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


if __name__ == "__main__":
    falhas = 0
    for nome, fn in sorted(globals().items()):
        if nome.startswith("test_") and callable(fn):
            try:
                fn(); print("ok   ", nome)
            except AssertionError as e:
                falhas += 1; print("FALHA", nome, e)
    sys.exit(1 if falhas else 0)
