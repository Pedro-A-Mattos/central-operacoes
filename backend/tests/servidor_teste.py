"""Servidor de TESTE com Starlette, espelhando as rotas de api/main.py sobre a
mesma camada de serviço. Serve só para validar a integração do front no modo
servidor em ambientes sem FastAPI. Em produção use: uvicorn api.main:app
"""
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
from starlette.applications import Starlette  # noqa: E402
from starlette.requests import Request  # noqa: E402
from starlette.responses import FileResponse, JSONResponse  # noqa: E402
from starlette.routing import Route  # noqa: E402

from api import servico as sv  # noqa: E402

FRONT = RAIZ.parent / "frontend" / "dist" / "index.html"


def ok(f):
    async def h(req: Request):
        try:
            return JSONResponse(await f(req))
        except sv.ErroUsuario as e:
            return JSONResponse(e.corpo, status_code=e.status)
    return h


async def arquivos(req):
    form = await req.form(); up = form["arquivo"]
    return sv.receber_arquivo(up.filename, await up.read())

async def corpo(req):
    return await req.json()

rotas = [
    Route("/", lambda r: FileResponse(FRONT)),
    Route("/api/saude", ok(lambda r: _v({"ok": True, "motor": "python"}))),
    Route("/api/arquivos", ok(arquivos), methods=["POST"]),
    Route("/api/exemplos", ok(lambda r: _v(sv.carregar_exemplos())), methods=["POST"]),
    Route("/api/ordem", ok(lambda r: _j(r, lambda c: sv.verificar_ordem(c["token_base"], c["token_atual"]))), methods=["POST"]),
    Route("/api/analises", ok(lambda r: _j(r, lambda c: sv.executar_analise(c["token_base"], c["token_atual"], c.get("parametros", {})))), methods=["POST"]),
    Route("/api/analises/{id}/desempenho", ok(lambda r: _v(sv.desempenho_por_dias(r.path_params["id"], r.query_params.getlist("dias"))))),
    Route("/api/analises/{id}/simular-regras", ok(lambda r: _j(r, lambda c: sv.simular(r.path_params["id"], c["atual"], c["novo"]))), methods=["POST"]),
    Route("/api/historico", ok(lambda r: _v(sv.listar_historico()) if r.method == "GET" else _j(r, sv.registrar_importacao)), methods=["GET", "POST"]),
    Route("/api/regras", ok(lambda r: _v(sv.obter_regras()) if r.method == "GET" else _j(r, sv.salvar_regras)), methods=["GET", "PUT"]),
    Route("/api/justificativas/{awb}", ok(lambda r: _v(sv.reativar(r.path_params["awb"])) if r.method == "DELETE" else _j(r, lambda c: sv.justificar(r.path_params["awb"], c.get("motivo", ""), c.get("observacao", ""), c.get("reavaliar_em", "")))), methods=["PUT", "DELETE"]),
]

async def _v(x): return x
async def _j(r, f): return f(await r.json())

app = Starlette(routes=rotas)
