"""Gera a saída de referência do motor Python para o teste de paridade do front.
    python tests/gerar_referencia.py > /tmp/ref.json
"""
import json
import sys
import warnings
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
warnings.filterwarnings("ignore")
from logistica import comparador as cmp  # noqa: E402
from logistica import regras as rg  # noqa: E402
from logistica.pipeline import Parametros, analisar, filtrar_relatorios, simular_regras, validar_arquivo  # noqa: E402

REF = "2026-10-10 18:00:00"
CENARIOS = [
    {"nome": "padrao", "base": "tabela_base.xlsx", "atual": "ultima_tabela.xlsx",
     "parametros": {"ignorar_descarregado": False, "ignorar_nao_recebido": False, "limiar_ruido": 3, "cidades_ignoradas": [], "referencia_backlog": REF},
     "overrides": {"por_cidade": {}, "cidades_ignoradas": []}},
    {"nome": "override+descarregado+limiar5", "base": "tabela_base.xlsx", "atual": "ultima_tabela.xlsx",
     "parametros": {"ignorar_descarregado": True, "ignorar_nao_recebido": False, "limiar_ruido": 5, "cidades_ignoradas": ["Buritis"], "referencia_backlog": REF},
     "overrides": {"por_cidade": {"Arinos": ["Giliard Barbosa de Oliveira"]}, "cidades_ignoradas": []}},
    {"nome": "op06-nome-do-arquivo+descarregado-padrao", "base": "ultima_tabela.xlsx", "atual": "dispatch_2026-10-11.xlsx",
     "nome_atual": "Dispatch waybill query - 2026-10-11T185714.610.xlsx",
     "parametros": {"ignorar_descarregado": True, "ignorar_nao_recebido": True, "limiar_ruido": 3, "cidades_ignoradas": [], "referencia_backlog": None},
     "overrides": {"por_cidade": {}, "cidades_ignoradas": []}},
    {"nome": "op06-ultimo-evento", "base": "tabela_base.xlsx", "atual": "ultima_tabela.xlsx",
     "parametros": {"ignorar_descarregado": True, "ignorar_nao_recebido": True, "limiar_ruido": 3, "cidades_ignoradas": [], "referencia_backlog": None},
     "overrides": {"por_cidade": {}, "cidades_ignoradas": []}},
    {"nome": "invertido", "base": "dispatch_2026-10-11.xlsx", "atual": "ultima_tabela.xlsx",
     "parametros": {"ignorar_descarregado": False, "ignorar_nao_recebido": False, "limiar_ruido": 1, "cidades_ignoradas": [], "referencia_backlog": REF},
     "overrides": {"por_cidade": {}, "cidades_ignoradas": []}},
    {"nome": "nao-recebido-ligado", "base": "tabela_base.xlsx", "atual": "ultima_tabela.xlsx",
     "parametros": {"ignorar_descarregado": True, "ignorar_nao_recebido": True, "limiar_ruido": 3, "cidades_ignoradas": [], "referencia_backlog": REF},
     "overrides": {"por_cidade": {}, "cidades_ignoradas": []}},
]
saida = []
for c in CENARIOS:
    b = pd.read_excel(RAIZ / "dados_exemplo" / c["base"])
    u = pd.read_excel(RAIZ / "dados_exemplo" / c["atual"])
    p = c["parametros"]
    nome_atual = c.get("nome_atual", c["atual"])
    ref = pd.Timestamp(p["referencia_backlog"]) if p["referencia_backlog"] else None
    r = analisar(b, u, Parametros(p["ignorar_descarregado"], p.get("ignorar_nao_recebido", True),
                                  p["limiar_ruido"], p["cidades_ignoradas"],
                                  c["overrides"], ref), {}, (c["base"], nome_atual))
    r.pop("gerado_em")
    val = {"base": validar_arquivo(b, c["base"]), "atual": validar_arquivo(u, nome_atual)}
    def prep(df):
        n = cmp.aplicar_filtro_descarregado(cmp.normalizar_relatorio(df), p["ignorar_descarregado"])
        n = cmp.aplicar_filtro_nao_recebido(n, p.get("ignorar_nao_recebido", True))
        d = cmp.remover_fm(n)
        return cmp.separar_fora_jurisdicao(d)[0]
    atual_cfg = {"overrides": c["overrides"], "limiar_ruido": p["limiar_ruido"], "cidades_ignoradas": p["cidades_ignoradas"]}
    novo_cfg = {"overrides": {"por_cidade": {"Arinos": ["Giliard Barbosa de Oliveira", "Pedro Lopes de Jesus (Arinos)"]},
                              "cidades_ignoradas": ["Buritis"]}, "limiar_ruido": 2, "cidades_ignoradas": []}
    fl = filtrar_relatorios(cmp.normalizar_relatorio(b), cmp.normalizar_relatorio(u), p["ignorar_descarregado"], p.get("ignorar_nao_recebido", True))
    sim = simular_regras(fl["base_f"], fl["ult_f"], atual_cfg, novo_cfg)
    saida.append({**c, "nome_atual": nome_atual, "resultado": r, "validacao": val, "simulacao": {"atual": atual_cfg, "novo": novo_cfg, "resultado": sim}})

# Paridade do Modo Estudo/Validação por região (CEP): deriva e valida sobre a mesma planilha.
_u = cmp.normalizar_relatorio(pd.read_excel(RAIZ / "dados_exemplo" / "ultima_tabela.xlsx"))
regiao = []
for limiar in (3, 10):
    mapa = rg.derivar_regras_regiao(_u, limiar)
    err = rg.validar_regiao(_u, mapa)
    por_tipo = {k: int(v) for k, v in err["tipo_erro"].value_counts().items()} if len(err) else {}
    regiao.append({"arquivo": "ultima_tabela.xlsx", "limiar": limiar, "mapa": mapa,
                   "n_erros": int(len(err)), "por_tipo": por_tipo})

json.dump({"cenarios": saida, "regiao": regiao}, sys.stdout, ensure_ascii=False)
