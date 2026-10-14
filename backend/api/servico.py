"""Camada de serviço da API: independente de framework web, testável.

Mantém uploads em memória por um tempo limitado (TTL) e persiste regras e
justificativas em JSON, como o MVP. Para produção: trocar `Armazenamento`
por banco de dados e isolar por usuário/operação (ver docs/ARQUITETURA.md).
"""
from __future__ import annotations

import io
import json
import os
import threading
import time
import uuid
import zipfile
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from logistica import excecoes as exc
from logistica import regras as rg
from logistica.comparador import ler_planilha as cmp_ler_planilha
from logistica.pipeline import Parametros, analisar, desempenho, simular_regras, validar_arquivo

TAMANHO_MAXIMO = int(os.getenv("CIO_TAMANHO_MAXIMO_MB", "20")) * 1024 * 1024
LINHAS_MAXIMAS = int(os.getenv("CIO_LINHAS_MAXIMAS", "200000"))
TTL_SEGUNDOS = int(os.getenv("CIO_TTL_SEGUNDOS", "7200"))
PASTA_DADOS = Path(os.getenv("CIO_PASTA_DADOS", Path(__file__).resolve().parents[1] / "dados"))


class ErroUsuario(Exception):
    """Erro apresentável: o que aconteceu, o que significa, o que fazer."""

    def __init__(self, titulo: str, significado: str, acao: str, status: int = 400):
        super().__init__(titulo)
        self.corpo = {"titulo": titulo, "significado": significado, "acao": acao}
        self.status = status


@dataclass
class ArquivoRecebido:
    nome: str
    df: pd.DataFrame
    criado: float


class Armazenamento:
    def __init__(self) -> None:
        self._arquivos: dict[str, ArquivoRecebido] = {}
        self._analises: dict[str, tuple[pd.DataFrame, pd.DataFrame, float]] = {}
        self._trava = threading.Lock()
        PASTA_DADOS.mkdir(parents=True, exist_ok=True)

    def _limpar(self) -> None:
        agora = time.time()
        for d in (self._arquivos, self._analises):
            for k in [k for k, v in d.items() if agora - (v.criado if hasattr(v, "criado") else v[2]) > TTL_SEGUNDOS]:
                d.pop(k, None)

    def guardar_arquivo(self, nome: str, df: pd.DataFrame) -> str:
        with self._trava:
            self._limpar()
            token = uuid.uuid4().hex
            self._arquivos[token] = ArquivoRecebido(nome, df, time.time())
            return token

    def arquivo(self, token: str) -> ArquivoRecebido:
        a = self._arquivos.get(token)
        if a is None:
            raise ErroUsuario("Arquivo não encontrado", "O envio expirou ou o servidor foi reiniciado.",
                              "Envie os relatórios novamente.", 404)
        return a

    def guardar_analise(self, base_f: pd.DataFrame, ult_f: pd.DataFrame) -> str:
        with self._trava:
            k = uuid.uuid4().hex
            self._analises[k] = (base_f, ult_f, time.time())
            return k

    def analise(self, k: str):
        a = self._analises.get(k)
        if a is None:
            raise ErroUsuario("Análise expirada", "Os dados desta análise não estão mais em memória.",
                              "Refaça a importação dos relatórios.", 404)
        return a


ARMAZEM = Armazenamento()
ARQ_REGRAS = PASTA_DADOS / "regras_piso.json"
ARQ_JUST = PASTA_DADOS / "justificativas.json"
ARQ_HIST = PASTA_DADOS / "historico.json"
MAX_HISTORICO = 60


def ler_excel_seguro(nome: str, conteudo: bytes) -> pd.DataFrame:
    if not nome.lower().endswith(".xlsx"):
        raise ErroUsuario("Formato não aceito", "Só relatórios Excel (.xlsx) exportados do Dispatch são aceitos.",
                          "Exporte o relatório em .xlsx e envie novamente.")
    if len(conteudo) > TAMANHO_MAXIMO:
        raise ErroUsuario("Arquivo muito grande", f"O limite é {TAMANHO_MAXIMO // (1024 * 1024)} MB por relatório.",
                          "Exporte um período menor ou fale com o suporte.", 413)
    if not zipfile.is_zipfile(io.BytesIO(conteudo)):
        raise ErroUsuario("Arquivo danificado ou não é Excel", "O conteúdo não corresponde a uma planilha .xlsx.",
                          "Abra o arquivo no Excel, salve como .xlsx e envie novamente.")
    try:
        df = cmp_ler_planilha(io.BytesIO(conteudo))
    except Exception:  # noqa: BLE001 — a mensagem técnica vai para o log, não para a tela
        raise ErroUsuario("Não foi possível ler a planilha", "A planilha tem uma estrutura que o sistema não reconhece.",
                          "Confira se é o relatório Dispatch original, sem edições manuais.")
    if len(df) > LINHAS_MAXIMAS:
        raise ErroUsuario("Relatório com linhas demais", f"O limite atual é {LINHAS_MAXIMAS} linhas.",
                          "Divida o período exportado.", 413)
    return df


