"""Teste de ponta a ponta da API FastAPI real (api/main.py).

Sobe o uvicorn numa porta livre, com uma pasta de dados temporária, e percorre
as rotas que a interface usa. Pulado se FastAPI/uvicorn não estiverem instalados.
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
pytest.importorskip("fastapi")
pytest.importorskip("uvicorn")


def _porta_livre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def api():
    porta = _porta_livre()
    dados = tempfile.mkdtemp(prefix="cio_api_")
    env = {**os.environ, "CIO_PASTA_DADOS": dados, "PYTHONPATH": os.pathsep.join([str(RAIZ), os.environ.get("PYTHONPATH", "")])}
    proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "api.main:app", "--port", str(porta), "--log-level", "warning"],
                            cwd=RAIZ, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    base = f"http://127.0.0.1:{porta}"
    for _ in range(100):
        try:
            urllib.request.urlopen(base + "/api/saude", timeout=0.5)
            break
        except Exception:
            if proc.poll() is not None:
                raise RuntimeError(proc.stdout.read().decode())
            time.sleep(0.1)
    yield base, Path(dados)
    proc.terminate()
    proc.wait(timeout=5)


def _req(base, metodo, rota, corpo=None, tipo="application/json"):
    dados = None if corpo is None else (corpo if isinstance(corpo, bytes) else json.dumps(corpo).encode())
    r = urllib.request.Request(base + rota, data=dados, method=metodo, headers={"Content-Type": tipo} if dados is not None else {})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def _multipart(nome: str, conteudo: bytes) -> tuple[bytes, str]:
    fronteira = uuid.uuid4().hex
    corpo = (f"--{fronteira}\r\nContent-Disposition: form-data; name=\"arquivo\"; filename=\"{nome}\"\r\n"
             f"Content-Type: application/octet-stream\r\n\r\n").encode() + conteudo + f"\r\n--{fronteira}--\r\n".encode()
    return corpo, f"multipart/form-data; boundary={fronteira}"


def test_fluxo_completo(api):
    base, pasta = api
    assert _req(base, "GET", "/api/saude") == (200, {"ok": True, "motor": "python"})

    # arquivo inválido: mensagem em três partes, sem stack trace
    corpo, tipo = _multipart("falso.xlsx", b"nao sou excel")
    st, err = _req(base, "POST", "/api/arquivos", corpo, tipo)
    assert st == 400 and set(err) == {"titulo", "significado", "acao"}

    # upload real
    corpo, tipo = _multipart("tabela_base.xlsx", (RAIZ / "dados_exemplo" / "tabela_base.xlsx").read_bytes())
    st, vb = _req(base, "POST", "/api/arquivos", corpo, tipo)
    assert st == 200 and vb["linhas"] == 1903 and vb["token"]
    corpo, tipo = _multipart("ultima_tabela.xlsx", (RAIZ / "dados_exemplo" / "ultima_tabela.xlsx").read_bytes())
    st, va = _req(base, "POST", "/api/arquivos", corpo, tipo)
    assert st == 200 and va["linhas"] == 552

    st, ordem = _req(base, "POST", "/api/ordem", {"token_base": vb["token"], "token_atual": va["token"]})
    assert st == 200 and not ordem["possivel_inversao"]

    params = {"ignorar_descarregado": False, "ignorar_nao_recebido": False, "limiar_ruido": 3, "cidades_ignoradas": [], "referencia_backlog": "2026-10-10 18:00:00"}
    st, a = _req(base, "POST", "/api/analises", {"token_base": vb["token"], "token_atual": va["token"], "parametros": params})
    assert st == 200 and a["motor"] == "python" and a["resumo"]["pendentes"] == 413
    assert sum(1 for x in a["atual"] if x["erro_piso"]) == 31

    st, d = _req(base, "GET", f"/api/analises/{a['id']}/desempenho?dias={a['dias_chegada'][0]}")
    assert st == 200 and d["dias"] == [a["dias_chegada"][0]]

    # ajuste de regra persiste e muda a conferência (CA-008)
    assert _req(base, "PUT", "/api/regras", {"por_cidade": {"Arinos": ["Giliard Barbosa de Oliveira"]}, "cidades_ignoradas": []})[0] == 200
    st, a2 = _req(base, "POST", "/api/analises", {"token_base": vb["token"], "token_atual": va["token"], "parametros": params})
    assert sum(1 for x in a2["atual"] if x["erro_piso"] and x["dados"]["Consignee City"] == "Arinos") == 14
    assert json.loads((pasta / "regras_piso.json").read_text())["por_cidade"]["Arinos"] == ["Giliard Barbosa de Oliveira"]

    # justificativa: motivo obrigatório, grava e reativa (CA-013)
    assert _req(base, "PUT", "/api/justificativas/3320120101920", {"motivo": "  "})[0] == 400
    st, j = _req(base, "PUT", "/api/justificativas/3320120101920", {"motivo": "Cliente reagendou"})
    assert st == 200 and "3320120101920" in j
    assert _req(base, "DELETE", "/api/justificativas/3320120101920") == (200, {})

    # simulação de regra (antes de salvar)
    st, sim = _req(base, "POST", f"/api/analises/{a['id']}/simular-regras",
                   {"atual": {"overrides": {"por_cidade": {}, "cidades_ignoradas": []}, "limiar_ruido": 3},
                    "novo": {"overrides": {"por_cidade": {"Arinos": ["Giliard Barbosa de Oliveira", "Pedro Lopes de Jesus (Arinos)"]}}, "limiar_ruido": 3}})
    assert st == 200 and sim["deixam_de_ser_erro"] == 14

    # histórico: grava, substitui pela mesma chave e lista em ordem de referência
    reg = {"chave": "2026-10-10 18:00:00|ultima_tabela.xlsx", "referencia": "2026-10-10 18:00:00", "pendentes": ["1", "2"]}
    assert _req(base, "POST", "/api/historico", reg)[0] == 200
    st, hist = _req(base, "POST", "/api/historico", {**reg, "pendentes": ["1"]})
    assert st == 200 and len(hist) == 1 and hist[0]["pendentes"] == ["1"]
    assert _req(base, "GET", "/api/historico")[1] == hist
    assert _req(base, "POST", "/api/historico", {"sem": "chave"})[0] == 400

    # exemplos embutidos no servidor
    st, ex = _req(base, "POST", "/api/exemplos")
    assert st == 200 and ex["base"]["token"] and ex["atual"]["token"]

    # análise expirada / inexistente
    assert _req(base, "GET", "/api/analises/naoexiste/desempenho")[0] == 404
