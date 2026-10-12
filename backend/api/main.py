"""API HTTP da Central Inteligente de Operações Logísticas.

    uvicorn api.main:app --reload      (a partir da pasta backend/)

Serve também a interface (frontend/dist/index.html) na raiz, de modo que o
front detecta /api/saude e passa a usar o motor Python automaticamente.
"""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, File, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from . import servico as sv

log = logging.getLogger("cio.api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(title="Central Inteligente de Operações Logísticas", version="1.0.0")
FRONT = Path(__file__).resolve().parents[2] / "frontend" / "dist" / "index.html"


@app.exception_handler(sv.ErroUsuario)
async def _erro_usuario(_: Request, e: sv.ErroUsuario):
    log.info("erro de usuário: %s", e.corpo["titulo"])
    return JSONResponse(status_code=e.status, content=e.corpo)


@app.exception_handler(Exception)
async def _erro_inesperado(req: Request, e: Exception):
    log.exception("falha inesperada em %s", req.url.path)
    return JSONResponse(status_code=500, content={
        "titulo": "Falha inesperada no processamento",
        "significado": "O servidor não conseguiu concluir a operação. Nada foi alterado.",
        "acao": "Tente novamente. Se persistir, envie os arquivos ao suporte."})


@app.get("/api/saude")
def saude():
    return {"ok": True, "motor": "python"}


@app.post("/api/arquivos")
async def enviar_arquivo(arquivo: UploadFile = File(...)):
    conteudo = await arquivo.read(sv.TAMANHO_MAXIMO + 1)
    return sv.receber_arquivo(arquivo.filename or "arquivo.xlsx", conteudo)


@app.post("/api/exemplos")
def usar_exemplos():
    return sv.carregar_exemplos()


class PedidoOrdem(BaseModel):
    token_base: str
    token_atual: str


@app.post("/api/ordem")
def verificar_ordem(p: PedidoOrdem):
    return sv.verificar_ordem(p.token_base, p.token_atual)


class PedidoAnalise(BaseModel):
    token_base: str
    token_atual: str
    parametros: dict = Field(default_factory=dict)


@app.post("/api/analises")
def criar_analise(p: PedidoAnalise):
    return sv.executar_analise(p.token_base, p.token_atual, p.parametros)


@app.get("/api/analises/{id_analise}/desempenho")
def desempenho(id_analise: str, dias: list[str] = Query(default=[])):
    return sv.desempenho_por_dias(id_analise, dias)


class PedidoSimulacao(BaseModel):
    atual: dict
    novo: dict


@app.post("/api/analises/{id_analise}/simular-regras")
def simular_regras(id_analise: str, p: PedidoSimulacao):
    return sv.simular(id_analise, p.atual, p.novo)


@app.get("/api/historico")
def listar_historico():
    return sv.listar_historico()


@app.post("/api/historico")
def registrar_importacao(registro: dict):
    return sv.registrar_importacao(registro)


@app.get("/api/regras")
def obter_regras():
    return sv.obter_regras()


@app.put("/api/regras")
def salvar_regras(corpo: dict):
    return sv.salvar_regras(corpo)


@app.get("/api/justificativas")
def listar_justificativas():
    return sv.listar_justificativas()


class PedidoJustificativa(BaseModel):
    motivo: str
    observacao: str = ""
    reavaliar_em: str = ""


@app.put("/api/justificativas/{awb}")
def justificar(awb: str, p: PedidoJustificativa):
    return sv.justificar(awb, p.motivo, p.observacao, p.reavaliar_em)


@app.delete("/api/justificativas/{awb}")
def reativar(awb: str):
    return sv.reativar(awb)


@app.get("/")
def interface():
    return FileResponse(FRONT)