def receber_arquivo(nome: str, conteudo: bytes) -> dict:
    df = ler_excel_seguro(nome, conteudo)
    info = validar_arquivo(df, nome)
    info["token"] = ARMAZEM.guardar_arquivo(nome, df) if not info["problemas"] else None
    return info


def verificar_ordem(token_base: str, token_atual: str) -> dict:
    from logistica import comparador as cmp
    from logistica.pipeline import indicio_ordem
    b, a = ARMAZEM.arquivo(token_base), ARMAZEM.arquivo(token_atual)
    return indicio_ordem(cmp.normalizar_relatorio(b.df), cmp.normalizar_relatorio(a.df))


PASTA_EXEMPLOS = Path(__file__).resolve().parents[1] / "dados_exemplo"


def carregar_exemplos() -> dict:
    """FUNC-002: equivalente ao checkbox 'Usar arquivos de exemplo' / ?demo=1."""
    out = {}
    for papel, nome in (("base", "tabela_base.xlsx"), ("atual", "ultima_tabela.xlsx")):
        out[papel] = receber_arquivo(nome, (PASTA_EXEMPLOS / nome).read_bytes())
    return out


def executar_analise(token_base: str, token_atual: str, parametros: dict) -> dict:
    base, atual = ARMAZEM.arquivo(token_base), ARMAZEM.arquivo(token_atual)
    ref = parametros.get("referencia_backlog")
    mapa = parametros.get("mapa_regiao")
    p = Parametros(
        ignorar_descarregado=bool(parametros.get("ignorar_descarregado", True)),
        ignorar_nao_recebido=bool(parametros.get("ignorar_nao_recebido", True)),
        limiar_ruido=max(1, min(20, int(parametros.get("limiar_ruido", rg.LIMIAR_RUIDO)))),
        cidades_ignoradas=list(parametros.get("cidades_ignoradas", [])),
        overrides=rg.carregar_overrides(ARQ_REGRAS),
        referencia_backlog=pd.Timestamp(ref) if ref else None,
        mapa_regiao=mapa if isinstance(mapa, dict) else None,
    )
    resultado = analisar(base.df, atual.df, p, exc.carregar_justificativas(ARQ_JUST), (base.nome, atual.nome))
    resultado["motor"] = "python"
    # guarda base_f/ult_f para recalcular o desempenho por dias
    from logistica import comparador as cmp
    from logistica.pipeline import filtrar_relatorios
    fl = filtrar_relatorios(cmp.normalizar_relatorio(base.df), cmp.normalizar_relatorio(atual.df), p.ignorar_descarregado, p.ignorar_nao_recebido)
    resultado["id"] = ARMAZEM.guardar_analise(fl["base_f"], fl["ult_f"])
    return resultado


def desempenho_por_dias(id_analise: str, dias: list[str]) -> dict:
    base_f, ult_f, _ = ARMAZEM.analise(id_analise)
    return desempenho(base_f, ult_f, dias)


def simular(id_analise: str, atual: dict, novo: dict) -> dict:
    base_f, ult_f, _ = ARMAZEM.analise(id_analise)
    return simular_regras(base_f, ult_f, atual, novo)


def listar_historico() -> list[dict]:
    try:
        dados = json.loads(ARQ_HIST.read_text(encoding="utf-8"))
        return dados if isinstance(dados, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def registrar_importacao(reg: dict) -> list[dict]:
    """Guarda o resumo de uma análise. Mesma chave (referência + arquivo atualizado) substitui."""
    if not isinstance(reg, dict) or not reg.get("chave") or not reg.get("referencia"):
        raise ErroUsuario("Registro inválido", "O resumo da importação veio incompleto.", "Processe a análise novamente.")
    hist = [h for h in listar_historico() if h.get("chave") != reg["chave"]]
    hist.append(reg)
    hist.sort(key=lambda h: h.get("referencia", ""))
    hist = hist[-MAX_HISTORICO:]
    ARQ_HIST.write_text(json.dumps(hist, ensure_ascii=False), encoding="utf-8")
    return hist


def obter_regras() -> dict:
    return rg.carregar_overrides(ARQ_REGRAS)


def salvar_regras(overrides: dict) -> dict:
    limpo = {"por_cidade": {str(c): sorted({str(e) for e in v}) for c, v in (overrides.get("por_cidade") or {}).items()},
             "cidades_ignoradas": sorted({str(c) for c in overrides.get("cidades_ignoradas") or []})}
    rg.salvar_overrides(ARQ_REGRAS, limpo)
    return limpo


def listar_justificativas() -> dict:
    return exc.carregar_justificativas(ARQ_JUST)


def justificar(awb: str, motivo: str, observacao: str = "", reavaliar_em: str = "") -> dict:
    if not motivo.strip():
        raise ErroUsuario("Informe um motivo", "A justificativa precisa de um motivo para ser registrada.",
                          "Escreva em poucas palavras por que o alerta pode ser silenciado.")
    return exc.salvar_justificativa(ARQ_JUST, awb, exc.Justificativa(motivo.strip(), observacao.strip(), reavaliar_em))


def reativar(awb: str) -> dict:
    return exc.remover_justificativa(ARQ_JUST, awb)
