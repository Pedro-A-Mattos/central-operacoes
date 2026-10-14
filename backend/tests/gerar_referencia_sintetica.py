"""Gera a referência do motor Python sobre cenários SINTÉTICOS (sem planilhas reais) para a paridade do front.

    python tests/gerar_referencia_sintetica.py <pasta_de_saida> > ref_sintetica.json
    DADOS_DIR=<pasta_de_saida> node frontend/tests/paridade.mjs ref_sintetica.json

Grava cada par em .xlsx (para exercitar a leitura de planilha dos DOIS motores) e imprime o JSON de
referência no mesmo formato de gerar_referencia.py.
"""
import json
import sys
import warnings
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(Path(__file__).resolve().parent))
warnings.filterwarnings("ignore")
from fixtures_sinteticos import cenarios, historico_regiao  # noqa: E402
from logistica import regras as rg  # noqa: E402
from logistica import comparador as cmp  # noqa: E402
from logistica.pipeline import Parametros, analisar, filtrar_relatorios, simular_regras, validar_arquivo  # noqa: E402


def main(pasta: Path) -> None:
    pasta.mkdir(parents=True, exist_ok=True)
    saida = []
    for c in cenarios():
        nome = c["nome"]
        arq_b, arq_u = f"{nome}__base.xlsx", f"{nome}__atual.xlsx"
        c["base"].to_excel(pasta / arq_b, index=False)
        c["atual"].to_excel(pasta / arq_u, index=False)
        b, u = cmp.ler_planilha(pasta / arq_b), cmp.ler_planilha(pasta / arq_u)
        p = c["parametros"]
        ref = pd.Timestamp(p["referencia_backlog"]) if p["referencia_backlog"] else None
        r = analisar(b, u, Parametros(p["ignorar_descarregado"], p["ignorar_nao_recebido"], p["limiar_ruido"], p["cidades_ignoradas"],
                                      c["overrides"], ref, p.get("mapa_regiao")), {}, (arq_b, arq_u))
        r.pop("gerado_em")
        val = {"base": validar_arquivo(b, arq_b), "atual": validar_arquivo(u, arq_u)}
        atual_cfg = {"overrides": c["overrides"], "limiar_ruido": p["limiar_ruido"], "cidades_ignoradas": p["cidades_ignoradas"]}
        novo_cfg = {"overrides": {"por_cidade": {"Unaí": ["Ana", "Bia"]}, "cidades_ignoradas": []}, "limiar_ruido": 2, "cidades_ignoradas": []}
        if p.get("mapa_regiao"):
            atual_cfg["mapa_regiao"] = novo_cfg["mapa_regiao"] = p["mapa_regiao"]
        fl = filtrar_relatorios(cmp.normalizar_relatorio(b), cmp.normalizar_relatorio(u), p["ignorar_descarregado"], p["ignorar_nao_recebido"])
        sim = simular_regras(fl["base_f"], fl["ult_f"], atual_cfg, novo_cfg)
        saida.append({"nome": nome, "base": arq_b, "atual": arq_u, "nome_atual": arq_u, "parametros": p, "overrides": c["overrides"],
                      "resultado": r, "validacao": val, "simulacao": {"atual": atual_cfg, "novo": novo_cfg, "resultado": sim}})
    historico_regiao().to_excel(pasta / "historico.xlsx", index=False)
    h = cmp.ler_planilha(pasta / "historico.xlsx")
    n = cmp.normalizar_relatorio(h)
    regiao = []
    for limiar in (3, 5, 10):
        mapa = rg.derivar_regras_regiao(n, limiar)
        err = rg.validar_regiao(n, mapa)
        por_tipo = {k: int(v) for k, v in err["tipo_erro"].value_counts().items()} if len(err) else {}
        regiao.append({"arquivo": "historico.xlsx", "limiar": limiar, "mapa": mapa, "n_erros": int(len(err)), "por_tipo": por_tipo})
    json.dump({"cenarios": saida, "regiao": regiao}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main(Path(sys.argv[1]))
